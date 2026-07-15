"""HTTP boundaries for evidence-first Checks reads."""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from domains.checks.observation_projection import checks_detail, checks_overview
from domains.identity.dependencies import require_session, resolve_allowed_cluster_ids
from domains.inventory_filter.query import parse_facet_values
from packages.contracts.checks.observations import ChecksDetailResponse, ChecksOverviewResponse
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.runtime.dependencies import get_db

router = APIRouter()

INVALID_SCOPE_DETAIL = "Checks scope is invalid"
SCOPE_NOT_FOUND_DETAIL = "Checks scope not found"
INVALID_CHECK_ID_DETAIL = "Check identifier is invalid"


@router.get(gateway_routes.CHECKS_OVERVIEW_PATH, response_model=ChecksOverviewResponse)
async def get_checks_overview(
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ChecksOverviewResponse:
    """Read scope-aware checks availability without claiming an empty evaluation."""

    scope = await _authorized_scope(
        clusters=clusters, namespaces=namespaces, current=current, db=db
    )
    return checks_overview(**scope)


@router.get(gateway_routes.CHECKS_DETAIL_PATH, response_model=ChecksDetailResponse)
async def get_checks_detail(
    check_id: str = Path(min_length=1, max_length=253),
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ChecksDetailResponse:
    """Preserve direct URL intent while catalog materialization is unavailable."""

    requested_check_id = _check_id(check_id)
    scope = await _authorized_scope(
        clusters=clusters, namespaces=namespaces, current=current, db=db
    )
    return checks_detail(requested_check_id=requested_check_id, **scope)


async def _authorized_scope(
    *,
    clusters: str | None,
    namespaces: str | None,
    current: Any,
    db: Any,
) -> dict[str, object]:
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
    selected_cluster_ids = tuple(sorted(requested_scope_clusters or allowed_clusters))
    contexts = await asyncio.to_thread(
        db.filter_snapshot_contexts,
        workspace_id,
        selected_cluster_ids,
    )
    return {
        "workspace_id": workspace_id,
        "contexts": contexts,
        "namespace_refs": requested_namespaces,
        "selected_cluster_ids": selected_cluster_ids,
    }


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


def _check_id(value: str) -> str:
    normalized = value.strip()
    if (
        normalized != value
        or not normalized
        or any(ord(character) < 32 for character in normalized)
    ):
        raise HTTPException(status_code=422, detail=INVALID_CHECK_ID_DETAIL)
    return normalized
