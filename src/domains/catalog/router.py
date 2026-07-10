"""서비스 카탈로그 API 라우트."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.identity.dependencies import require_cluster_access, require_session
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import CatalogInstallRequest
from packages.contracts.gateway.responses import CatalogItemListResponse, CatalogItemResponse
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.runtime.dependencies import get_db

router = APIRouter()
HTTP_NOT_FOUND = 404
HTTP_NOT_IMPLEMENTED = 501
CATALOG_ITEM_NOT_FOUND = "catalog item not found"
CATALOG_INSTALL_RUNNER_UNAVAILABLE = {
    "code": "catalog_install_runner_unavailable",
    "detail": "설치 실행기가 연결되지 않아 카탈로그 설치를 시작할 수 없습니다.",
}


def catalog_item_or_404(db: Any, item_id: str) -> dict[str, Any]:
    item = db.get_catalog_item(item_id)
    if item is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=CATALOG_ITEM_NOT_FOUND)
    return item


def catalog_version_or_default(item: dict[str, Any], version: str | None) -> dict[str, Any]:
    desired_version = version or str(item["default_version"])
    for candidate in item.get("versions", []):
        if candidate["version"] == desired_version:
            return dict(candidate)
    raise HTTPException(status_code=HTTP_NOT_FOUND, detail="catalog item version not found")


@router.get(gateway_routes.CATALOG_ITEMS_PATH, response_model=CatalogItemListResponse)
async def list_catalog_items(
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> CatalogItemListResponse:
    _ = current
    return CatalogItemListResponse(items=db.list_catalog_items())


@router.get(gateway_routes.CATALOG_ITEM_PATH, response_model=CatalogItemResponse)
async def get_catalog_item(
    item_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> CatalogItemResponse:
    _ = current
    return CatalogItemResponse(item=catalog_item_or_404(db, item_id))


@router.post(
    gateway_routes.CATALOG_ITEM_INSTALLS_PATH,
)
async def install_catalog_item(
    item_id: str,
    payload: CatalogInstallRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> None:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    item = catalog_item_or_404(db, item_id)
    catalog_version_or_default(item, payload.version)
    require_cluster_access(
        db,
        current,
        workspace_id,
        payload.cluster_id,
        Permission.DEPLOY_RUN.value,
    )
    raise HTTPException(
        status_code=HTTP_NOT_IMPLEMENTED,
        detail=CATALOG_INSTALL_RUNNER_UNAVAILABLE,
    )
