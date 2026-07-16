"""HTTP boundary for scoped Cost observation availability."""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.cost.observation_projection import cost_overview
from domains.identity.dependencies import require_session, resolve_allowed_cluster_ids
from domains.inventory_filter.query import parse_facet_values
from packages.contracts.cost.observations import CostOverviewResponse, CostTimeRange
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.runtime.dependencies import get_db

router = APIRouter()

INVALID_SCOPE_DETAIL = "Cost scope is invalid"
SCOPE_NOT_FOUND_DETAIL = "Cost scope not found"


@router.get(gateway_routes.COST_OVERVIEW_PATH, response_model=CostOverviewResponse)
async def get_cost_overview(
    clusters: str | None = Query(default=None),
    time_range: CostTimeRange = Query(default="24h", alias="range"),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> CostOverviewResponse:
    """Return only evidence that exists in the caller's inventory scope."""

    requested_clusters = _selected("clusters", clusters)
    workspace_id = _workspace_id(current)
    allowed_clusters = await asyncio.to_thread(
        resolve_allowed_cluster_ids,
        db,
        current,
        workspace_id,
        Permission.INVENTORY_READ.value,
    )
    _require_requested_clusters(requested_clusters, allowed_clusters)
    selected_clusters = tuple(sorted(requested_clusters or allowed_clusters))
    contexts = await asyncio.to_thread(
        db.filter_snapshot_contexts,
        workspace_id,
        selected_clusters,
    )
    return cost_overview(
        workspace_id=workspace_id,
        contexts=contexts,
        selected_cluster_ids=selected_clusters,
        time_range=time_range,
    )


def _workspace_id(current: Any) -> str:
    return str(getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID) or DEFAULT_WORKSPACE_ID)


def _selected(axis: str, value: str | None) -> tuple[str, ...]:
    try:
        return parse_facet_values(axis, value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=INVALID_SCOPE_DETAIL) from exc


def _require_requested_clusters(requested: Iterable[str], allowed: set[str]) -> None:
    if not set(requested).issubset(allowed):
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)
