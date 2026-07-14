from __future__ import annotations

import pytest
from pydantic import ValidationError

from domains.inventory_filter.physical_topology import build_physical_topology
from packages.contracts.gateway import routes
from packages.contracts.gateway.responses import PhysicalTopologyResponse


def _payload() -> dict[str, object]:
    return {
        "view": "physical",
        "cluster_projection_revision": 42,
        "cluster": {"cluster_id": "cluster-a", "name": "prod", "provider": "eks"},
        "servers": [
            {
                "id": "node-key-a",
                "name": "node-a",
                "cpu_pct": 42.0,
                "mem_pct": 73.4,
                "status": "Ready",
                "matched_pod_count": 1,
                "total_pod_count": 2,
                "matched_pod_count_completeness": "exact",
                "total_pod_count_completeness": "exact",
            }
        ],
        "pods": [
            {
                "id": "pod-key-a",
                "name": "checkout-a",
                "namespace": "shop",
                "server_id": "node-key-a",
                "usage_pct": None,
                "cpu_mcores": 120.5,
                "cpu_request_mcores": None,
                "mem_mib": 256.0,
                "mem_request_mib": None,
                "phase": "Running",
                "health": "healthy",
                "restarts": 0,
                "matches_filter": True,
            }
        ],
        "truncated": {"node-key-a": 1},
        "unassigned_truncated_count": 0,
        "counts": {
            "filtered_count": 1,
            "unfiltered_count": 3,
            "filtered_count_completeness": "exact",
            "unfiltered_count_completeness": "exact",
        },
        "projection_completeness": "partial",
        "metrics_completeness": "partial",
        "metrics_observed_at": "2026-07-14T05:00:00Z",
        "partial_reason_codes": ["topology_pod_budget_exceeded"],
        "snapshot": {
            "snapshot_revision": 42,
            "authorization_revision": "auth-a",
            "filter_fingerprint": "filter-a",
            "observed_at": "2026-07-14T05:00:00Z",
            "stale": False,
            "partial_reason_codes": ["topology_pod_budget_exceeded"],
        },
    }


def test_physical_topology_contract_is_additive_bounded_and_allowlisted() -> None:
    response = PhysicalTopologyResponse.model_validate(_payload())

    assert routes.TOPOLOGY_PATH == "/topology"
    assert response.cluster_projection_revision == 42
    assert response.servers[0].matched_pod_count == 1
    assert response.servers[0].total_pod_count == 2
    assert response.pods[0].server_id == "node-key-a"
    encoded = response.model_dump_json()
    assert "raw" not in encoded
    assert "annotations" not in encoded
    assert "secret" not in encoded.casefold()


def test_physical_topology_rejects_unknown_server_links_and_truncation() -> None:
    payload = _payload()
    payload["pods"] = [{**payload["pods"][0], "server_id": "missing-node"}]
    with pytest.raises(ValidationError):
        PhysicalTopologyResponse.model_validate(payload)

    payload = _payload()
    payload["pods"] = [{**payload["pods"][0], "usage_pct": 106.2}]
    with pytest.raises(ValidationError):
        PhysicalTopologyResponse.model_validate(payload)

    payload = _payload()
    payload["servers"] = [
        {
            **payload["servers"][0],
            "matched_pod_count": 0,
            "matched_pod_count_completeness": "unavailable",
        }
    ]
    with pytest.raises(ValidationError):
        PhysicalTopologyResponse.model_validate(payload)

    payload = _payload()
    payload["truncated"] = {"missing-node": 2}
    with pytest.raises(ValidationError):
        PhysicalTopologyResponse.model_validate(payload)


