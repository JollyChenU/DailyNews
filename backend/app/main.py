from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlsplit

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .gateway import GatewayError, RevisionConflict, ValidationFailure, HorizonGateway
from .settings import APP_ROOT, AppSettings, load_settings, save_settings, validate_horizon_path


class ConfigPayload(BaseModel):
    raw: dict[str, Any]


class SettingsPayload(BaseModel):
    horizon_path: str
    config_path: str = ""
    port: int = Field(default=8765, ge=1024, le=65535)


_gateway: HorizonGateway | None = None
_gateway_error: str | None = None


def active_gateway() -> HorizonGateway:
    global _gateway, _gateway_error
    if _gateway is None:
        settings = load_settings()
        if not settings.horizon_path:
            raise GatewayError("尚未配置 Horizon 路径，请前往设置页面。")
        try:
            _gateway = HorizonGateway(settings.horizon_path, settings.config_path or None)
            _gateway_error = None
        except Exception as exc:
            _gateway_error = str(exc)
            raise GatewayError(str(exc)) from exc
    return _gateway


@asynccontextmanager
async def lifespan(_: FastAPI):
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")
    yield


app = FastAPI(title="Horizon Console", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "PUT", "POST"],
    allow_headers=["Content-Type", "If-Match"],
)


@app.middleware("http")
async def local_boundary(request: Request, call_next):
    host = (request.headers.get("host") or "").split(":")[0].lower()
    client = request.client.host if request.client else ""
    if host not in {"127.0.0.1", "localhost", "testserver"}:
        return JSONResponse(status_code=403, content={"detail": "仅允许本机访问。"})
    if client not in {"127.0.0.1", "::1", "localhost", "testclient"}:
        return JSONResponse(status_code=403, content={"detail": "仅允许本机访问。"})
    if request.method in {"PUT", "POST"}:
        origin = request.headers.get("origin")
        if origin and urlsplit(origin).hostname not in {"127.0.0.1", "localhost"}:
            return JSONResponse(status_code=403, content={"detail": "不允许的跨域写操作。"})
    return await call_next(request)


@app.exception_handler(GatewayError)
async def gateway_error_handler(_: Request, exc: GatewayError):
    status = 409 if isinstance(exc, RevisionConflict) else 422 if isinstance(exc, ValidationFailure) else 503
    payload = exc.payload if isinstance(exc, ValidationFailure) else {"detail": str(exc)}
    return JSONResponse(status_code=status, content=payload)


@app.get("/api/health")
def health():
    return {"ok": True, "name": "Horizon Console"}


@app.get("/api/context")
def context():
    settings = load_settings()
    try:
        gateway = active_gateway()
        active = {
            "horizon_path": str(gateway.horizon_path),
            "config_path": str(gateway.config_path),
            "runs_root": str(gateway.runs_root),
            "summaries_dir": str(gateway.summaries_dir),
        }
        error = None
    except GatewayError as exc:
        active = None
        error = str(exc)
    return {
        "active": active,
        "saved": settings.to_dict(),
        "error": error,
        "restart_required": bool(
            _gateway
            and (
                str(_gateway.horizon_path) != settings.horizon_path
                or str(_gateway.config_path) != settings.config_path
            )
        ),
    }


@app.put("/api/settings")
def update_settings(payload: SettingsPayload):
    try:
        horizon_path = validate_horizon_path(payload.horizon_path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    config_path = Path(payload.config_path).expanduser() if payload.config_path else horizon_path / "data/config.json"
    if not config_path.is_absolute():
        config_path = horizon_path / config_path
    config_path = config_path.resolve()
    if not config_path.is_file():
        raise HTTPException(status_code=422, detail="配置文件不存在。")
    settings = AppSettings(str(horizon_path), str(config_path), payload.port)
    save_settings(settings)
    return {"ok": True, "saved": settings.to_dict(), "restart_required": True}


@app.get("/api/config")
def get_config():
    gateway = active_gateway()
    document = gateway.read_config()
    try:
        profiles = gateway.profiles(document.payload)
        profile_error = None
    except Exception as exc:
        profiles = []
        profile_error = str(exc)
    return {
        "raw_text": document.raw_text,
        "raw": document.payload,
        "revision": document.revision,
        "modified_at": document.modified_at,
        "parse_error": document.parse_error,
        "schema": gateway.config_schema(),
        "profiles": profiles,
        "profile_error": profile_error,
        "backup": gateway.backup_info(),
        "config_path": str(gateway.config_path),
    }


@app.post("/api/config/validate")
async def validate_config(payload: ConfigPayload):
    return await active_gateway().validate_config(payload.raw)


@app.put("/api/config")
async def save_config(payload: ConfigPayload, if_match: str | None = Header(default=None)):
    gateway = active_gateway()
    if not if_match:
        raise HTTPException(status_code=428, detail="缺少 If-Match 版本号。")
    validation = await gateway.validate_config(payload.raw)
    if not validation.get("ok"):
        raise ValidationFailure(validation)
    return gateway.save_config(payload.raw, if_match.strip('"'))


@app.get("/api/runs")
def list_runs(limit: int = Query(default=100, ge=1, le=500)):
    return active_gateway().list_runs(limit)


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    return active_gateway().get_run(run_id)


@app.get("/api/runs/{run_id}/stages/{stage}")
def get_stage(
    run_id: str,
    stage: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    query: str = "",
    source: str = "",
    profile: str = "",
):
    return active_gateway().get_stage(run_id, stage, offset, limit, query, source, profile)


@app.get("/api/runs/{run_id}/item")
def get_item(run_id: str, stage: str = Query(...), item_id: str = Query(...)):
    return active_gateway().get_item(run_id, stage, item_id)


@app.get("/api/runs/{run_id}/summary")
def get_summary(run_id: str, language: str = "zh"):
    return active_gateway().get_summary(run_id, language)


@app.get("/api/archives")
def list_archives(query: str = ""):
    return {"items": active_gateway().list_archives(query)}


@app.get("/api/archives/{filename}")
def get_archive(filename: str):
    return active_gateway().get_archive(filename)


frontend_dist = APP_ROOT / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def frontend(full_path: str):
        candidate = (frontend_dist / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(frontend_dist.resolve()):
            return FileResponse(candidate)
        return FileResponse(frontend_dist / "index.html")
