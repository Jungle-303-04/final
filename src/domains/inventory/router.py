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
from domains.inventory.capabilities import resource_capabilities_response
from domains.inventory.events import InventorySnapshotRecordedBody
from domains.inventory.ingest import ingest_inventory_snapshot
from domains.inventory.provider_detail import provider_detail_projection
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import InventorySnapshotRequest
from packages.contracts.gateway.responses import (
    ClusterUsageResponse,
    ClusterUsageSample,
    InventoryResourceDetailResponse,
    InventoryResourceListResponse,
    InventoryResourceResponse,
    InventorySnapshotResponse,
    InventorySummaryResponse,
    ResourceCapabilitiesResponse,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.runtime.dependencies import get_db, get_events, get_timeline_fanout

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
    timeline_fanout: Any = Depends(get_timeline_fanout),
) -> InventorySnapshotResponse:
    if payload.cluster_id != identity.cluster_id:
        raise HTTPException(status_code=403, detail="cluster_id does not match agent identity")

    async def record_snapshot_event(result: dict[str, Any]) -> None:
        # An ignored stale observation is retained only for collection audit; it
        # must not impersonate an accepted inventory state transition downstream.
        if result.get("accepted") is not True:
            return
        await events.accept_body(
            InventorySnapshotRecordedBody(
                workspace_id=identity.workspace_id,
                cluster_id=identity.cluster_id,
                snapshot_id=str(result["snapshot_id"]),
                agent_id=payload.agent_id,
                resource_count=int(result["resource_count"]),
                resource_types=list(result["resource_types"]),
            )
        )

    result = await ingest_inventory_snapshot(
        db=db,
        workspace_id=identity.workspace_id,
        cluster_id=identity.cluster_id,
        agent_id=payload.agent_id,
        payload=payload.model_dump(),
        fanout=timeline_fanout,
        after_persist=record_snapshot_event,
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
        resources=[
            InventoryResourceResponse(**public_inventory_resource(resource))
            for resource in resources
        ],
    )


def public_inventory_resource(resource: dict[str, Any]) -> dict[str, Any]:
    """Browser inventory list response에서 raw Kubernetes object를 제거한다."""
    item = dict(resource)
    item.pop("raw", None)
    return item


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
    gateway_routes.CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH,
    response_model=InventoryResourceDetailResponse,
)
async def get_inventory_resource_detail(
    cluster_id: str,
    resource_type: str = Query(min_length=1, max_length=80),
    kind: str = Query(min_length=1, max_length=120),
    name: str = Query(min_length=1, max_length=253),
    namespace: str | None = Query(default=None, max_length=253),
    related_limit: int = Query(default=100, ge=1, le=1000),
    event_limit: int = Query(default=50, ge=1, le=200),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> InventoryResourceDetailResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_inventory_access(db, current, workspace_id, cluster_id)
    resource = db.get_inventory_resource(
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type=resource_type,
        kind=kind,
        namespace=namespace,
        name=name,
    )
    if resource is None:
        raise HTTPException(status_code=404, detail="inventory resource not found")
    public_resource = public_inventory_resource(resource)
    related = {
        group: [InventoryResourceResponse(**public_inventory_resource(item)) for item in items]
        for group, items in db.list_related_inventory_resources(
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            resource=resource,
            limit=related_limit,
        ).items()
    }
    events = [
        InventoryResourceResponse(**public_inventory_resource(event))
        for event in db.list_resource_events(
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            resource=resource,
            limit=event_limit,
        )
    ]
    return InventoryResourceDetailResponse(
        cluster_id=cluster_id,
        identity={
            "resource_type": resource_type.strip().lower(),
            "kind": kind,
            "namespace": namespace,
            "name": name,
        },
        resource=InventoryResourceResponse(**public_resource),
        provider_detail=provider_detail_projection(resource),
        related=related,
        events=events,
    )


@router.get(
    gateway_routes.RESOURCE_CAPABILITIES_PATH,
    response_model=ResourceCapabilitiesResponse,
)
async def get_resource_capabilities(
    resource: str = Query(min_length=1, max_length=255),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ResourceCapabilitiesResponse:
    """권한·지원·안전 정책을 모두 만족하는 resource action만 공개한다."""
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    inventory_resource = db.get_inventory_resource_by_key(
        workspace_id=workspace_id,
        inventory_key=resource,
    )
    if inventory_resource is None:
        raise HTTPException(status_code=404, detail="inventory resource not found")
    cluster_id = str(inventory_resource["cluster_id"])
    require_inventory_access(db, current, workspace_id, cluster_id)
    return resource_capabilities_response(
        db,
        workspace_id=workspace_id,
        current=current,
        resource=inventory_resource,
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


@router.get(gateway_routes.CLUSTER_USAGE_PATH, response_model=ClusterUsageResponse)
async def get_cluster_usage(
    cluster_id: str,
    limit: int = Query(default=288, ge=1, le=2000),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ClusterUsageResponse:
    """스냅샷마다 적재되는 실측 usage 롤업 시계열 — 콘솔 추이 차트용."""
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_inventory_access(db, current, workspace_id, cluster_id)
    samples = db.list_cluster_usage_samples(workspace_id, cluster_id, limit=limit)
    return ClusterUsageResponse(
        cluster_id=cluster_id,
        samples=[ClusterUsageSample(**sample) for sample in samples],
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
