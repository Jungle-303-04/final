"""HTTP boundary for truthful, read-only traffic availability."""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.identity.dependencies import require_session, resolve_allowed_cluster_ids
from domains.inventory_filter.query import parse_facet_values
from domains.traffic.observation_projection import traffic_overview
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.contracts.traffic.observations import TrafficOverviewResponse
from packages.runtime.dependencies import get_db

router = APIRouter()

INVALID_SCOPE_DETAIL = "Traffic scope is invalid"
SCOPE_NOT_FOUND_DETAIL = "Traffic scope not found"


@router.get(gateway_routes.TRAFFIC_OVERVIEW_PATH, response_model=TrafficOverviewResponse)
async def get_traffic_overview(
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> TrafficOverviewResponse:
    """Report selected scope state without treating absent data as zero traffic."""

    requested_clusters = _selected("clusters", clusters)
    requested_namespaces = _namespace_refs(namespaces)
    workspace_id = _workspace_id(current)
    allowed_clusters = await asyncio.to_thread(
        resolve_allowed_cluster_ids,
        db,
        current,
        workspace_id,
        Permission.INVENTORY_READ.value,
    )
    requested_scope_clusters = set(requested_clusters) | {
        cluster_id for cluster_id, _namespace in requested_namespaces
    }
    _require_requested_clusters(requested_scope_clusters, allowed_clusters)
    selected_clusters = tuple(sorted(requested_scope_clusters or allowed_clusters))
    contexts = await asyncio.to_thread(
        db.filter_snapshot_contexts,
        workspace_id,
        selected_clusters,
    )
    return traffic_overview(
        workspace_id=workspace_id,
        contexts=contexts,
        namespace_refs=requested_namespaces,
        selected_cluster_ids=selected_clusters,
    )


def _workspace_id(current: Any) -> str:
    return str(getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID) or DEFAULT_WORKSPACE_ID)


def _selected(axis: str, value: str | None) -> tuple[str, ...]:
    try:
        return parse_facet_values(axis, value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=INVALID_SCOPE_DETAIL) from exc


def _namespace_refs(value: str | None) -> tuple[tuple[str, str], ...]:
    selected = _selected("namespaces", value)
    return tuple(token.rpartition("/")[::2] for token in selected)


def _require_requested_clusters(requested: Iterable[str], allowed: set[str]) -> None:
    if not set(requested).issubset(allowed):
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)
