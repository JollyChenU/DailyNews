from __future__ import annotations

import asyncio
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient

from app import main
from app.gateway import GatewayError, HorizonGateway, RevisionConflict
from app.settings import load_settings


class GatewayTests(unittest.TestCase):
    def setUp(self) -> None:
        settings = load_settings()
        if not settings.horizon_path:
            self.skipTest("未配置 Horizon 路径")
        self.horizon_path = settings.horizon_path
        self.config_path = Path(settings.config_path) if settings.config_path else Path(self.horizon_path) / "data/config.json"
        self.original_text = self.config_path.read_text(encoding="utf-8")
        self.payload = json.loads(self.original_text)
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.temp_config = Path(self.temp_dir.name) / "config.json"
        self.temp_config.write_text(self.original_text, encoding="utf-8")
        self.gateway = HorizonGateway(self.horizon_path, str(self.temp_config))

    def test_validate_current_config(self) -> None:
        result = asyncio.run(self.gateway.validate_config(self.payload))
        self.assertTrue(result.get("ok"), result)
        self.assertIn("result", result)

    def test_validate_rejects_unknown_fields(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["unexpected_field"] = True
        result = asyncio.run(self.gateway.validate_config(payload))
        self.assertFalse(result.get("ok"))
        self.assertTrue(result.get("errors"))

    def test_save_preserves_env_placeholder_and_backup(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["ai"]["base_url"] = "${HORIZON_TEST_BASE_URL}"
        revision = self.gateway.read_config().revision
        result = self.gateway.save_config(payload, revision)
        saved_text = self.temp_config.read_text(encoding="utf-8")
        self.assertIn("${HORIZON_TEST_BASE_URL}", saved_text)
        self.assertEqual(json.loads(saved_text), payload)
        backup = Path(result["backup_path"])
        self.assertEqual(backup.read_text(encoding="utf-8"), self.original_text)
        self.assertNotEqual(result["revision"], revision)

    def test_stale_revision_is_rejected(self) -> None:
        revision = self.gateway.read_config().revision
        self.temp_config.write_text(self.original_text + "\n", encoding="utf-8")
        with self.assertRaises(RevisionConflict):
            self.gateway.save_config(copy.deepcopy(self.payload), revision)
        self.assertEqual(self.temp_config.read_text(encoding="utf-8"), self.original_text + "\n")

    def test_atomic_write_failure_keeps_original(self) -> None:
        revision = self.gateway.read_config().revision

        def fail_write(*_: object) -> None:
            raise OSError("simulated write failure")

        self.gateway._atomic_write_text = fail_write
        with self.assertRaises(OSError):
            self.gateway.save_config(copy.deepcopy(self.payload), revision)
        self.assertEqual(self.temp_config.read_text(encoding="utf-8"), self.original_text)

    def test_archive_rejects_path_traversal(self) -> None:
        with self.assertRaises(GatewayError):
            self.gateway.get_archive("../config.json")

    def test_real_run_artifacts_are_readable(self) -> None:
        gateway = HorizonGateway(self.horizon_path, str(self.config_path))
        runs = gateway.list_runs()["items"]
        self.assertTrue(runs)
        latest = runs[0]
        detail = gateway.get_run(latest["run_id"])
        self.assertEqual(detail["run_id"], latest["run_id"])
        self.assertEqual(detail["created_at"], detail["meta"].get("created_at"))
        raw_count = detail["meta"].get("raw_count")
        if raw_count is not None:
            stage = gateway.get_stage(latest["run_id"], "raw", limit=1)
            self.assertEqual(stage["total"], raw_count)
            self.assertLessEqual(len(stage["items"]), 1)
        if latest["summary_languages"]:
            summary = gateway.get_summary(latest["run_id"], latest["summary_languages"][0])
            self.assertTrue(summary["summary"])
        archives = gateway.list_archives()
        if archives:
            archive = gateway.get_archive(archives[0]["filename"])
            self.assertTrue(archive["markdown"])


class ApiTests(GatewayTests):
    def setUp(self) -> None:
        super().setUp()
        self.gateway_patch = patch.object(main, "_gateway", self.gateway)
        self.gateway_patch.start()
        self.addCleanup(self.gateway_patch.stop)
        self.client = TestClient(main.app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def test_health_context_and_static_app(self) -> None:
        self.assertEqual(self.client.get("/api/health").json(), {"ok": True, "name": "Horizon Console"})
        context = self.client.get("/api/context")
        self.assertEqual(context.status_code, 200)
        self.assertEqual(context.json()["active"]["config_path"], str(self.temp_config))
        page = self.client.get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn("<div id=\"root\"></div>", page.text)

    def test_config_validation_and_revision_errors(self) -> None:
        invalid = copy.deepcopy(self.payload)
        invalid["unexpected_field"] = True
        response = self.client.post("/api/config/validate", json={"raw": invalid})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["ok"])

        response = self.client.put("/api/config", json={"raw": self.payload})
        self.assertEqual(response.status_code, 428)

        response = self.client.put(
            "/api/config",
            json={"raw": self.payload},
            headers={"If-Match": "stale-revision"},
        )
        self.assertEqual(response.status_code, 409)

    def test_invalid_settings_and_remote_host_are_rejected(self) -> None:
        response = self.client.put(
            "/api/settings",
            json={"horizon_path": str(Path(self.temp_dir.name) / "missing"), "config_path": "", "port": 8765},
        )
        self.assertEqual(response.status_code, 422)
        response = self.client.get("/api/health", headers={"Host": "example.com"})
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
