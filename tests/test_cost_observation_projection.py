from __future__ import annotations

import pytest

from domains.cost.observation_projection import cost_overview
from packages.contracts.cost.observations import (
    CostCurrentAllocation,
    CostObservedTrend,
    CostObservedWorkloadAllocation,
    CostTrendPoint,
    CostTrendSeries,
)


def test_cost_projection_exposes_scope_but_never_invents_currency_or_amounts() -> None:
    body = cost_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        contexts={
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-16T09:00:00Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
    )

    assert body.scope_coverage.availability == "available"
    assert body.scope_coverage.scopes[0].model_dump() == {
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "namespaces": (),
        "freshness": "live",
    }
    assert body.observation.model_dump() == {
        "availability": "unavailable",
        "observed_at": None,
        "currency": None,
        "data_window": None,
        "reason_codes": ("cost_observation_not_integrated",),
    }
    assert body.summary.hourly_cost is None
    assert body.summary.monthly_projection is None
    assert body.summary.savings_recommendations is None
    assert body.trend.model_dump() == {
        "availability": "unavailable",
        "range": "24h",
        "currency": None,
        "series": (),
        "reason_codes": ("cost_observation_not_integrated",),
    }
    assert body.refresh_after_seconds == 60
    assert body.trend_refresh_after_seconds == 120
    assert body.nodes_refresh_after_seconds == 120


def test_cost_projection_preserves_the_requested_bounded_trend_range() -> None:
    body = cost_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        contexts={
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-16T09:00:00Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
        time_range="7d",
    )

    assert body.trend.range == "7d"
    assert body.trend.series == ()


def test_cost_projection_keeps_partial_and_disconnected_scope_evidence() -> None:
    body = cost_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a", "cluster-b", "cluster-c"),
        contexts={
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-16T09:00:00Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            },
            "cluster-b": {
                "snapshot_revision": 9,
                "observed_at": "2026-07-16T09:01:00Z",
                "resources_complete": False,
                "labels_complete": True,
                "partial_reason_codes": ["agent_snapshot_truncated"],
            },
        },
    )

    assert body.scope_coverage.availability == "unavailable"
    assert [scope.freshness for scope in body.scope_coverage.scopes] == [
        "live",
        "partial",
        "disconnected",
    ]
    assert body.scope_coverage.reason_codes == (
        "agent_snapshot_truncated",
        "inventory_snapshot_incomplete:cluster-b",
        "inventory_snapshot_unavailable:cluster-c",
    )


def test_observed_cost_trend_enforces_order_and_transport_bounds() -> None:
    with pytest.raises(ValueError, match="unique ascending timestamps"):
        CostTrendSeries(
            key="namespace/shop",
            label="shop",
            points=(
                CostTrendPoint(timestamp=2, rate_micros=2),
                CostTrendPoint(timestamp=1, rate_micros=1),
            ),
        )

    with pytest.raises(ValueError, match="at most 480"):
        CostTrendSeries(
            key="namespace/shop",
            label="shop",
            points=tuple(
                CostTrendPoint(timestamp=index, rate_micros=index) for index in range(481)
            ),
        )

    observed = CostObservedTrend(
        availability="partial",
        range="6h",
        currency="KRW",
        series=(
            CostTrendSeries(
                key="namespace/shop",
                label="shop",
                points=(
                    CostTrendPoint(timestamp=1, rate_micros=1),
                    CostTrendPoint(timestamp=2, rate_micros=2),
                ),
            ),
        ),
        reason_codes=("collector_gap",),
    )

    assert observed.currency == "KRW"


def test_workload_allocation_requires_server_projections_and_consistent_units() -> None:
    current = CostCurrentAllocation(
        replicas=2,
        hourly_rate_micros=300_000,
        projected_daily_micros=7_200_000,
        projected_monthly_micros=219_000_000,
        cpu_rate_micros=180_000,
        memory_rate_micros=120_000,
        cpu_allocation_use_basis_points=2_500,
        memory_allocation_use_basis_points=4_000,
        cpu_usage_window_seconds=3_600,
        memory_usage_window_seconds=60,
    )
    workload = CostObservedWorkloadAllocation(
        availability="partial",
        observed_at="2026-07-16T09:00:00Z",
        currency="KRW",
        current=current,
        trend={
            "availability": "unavailable",
            "range": "24h",
            "currency": None,
            "series": (),
            "reason_codes": ("workload_history_not_observed",),
        },
        reason_codes=("workload_history_not_observed",),
    )

    assert workload.current.projected_monthly_micros == 219_000_000

    with pytest.raises(ValueError, match="component rates"):
        CostCurrentAllocation(
            replicas=1,
            hourly_rate_micros=1,
            projected_daily_micros=24,
            projected_monthly_micros=730,
            cpu_rate_micros=1,
            memory_rate_micros=1,
        )

    with pytest.raises(ValueError, match="available together"):
        CostCurrentAllocation(
            replicas=1,
            hourly_rate_micros=2,
            projected_daily_micros=48,
            projected_monthly_micros=1_460,
            cpu_rate_micros=1,
            memory_rate_micros=1,
            cpu_allocation_use_basis_points=5_000,
        )
