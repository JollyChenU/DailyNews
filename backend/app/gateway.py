from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
from typing import Any
from urllib.parse import quote

from filelock import FileLock
from pydantic import ValidationError

from .settings import validate_horizon_path


class GatewayError(RuntimeError):
    pass


class RevisionConflict(GatewayError):
    pass


class ValidationFailure(GatewayError):
    def __init__(self, payload: dict[str, Any]):
        super().__init__("配置校验未通过。")
        self.payload = payload


@dataclass
class ConfigDocument:
    raw_text: str
    payload: dict[str, Any] | None
    revision: str
    modified_at: float
    parse_error: str | None = None


class HorizonGateway:
    def __init__(self, horizon_path: str, config_path: str | None = None):
        self.horizon_path = validate_horizon_path(horizon_path)
        if str(self.horizon_path) not in sys.path:
            sys.path.insert(0, str(self.horizon_path))

        from src._file_utils import _atomic_write_text
        from src.mcp.errors import HorizonMcpError
        from src.mcp.run_store import STAGES
        from src.mcp.service import HorizonPipelineService
        from src.models import Config
        from src.processing import ProfileRegistry
        from src.storage.manager import _expand_env_vars

        self._atomic_write_text = _atomic_write_text
        self._HorizonMcpError = HorizonMcpError
        self._STAGES = STAGES
        self._Config = Config
        self._ProfileRegistry = ProfileRegistry
        self._expand_env_vars = _expand_env_vars

        if config_path:
            raw_path = Path(config_path).expanduser()
            self.config_path = (raw_path if raw_path.is_absolute() else self.horizon_path / raw_path).resolve()
        else:
            self.config_path = (self.horizon_path / "data/config.json").resolve()
        if not self.config_path.is_file():
            raise GatewayError(f"配置文件不存在：{self.config_path}")

        self.data_dir = self.config_path.parent
        self.runs_root = self.data_dir / "mcp-runs"
        self.summaries_dir = self.data_dir / "summaries"
        self.service = HorizonPipelineService(runs_root=self.runs_root)

    @staticmethod
    def _revision(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def read_config(self) -> ConfigDocument:
        raw_text = self.config_path.read_text(encoding="utf-8")
        revision = self._revision(raw_text)
        modified_at = self.config_path.stat().st_mtime
        try:
            payload = json.loads(raw_text)
            if not isinstance(payload, dict):
                raise ValueError("配置顶层必须是 JSON 对象。")
            return ConfigDocument(raw_text, payload, revision, modified_at)
        except (json.JSONDecodeError, ValueError) as exc:
            return ConfigDocument(raw_text, None, revision, modified_at, str(exc))

    def config_schema(self) -> dict[str, Any]:
        return self._Config.model_json_schema()

    def profiles(self, payload: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        payload = payload if payload is not None else self.read_config().payload
        if payload is None:
            return []
        processing = payload.get("processing") or {}
        profiles_dir = Path(str(processing.get("profiles_dir") or "profiles")).expanduser()
        default_profile = str(processing.get("default_profile") or "tech-news")
        registry = self._ProfileRegistry.load(profiles_dir, default_profile, base_dir=self.horizon_path)
        return [
            {
                "id": profile.id,
                "name": profile.definition.name,
                "display_names": profile.definition.display_names,
                "blocks": [block.model_dump(mode="json") for block in profile.definition.enrichment.blocks],
            }
            for profile in registry.profiles
        ]

    @staticmethod
    def _validation_errors(exc: ValidationError) -> list[dict[str, Any]]:
        return [
            {
                "location": list(error.get("loc", [])),
                "message": error.get("msg", "无效值"),
                "type": error.get("type", "validation_error"),
            }
            for error in exc.errors(include_input=False, include_context=False, include_url=False)
        ]

    async def validate_config(self, payload: dict[str, Any], check_env: bool = True) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValidationFailure({"ok": False, "message": "配置顶层必须是 JSON 对象。"})

        try:
            expanded = self._expand_env_vars(payload)
            config = self._Config.model_validate(expanded)
            registry = self._ProfileRegistry.load(
                Path(config.processing.profiles_dir).expanduser(),
                config.processing.default_profile,
                base_dir=self.horizon_path,
            )
            registry.validate_source_references(config.model_dump(mode="json"))
            registry.validate_digest_references(config.digest)
        except ValidationError as exc:
            return {
                "ok": False,
                "message": "配置字段校验失败。",
                "errors": self._validation_errors(exc),
            }
        except Exception as exc:
            return {"ok": False, "message": str(exc), "errors": []}

        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.config_path.parent,
                prefix=".dailynews-validate-",
                suffix=".json",
                delete=False,
            ) as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                temp_path = Path(handle.name)
            result = await self.service.validate_config(
                horizon_path=str(self.horizon_path),
                config_path=str(temp_path),
                check_env=check_env,
            )
            result["config_path"] = str(self.config_path)
            return {"ok": True, "result": result, "profiles": [profile.id for profile in registry.profiles]}
        except self._HorizonMcpError as exc:
            return {"ok": False, "message": exc.message, "code": exc.code, "errors": []}
        except Exception as exc:
            return {"ok": False, "message": str(exc), "errors": []}
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)

    async def current_validation(self) -> dict[str, Any]:
        document = self.read_config()
        if document.payload is None:
            return {"ok": False, "message": document.parse_error or "配置不是有效 JSON。"}
        return await self.validate_config(document.payload)

    def save_config(self, payload: dict[str, Any], expected_revision: str) -> dict[str, Any]:
        lock_path = self.config_path.with_suffix(self.config_path.suffix + ".lock")
        with FileLock(str(lock_path)):
            current_text = self.config_path.read_text(encoding="utf-8")
            current_revision = self._revision(current_text)
            if expected_revision != current_revision:
                raise RevisionConflict("配置已被其他程序修改，请刷新后重试。")

            backup_path = self.config_path.with_suffix(".json.bak")
            if self.config_path.exists():
                shutil.copy2(self.config_path, backup_path)

            content = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
            self._atomic_write_text(self.config_path, content)
            document = self.read_config()

        return {
            "ok": True,
            "revision": document.revision,
            "backup_path": str(backup_path),
            "config_path": str(self.config_path),
        }

    def backup_info(self) -> dict[str, Any] | None:
        backup_path = self.config_path.with_suffix(".json.bak")
        if not backup_path.is_file():
            return None
        stat = backup_path.stat()
        return {"path": str(backup_path), "size": stat.st_size, "modified_at": stat.st_mtime}

    @staticmethod
    def _run_status(meta: dict[str, Any], stages: dict[str, bool], languages: list[str]) -> str:
        if languages:
            return "completed"
        if stages.get("enriched"):
            return "enriched"
        if stages.get("filtered"):
            return "filtered"
        if stages.get("scored"):
            return "scored"
        if stages.get("raw"):
            return "fetched"
        return "created"

    def _summary_languages(self, run_id: str) -> list[str]:
        run_dir = self.runs_root / run_id
        return sorted(path.stem.removeprefix("summary-") for path in run_dir.glob("summary-*.md"))

    def list_runs(self, limit: int = 100) -> dict[str, Any]:
        result = self.service.list_runs(limit=limit)
        items = []
        for item in result["items"]:
            languages = self._summary_languages(item["run_id"])
            items.append({**item, "summary_languages": languages, "status": self._run_status(item["meta"], item["stages"], languages)})
        return {"count": len(items), "items": items}

    def get_run(self, run_id: str) -> dict[str, Any]:
        meta = self.service.get_run_meta(run_id)
        stages = {stage: self.service.run_store.has_stage(run_id, stage) for stage in self._STAGES}
        languages = self._summary_languages(run_id)
        return {
            **meta,
            "created_at": meta["meta"].get("created_at"),
            "stages": stages,
            "summary_languages": languages,
            "status": self._run_status(meta["meta"], stages, languages),
        }

    @staticmethod
    def _item_summary(item: dict[str, Any]) -> dict[str, Any]:
        processing = item.get("processing") or {}
        classification = processing.get("classification") or {}
        analysis = processing.get("analysis") or {}
        artifacts = processing.get("artifacts") or {}
        return {
            "id": item.get("id"),
            "source_type": item.get("source_type"),
            "title": item.get("title"),
            "url": item.get("url"),
            "author": item.get("author"),
            "published_at": item.get("published_at"),
            "fetched_at": item.get("fetched_at"),
            "category": (item.get("metadata") or {}).get("category"),
            "profile": classification.get("profile") or item.get("profile"),
            "classification": classification,
            "score": analysis.get("score"),
            "reason": analysis.get("reason"),
            "summary": analysis.get("summary"),
            "tags": analysis.get("tags") or [],
            "artifact_languages": sorted(artifacts),
            "has_content": bool(item.get("content")),
            "content_preview": (item.get("content") or "")[:500],
        }

    def get_stage(
        self,
        run_id: str,
        stage: str,
        offset: int = 0,
        limit: int = 50,
        query: str = "",
        source: str = "",
        profile: str = "",
    ) -> dict[str, Any]:
        if stage not in self._STAGES:
            raise GatewayError(f"不支持的阶段：{stage}")
        items = self.service.run_store.load_items(run_id, stage)
        query = query.strip().casefold()
        filtered = []
        for item in items:
            summary = self._item_summary(item)
            haystack = " ".join(str(summary.get(key) or "") for key in ("title", "author", "summary", "reason")).casefold()
            if query and query not in haystack:
                continue
            if source and summary.get("source_type") != source:
                continue
            if profile and summary.get("profile") != profile:
                continue
            filtered.append(summary)
        total = len(filtered)
        page = filtered[offset : offset + limit]
        return {
            "run_id": run_id,
            "stage": stage,
            "total": total,
            "offset": offset,
            "limit": limit,
            "items": page,
            "sources": sorted({str(item.get("source_type")) for item in items}),
            "profiles": sorted({str(self._item_summary(item).get("profile")) for item in items if self._item_summary(item).get("profile")}),
        }

    def get_item(self, run_id: str, stage: str, item_id: str) -> dict[str, Any]:
        if stage not in self._STAGES:
            raise GatewayError(f"不支持的阶段：{stage}")
        for item in self.service.run_store.load_items(run_id, stage):
            if item.get("id") == item_id:
                return item
        raise GatewayError("未找到该条目。")

    def get_summary(self, run_id: str, language: str) -> dict[str, Any]:
        return self.service.get_run_summary(run_id, language)

    def list_archives(self, query: str = "") -> list[dict[str, Any]]:
        if not self.summaries_dir.exists():
            return []
        pattern = re.compile(r"^horizon-(\d{4}-\d{2}-\d{2})(?:-(.+))?\.md$")
        query = query.strip().casefold()
        entries = []
        for path in self.summaries_dir.glob("horizon-*.md"):
            match = pattern.fullmatch(path.name)
            if not match:
                continue
            stat = path.stat()
            markdown = path.read_text(encoding="utf-8")
            if query and query not in markdown.casefold() and query not in path.name.casefold():
                continue
            title = next((line.lstrip("# ").strip() for line in markdown.splitlines() if line.startswith("# ")), path.stem)
            entries.append(
                {
                    "filename": path.name,
                    "date": match.group(1),
                    "language": match.group(2) or "unknown",
                    "title": title,
                    "size": stat.st_size,
                    "modified_at": stat.st_mtime,
                    "path": str(path),
                }
            )
        entries.sort(key=lambda item: (item["date"], item["modified_at"]), reverse=True)
        return entries

    def get_archive(self, filename: str) -> dict[str, Any]:
        if not re.fullmatch(r"horizon-\d{4}-\d{2}-\d{2}(?:-[A-Za-z0-9_-]+)?\.md", filename):
            raise GatewayError("无效的日报文件名。")
        path = (self.summaries_dir / filename).resolve()
        if path.parent != self.summaries_dir.resolve() or not path.is_file():
            raise GatewayError("日报不存在。")
        return {"filename": filename, "markdown": path.read_text(encoding="utf-8"), "path": str(path)}
