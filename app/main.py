from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version)

    app.include_router(health_router)

    @app.get("/")
    def root() -> dict[str, str]:
        return {
            "service": settings.app_name,
            "env": settings.app_env,
            "version": settings.app_version,
        }

    @app.get("/api/v1/ping")
    def ping() -> dict[str, str]:
        return {"message": "pong"}

    return app


app = create_app()
