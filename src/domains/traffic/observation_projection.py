"""Truthful traffic read projection.

Traffic is not inferred from Services, Pods, or ports.  Until an agent-backed
collector persists flow evidence, the projection exposes the authorized scope
and explicit unavailability only.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from packages.contracts.parity import ClusterScope
from packages.contracts.traffic.observations import (
    TrafficObservationStatus,
    TrafficObservationSummary,
    TrafficOverviewResponse,
    TrafficRelationships,
    TrafficScopeCoverage,
)

TRAFFIC_OBSERVATION_UNAVAILABLE = "traffic_observation_not_integrated"


def traffic_overview(
    *,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    namespace_refs: Iterable[tuple[str, str]],
    selected_cluster_ids: Iterable[str],
) -> TrafficOverviewResponse:
    """Build the first read vertical without manufacturing a flow result."""

    selected = tuple(sorted({_text(value) for value in selected_cluster_ids if _text(value)}))
    namespaces = _namespaces_by_cluster(namespace_refs)
    coverage = traffic_scope_coverage(
        workspace_id=workspace_id,
        contexts=contexts,
        namespaces=namespaces,
        selected_cluster_ids=selected,
    )
    unavailable_reasons = (TRAFFIC_OBSERVATION_UNAVAILABLE,)
    return TrafficOverviewResponse(
        scope_coverage=coverage,
        observation=TrafficObservationStatus(reason_codes=unavailable_reasons),
        summary=TrafficObservationSummary(reason_codes=unavailable_reasons),
        relationships=TrafficRelationships(reason_codes=unavailable_reasons),
    )


def traffic_scope_coverage(
    *,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    namespaces: Mapping[str, tuple[str, ...]],
    selected_cluster_ids: Iterable[str],
) -> TrafficScopeCoverage:
    """Describe inventory freshness per authorized selected cluster."""

    selected = tuple(sorted({_text(value) for value in selected_cluster_ids if _text(value)}))
    if not selected:
        return TrafficScopeCoverage(
            availability="unavailable",
            reason_codes=("authorization_scope_empty",),
        )
    reasons: set[str] = set()
    observed_at: list[str] = []
    scopes: list[ClusterScope] = []
    has_unavailable = False
    has_partial = False
    for cluster_id in selected:
        context = contexts.get(cluster_id)
        if context is None or int(context.get("snapshot_revision") or 0) <= 0:
            has_unavailable = True
            reasons.add(f"inventory_snapshot_unavailable:{cluster_id}")
        elif not bool(context.get("resources_complete")) or not bool(
            context.get("labels_complete")
        ):
            has_partial = True
            reasons.add(f"inventory_snapshot_incomplete:{cluster_id}")
        for reason in (context or {}).get("partial_reason_codes", ()):
            if normalized := _text(reason):
                has_partial = True
                reasons.add(normalized)
        if stamp := _optional_text((context or {}).get("observed_at")):
            observed_at.append(stamp)
        scopes.append(
            ClusterScope(
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                namespaces=namespaces.get(cluster_id, ()),
                freshness=_freshness(context),
            )
        )
    availability = "unavailable" if has_unavailable else "partial" if has_partial else "available"
    return TrafficScopeCoverage(
        availability=availability,
        scopes=tuple(scopes),
        observed_at=max(observed_at) if observed_at else None,
        reason_codes=tuple(sorted(reasons)),
    )


def _freshness(context: Mapping[str, Any] | None) -> str:
    if context is None or int(context.get("snapshot_revision") or 0) <= 0:
        return "disconnected"
    if not bool(context.get("resources_complete")) or not bool(context.get("labels_complete")):
        return "partial"
    return "live"


def _namespaces_by_cluster(
    namespace_refs: Iterable[tuple[str, str]],
) -> dict[str, tuple[str, ...]]:
    grouped: dict[str, set[str]] = {}
    for cluster_id, namespace in namespace_refs:
        if normalized_cluster := _text(cluster_id):
            if normalized_namespace := _text(namespace):
                grouped.setdefault(normalized_cluster, set()).add(normalized_namespace)
    return {cluster_id: tuple(sorted(values)) for cluster_id, values in grouped.items()}


def _text(value: object) -> str:
    return str(value or "").strip()


def _optional_text(value: object) -> str | None:
    return _text(value) or None
