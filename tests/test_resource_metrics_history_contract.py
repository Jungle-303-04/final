from __future__ import annotations

import pytest
from pydantic import ValidationError

from domains.inventory_filter.metrics_history import build_resource_metric_history
from packages.contracts.gateway.responses import (
    FilterSnapshotMeta,
    ResourceMetricHistorySeries,
    ResourceMetricsHistoryResponse,
)


def _snapshot() -> FilterSnapshotMeta:
    return FilterSnapshotMeta(
        snapshot_revision=42,
        authorization_revision="auth-revision",
        filter_fingerprint="filter-fingerprint",
        observed_at="2026-07-14T05:02:00Z",
        stale=False,
        partial_reason_codes=[],
    )


def test_metric_history_preserves_real_nulls_and_completeness() -> None:
    built = build_resource_metric_history(
        [
            {
                "resource_id": "pod-a",
                "cluster_id": "cluster-a",
                "namespace": "shop",
                "name": "checkout-a",
            }
        ],
        {
            "cluster-a": [
                {
                    "sampled_at": "2026-07-14T05:00:00Z",
                    "usage": {"pods": {"shop/checkout-a": {"cpu_mcores": 125.5}}},
                },
                {
                    "sampled_at": "2026-07-14T05:01:00Z",
                    "usage": {"pods": {}},
                },
            ]
        },
        projection_complete=True,
    )

    response = ResourceMetricsHistoryResponse(
        **built,
        snapshot=_snapshot(),
    )
    assert response.completeness == "partial"
    assert response.series[0].has_sparkline_points is True
    assert response.series[0].completeness == "partial"
    assert response.series[0].points[0].cpu_mcores == 125.5
    assert response.series[0].points[1].cpu_mcores is None
    assert "metrics_history_partial" in response.partial_reason_codes


def test_metric_history_without_samples_is_empty_not_zero() -> None:
    built = build_resource_metric_history(
        [
            {
                "resource_id": "pod-a",
                "cluster_id": "cluster-a",
                "namespace": "shop",
                "name": "checkout-a",
            }
        ],
        {},
        projection_complete=True,
    )

    assert built["series"][0]["points"] == []
    assert built["series"][0]["has_sparkline_points"] is False
    assert built["series"][0]["completeness"] == "unavailable"
    assert built["completeness"] == "unavailable"


def test_metric_history_contract_rejects_synthetic_availability() -> None:
    with pytest.raises(ValidationError):
        ResourceMetricHistorySeries(
            resource_id="pod-a",
            cluster_id="cluster-a",
            namespace="shop",
            name="checkout-a",
            points=[],
            has_sparkline_points=True,
            completeness="exact",
            partial_reason_codes=[],
        )
