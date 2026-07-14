"""Workspace-scoped Resources filter, facet, and server-side count APIs."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from domains.identity.dependencies import (
    require_session,
    resolve_allowed_application_ids,
    resolve_allowed_cluster_ids,
)
from domains.inventory_filter.cursor import (
    CursorScope,
    FilterCursorCodec,
    authorization_revision,
)
from domains.inventory_filter.graph import build_resource_graph
from domains.inventory_filter.metrics_history import build_resource_metric_history
from domains.inventory_filter.physical_topology import build_physical_topology
from domains.inventory_filter.query import (
    ResourceFilters,
    filter_fingerprint,
    parse_facet_values,
    parse_resource_filters,
)
from domains.inventory_filter.relations_topology import build_relations_topology
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import (
    FilteredInventoryResourceListResponse,
    FilterResultCounts,
    FilterSnapshotMeta,
    GlobalFilterFacetsResponse,
    LabelFacetPageResponse,
    PhysicalTopologyResponse,
    RelationsTopologyResponse,
    ResourceFilterFacetPageResponse,
    ResourceGraphSnapshotResponse,
    ResourceMetricsHistoryResponse,
)
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db

DEFAULT_PAGE_LIMIT = 50
MAX_PAGE_LIMIT = 200
MAX_CURSOR_LENGTH = 8192
DEFAULT_GRAPH_NODE_LIMIT = 200
MAX_GRAPH_NODE_LIMIT = 200
DEFAULT_GRAPH_EDGE_LIMIT = 1000
MAX_GRAPH_EDGE_LIMIT = 2000
MAX_METRIC_HISTORY_IDS = 100
MAX_METRIC_HISTORY_QUERY_LENGTH = 8192
METRIC_HISTORY_RANGE_SECONDS = {
    "15m": 15 * 60,
    "1h": 60 * 60,
    "6h": 6 * 60 * 60,
    "24h": 24 * 60 * 60,
}
FILTER_CURSOR_SIGNING_KEY_ENV = "FILTER_CURSOR_SIGNING_KEY"
INVALID_REQUEST_DETAIL = "resource filter request is invalid"
SCOPE_NOT_FOUND_DETAIL = "resource filter scope not found"
CURSOR_UNAVAILABLE_DETAIL = "resource filter cursor is unavailable"
TOPOLOGY_UNAVAILABLE_DETAIL = "resource topology snapshot is unavailable"

FacetAxis = Literal["clusters", "namespaces", "applications"]

router = APIRouter()


@dataclass(frozen=True)
class AuthorizedFilterScope:
    workspace_id: str
    user_id: str
    roles: tuple[str, ...]
    cluster_ids: frozenset[str]
    application_ids: frozenset[str]
    authorization_revision: str


@dataclass(frozen=True)
class PageState:
    context: dict[str, Any]
    latest_context: dict[str, Any]
    position: dict[str, Any] | None
    scope: CursorScope


@router.get(
    gateway_routes.FILTER_FACETS_PATH,
    response_model=GlobalFilterFacetsResponse,
)
async def list_global_filter_facets(
    q: str | None = Query(default=None, max_length=200),
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    applications: str | None = Query(default=None),
    labels: str | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=20),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> GlobalFilterFacetsResponse:
    filters = _parse_filters(
        clusters=clusters,
        namespaces=namespaces,
        applications=applications,
        resource_types=None,
        health=None,
        labels=labels,
        query=None,
        include_deleted=False,
    )
    authorized = await _authorized_scope(db, current)
    _require_requested_scope(authorized, filters)
    if not authorized.cluster_ids:
        return GlobalFilterFacetsResponse()
    context = await _snapshot_context(db, authorized)
    result = await asyncio.to_thread(
        db.list_global_filter_facets,
        workspace_id=authorized.workspace_id,
        allowed_cluster_ids=set(authorized.cluster_ids),
        allowed_application_ids=set(authorized.application_ids),
        filters=filters,
        snapshot_revision=int(context.get("snapshot_revision") or 0),
        query=q,
        limit=limit,
    )
    return GlobalFilterFacetsResponse.model_validate(
        _global_facets_with_completeness(result, context)
    )


@router.get(
    gateway_routes.TOPOLOGY_PATH,
    response_model=PhysicalTopologyResponse | RelationsTopologyResponse,
)
async def get_topology(
    view: Literal["physical", "relations"] = Query(default="physical"),
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    applications: str | None = Query(default=None),
    resources_types: str | None = Query(default=None, alias="resources.types"),
    resource_types: str | None = Query(default=None, include_in_schema=False),
    resources_health: str | None = Query(default=None, alias="resources.health"),
    health: str | None = Query(default=None, include_in_schema=False),
    labels: str | None = Query(default=None),
    resources_q: str | None = Query(default=None, alias="resources.q"),
    q: str | None = Query(default=None, include_in_schema=False),
    resources_include_deleted: bool | None = Query(
        default=None,
        alias="resources.includeDeleted",
    ),
    include_deleted: bool | None = Query(default=None, include_in_schema=False),
    snapshot_revision: int | None = Query(default=None, ge=1),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> PhysicalTopologyResponse | RelationsTopologyResponse:
    filters = _parse_filters(
        clusters=clusters,
        namespaces=namespaces,
        applications=applications,
        resource_types=_coalesce_text(resources_types, resource_types),
        health=_coalesce_text(resources_health, health),
        labels=labels,
        query=_coalesce_text(resources_q, q),
        include_deleted=_coalesce_bool(resources_include_deleted, include_deleted),
    )
    cluster_id = _single_graph_cluster(filters)
    authorized = await _authorized_scope(db, current)
    _require_requested_scope(authorized, filters)

    latest_global = await _snapshot_context(db, authorized)
    latest_revision = int(latest_global.get("snapshot_revision") or 0)
    target_revision = snapshot_revision if snapshot_revision is not None else latest_revision
    if target_revision > latest_revision:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)
    if snapshot_revision is not None:
        pinned_global = await _snapshot_context(db, authorized, at_revision=target_revision)
        if int(pinned_global.get("snapshot_revision") or 0) != target_revision:
            raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)

    cluster_context = await asyncio.to_thread(
        db.filter_snapshot_context,
        authorized.workspace_id,
        {cluster_id},
        at_revision=target_revision,
    )
    if view == "relations":
        if (
            target_revision <= 0
            or int(cluster_context.get("snapshot_revision") or 0) != target_revision
        ):
            raise HTTPException(status_code=503, detail=TOPOLOGY_UNAVAILABLE_DETAIL)
        result = await asyncio.to_thread(
            db.list_filtered_resources,
            workspace_id=authorized.workspace_id,
            allowed_cluster_ids={cluster_id},
            allowed_application_ids=set(authorized.application_ids),
            filters=filters,
            snapshot_revision=target_revision,
            position=None,
            limit=DEFAULT_GRAPH_NODE_LIMIT,
            graph_priority=True,
        )
        items = list(result.get("items") or [])
        filtered_count = int(result.get("filtered_count") or 0)
        reasons = list(cluster_context.get("partial_reason_codes") or [])
        if any(item.get("application_binding_completeness") != "exact" for item in items):
            reasons.append("restricted_application_bindings")
        graph = build_resource_graph(
            items,
            snapshot_revision=target_revision,
            filter_fingerprint=filter_fingerprint(filters),
            source_complete=bool(cluster_context.get("resources_complete")),
            labels_complete=bool(cluster_context.get("labels_complete")),
            truncated=bool(result.get("has_more")),
            node_limit=DEFAULT_GRAPH_NODE_LIMIT,
            edge_limit=DEFAULT_GRAPH_EDGE_LIMIT,
            omitted_node_count=max(0, filtered_count - len(items)),
            partial_reason_codes=reasons,
            cluster={"cluster_id": cluster_id, "name": None, "provider": None},
            authorization_revision=authorized.authorization_revision,
        )
        return RelationsTopologyResponse.model_validate(build_relations_topology(graph))

    topology_result, usage_by_cluster, cluster_identities = await asyncio.gather(
        asyncio.to_thread(
            db.list_physical_topology_resources,
            workspace_id=authorized.workspace_id,
            allowed_cluster_ids={cluster_id},
            allowed_application_ids=set(authorized.application_ids),
            filters=filters,
            snapshot_revision=target_revision,
        ),
        asyncio.to_thread(
            db.latest_cluster_usage_rollups,
            authorized.workspace_id,
            {cluster_id},
            samples_per_cluster=1,
        ),
        asyncio.to_thread(
            db.resolve_filter_clusters,
            authorized.workspace_id,
            {cluster_id},
        ),
    )
    matched_count_completeness = _filtered_completeness(
        cluster_context,
        filters=filters,
        require_labels=bool(filters.labels),
    )
    total_count_completeness = _unfiltered_completeness(cluster_context)
    usage_samples = usage_by_cluster.get(cluster_id, [])
    # A latest usage sample cannot be attached to a historical inventory revision without
    # a revision/time join. Keep the historical frame honest by returning metric nulls.
    latest_usage_sample = (
        usage_samples[-1] if usage_samples and target_revision == latest_revision else None
    )
    physical = build_physical_topology(
        topology_result,
        latest_usage_sample=latest_usage_sample,
        matched_count_completeness=matched_count_completeness,
        total_count_completeness=total_count_completeness,
    )
    reasons = {
        *(str(reason) for reason in cluster_context.get("partial_reason_codes") or []),
        *(str(reason) for reason in physical.pop("partial_reason_codes", [])),
    }
    projection_completeness = matched_count_completeness
    if projection_completeness == "exact" and reasons:
        projection_completeness = "partial"
    fingerprint = filter_fingerprint(filters)
    cluster_identity = cluster_identities.get(
        cluster_id,
        {"cluster_id": cluster_id, "name": None, "provider": None},
    )
    return PhysicalTopologyResponse(
        **physical,
        cluster_projection_revision=int(cluster_context.get("snapshot_revision") or 0),
        cluster=cluster_identity,
        counts=_counts(
            topology_result,
            context=cluster_context,
            filters=filters,
            require_labels=bool(filters.labels),
        ),
        projection_completeness=projection_completeness,
        partial_reason_codes=sorted(reasons),
        snapshot=FilterSnapshotMeta(
            snapshot_revision=target_revision,
            authorization_revision=authorized.authorization_revision,
            filter_fingerprint=fingerprint,
            observed_at=cluster_context.get("observed_at"),
            stale=target_revision < latest_revision,
            partial_reason_codes=sorted(reasons),
        ),
    )


@router.get(
    gateway_routes.RESOURCES_GRAPH_PATH,
    response_model=ResourceGraphSnapshotResponse,
)
async def get_resource_graph(
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    applications: str | None = Query(default=None),
    resources_types: str | None = Query(default=None, alias="resources.types"),
    resource_types: str | None = Query(default=None, include_in_schema=False),
    resources_health: str | None = Query(default=None, alias="resources.health"),
    health: str | None = Query(default=None, include_in_schema=False),
    labels: str | None = Query(default=None),
    resources_q: str | None = Query(default=None, alias="resources.q"),
    q: str | None = Query(default=None, include_in_schema=False),
    resources_include_deleted: bool | None = Query(
        default=None,
        alias="resources.includeDeleted",
    ),
    include_deleted: bool | None = Query(default=None, include_in_schema=False),
    snapshot_revision: int | None = Query(default=None, ge=1),
    max_nodes: int = Query(default=DEFAULT_GRAPH_NODE_LIMIT, ge=1, le=MAX_GRAPH_NODE_LIMIT),
    max_edges: int = Query(default=DEFAULT_GRAPH_EDGE_LIMIT, ge=1, le=MAX_GRAPH_EDGE_LIMIT),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ResourceGraphSnapshotResponse:
    filters = _parse_filters(
        clusters=clusters,
        namespaces=namespaces,
        applications=applications,
        resource_types=_coalesce_text(resources_types, resource_types),
        health=_coalesce_text(resources_health, health),
        labels=labels,
        query=_coalesce_text(resources_q, q),
        include_deleted=_coalesce_bool(resources_include_deleted, include_deleted),
    )
    cluster_id = _single_graph_cluster(filters)
    authorized = await _authorized_scope(db, current)
    _require_requested_scope(authorized, filters)

    latest_global = await _snapshot_context(db, authorized)
    latest_revision = int(latest_global.get("snapshot_revision") or 0)
    target_revision = snapshot_revision if snapshot_revision is not None else latest_revision
    if target_revision > latest_revision:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)
    if snapshot_revision is not None:
        pinned_global = await _snapshot_context(
            db,
            authorized,
            at_revision=target_revision,
        )
        if int(pinned_global.get("snapshot_revision") or 0) != target_revision:
            raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)

    cluster_context = await asyncio.to_thread(
        db.filter_snapshot_context,
        authorized.workspace_id,
        {cluster_id},
        at_revision=target_revision,
    )
    result = await asyncio.to_thread(
        db.list_filtered_resources,
        workspace_id=authorized.workspace_id,
        allowed_cluster_ids={cluster_id},
        allowed_application_ids=set(authorized.application_ids),
        filters=filters,
        snapshot_revision=target_revision,
        position=None,
        limit=max_nodes,
        graph_priority=True,
    )
    items = list(result.get("items") or [])
    filtered_count = int(result.get("filtered_count") or 0)
    omitted_node_count = max(0, filtered_count - len(items))
    fingerprint = filter_fingerprint(filters)
    reasons = list(cluster_context.get("partial_reason_codes") or [])
    if any(item.get("application_binding_completeness") != "exact" for item in items):
        reasons.append("restricted_application_bindings")
    cluster_identity = (
        dict(items[0].get("cluster") or {})
        if items
        else {"cluster_id": cluster_id, "name": None, "provider": None}
    )
    graph = build_resource_graph(
        items,
        snapshot_revision=target_revision,
        filter_fingerprint=fingerprint,
        source_complete=bool(cluster_context.get("resources_complete")),
        labels_complete=bool(cluster_context.get("labels_complete")),
        truncated=bool(result.get("has_more")),
        node_limit=max_nodes,
        edge_limit=max_edges,
        omitted_node_count=omitted_node_count,
        partial_reason_codes=reasons,
        cluster=cluster_identity,
        authorization_revision=authorized.authorization_revision,
    )
    return ResourceGraphSnapshotResponse(
        **graph,
        cluster_projection_revision=int(cluster_context.get("snapshot_revision") or 0),
        counts=_counts(
            result,
            context=cluster_context,
            filters=filters,
            require_labels=bool(filters.labels),
        ),
        snapshot=FilterSnapshotMeta(
            snapshot_revision=target_revision,
            authorization_revision=authorized.authorization_revision,
            filter_fingerprint=fingerprint,
            observed_at=cluster_context.get("observed_at"),
            stale=target_revision < latest_revision,
            partial_reason_codes=sorted(set(reasons)),
        ),
    )


@router.get(
    gateway_routes.FILTERED_RESOURCES_PATH,
    response_model=FilteredInventoryResourceListResponse,
)
async def list_filtered_resources(
    request: Request,
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    applications: str | None = Query(default=None),
    resources_types: str | None = Query(default=None, alias="resources.types"),
    resource_types: str | None = Query(default=None, include_in_schema=False),
    resources_health: str | None = Query(default=None, alias="resources.health"),
    health: str | None = Query(default=None, include_in_schema=False),
    labels: str | None = Query(default=None),
    resources_q: str | None = Query(default=None, alias="resources.q"),
    q: str | None = Query(default=None, include_in_schema=False),
    resources_include_deleted: bool | None = Query(
        default=None,
        alias="resources.includeDeleted",
    ),
    include_deleted: bool | None = Query(default=None, include_in_schema=False),
    cursor: str | None = Query(default=None, min_length=1, max_length=MAX_CURSOR_LENGTH),
    limit: int = Query(default=DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> FilteredInventoryResourceListResponse:
    filters = _parse_filters(
        clusters=clusters,
        namespaces=namespaces,
        applications=applications,
        resource_types=_coalesce_text(resources_types, resource_types),
        health=_coalesce_text(resources_health, health),
        labels=labels,
        query=_coalesce_text(resources_q, q),
        include_deleted=_coalesce_bool(resources_include_deleted, include_deleted),
    )
    authorized = await _authorized_scope(db, current)
    _require_requested_scope(authorized, filters)
    fingerprint = filter_fingerprint(filters)
    if not authorized.cluster_ids:
        return _empty_resource_response(authorized, fingerprint)
    codec = _cursor_codec(request)
    page_state = await _page_state(
        db,
        codec=codec,
        cursor=cursor,
        authorized=authorized,
        surface="resources:list",
        fingerprint=fingerprint,
        facet_query=None,
    )
    context = page_state.context
    if int(context["snapshot_revision"]) <= 0:
        return _unavailable_resource_response(authorized, fingerprint, context)
    result = await asyncio.to_thread(
        db.list_filtered_resources,
        workspace_id=authorized.workspace_id,
        allowed_cluster_ids=set(authorized.cluster_ids),
        allowed_application_ids=set(authorized.application_ids),
        filters=filters,
        snapshot_revision=int(context["snapshot_revision"]),
        position=page_state.position,
        limit=limit,
    )
    next_cursor = _next_cursor(codec, page_state.scope, result.get("next_position"))
    counts = _counts(
        result,
        context=context,
        filters=filters,
        require_labels=bool(filters.labels),
    )
    return FilteredInventoryResourceListResponse(
        items=result["items"],
        next_cursor=next_cursor,
        has_more=bool(result["has_more"]),
        counts=counts,
        snapshot=_snapshot_meta(page_state, authorized, fingerprint),
    )


@router.get(
    gateway_routes.RESOURCE_METRICS_HISTORY_PATH,
    response_model=ResourceMetricsHistoryResponse,
)
async def get_resource_metrics_history(
    ids: str = Query(min_length=1, max_length=MAX_METRIC_HISTORY_QUERY_LENGTH),
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    applications: str | None = Query(default=None),
    resources_types: str | None = Query(default=None, alias="resources.types"),
    resource_types: str | None = Query(default=None, include_in_schema=False),
    resources_health: str | None = Query(default=None, alias="resources.health"),
    health: str | None = Query(default=None, include_in_schema=False),
    labels: str | None = Query(default=None),
    resources_q: str | None = Query(default=None, alias="resources.q"),
    q: str | None = Query(default=None, include_in_schema=False),
    resources_include_deleted: bool | None = Query(
        default=None,
        alias="resources.includeDeleted",
    ),
    include_deleted: bool | None = Query(default=None, include_in_schema=False),
    snapshot_revision: int | None = Query(default=None, ge=1),
    time_range: Literal["15m", "1h", "6h", "24h"] = Query(default="1h", alias="range"),
    limit: int = Query(default=60, ge=1, le=288),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ResourceMetricsHistoryResponse:
    resource_ids = _parse_metric_history_ids(ids)
    filters = _parse_filters(
        clusters=clusters,
        namespaces=namespaces,
        applications=applications,
        resource_types=_coalesce_text(resources_types, resource_types),
        health=_coalesce_text(resources_health, health),
        labels=labels,
        query=_coalesce_text(resources_q, q),
        include_deleted=_coalesce_bool(resources_include_deleted, include_deleted),
    )
    authorized = await _authorized_scope(db, current)
    _require_requested_scope(authorized, filters)
    if not authorized.cluster_ids:
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)

    latest_context = await _snapshot_context(db, authorized)
    latest_revision = int(latest_context.get("snapshot_revision") or 0)
    target_revision = snapshot_revision if snapshot_revision is not None else latest_revision
    if target_revision <= 0:
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)
    if target_revision > latest_revision:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)
    context = latest_context
    if snapshot_revision is not None:
        context = await _snapshot_context(db, authorized, at_revision=target_revision)
        if int(context.get("snapshot_revision") or 0) != target_revision:
            raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)

    result = await asyncio.to_thread(
        db.list_resource_metric_history,
        workspace_id=authorized.workspace_id,
        allowed_cluster_ids=set(authorized.cluster_ids),
        allowed_application_ids=set(authorized.application_ids),
        filters=filters,
        snapshot_revision=target_revision,
        resource_ids=resource_ids,
        window_seconds=METRIC_HISTORY_RANGE_SECONDS[time_range],
        limit=limit,
    )
    resources = list(result.get("resources") or [])
    if {str(item.get("resource_id")) for item in resources} != set(resource_ids):
        # Missing, non-pod, unauthorized, and filtered-out ids share one response to avoid
        # turning this batch endpoint into a resource-existence oracle.
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)

    projection_complete = (
        _filtered_completeness(
            context,
            filters=filters,
            require_labels=bool(filters.labels),
        )
        == "exact"
    )
    history = build_resource_metric_history(
        resources,
        result.get("samples_by_cluster") or {},
        projection_complete=projection_complete,
    )
    reasons = {
        *(str(reason) for reason in context.get("partial_reason_codes") or []),
        *(str(reason) for reason in history["partial_reason_codes"]),
    }
    fingerprint = filter_fingerprint(filters)
    return ResourceMetricsHistoryResponse(
        series=history["series"],
        completeness=history["completeness"],
        partial_reason_codes=sorted(reasons),
        snapshot=FilterSnapshotMeta(
            snapshot_revision=target_revision,
            authorization_revision=authorized.authorization_revision,
            filter_fingerprint=fingerprint,
            observed_at=context.get("observed_at"),
            stale=target_revision < latest_revision,
            partial_reason_codes=sorted(
                str(reason) for reason in context.get("partial_reason_codes") or []
            ),
        ),
    )


@router.get(
    gateway_routes.RESOURCE_LABEL_FACETS_PATH,
    response_model=LabelFacetPageResponse,
)
async def list_resource_label_facets(
    request: Request,
    surface: Literal["resources"] = Query(default="resources"),
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    applications: str | None = Query(default=None),
    resources_types: str | None = Query(default=None, alias="resources.types"),
    resource_types: str | None = Query(default=None, include_in_schema=False),
    resources_health: str | None = Query(default=None, alias="resources.health"),
    health: str | None = Query(default=None, include_in_schema=False),
    labels: str | None = Query(default=None),
    resources_q: str | None = Query(default=None, alias="resources.q"),
    q: str | None = Query(default=None, include_in_schema=False),
    resources_include_deleted: bool | None = Query(
        default=None,
        alias="resources.includeDeleted",
    ),
    include_deleted: bool | None = Query(default=None, include_in_schema=False),
    facet_q: str | None = Query(default=None, max_length=200),
    cursor: str | None = Query(default=None, min_length=1, max_length=MAX_CURSOR_LENGTH),
    limit: int = Query(default=DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> LabelFacetPageResponse:
    filters = _parse_filters(
        clusters=clusters,
        namespaces=namespaces,
        applications=applications,
        resource_types=_coalesce_text(resources_types, resource_types),
        health=_coalesce_text(resources_health, health),
        labels=labels,
        query=_coalesce_text(resources_q, q),
        include_deleted=_coalesce_bool(resources_include_deleted, include_deleted),
    )
    authorized = await _authorized_scope(db, current)
    _require_requested_scope(authorized, filters)
    fingerprint = filter_fingerprint(filters)
    normalized_facet_query = (facet_q or "").strip().casefold() or None
    if not authorized.cluster_ids:
        return _empty_label_response(authorized, fingerprint, filters)
    codec = _cursor_codec(request)
    page_state = await _page_state(
        db,
        codec=codec,
        cursor=cursor,
        authorized=authorized,
        surface="resources:label-facets",
        fingerprint=fingerprint,
        facet_query=normalized_facet_query,
    )
    context = page_state.context
    if int(context["snapshot_revision"]) <= 0:
        return _unavailable_label_response(authorized, fingerprint, context, filters)
    result = await asyncio.to_thread(
        db.list_label_facets,
        workspace_id=authorized.workspace_id,
        allowed_cluster_ids=set(authorized.cluster_ids),
        allowed_application_ids=set(authorized.application_ids),
        filters=filters,
        snapshot_revision=int(context["snapshot_revision"]),
        facet_query=normalized_facet_query,
        position=page_state.position,
        limit=limit,
    )
    next_cursor = _next_cursor(codec, page_state.scope, result.get("next_position"))
    count_completeness = _filtered_completeness(
        context,
        filters=filters,
        require_labels=True,
    )
    selected_match_counts = {
        (str(item["key"]), str(item["value"])): int(item["match_count"])
        for item in result.get("selected_match_counts", [])
    }
    return LabelFacetPageResponse(
        surface=surface,
        items=[
            {
                "key": item["key"],
                "value": item["value"],
                "selector": f"{item['key']}={item['value']}",
                "match_count": int(item["match_count"]),
                "count_completeness": count_completeness,
            }
            for item in result["items"]
        ],
        selected_resolutions=[
            {
                "key": key,
                "value": value,
                "selector": f"{key}={value}",
                "status": _selected_label_status(
                    context,
                    selected_match_count=selected_match_counts.get((key, value), 0),
                ),
            }
            for key, value in filters.labels
        ],
        next_cursor=next_cursor,
        has_more=bool(result["has_more"]),
        counts=_counts(result, context=context, filters=filters, require_labels=True),
        snapshot=_snapshot_meta(page_state, authorized, fingerprint),
    )


@router.get(
    gateway_routes.RESOURCES_FILTER_FACETS_PATH,
    response_model=ResourceFilterFacetPageResponse,
)
async def list_resource_filter_facets(
    request: Request,
    axis: FacetAxis,
    selected: str | None = Query(default=None),
    cursor: str | None = Query(default=None, min_length=1, max_length=MAX_CURSOR_LENGTH),
    limit: int = Query(default=DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ResourceFilterFacetPageResponse:
    selected_values = _parse_selected(axis, selected)
    filters = _filters_for_selected(axis, selected_values)
    fingerprint = filter_fingerprint(filters)
    authorized = await _authorized_scope(db, current)
    if not authorized.cluster_ids:
        return _empty_facet_response(axis, selected_values, authorized, fingerprint)
    codec = _cursor_codec(request)
    page_state = await _page_state(
        db,
        codec=codec,
        cursor=cursor,
        authorized=authorized,
        surface=f"resources:facet:{axis}",
        fingerprint=fingerprint,
        facet_query=None,
    )
    context = page_state.context
    if axis == "clusters":
        result = await asyncio.to_thread(
            db.list_filter_clusters,
            authorized.workspace_id,
            set(authorized.cluster_ids),
            position=page_state.position,
            limit=limit,
        )
        items = [
            {
                "axis": "cluster",
                "value": row["cluster_id"],
                "cluster_id": row["cluster_id"],
                "name": row.get("name"),
                "provider": row.get("provider"),
                "availability": "available",
            }
            for row in result["items"]
        ]
    elif axis == "applications":
        result = await asyncio.to_thread(
            db.list_filter_applications,
            authorized.workspace_id,
            set(authorized.application_ids),
            position=page_state.position,
            limit=limit,
        )
        items = [
            {
                "axis": "application",
                "value": row["application_id"],
                "application_id": row["application_id"],
                "name": row.get("name"),
                "environment": None,
                "availability": "available",
            }
            for row in result["items"]
        ]
    else:
        result = await asyncio.to_thread(
            db.list_filter_namespaces,
            authorized.workspace_id,
            set(authorized.cluster_ids),
            int(context["snapshot_revision"]),
            position=page_state.position,
            limit=limit,
        )
        items = [
            {
                "axis": "namespace",
                "value": f"{row['cluster_id']}/{row['namespace']}",
                "cluster_id": row["cluster_id"],
                "namespace": row["namespace"],
                "availability": "available",
            }
            for row in result["items"]
        ]
    selected_resolutions = await _resolve_selected(
        db,
        axis=axis,
        selected_values=selected_values,
        authorized=authorized,
        snapshot_revision=int(context["snapshot_revision"]),
    )
    return ResourceFilterFacetPageResponse(
        axis=axis,
        items=items,
        selected_resolutions=selected_resolutions,
        next_cursor=_next_cursor(codec, page_state.scope, result.get("next_position")),
        has_more=bool(result["has_more"]),
        snapshot=_snapshot_meta(page_state, authorized, fingerprint),
    )


async def _authorized_scope(db: Any, current: Any) -> AuthorizedFilterScope:
    workspace_id = str(getattr(current, "workspace_id", "") or "").strip()
    user_id = str(getattr(current, "user_id", "") or "").strip()
    roles = tuple(str(role) for role in (getattr(current, "roles", ()) or ()))
    if not workspace_id or not user_id:
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)

    def resolve() -> tuple[set[str], set[str]]:
        return (
            resolve_allowed_cluster_ids(
                db,
                current,
                workspace_id,
                Permission.INVENTORY_READ.value,
            ),
            resolve_allowed_application_ids(
                db,
                current,
                workspace_id,
                Permission.APPLICATION_READ.value,
            ),
        )

    cluster_ids, application_ids = await asyncio.to_thread(resolve)
    revision = authorization_revision(
        user_id=user_id,
        workspace_id=workspace_id,
        roles=roles,
        allowed_cluster_ids=cluster_ids,
        allowed_application_ids=application_ids,
    )
    return AuthorizedFilterScope(
        workspace_id=workspace_id,
        user_id=user_id,
        roles=roles,
        cluster_ids=frozenset(cluster_ids),
        application_ids=frozenset(application_ids),
        authorization_revision=revision,
    )


async def _page_state(
    db: Any,
    *,
    codec: FilterCursorCodec,
    cursor: str | None,
    authorized: AuthorizedFilterScope,
    surface: str,
    fingerprint: str,
    facet_query: str | None,
) -> PageState:
    if cursor is None:
        latest = await _snapshot_context(db, authorized)
        target_revision = int(latest["snapshot_revision"])
        scope = _cursor_scope(
            authorized,
            surface=surface,
            fingerprint=fingerprint,
            snapshot_revision=target_revision,
            facet_query=facet_query,
        )
        return PageState(context=latest, latest_context=latest, position=None, scope=scope)
    try:
        inspected = codec.inspect(cursor)
        scope = _cursor_scope(
            authorized,
            surface=surface,
            fingerprint=fingerprint,
            snapshot_revision=inspected.scope.snapshot_revision,
            facet_query=facet_query,
        )
        decoded = codec.decode(cursor, expected=scope)
        position = _validated_cursor_position(surface, decoded.position)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL) from exc
    context, latest = await asyncio.gather(
        _snapshot_context(db, authorized, at_revision=scope.snapshot_revision),
        _snapshot_context(db, authorized),
    )
    if int(context["snapshot_revision"]) != scope.snapshot_revision:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)
    return PageState(
        context=context,
        latest_context=latest,
        position=position,
        scope=scope,
    )


def _validated_cursor_position(surface: str, position: Mapping[str, Any]) -> dict[str, Any]:
    if surface == "resources:list":
        required = (
            "cluster_id",
            "namespace",
            "resource_type",
            "kind",
            "name",
            "inventory_key",
        )
    elif surface == "resources:label-facets":
        required = ("key", "value")
    elif surface == "resources:facet:namespaces":
        required = ("cluster_id", "namespace")
    elif surface in {"resources:facet:clusters", "resources:facet:applications"}:
        required = ("value",)
    else:
        raise ValueError("cursor surface is invalid")
    if set(position) != set(required) or any(
        not isinstance(position[key], str) or not position[key] for key in required
    ):
        raise ValueError("cursor position is invalid")
    return {key: str(position[key]) for key in required}


async def _snapshot_context(
    db: Any,
    authorized: AuthorizedFilterScope,
    *,
    at_revision: int | None = None,
) -> dict[str, Any]:
    return await asyncio.to_thread(
        db.filter_snapshot_context,
        authorized.workspace_id,
        set(authorized.cluster_ids),
        at_revision=at_revision,
    )


def _cursor_scope(
    authorized: AuthorizedFilterScope,
    *,
    surface: str,
    fingerprint: str,
    snapshot_revision: int,
    facet_query: str | None,
) -> CursorScope:
    return CursorScope(
        workspace_id=authorized.workspace_id,
        user_id=authorized.user_id,
        authorization_revision=authorized.authorization_revision,
        surface=surface,
        filter_fingerprint=fingerprint,
        snapshot_revision=snapshot_revision,
        facet_query=facet_query,
    )


def _cursor_codec(request: Request) -> FilterCursorCodec:
    configured = getattr(request.app.state, "inventory_filter_cursor_codec", None)
    if isinstance(configured, FilterCursorCodec):
        return configured
    try:
        return FilterCursorCodec(env(FILTER_CURSOR_SIGNING_KEY_ENV, "").strip())
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=CURSOR_UNAVAILABLE_DETAIL) from exc


def _next_cursor(
    codec: FilterCursorCodec,
    scope: CursorScope,
    position: object,
) -> str | None:
    if not isinstance(position, Mapping):
        return None
    try:
        return codec.encode(scope, position=position)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL) from exc


def _parse_filters(**kwargs: Any) -> ResourceFilters:
    try:
        return parse_resource_filters(**kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL) from exc


def _parse_metric_history_ids(value: str) -> tuple[str, ...]:
    raw = value.split(",")
    ids = tuple(item.strip() for item in raw)
    if (
        not ids
        or any(not item or len(item) > 512 for item in ids)
        or len(ids) > MAX_METRIC_HISTORY_IDS
        or len(set(ids)) != len(ids)
    ):
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)
    return ids


def _global_facets_with_completeness(
    result: Mapping[str, Any],
    context: Mapping[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    revision = int(context.get("snapshot_revision") or 0)
    sources = {
        "clusters": "resources_complete",
        "namespaces": "resources_complete",
        "applications": "application_bindings_complete",
        "labels": "labels_complete",
        "resources": "resources_complete",
    }
    response: dict[str, list[dict[str, Any]]] = {}
    for group, source in sources.items():
        completeness = (
            "unavailable" if revision <= 0 else "exact" if bool(context.get(source)) else "partial"
        )
        response[group] = [
            {
                **dict(item),
                "count": None if completeness == "unavailable" else item.get("count"),
                "count_completeness": completeness,
            }
            for item in result.get(group, [])
            if isinstance(item, Mapping)
        ]
    return response


def _parse_selected(axis: FacetAxis, value: str | None) -> tuple[str, ...]:
    try:
        return parse_facet_values(axis, value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL) from exc


def _coalesce_text(canonical: str | None, compatibility: str | None) -> str | None:
    if canonical is not None and compatibility is not None and canonical != compatibility:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)
    return canonical if canonical is not None else compatibility


def _coalesce_bool(canonical: bool | None, compatibility: bool | None) -> bool:
    if canonical is not None and compatibility is not None and canonical != compatibility:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)
    value = canonical if canonical is not None else compatibility
    return bool(value)


def _require_requested_scope(
    authorized: AuthorizedFilterScope,
    filters: ResourceFilters,
) -> None:
    requested_cluster_ids = set(filters.clusters) | {
        cluster_id for cluster_id, _namespace in filters.namespaces
    }
    if not requested_cluster_ids.issubset(authorized.cluster_ids):
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)
    if not set(filters.applications).issubset(authorized.application_ids):
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)


def _single_graph_cluster(filters: ResourceFilters) -> str:
    if len(filters.clusters) != 1:
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)
    cluster_id = filters.clusters[0]
    if any(namespace_cluster != cluster_id for namespace_cluster, _ in filters.namespaces):
        raise HTTPException(status_code=422, detail=INVALID_REQUEST_DETAIL)
    return cluster_id


def _filters_for_selected(axis: FacetAxis, selected: tuple[str, ...]) -> ResourceFilters:
    values: dict[str, Any] = {
        "clusters": None,
        "namespaces": None,
        "applications": None,
        "resource_types": None,
        "health": None,
        "labels": None,
        "query": None,
        "include_deleted": False,
    }
    values[axis] = ",".join(selected) or None
    return _parse_filters(**values)


async def _resolve_selected(
    db: Any,
    *,
    axis: FacetAxis,
    selected_values: tuple[str, ...],
    authorized: AuthorizedFilterScope,
    snapshot_revision: int,
) -> list[dict[str, Any]]:
    if not selected_values:
        return []
    if axis == "clusters":
        visible = tuple(value for value in selected_values if value in authorized.cluster_ids)
        resolved = await asyncio.to_thread(
            db.resolve_filter_clusters,
            authorized.workspace_id,
            visible,
        )
        return [
            {
                "axis": "cluster",
                "value": value,
                "status": (
                    "restricted"
                    if value not in authorized.cluster_ids
                    else "resolved"
                    if value in resolved
                    else "unresolved"
                ),
                "display_label": resolved.get(value, {}).get("name"),
            }
            for value in selected_values
        ]
    if axis == "applications":
        visible = tuple(value for value in selected_values if value in authorized.application_ids)
        resolved = await asyncio.to_thread(
            db.resolve_filter_applications,
            authorized.workspace_id,
            visible,
        )
        return [
            {
                "axis": "application",
                "value": value,
                "status": (
                    "restricted"
                    if value not in authorized.application_ids
                    else "resolved"
                    if value in resolved
                    else "unresolved"
                ),
                "display_label": resolved.get(value, {}).get("name"),
            }
            for value in selected_values
        ]
    pairs = tuple(value.rpartition("/") for value in selected_values)
    visible_pairs = tuple(
        (cluster_id, namespace)
        for cluster_id, separator, namespace in pairs
        if separator and cluster_id in authorized.cluster_ids
    )
    resolved_pairs = await asyncio.to_thread(
        db.resolve_filter_namespaces,
        authorized.workspace_id,
        set(authorized.cluster_ids),
        snapshot_revision,
        visible_pairs,
    )
    return [
        {
            "axis": "namespace",
            "value": value,
            "status": (
                "restricted"
                if cluster_id not in authorized.cluster_ids
                else "resolved"
                if (cluster_id, namespace) in resolved_pairs
                else "unresolved"
            ),
            "display_label": namespace if (cluster_id, namespace) in resolved_pairs else None,
        }
        for value, (cluster_id, _separator, namespace) in zip(selected_values, pairs, strict=True)
    ]


def _filtered_completeness(
    context: Mapping[str, Any],
    *,
    filters: ResourceFilters,
    require_labels: bool,
) -> Literal["exact", "partial", "unavailable"]:
    if int(context.get("snapshot_revision") or 0) <= 0:
        return "unavailable"
    complete = bool(context.get("resources_complete"))
    if require_labels or filters.labels:
        complete = complete and bool(context.get("labels_complete"))
    if filters.applications:
        complete = complete and bool(context.get("application_bindings_complete"))
    return "exact" if complete else "partial"


def _unfiltered_completeness(
    context: Mapping[str, Any],
) -> Literal["exact", "partial", "unavailable"]:
    if int(context.get("snapshot_revision") or 0) <= 0:
        return "unavailable"
    return "exact" if bool(context.get("resources_complete")) else "partial"


def _counts(
    result: Mapping[str, Any],
    *,
    context: Mapping[str, Any],
    filters: ResourceFilters,
    require_labels: bool,
) -> FilterResultCounts:
    return FilterResultCounts(
        filtered_count=int(result["filtered_count"]),
        unfiltered_count=int(result["unfiltered_count"]),
        filtered_count_completeness=_filtered_completeness(
            context,
            filters=filters,
            require_labels=require_labels,
        ),
        unfiltered_count_completeness=_unfiltered_completeness(context),
    )


def _selected_label_status(
    context: Mapping[str, Any],
    *,
    selected_match_count: int,
) -> Literal["resolved", "zero", "unavailable"]:
    if not bool(context.get("resources_complete")) or not bool(context.get("labels_complete")):
        return "unavailable"
    return "resolved" if selected_match_count > 0 else "zero"


def _snapshot_meta(
    page_state: PageState,
    authorized: AuthorizedFilterScope,
    fingerprint: str,
) -> FilterSnapshotMeta:
    context = page_state.context
    return FilterSnapshotMeta(
        snapshot_revision=int(context["snapshot_revision"]),
        authorization_revision=authorized.authorization_revision,
        filter_fingerprint=fingerprint,
        observed_at=context.get("observed_at"),
        stale=int(page_state.latest_context["snapshot_revision"])
        > int(context["snapshot_revision"]),
        partial_reason_codes=list(context.get("partial_reason_codes") or []),
    )


def _empty_snapshot_meta(
    authorized: AuthorizedFilterScope,
    fingerprint: str,
) -> FilterSnapshotMeta:
    return FilterSnapshotMeta(
        snapshot_revision=0,
        authorization_revision=authorized.authorization_revision,
        filter_fingerprint=fingerprint,
        observed_at=None,
        stale=False,
        partial_reason_codes=[],
    )


def _empty_resource_response(
    authorized: AuthorizedFilterScope,
    fingerprint: str,
) -> FilteredInventoryResourceListResponse:
    return FilteredInventoryResourceListResponse(
        items=[],
        next_cursor=None,
        has_more=False,
        counts=FilterResultCounts(
            filtered_count=0,
            unfiltered_count=0,
            filtered_count_completeness="exact",
            unfiltered_count_completeness="exact",
        ),
        snapshot=_empty_snapshot_meta(authorized, fingerprint),
    )


def _unavailable_resource_response(
    authorized: AuthorizedFilterScope,
    fingerprint: str,
    context: Mapping[str, Any],
) -> FilteredInventoryResourceListResponse:
    return FilteredInventoryResourceListResponse(
        items=[],
        next_cursor=None,
        has_more=False,
        counts=FilterResultCounts(
            filtered_count=None,
            unfiltered_count=None,
            filtered_count_completeness="unavailable",
            unfiltered_count_completeness="unavailable",
        ),
        snapshot=FilterSnapshotMeta(
            snapshot_revision=0,
            authorization_revision=authorized.authorization_revision,
            filter_fingerprint=fingerprint,
            observed_at=None,
            stale=False,
            partial_reason_codes=list(context.get("partial_reason_codes") or []),
        ),
    )


def _empty_label_response(
    authorized: AuthorizedFilterScope,
    fingerprint: str,
    filters: ResourceFilters,
) -> LabelFacetPageResponse:
    return LabelFacetPageResponse(
        surface="resources",
        items=[],
        selected_resolutions=[
            {
                "key": key,
                "value": value,
                "selector": f"{key}={value}",
                "status": "unavailable",
            }
            for key, value in filters.labels
        ],
        next_cursor=None,
        has_more=False,
        counts=FilterResultCounts(
            filtered_count=0,
            unfiltered_count=0,
            filtered_count_completeness="exact",
            unfiltered_count_completeness="exact",
        ),
        snapshot=_empty_snapshot_meta(authorized, fingerprint),
    )


def _unavailable_label_response(
    authorized: AuthorizedFilterScope,
    fingerprint: str,
    context: Mapping[str, Any],
    filters: ResourceFilters,
) -> LabelFacetPageResponse:
    response = _empty_label_response(authorized, fingerprint, filters)
    return response.model_copy(
        update={
            "counts": FilterResultCounts(
                filtered_count=None,
                unfiltered_count=None,
                filtered_count_completeness="unavailable",
                unfiltered_count_completeness="unavailable",
            ),
            "snapshot": FilterSnapshotMeta(
                snapshot_revision=0,
                authorization_revision=authorized.authorization_revision,
                filter_fingerprint=fingerprint,
                observed_at=None,
                stale=False,
                partial_reason_codes=list(context.get("partial_reason_codes") or []),
            ),
        }
    )


def _empty_facet_response(
    axis: FacetAxis,
    selected_values: tuple[str, ...],
    authorized: AuthorizedFilterScope,
    fingerprint: str,
) -> ResourceFilterFacetPageResponse:
    return ResourceFilterFacetPageResponse(
        axis=axis,
        items=[],
        selected_resolutions=[
            {
                "axis": axis[:-1] if axis != "applications" else "application",
                "value": value,
                "status": "restricted",
                "display_label": None,
            }
            for value in selected_values
        ],
        next_cursor=None,
        has_more=False,
        snapshot=_empty_snapshot_meta(authorized, fingerprint),
    )
