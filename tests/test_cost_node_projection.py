from __future__ import annotations

from time import perf_counter

import pytest

from domains.cost.node_projection import cost_node_page
from packages.contracts.cost.observations import CostNodePricing


def _node(index: int, *, provider_id: str | None = None) -> dict[str, object]:
    name = f"node-{index:05d}"
    return {
        "resource": {
            "inventory_key": f"cluster-a:v1:Node:_:{name}",
            "cluster_id": "cluster-a",
            "api_version": "v1",
            "kind": "Node",
            "namespace": None,
            "name": name,
            "uid": f"uid-{index}",
            "status": "Ready",
            "labels": {
                "node.kubernetes.io/instance-type": "m6i.large",
                "topology.kubernetes.io/zone": "ap-northeast-2a",
                "karpenter.sh/capacity-type": "spot",
            },
            "summary": {
                "provider_id": provider_id,
                "allocatable": {"cpu": "1900m", "memory": "7Gi", "pods": "58"},
            },
            "observed_at": "2026-07-17T01:00:00Z",
        },
        "cluster": {"cluster_id": "cluster-a", "name": "prod", "provider": "eks"},
        "application_ids": [],
        "application_binding_completeness": "exact",
    }


def test_cost_node_projection_reuses_observed_identity_capacity_and_usage_without_money() -> None:
    page = cost_node_page(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(("cluster-a", "shop"),),
        contexts={
            "cluster-a": {
                "snapshot_revision": 41,
                "observed_at": "2026-07-17T01:00:00Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
        resource_page={
            "items": [_node(1, provider_id="aws:///ap-northeast-2a/i-123")],
            "filtered_count": 1,
            "has_more": False,
        },
        metric_page={
            "resources": [{"resource_id": "cluster-a:v1:Node:_:node-00001"}],
            "samples_by_cluster": {
                "cluster-a": [
                    {
                        "sampled_at": "2026-07-17T01:00:00Z",
                        "usage": {
                            "nodes": {
                                "node-00001": {
                                    "cpu_mcores": 950,
                                    "mem_mib": 3584,
                                    "cpu_ratio": 0.5,
                                    "mem_ratio": 0.5,
                                }
                            }
                        },
                    }
                ]
            },
        },
        snapshot_revision=41,
        next_cursor=None,
    )

    assert page.scope_coverage.scopes[0].namespaces == ("shop",)
    assert page.refresh_after_seconds == 120
    assert page.total == 1
    assert page.count_completeness == "exact"
    assert page.pricing_coverage.model_dump() == {
        "availability": "unavailable",
        "reason_codes": (
            "namespace_allocation_not_observed",
            "node_pricing_observation_not_integrated",
        ),
    }
    assert page.items[0].model_dump() == {
        "resource": {
            "api_group": "",
            "version": "v1",
            "kind": "Node",
            "namespace": None,
            "name": "node-00001",
            "uid": "uid-1",
        },
        "cluster_id": "cluster-a",
        "cluster_name": "prod",
        "provider": "eks",
        "provider_id": "aws:///ap-northeast-2a/i-123",
        "instance_type": "m6i.large",
        "zone": "ap-northeast-2a",
        "capacity_type": "spot",
        "status": "Ready",
        "observed_at": "2026-07-17T01:00:00Z",
        "capacity": {"cpu_mcores": 1900.0, "memory_mib": 7168.0, "pods": 58},
        "usage": {
            "availability": "available",
            "observed_at": "2026-07-17T01:00:00Z",
            "cpu_mcores": 950.0,
            "memory_mib": 3584.0,
            "cpu_utilization_percent": 50.0,
            "memory_utilization_percent": 50.0,
            "reason_codes": (),
        },
        "pricing": {
            "availability": "unavailable",
            "currency": None,
            "hourly_rate_micros": None,
            "reason_codes": ("node_pricing_observation_not_integrated",),
        },
    }


def test_cost_node_projection_marks_missing_identity_and_metrics_without_guessing() -> None:
    page = cost_node_page(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(),
        contexts={
            "cluster-a": {
                "snapshot_revision": 41,
                "observed_at": "2026-07-17T01:00:00Z",
                "resources_complete": False,
                "labels_complete": False,
                "partial_reason_codes": ["agent_snapshot_truncated"],
            }
        },
        resource_page={"items": [_node(1)], "filtered_count": 1, "has_more": False},
        metric_page={"resources": [], "samples_by_cluster": {}},
        snapshot_revision=41,
        next_cursor=None,
    )

    assert page.count_completeness == "partial"
    assert page.items[0].provider_id is None
    assert page.items[0].pricing.reason_codes == (
        "node_pricing_observation_not_integrated",
        "node_provider_identity_not_observed",
    )
    assert page.items[0].usage.model_dump() == {
        "availability": "unavailable",
        "observed_at": None,
        "cpu_mcores": None,
        "memory_mib": None,
        "cpu_utilization_percent": None,
        "memory_utilization_percent": None,
        "reason_codes": ("node_usage_not_observed",),
    }


def test_cost_node_contract_rejects_money_when_pricing_is_unavailable() -> None:
    with pytest.raises(ValueError):
        CostNodePricing.model_validate(
            {
                "availability": "unavailable",
                "currency": "USD",
                "hourly_rate_micros": 0,
                "reason_codes": ["node_pricing_observation_not_integrated"],
            }
        )


def test_cost_node_projection_handles_maximum_observed_page_linearly() -> None:
    rows = [_node(index, provider_id=f"aws:///zone/i-{index}") for index in range(200)]
    started = perf_counter()
    page = cost_node_page(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(),
        contexts={
            "cluster-a": {
                "snapshot_revision": 41,
                "observed_at": "2026-07-17T01:00:00Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
        resource_page={"items": rows, "filtered_count": 10_000, "has_more": True},
        metric_page={"resources": [], "samples_by_cluster": {}},
        snapshot_revision=41,
        next_cursor="next-page",
    )
    elapsed = perf_counter() - started

    assert len(page.items) == 200
    assert page.total == 10_000
    assert page.next_cursor == "next-page"
    assert elapsed < 0.5
