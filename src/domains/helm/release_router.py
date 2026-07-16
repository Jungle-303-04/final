"""HTTP boundary for the read-only Helm release projection."""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.helm.release_projection import helm_release_detail, helm_release_list
from domains.identity.dependencies import require_session, resolve_allowed_cluster_ids
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.helm.releases import HelmReleaseDetailResponse, HelmReleaseListResponse
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.runtime.dependencies import get_db

router = APIRouter()

INVALID_SCOPE_DETAIL = "Helm release scope is invalid"
SCOPE_NOT_FOUND_DETAIL = "Helm release scope not found"
RELEASE_NOT_FOUND_DETAIL = "Helm release not found"
MAX_SCOPE_VALUES = 200


@router.get(gateway_routes.HELM_RELEASES_PATH, response_model=HelmReleaseListResponse)
async def get_helm_releases(
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> HelmReleaseListResponse:
    """List only releases inferred from authorized inventory label metadata."""

    requested_clusters = _scope_values(clusters)
    requested_namespaces = _scope_values(namespaces)
    workspace_id = _workspace_id(current)
    allowed_clusters = await asyncio.to_thread(
        resolve_allowed_cluster_ids,
        db,
        current,
        workspace_id,
        Permission.INVENTORY_READ.value,
    )
    _require_requested_clusters(requested_clusters, allowed_clusters)
    selected_clusters = requested_clusters or tuple(sorted(allowed_clusters))
    contexts = await asyncio.to_thread(
        db.helm_release_observation_contexts,
        workspace_id=workspace_id,
        cluster_ids=selected_clusters,
    )
    agent_statuses = await asyncio.to_thread(
        db.latest_cluster_agent_statuses,
        workspace_id,
        set(selected_clusters),
    )
    storage_rows = await asyncio.to_thread(
        db.list_helm_storage_observations,
        workspace_id=workspace_id,
        cluster_ids=selected_clusters,
        namespaces=requested_namespaces,
    )
    return helm_release_list(
        storage_rows,
        contexts=contexts,
        agent_statuses=agent_statuses,
        selected_cluster_ids=selected_clusters,
    )


@router.get(
    gateway_routes.HELM_RELEASE_PATH,
    response_model=HelmReleaseDetailResponse,
)
async def get_helm_release(
    namespace: str,
    release_name: str,
    cluster_id: str = Query(min_length=1),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> HelmReleaseDetailResponse:
    """Read one exact authorized storage scope; no provider fallback is attempted."""

    selected_namespace = _single_scope_value(namespace)
    selected_release = _single_scope_value(release_name)
    selected_cluster = _single_scope_value(cluster_id)
    workspace_id = _workspace_id(current)
    allowed_clusters = await asyncio.to_thread(
        resolve_allowed_cluster_ids,
        db,
        current,
        workspace_id,
        Permission.INVENTORY_READ.value,
    )
    _require_requested_clusters((selected_cluster,), allowed_clusters)
    contexts = await asyncio.to_thread(
        db.helm_release_observation_contexts,
        workspace_id=workspace_id,
        cluster_ids=(selected_cluster,),
    )
    agent_statuses = await asyncio.to_thread(
        db.latest_cluster_agent_statuses,
        workspace_id,
        {selected_cluster},
    )
    storage_rows = await asyncio.to_thread(
        db.list_helm_storage_observations,
        workspace_id=workspace_id,
        cluster_ids=(selected_cluster,),
        namespaces=(selected_namespace,),
    )
    detail = helm_release_detail(
        storage_rows,
        contexts=contexts,
        agent_statuses=agent_statuses,
        selected_cluster_id=selected_cluster,
        namespace=selected_namespace,
        release_name=selected_release,
    )
    if detail is None:
        raise HTTPException(status_code=404, detail=RELEASE_NOT_FOUND_DETAIL)
    return detail


def _workspace_id(current: Any) -> str:
    return str(getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID) or DEFAULT_WORKSPACE_ID)


def _scope_values(value: str | None) -> tuple[str, ...]:
    if value is None:
        return ()
    values = tuple(sorted({part.strip() for part in value.split(",") if part.strip()}))
    if not values or len(values) > MAX_SCOPE_VALUES:
        raise HTTPException(status_code=422, detail=INVALID_SCOPE_DETAIL)
    return values


def _single_scope_value(value: str) -> str:
    values = _scope_values(value)
    if len(values) != 1:
        raise HTTPException(status_code=422, detail=INVALID_SCOPE_DETAIL)
    return values[0]


def _require_requested_clusters(requested: Iterable[str], allowed: set[str]) -> None:
    if not set(requested).issubset(allowed):
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)
