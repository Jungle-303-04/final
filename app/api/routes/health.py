from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.db.session import check_database

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
def readyz() -> dict[str, object]:
    settings = get_settings()
    checks = {"database": "ok"}

    try:
        check_database()
    except Exception as exc:
        checks["database"] = "failed"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "not_ready", "checks": checks},
        ) from exc

    return {
        "status": "ready",
        "service": settings.app_name,
        "env": settings.app_env,
        "version": settings.app_version,
        "checks": checks,
    }
