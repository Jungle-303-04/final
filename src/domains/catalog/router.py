"""서비스 카탈로그 API 라우트."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.identity.dependencies import require_cluster_access, require_session
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import CatalogInstallRequest
from packages.contracts.gateway.responses import (
    CatalogInstallRunResponse,
    CatalogItemListResponse,
    CatalogItemResponse,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.runtime.dependencies import get_db

router = APIRouter()
HTTP_NOT_FOUND = 404
CATALOG_ITEM_NOT_FOUND = "catalog item not found"


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


def catalog_install_plan(
    item: dict[str, Any],
    version: dict[str, Any],
    payload: CatalogInstallRequest,
) -> dict[str, Any]:
    return {
        "item_id": item["item_id"],
        "slug": item["slug"],
        "version": version["version"],
        "package_type": version["package_type"],
        "package_ref": version["package_ref"],
        "cluster_id": payload.cluster_id,
        "namespace": payload.namespace,
        "application_name": payload.application_name,
        "values_schema": version.get("values_schema", {}),
        "template": version.get("template", {}),
        "steps": ["validate values", "render package", "await approval", "dispatch runner job"],
    }


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
    response_model=CatalogInstallRunResponse,
)
async def install_catalog_item(
    item_id: str,
    payload: CatalogInstallRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> CatalogInstallRunResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    item = catalog_item_or_404(db, item_id)
    version = catalog_version_or_default(item, payload.version)
    require_cluster_access(
        db,
        current,
        workspace_id,
        payload.cluster_id,
        Permission.DEPLOY_RUN.value,
    )
    plan = catalog_install_plan(item, version, payload)
    install = db.record_catalog_install_run(
        workspace_id=workspace_id,
        item_id=str(item["item_id"]),
        version=str(version["version"]),
        cluster_id=payload.cluster_id,
        namespace=payload.namespace,
        application_name=payload.application_name,
        requested_by=current.user_id,
        values=payload.values,
        plan=plan,
    )
    return CatalogInstallRunResponse(install=install)
