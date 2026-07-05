"""dashboard HTTP API — 권한이 적용된 RCA timeline 조회."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.identity.dependencies import (
    RESOURCE_ACCESS_DENIED_MESSAGE,
    require_cluster_access,
    require_session,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import (
    RcaIncidentResponse,
    RcaTimelineItem,
    RcaTimelineResponse,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, READ_ACCESS, AccessResourceType
from packages.runtime.dependencies import get_db

DEFAULT_TIMELINE_LIMIT = 50
MAX_TIMELINE_LIMIT = 100
NOT_FOUND_CODE = 404
TIMELINE_ITEM_FIELDS = set(RcaTimelineItem.model_fields)

router = APIRouter()


@router.get(
    gateway_routes.DASHBOARD_RCA_TIMELINE_PATH,
    response_model=RcaTimelineResponse,
)
async def rca_timeline(
    cluster_id: str | None = None,
    limit: int = Query(default=DEFAULT_TIMELINE_LIMIT, ge=1, le=MAX_TIMELINE_LIMIT),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> RcaTimelineResponse:
    workspace_id = _workspace_id(current)
    allowed_cluster_ids = await _allowed_cluster_ids(db, current, workspace_id, cluster_id)
    rows = await asyncio.to_thread(
        db.list_rca_timeline,
        workspace_id,
        allowed_cluster_ids,
        limit,
    )
    return RcaTimelineResponse(items=[timeline_item(row) for row in rows])


@router.get(
    gateway_routes.DASHBOARD_RCA_INCIDENT_PATH,
    response_model=RcaIncidentResponse,
)
async def rca_incident(
    incident_id: str,
    cluster_id: str | None = None,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> RcaIncidentResponse:
    workspace_id = _workspace_id(current)
    allowed_cluster_ids = await _allowed_cluster_ids(db, current, workspace_id, cluster_id)
    row = await asyncio.to_thread(
        db.get_rca_timeline_item,
        workspace_id,
        incident_id,
        allowed_cluster_ids,
    )
    if row is None:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail="RCA incident not found")
    return RcaIncidentResponse(item=timeline_item(row))


async def _allowed_cluster_ids(
    db: Any,
    current: Any,
    workspace_id: str,
    cluster_id: str | None,
) -> set[str] | None:
    if cluster_id is not None:
        require_cluster_access(
            db,
            current,
            workspace_id,
            cluster_id,
            READ_ACCESS,
            detail=RESOURCE_ACCESS_DENIED_MESSAGE,
        )
        return {cluster_id}
    return await asyncio.to_thread(
        db.accessible_resource_ids,
        current.user_id,
        workspace_id,
        AccessResourceType.CLUSTER.value,
        READ_ACCESS,
    )


def timeline_item(row: JsonObject) -> RcaTimelineItem:
    data = {key: row.get(key) for key in TIMELINE_ITEM_FIELDS}
    data["supporting_evidence"] = row.get("supporting_evidence") or []
    data["missing_evidence"] = row.get("missing_evidence") or []
    return RcaTimelineItem(**data)


def _workspace_id(current: Any) -> str:
    return getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
