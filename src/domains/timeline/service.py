"""Server-side Timeline query resolution.

This layer turns a browser request into an observed, source-authorized ledger
boundary.  It deliberately owns neither HTTP serialization nor SQL: keeping
those concerns separate makes the same resolution usable by retained snapshots
and the later resumable SSE reader.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException

from domains.target.connectivity import cluster_connection_status
from domains.timeline.access import (
    AuthorizedTimelineScope,
    require_timeline_capability_access,
    require_timeline_cluster_ids,
    resolve_authorized_timeline_scope,
)
from domains.timeline.cursor import TimelineCursorBinding
from domains.timeline.predicate import TimelineEvidencePredicate
from domains.timeline.repository import TimelineLedgerReadScope
from domains.timeline.settings import (
    timeline_capability_descriptor,
    timeline_control_selection_is_valid,
    timeline_max_window_ms,
    timeline_realtime_policy,
)
from packages.contracts.parity import ClusterScope, Freshness
from packages.contracts.timeline import (
    RealtimePolicy,
    TimelineCapabilityDescriptor,
    TimelineQuery,
)

INVALID_WINDOW_DETAIL = "timeline window exceeds the server read limit"
INVALID_CONTROL_SELECTION_DETAIL = "timeline control selection is unavailable"
SCOPE_NOT_FOUND_DETAIL = "timeline scope not found"
FRESHNESS_UNAVAILABLE_DETAIL = "timeline freshness is unavailable"


@dataclass(frozen=True)
class TimelineReadResolution:
    """One immutable read boundary shared by snapshot and replay transports."""

    authorized: AuthorizedTimelineScope
    # Query identity intentionally excludes collection freshness.  The latter
    # is observed output and must never influence a replay cursor binding.
    query: TimelineQuery
    scopes: tuple[ClusterScope, ...]
    read_scope: TimelineLedgerReadScope
    evidence_predicate: TimelineEvidencePredicate
    cursor_binding: TimelineCursorBinding
    policy: RealtimePolicy
    capabilities: TimelineCapabilityDescriptor


async def resolve_timeline_capabilities(
    db: Any,
    current: Any,
) -> TimelineCapabilityDescriptor:
    """Return the one server-owned descriptor without creating a read session.

    No query, freshness observation, evidence predicate, replay cursor, or
    subscription is necessary for this first-render bootstrap read.  It still
    resolves all source-specific workspace grants before exposing metadata.
    """
    authorized = await resolve_authorized_timeline_scope(db, current)
    require_timeline_capability_access(authorized)
    return timeline_capability_descriptor()


async def resolve_timeline_read(
    db: Any,
    current: Any,
    requested_query: TimelineQuery,
) -> TimelineReadResolution:
    """Authorize one query and derive freshness only from persisted agent state."""
    _validate_window(requested_query)
    _validate_control_selection(requested_query)
    authorized = await resolve_authorized_timeline_scope(db, current)
    requested_workspace_id = requested_query.scopes[0].workspace_id
    if requested_workspace_id != authorized.workspace_id:
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)

    requested_cluster_ids = {scope.cluster_id for scope in requested_query.scopes}
    require_timeline_cluster_ids(authorized, requested_cluster_ids)
    scopes = await _observed_scopes(db, authorized.workspace_id, requested_query.scopes)
    read_scope = TimelineLedgerReadScope(
        workspace_id=authorized.workspace_id,
        scopes=scopes,
        inventory_cluster_ids=authorized.cluster_ids & requested_cluster_ids,
        kubernetes_event_cluster_ids=authorized.cluster_ids & requested_cluster_ids,
        incident_cluster_ids=authorized.incident_cluster_ids & requested_cluster_ids,
        application_workflow_ids=authorized.deployment_application_ids,
        gitops_application_ids=authorized.application_ids,
    )
    evidence_predicate = TimelineEvidencePredicate.from_query(read_scope, requested_query)
    binding = TimelineCursorBinding.from_query(
        user_id=authorized.user_id,
        authorization_revision=authorized.authorization_revision,
        query=requested_query,
    )
    return TimelineReadResolution(
        authorized=authorized,
        query=requested_query,
        scopes=scopes,
        read_scope=read_scope,
        evidence_predicate=evidence_predicate,
        cursor_binding=binding,
        policy=timeline_realtime_policy(),
        capabilities=timeline_capability_descriptor(),
    )


def _validate_window(query: TimelineQuery) -> None:
    if query.window.to_ms - query.window.from_ms > timeline_max_window_ms():
        raise HTTPException(status_code=422, detail=INVALID_WINDOW_DETAIL)


def _validate_control_selection(query: TimelineQuery) -> None:
    """Reject controls that are absent or unavailable in this deployment."""
    if not timeline_control_selection_is_valid(query):
        raise HTTPException(status_code=422, detail=INVALID_CONTROL_SELECTION_DETAIL)


async def _observed_scopes(
    db: Any,
    workspace_id: str,
    requested_scopes: tuple[ClusterScope, ...],
) -> tuple[ClusterScope, ...]:
    getter = getattr(db, "latest_cluster_agent_statuses", None)
    if not callable(getter):
        raise HTTPException(status_code=503, detail=FRESHNESS_UNAVAILABLE_DETAIL)
    cluster_ids = {scope.cluster_id for scope in requested_scopes}
    try:
        statuses = await asyncio.to_thread(getter, workspace_id, cluster_ids)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=FRESHNESS_UNAVAILABLE_DETAIL) from exc
    if not isinstance(statuses, Mapping):
        raise HTTPException(status_code=503, detail=FRESHNESS_UNAVAILABLE_DETAIL)
    return tuple(
        scope.model_copy(update={"freshness": _observed_freshness(statuses.get(scope.cluster_id))})
        for scope in requested_scopes
    )


def _observed_freshness(agent: object) -> Freshness:
    status = cluster_connection_status(agent if isinstance(agent, Mapping) else None)
    if status == "online":
        return "live"
    if status == "stale":
        return "stale"
    return "disconnected"
