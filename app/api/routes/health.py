from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
def readyz() -> dict[str, str]:
    settings = get_settings()
    return {
        "status": "ready",
        "service": settings.app_name,
        "env": settings.app_env,
        "version": settings.app_version,
    }
