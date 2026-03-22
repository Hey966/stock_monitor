from __future__ import annotations

from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.api.routes.monitor import router as monitor_router
from app.api.routes.webhook import router as webhook_router
from app.config import settings
from app.logger import get_logger

logger = get_logger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

    app.include_router(health_router)
    app.include_router(webhook_router)
    app.include_router(monitor_router)

    @app.on_event("startup")
    async def on_startup() -> None:
        logger.info("Application startup")

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        logger.info("Application shutdown")

    return app


app = create_app()