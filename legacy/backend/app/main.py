"""FastAPI 入口。啟動：uvicorn app.main:app --reload（在 backend 資料夾中執行）。"""
from __future__ import annotations

from contextlib import asynccontextmanager
import logging
import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import database
from .api import admin, analyze, privacy, research
from .config import FROZEN, FRONTEND_DIST, get_settings
from .research import seed_reference_data
from .services import media
from .services.analysis_service import purge_expired
from .services.risk_analyzer import RULE_VERSION

VERSION = "0.1.0"
log = logging.getLogger("scamcheck")
_last_purge = 0.0


def _maintenance():
    global _last_purge
    if time.time() - _last_purge < 600:
        return
    _last_purge = time.time()
    db = database.SessionLocal()
    try:
        purge_expired(db, get_settings())
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    database.init_db()
    db = database.SessionLocal()
    try:
        seed_reference_data(db)
    finally:
        db.close()
    _maintenance()
    media.cleanup_stale_tmp(settings)
    if settings.environment == "production" and not settings.admin_enabled:
        log.warning("管理員功能未設定：ADMIN_PASSWORD_HASH / SECRET_KEY")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=VERSION, lifespan=lifespan,
                  docs_url="/api/docs" if settings.environment != "production" else None, redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=False,
                       allow_methods=["GET", "POST", "PATCH"], allow_headers=["Authorization", "Content-Type"])

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        _maintenance()
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/docs"):
            response.headers["Cache-Control"] = "no-store"
        else:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; "
                "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
            ) if not request.url.path.startswith("/api/docs") else response.headers.get("Content-Security-Policy", "")
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError):
        fields = [".".join(str(p) for p in e.get("loc", [])[1:]) for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": f"輸入格式不正確：{', '.join(f for f in fields if f) or '請檢查內容'}"})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        log.exception("unhandled error")  # 不回傳內部細節
        return JSONResponse(status_code=500, content={"detail": "伺服器發生錯誤，請稍後再試。"})

    for r in (analyze.router, research.router, privacy.router, admin.router):
        app.include_router(r)

    @app.get("/api/health")
    def health():
        s = get_settings()
        return {
            "status": "ok", "version": VERSION, "rule_version": RULE_VERSION,
            "modes": {
                "cofacts": "live" if s.cofacts_live else "mock",
                "ai": s.ai_mode,
                "ai_model": s.gemini_model if s.ai_mode == "gemini" else None,
                "ocr": "available" if media.ocr_available() else "unavailable",
                "ffmpeg": "available" if media.ffmpeg_path() else "unavailable",
                "research_mode": "formal" if s.research_is_formal else "simulation",
                "research_collection_enabled": s.research_collection_enabled,
                "admin_configured": s.admin_enabled,
                "portable": FROZEN,
            },
            "limits": {"max_text_chars": s.max_text_chars, "max_image_mb": s.max_image_mb, "max_video_mb": s.max_video_mb,
                       "max_video_seconds": s.max_video_seconds},
        }

    # 若已建置前端（frontend/dist），由同一個伺服器提供網頁
    dist = FRONTEND_DIST
    if dist.exists():
        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            if full_path.startswith("api/"):
                return JSONResponse(status_code=404, content={"detail": "找不到 API。"})
            target = (dist / full_path).resolve()
            if full_path and target.is_file() and dist.resolve() in target.parents:
                return FileResponse(target)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
