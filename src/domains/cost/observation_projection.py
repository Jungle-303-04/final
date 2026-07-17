"""Truthful Cost projection backed by authorized inventory scope only."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from domains.inventory_filter.snapshot_scope import project_snapshot_scope
from packages.config.refresh_policies import integral_refresh_after_seconds
from packages.contracts.cost.observations import (
    CostObservationStatus,
    CostObservationSummary,
    CostOverviewResponse,
    CostScopeCoverage,
    CostTimeRange,
    CostUnavailableTrend,
)

COST_OBSERVATION_UNAVAILABLE = "cost_observation_not_integrated"


def cost_overview(
    *,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    selected_cluster_ids: Iterable[str],
    namespace_refs: Iterable[tuple[str, str]] = (),
    time_range: CostTimeRange = "24h",
) -> CostOverviewResponse:
    """Expose scope/freshness without turning missing billing data into money."""

    coverage = cost_scope_coverage(
        workspace_id=workspace_id,
        contexts=contexts,
        selected_cluster_ids=selected_cluster_ids,
        namespace_refs=namespace_refs,
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
    namespace_refs: Iterable[tuple[str, str]] = (),
) -> CostScopeCoverage:
    projection = project_snapshot_scope(
        workspace_id=workspace_id,
        contexts=contexts,
        namespace_refs=namespace_refs,
        selected_cluster_ids=selected_cluster_ids,
    )
    return CostScopeCoverage(
        availability=projection.availability,
        scopes=projection.scopes,
        observed_at=projection.observed_at,
        reason_codes=projection.reason_codes,
    )
