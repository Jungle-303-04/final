"""Strict BQ-057 change timeline endpoint."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.changes.partitioned_evidence import (
    ChangeEvidencePartitionLimitExceeded,
    load_partitioned_change_evidence,
)
from domains.changes.repository import MAX_CHANGE_EVENTS, MAX_CHANGE_OBSERVATIONS
from domains.changes.timeline import build_change_timeline
from domains.identity.dependencies import require_session
from domains.inventory_filter.query import ResourceFilters, parse_resource_filters
from domains.timeline.access import (
    require_requested_timeline_scope,
    resolve_authorized_timeline_scope,
    selected_timeline_cluster_ids,
)
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import ChangeTimelineResponse
from packages.runtime.dependencies import get_db

MIN_BUCKET_MS = 1_000
MAX_BUCKET_MS = 3_600_000
MAX_RANGE_MS = 24 * 60 * 60 * 1_000
MAX_BUCKETS = 1_440
MAX_EPOCH_MS = 253_402_300_799_000
MAX_CHANGE_RESPONSE_EVENTS = 10_000
INVALID_REQUEST_DETAIL = "change timeline request is invalid"
RESULT_LIMIT_DETAIL = "change timeline result exceeds the bounded read limit"

router = APIRouter()


@router.get(
    gateway_routes.CHANGES_PATH,
    response_model=ChangeTimelineResponse,
)
async def list_changes(
    from_ms: int = Query(alias="from", ge=0, le=MAX_EPOCH_MS),
    to_ms: int = Query(alias="to", ge=1, le=MAX_EPOCH_MS),
    bucket_ms: int = Query(alias="bucket", ge=MIN_BUCKET_MS, le=MAX_BUCKET_MS),
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    applications: str | None = Query(default=None),
    resources_types: str | None = Query(default=None, alias="resources.types"),
    resources_health: str | None = Query(default=None, alias="resources.health"),
    labels: str | None = Query(default=None),
    resources_q: str | None = Query(default=None, alias="resources.q"),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ChangeTimelineResponse:
    _validate_window(from_ms=from_ms, to_ms=to_ms, bucket_ms=bucket_ms)
    filters = _parse_filters(
        clusters=clusters,
        namespaces=namespaces,
        applications=applications,
        resource_types=resources_types,
        health=resources_health,
        labels=labels,
        query=resources_q,
        include_deleted=False,
    )
    authorized = await resolve_authorized_timeline_scope(db, current)
    require_requested_timeline_scope(authorized, filters)
    required_clusters = selected_timeline_cluster_ids(authorized, filters)
    if not required_clusters:
        return ChangeTimelineResponse(buckets=[], events=[], gaps=[])

    try:
        evidence = await asyncio.to_thread(
            load_partitioned_change_evidence,
            db.list_change_timeline_evidence,
            query={
                "workspace_id": authorized.workspace_id,
                "allowed_cluster_ids": required_clusters,
                "allowed_application_ids": set(authorized.application_ids),
                "allowed_incident_cluster_ids": set(authorized.incident_cluster_ids),
                "allowed_deployment_application_ids": set(authorized.deployment_application_ids),
                "filters": filters,
            },
            from_ms=from_ms,
            to_ms=to_ms,
            leaf_limit=MAX_CHANGE_EVENTS,
            max_events=MAX_CHANGE_RESPONSE_EVENTS,
            max_observations=MAX_CHANGE_OBSERVATIONS,
        )
    except ChangeEvidencePartitionLimitExceeded:
        raise HTTPException(status_code=422, detail=RESULT_LIMIT_DETAIL) from None
    result = build_change_timeline(
        from_ms=from_ms,
        to_ms=to_ms,
        bucket_ms=bucket_ms,
        events=list(evidence.get("events") or []),
        observations=list(evidence.get("observations") or []),
        required_cluster_ids=required_clusters,
    )
    return ChangeTimelineResponse.model_validate(result)


def _validate_window(*, from_ms: int, to_ms: int, bucket_ms: int) -> None:
    width = to_ms - from_ms
    if (
        width <= 0
        or width > MAX_RANGE_MS
        or bucket_ms > width
        or (width + bucket_ms - 1) // bucket_ms > MAX_BUCKETS
    ):
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)


def _parse_filters(**kwargs: Any) -> ResourceFilters:
    try:
        return parse_resource_filters(**kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL) from exc