def test_physical_topology_builder_uses_measured_values_and_never_invents_requests() -> None:
    result = {
        "servers": [{"inventory_key": "node-key-a", "name": "node-a", "status": "Ready"}],
        "pods": [
            {
                "inventory_key": "pod-key-a",
                "name": "checkout-a",
                "namespace": "shop",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-a", "restart_total": 2},
                "placement_node_name": "node-a",
                "matches_filter": True,
            }
        ],
        "pod_counts_by_node_name": {"node-a": {"matched": 17, "total": 20}},
        "truncated_by_node_name": {"node-a": 8},
        "unassigned_truncated_count": 0,
    }
    built = build_physical_topology(
        result,
        latest_usage_sample={
            "sampled_at": "2026-07-14T05:00:00Z",
            "usage": {
                "nodes": {"node-a": {"cpu_ratio": 0.42, "memory_pct": 73.4}},
                "pods": {"shop/checkout-a": {"cpu_mcores": 120.5, "mem_mib": 256}},
            },
        },
        matched_count_completeness="exact",
        total_count_completeness="exact",
    )

    assert built["servers"][0] == {
        "id": "node-key-a",
        "name": "node-a",
        "cpu_pct": 42.0,
        "mem_pct": 73.4,
        "status": "Ready",
        "matched_pod_count": 17,
        "total_pod_count": 20,
        "matched_pod_count_completeness": "exact",
        "total_pod_count_completeness": "exact",
    }
    assert built["pods"][0]["usage_pct"] is None
    assert built["pods"][0]["cpu_mcores"] == 120.5
    assert built["pods"][0]["cpu_request_mcores"] is None
    assert built["pods"][0]["mem_mib"] == 256.0
    assert built["pods"][0]["mem_request_mib"] is None
    assert built["pods"][0]["restarts"] == 2
    assert built["truncated"] == {"node-key-a": 8}
    assert "topology_pod_budget_exceeded" in built["partial_reason_codes"]


def test_physical_topology_builder_preserves_actual_usage_and_request_denominators() -> None:
    result = {
        "servers": [],
        "pods": [
            {
                "inventory_key": "pod-key-a",
                "name": "checkout-a",
                "namespace": "shop",
                "status": "Running",
                "health": "healthy",
                "summary": {
                    "cpu_request_mcores": 200,
                    "mem_request_mib": 128,
                    "restart_total": 0,
                },
                "placement_node_name": "",
                "matches_filter": False,
            }
        ],
    }
    built = build_physical_topology(
        result,
        latest_usage_sample={
            "sampled_at": "2026-07-14T05:00:00Z",
            "usage": {"pods": {"shop/checkout-a": {"cpu_mcores": 250, "mem_mib": 64}}},
        },
        matched_count_completeness="partial",
        total_count_completeness="exact",
    )

    assert built["pods"][0]["usage_pct"] == 125.0
    assert built["pods"][0]["cpu_mcores"] == 250.0
    assert built["pods"][0]["cpu_request_mcores"] == 200.0
    assert built["pods"][0]["mem_mib"] == 64.0
    assert built["pods"][0]["mem_request_mib"] == 128.0
    assert built["pods"][0]["server_id"] is None


def test_physical_topology_builder_nulls_usage_when_any_request_is_missing() -> None:
    result = {
        "servers": [],
        "pods": [
            {
                "inventory_key": "pod-key-a",
                "name": "checkout-a",
                "namespace": "shop",
                "status": "Running",
                "health": "healthy",
                "summary": {"cpu_request_mcores": 200, "restart_total": 0},
                "placement_node_name": "",
                "matches_filter": True,
            }
        ],
    }

    built = build_physical_topology(
        result,
        latest_usage_sample={
            "sampled_at": "2026-07-14T05:00:00Z",
            "usage": {"pods": {"shop/checkout-a": {"cpu_mcores": 250, "mem_mib": 64}}},
        },
        matched_count_completeness="exact",
        total_count_completeness="exact",
    )

    assert built["pods"][0]["usage_pct"] is None
    assert built["pods"][0]["cpu_request_mcores"] == 200.0
    assert built["pods"][0]["mem_request_mib"] is None
