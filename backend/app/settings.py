from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import tempfile
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
SETTINGS_PATH = APP_ROOT / "runtime" / "settings.json"


@dataclass
class AppSettings:
    horizon_path: str = ""
    config_path: str = ""
    port: int = 8765

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_settings() -> AppSettings:
    if not SETTINGS_PATH.exists():
        return AppSettings(
            horizon_path=os.getenv("HORIZON_PATH", ""),
            config_path=os.getenv("HORIZON_CONFIG_PATH", ""),
            port=int(os.getenv("HORIZON_PORT", "8765")),
        )

    payload = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    return AppSettings(
        horizon_path=str(payload.get("horizon_path") or os.getenv("HORIZON_PATH", "")),
        config_path=str(payload.get("config_path") or os.getenv("HORIZON_CONFIG_PATH", "")),
        port=int(payload.get("port") or os.getenv("HORIZON_PORT", "8765")),
    )


def save_settings(settings: AppSettings) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(settings.to_dict(), ensure_ascii=False, indent=2) + "\n"
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=SETTINGS_PATH.parent,
            prefix=".settings.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            handle.write(content)
            temp_path = Path(handle.name)
        os.replace(temp_path, SETTINGS_PATH)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def validate_horizon_path(value: str) -> Path:
    path = Path(value).expanduser().resolve()
    if not path.is_dir():
        raise ValueError("Horizon 路径不存在或不是目录。")
    if not (path / "pyproject.toml").is_file() or not (path / "src/mcp/service.py").is_file():
        raise ValueError("该目录不是有效的 Horizon checkout。")
    return path
