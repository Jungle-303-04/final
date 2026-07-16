"""Authenticated Workload Detail route backed only by safe inventory projection."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from domains.identity.dependencies import require_cluster_access, require_session
from domains.workload_detail.projection import (
    WorkloadDetailIdentityUnavailable,
    WorkloadDetailNotFound,
    WorkloadDetailUnavailable,
    workload_detail_projection,
)
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.contracts.workload_detail import WorkloadDetailResponse
from packages.runtime.dependencies import get_db

KUBERNETES_NAME_PATTERN = r"^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$"
KUBERNETES_NAMESPACE_PATTERN = r"^(?:_|[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)$"
KUBERNETES_KIND_PATTERN = r"^[A-Za-z][A-Za-z0-9.-]*$"

router = APIRouter()


@router.get(
    gateway_routes.WORKLOAD_DETAIL_PATH,
    response_model=WorkloadDetailResponse,
)
async def get_workload_detail(
    kind: str = Path(min_length=1, max_length=120, pattern=KUBERNETES_KIND_PATTERN),
    namespace: str = Path(min_length=1, max_length=63, pattern=KUBERNETES_NAMESPACE_PATTERN),
    name: str = Path(min_length=1, max_length=253, pattern=KUBERNETES_NAME_PATTERN),
    cluster_id: str = Query(min_length=1, max_length=512),
    api_group: str = Query(default="", max_length=253, alias="apiGroup"),
    api_version: str = Query(min_length=1, max_length=63, alias="apiVersion"),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> WorkloadDetailResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_cluster_access(
        db,
        current,
        workspace_id,
        cluster_id,
        Permission.INVENTORY_READ.value,
    )
    try:
        detail = workload_detail_projection(
            db,
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            api_group=api_group,
            api_version=api_version,
            kind=kind,
            namespace=None if namespace == "_" else namespace,
            name=name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="workload API identity is invalid") from exc
    except WorkloadDetailNotFound as exc:
        raise HTTPException(status_code=404, detail="workload observation not found") from exc
    except WorkloadDetailIdentityUnavailable as exc:
        raise HTTPException(status_code=409, detail="workload identity is incomplete") from exc
    except WorkloadDetailUnavailable as exc:
        raise HTTPException(status_code=503, detail="workload observation is unavailable") from exc
    return WorkloadDetailResponse(detail=detail)
