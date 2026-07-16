"""Truthful Cost projection backed by authorized inventory scope only."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from packages.config.refresh_policies import integral_refresh_after_seconds
from packages.contracts.cost.observations import (
    CostObservationStatus,
    CostObservationSummary,
    CostOverviewResponse,
    CostScopeCoverage,
    CostTimeRange,
    CostUnavailableTrend,
)
from packages.contracts.parity import ClusterScope

COST_OBSERVATION_UNAVAILABLE = "cost_observation_not_integrated"


def cost_overview(
    *,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    selected_cluster_ids: Iterable[str],
    time_range: CostTimeRange = "24h",
) -> CostOverviewResponse:
    """Expose scope/freshness without turning missing billing data into money."""

    coverage = cost_scope_coverage(
        workspace_id=workspace_id,
        contexts=contexts,
        selected_cluster_ids=selected_cluster_ids,
    )
    reasons = (COST_OBSERVATION_UNAVAILABLE,)
    return CostOverviewResponse(
        scope_coverage=coverage,
        observation=CostObservationStatus(reason_codes=reasons),
        summary=CostObservationSummary(reason_codes=reasons),
        trend=CostUnavailableTrend(range=time_range, reason_codes=reasons),
        refresh_after_seconds=integral_refresh_after_seconds("cost_summary"),
        trend_refresh_after_seconds=integral_refresh_after_seconds("cost_trend"),
        nodes_refresh_after_seconds=integral_refresh_after_seconds("cost_nodes"),
    )


def cost_scope_coverage(
    *,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    selected_cluster_ids: Iterable[str],
) -> CostScopeCoverage:
    selected = tuple(sorted({_text(value) for value in selected_cluster_ids if _text(value)}))
    if not selected:
        return CostScopeCoverage(
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
                freshness=_freshness(context),
            )
        )
    availability = "unavailable" if has_unavailable else "partial" if has_partial else "available"
    return CostScopeCoverage(
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


def _text(value: object) -> str:
    return str(value or "").strip()


def _optional_text(value: object) -> str | None:
    return _text(value) or None
