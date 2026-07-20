from __future__ import annotations

from datetime import UTC, datetime, timedelta

from domains.inventory_filter.physical_topology import build_physical_topology


def _node_result(metrics_observed_at: str) -> dict[str, object]:
    return {
        "servers": [
            {
                "inventory_key": "node-current",
                "name": "node-current",
                "status": "Ready",
                "summary": {
                    "cpu_ratio": 0.25,
                    "mem_ratio": 0.5,
                    "metrics_observed_at": metrics_observed_at,
                },
            }
        ],
        "pods": [],
        "pod_counts_by_node_name": {"node-current": {"matched": 0, "total": 0}},
        "truncated_by_node_name": {},
        "unassigned_truncated_count": 0,
    }


def test_physical_topology_uses_fresh_inventory_node_metrics_as_fallback() -> None:
    observed_at = datetime.now(UTC).isoformat()

    built = build_physical_topology(
        _node_result(observed_at),
        latest_usage_sample=None,
        matched_count_completeness="exact",
        total_count_completeness="exact",
    )

    assert built["servers"][0]["cpu_pct"] == 25.0
    assert built["servers"][0]["mem_pct"] == 50.0
    assert built["metrics_completeness"] == "exact"
    assert built["metrics_observed_at"] == observed_at


def test_physical_topology_rejects_stale_inventory_node_metrics() -> None:
    observed_at = (datetime.now(UTC) - timedelta(hours=2)).isoformat()

    built = build_physical_topology(
        _node_result(observed_at),
        latest_usage_sample=None,
        matched_count_completeness="exact",
        total_count_completeness="exact",
    )

    assert built["servers"][0]["cpu_pct"] is None
    assert built["servers"][0]["mem_pct"] is None
    assert built["metrics_completeness"] == "unavailable"
    assert built["metrics_observed_at"] is None
