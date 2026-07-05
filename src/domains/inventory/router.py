"""inventory 도메인 HTTP 라우터 — agent 수집 데이터 수신."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.identity.dependencies import (
    ClusterAgentIdentity,
    require_cluster_access,
    require_cluster_agent,
    require_session,
)
from domains.inventory.events import InventorySnapshotRecordedBody
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import InventorySnapshotRequest
from packages.contracts.gateway.responses import (
    InventoryResourceListResponse,
    InventoryResourceResponse,
    InventorySnapshotResponse,
    InventorySummaryResponse,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.runtime.dependencies import get_db, get_events
from packages.storage.engine import unit_of_work_or_null

router = APIRouter()


@router.post(
    gateway_routes.AGENT_INVENTORY_SNAPSHOTS_PATH,
    response_model=InventorySnapshotResponse,
)
async def record_inventory_snapshot(
    payload: InventorySnapshotRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> InventorySnapshotResponse:
    if payload.cluster_id != identity.cluster_id:
        raise HTTPException(status_code=403, detail="cluster_id does not match agent identity")
    with unit_of_work_or_null(db):
        result = db.save_inventory_snapshot(
            workspace_id=identity.workspace_id,
            cluster_id=identity.cluster_id,
            agent_id=payload.agent_id,
            payload=payload.model_dump(),
        )
        await events.accept_body(
            InventorySnapshotRecordedBody(
                workspace_id=identity.workspace_id,
                cluster_id=identity.cluster_id,
                snapshot_id=result["snapshot_id"],
                agent_id=payload.agent_id,
                resource_count=result["resource_count"],
                resource_types=result["resource_types"],
            )
        )
    return InventorySnapshotResponse(**result)


def require_inventory_access(db: Any, current: Any, workspace_id: str, cluster_id: str) -> None:
    require_cluster_access(
        db,
        current,
        workspace_id,
        cluster_id,
        Permission.INVENTORY_READ.value,
    )


def inventory_list_response(
    db: Any,
    *,
    workspace_id: str,
    cluster_id: str,
    resource_type: str | None,
    namespace: str | None,
    include_deleted: bool,
    limit: int,
) -> InventoryResourceListResponse:
    resources = db.list_inventory_resources(
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type=resource_type,
        namespace=namespace,
        include_deleted=include_deleted,
        limit=limit,
    )
    return InventoryResourceListResponse(
        cluster_id=cluster_id,
        resource_type=resource_type,
        resources=[InventoryResourceResponse(**resource) for resource in resources],
    )


@router.get(
    gateway_routes.CLUSTER_INVENTORY_RESOURCES_PATH,
    response_model=InventoryResourceListResponse,
)
async def list_inventory_resources(
    cluster_id: str,
    resource_type: str | None = None,
    namespace: str | None = None,
    include_deleted: bool = False,
    limit: int = Query(default=200, ge=1, le=1000),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> InventoryResourceListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_inventory_access(db, current, workspace_id, cluster_id)
    return inventory_list_response(
        db,
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type=resource_type,
        namespace=namespace,
        include_deleted=include_deleted,
        limit=limit,
    )


@router.get(
    gateway_routes.CLUSTER_INVENTORY_WORKLOADS_PATH,
    response_model=InventoryResourceListResponse,
)
async def list_inventory_workloads(
    cluster_id: str,
    namespace: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> InventoryResourceListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_inventory_access(db, current, workspace_id, cluster_id)
    return inventory_list_response(
        db,
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type="workload",
        namespace=namespace,
        include_deleted=False,
        limit=limit,
    )


@router.get(
    gateway_routes.CLUSTER_INVENTORY_SERVICES_PATH,
    response_model=InventoryResourceListResponse,
)
async def list_inventory_services(
    cluster_id: str,
    namespace: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> InventoryResourceListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_inventory_access(db, current, workspace_id, cluster_id)
    return inventory_list_response(
        db,
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type="service",
        namespace=namespace,
        include_deleted=False,
        limit=limit,
    )


@router.get(
    gateway_routes.CLUSTER_INVENTORY_EVENTS_PATH,
    response_model=InventoryResourceListResponse,
)
async def list_inventory_events(
    cluster_id: str,
    namespace: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> InventoryResourceListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_inventory_access(db, current, workspace_id, cluster_id)
    return inventory_list_response(
        db,
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type="event",
        namespace=namespace,
        include_deleted=False,
        limit=limit,
    )


@router.get(
    gateway_routes.CLUSTER_INVENTORY_SUMMARY_PATH,
    response_model=InventorySummaryResponse,
)
async def get_inventory_summary(
    cluster_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> InventorySummaryResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_inventory_access(db, current, workspace_id, cluster_id)
    return InventorySummaryResponse(
        cluster_id=cluster_id,
        latest_snapshot=db.latest_inventory_snapshot(workspace_id, cluster_id),
        counts=db.inventory_resource_counts(workspace_id, cluster_id),
    )
