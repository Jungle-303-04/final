from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.routes.dummy import router as dummy_router
from app.api.routes.health import router as health_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.db.seed import seed_dummy_items
from app.db.session import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()
    seed_dummy_items()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)
    app.add_middleware(RequestContextMiddleware)

    app.include_router(health_router)
    app.include_router(dummy_router)
    Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": "http_error",
                    "message": str(exc.detail),
                    "request_id": getattr(request.state, "request_id", ""),
                }
            },
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_server_error",
                    "message": "internal server error",
                    "request_id": getattr(request.state, "request_id", ""),
                }
            },
        )

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
