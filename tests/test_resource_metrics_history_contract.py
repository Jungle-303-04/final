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
                "uid": "pod-checkout-a",
            }
        ],
        {
            "cluster-a": [
                {
                    "sampled_at": "2026-07-14T05:00:00Z",
                    "usage": {
                        "pods": {
                            "shop/checkout-a": {
                                "cpu_mcores": 125.5,
                                "mem_mib": 192,
                                "uid": "pod-checkout-a",
                                "metrics_observed_at": "2026-07-14T04:59:58Z",
                                "metrics_window": "30s",
                                "container_metrics_complete": True,
                                "container_metrics": [
                                    {
                                        "name": "app",
                                        "cpu_mcores": 100.5,
                                        "mem_mib": 128,
                                    },
                                    {
                                        "name": "sidecar",
                                        "cpu_mcores": 25,
                                        "mem_mib": 64,
                                    },
                                ],
                            }
                        }
                    },
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
        refresh_policy_key="metrics_kubernetes",
        snapshot=_snapshot(),
    )
    assert response.completeness == "partial"
    assert response.series[0].has_sparkline_points is True
    assert response.series[0].completeness == "partial"
    assert response.series[0].points[0].cpu_mcores == 125.5
    assert response.series[0].points[1].cpu_mcores is None
    assert response.series[0].current_observation is not None
    assert response.series[0].current_observation.container_metrics_complete is True
    assert [item.name for item in response.series[0].current_observation.containers] == [
        "app",
        "sidecar",
    ]
    assert response.series[0].current_observation.containers[1].cpu_mcores == 25
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


def test_current_pod_container_metrics_reject_same_name_recreation() -> None:
    built = build_resource_metric_history(
        [
            {
                "resource_id": "pod-new",
                "cluster_id": "cluster-a",
                "resource_type": "pod",
                "namespace": "shop",
                "name": "checkout-a",
                "uid": "pod-new-uid",
            }
        ],
        {
            "cluster-a": [
                {
                    "sampled_at": "2026-07-14T05:00:00Z",
                    "usage": {
                        "pods": {
                            "shop/checkout-a": {
                                "uid": "pod-old-uid",
                                "cpu_mcores": 125.5,
                                "metrics_observed_at": "2026-07-14T04:59:58Z",
                                "metrics_window": "30s",
                                "container_metrics_complete": True,
                                "container_metrics": [
                                    {
                                        "name": "app",
                                        "cpu_mcores": 125.5,
                                        "mem_mib": 128,
                                    }
                                ],
                            }
                        }
                    },
                }
            ],
        },
        projection_complete=True,
    )

    response = ResourceMetricsHistoryResponse(
        **built,
        refresh_policy_key="metrics_kubernetes",
        snapshot=_snapshot(),
    )

    assert response.series[0].points[0].cpu_mcores == 125.5
    assert response.series[0].current_observation is None


def test_metric_history_preserves_real_node_samples_without_a_namespace() -> None:
    built = build_resource_metric_history(
        [
            {
                "resource_id": "node-a",
                "cluster_id": "cluster-a",
                "resource_type": "node",
                "namespace": None,
                "name": "worker-a.internal",
            }
        ],
        {
            "cluster-a": [
                {
                    "sampled_at": "2026-07-15T05:00:00Z",
                    "usage": {
                        "nodes": {
                            "worker-a.internal": {
                                "cpu_mcores": 640.5,
                                "mem_mib": 4096,
                                "metrics_observed_at": "2026-07-15T04:59:58Z",
                                "metrics_window": "30s",
                            }
                        }
                    },
                }
            ]
        },
        projection_complete=True,
    )

    response = ResourceMetricsHistoryResponse(
        **built,
        refresh_policy_key="metrics_kubernetes",
        snapshot=_snapshot(),
    )
    assert response.series[0].resource_type == "node"
    assert response.series[0].namespace is None
    assert response.series[0].points[0].cpu_mcores == 640.5
    assert response.series[0].points[0].mem_mib == 4096
    assert response.series[0].current_observation is not None
    assert response.series[0].current_observation.observed_at == "2026-07-15T04:59:58Z"
    assert response.series[0].current_observation.measurement_window == "30s"
    assert response.series[0].current_observation.cpu_mcores == 640.5
    assert response.series[0].current_observation.mem_mib == 4096


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
