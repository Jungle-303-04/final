from __future__ import annotations

from domains.target.evidence_policy import (
    COST_NAMESPACE_HOURLY_QUERY,
    COST_NAMESPACE_STORAGE_QUERY,
    COST_POD_CPU_HOURLY_QUERY,
    COST_POD_CPU_USE_QUERY,
    COST_POD_MEMORY_HOURLY_QUERY,
    COST_POD_MEMORY_USE_QUERY,
    DEMO_EVIDENCE_PROFILE,
    STANDARD_EVIDENCE_PROFILE,
    default_agent_policy,
)
from packages.contracts.cost.observations import (
    COST_NAMESPACE_HOURLY_METRIC,
    COST_NAMESPACE_STORAGE_METRIC,
    COST_POD_CPU_HOURLY_METRIC,
    COST_POD_CPU_USE_METRIC,
    COST_POD_MEMORY_HOURLY_METRIC,
    COST_POD_MEMORY_USE_METRIC,
)
from packages.contracts.traffic.observations import (
    TRAFFIC_CARETTA_FLOW_METRIC,
    TRAFFIC_HUBBLE_FLOW_METRIC,
    TRAFFIC_ISTIO_FLOW_METRIC,
)


def test_default_target_policy_collects_live_color_turf_failures() -> None:
    policy = default_agent_policy(
        cluster_id="cluster-demo",
        evidence_profile=DEMO_EVIDENCE_PROFILE,
    )

    kubernetes_queries = policy.evidence.providers["kubernetes"].queries
    metrics_queries = policy.evidence.providers["metrics"].queries
    log_queries = policy.evidence.providers["logs"].queries

    assert {
        query["query"]
        for query in kubernetes_queries
        if query["name"] == "color_turf_namespace_snapshot"
    } == {"color-turf"}
    assert {query["name"] for query in metrics_queries} >= {
        "color_turf_pod_restarts",
        "color_turf_oom_terminated",
    }
    assert {query["name"] for query in log_queries} >= {"color_turf_runtime_failures"}


def test_standard_agent_policy_collects_server_owned_opencost_observations() -> None:
    policy = default_agent_policy(cluster_id="cluster-prod")
    by_name = {query["name"]: query for query in policy.evidence.providers["metrics"].queries}

    assert by_name[COST_NAMESPACE_HOURLY_METRIC]["query"] == COST_NAMESPACE_HOURLY_QUERY
    assert by_name[COST_NAMESPACE_STORAGE_METRIC]["query"] == COST_NAMESPACE_STORAGE_QUERY
    expected = {
        COST_NAMESPACE_HOURLY_METRIC: (COST_NAMESPACE_HOURLY_QUERY, ['namespace!=""']),
        COST_NAMESPACE_STORAGE_METRIC: (
            COST_NAMESPACE_STORAGE_QUERY,
            ['claim_namespace!=""'],
        ),
        COST_POD_CPU_HOURLY_METRIC: (COST_POD_CPU_HOURLY_QUERY, ['namespace!=""']),
        COST_POD_MEMORY_HOURLY_METRIC: (COST_POD_MEMORY_HOURLY_QUERY, ['namespace!=""']),
        COST_POD_CPU_USE_METRIC: (COST_POD_CPU_USE_QUERY, ['namespace!=""']),
        COST_POD_MEMORY_USE_METRIC: (COST_POD_MEMORY_USE_QUERY, ['namespace!=""']),
    }
    for name, (query, matchers) in expected.items():
        assert by_name[name]["query"] == query
        assert by_name[name]["collection_scope"] == "cluster_cost_observation"
        assert by_name[name]["provenance"] == {
            "cluster_id": "cluster-prod",
            "evidence_profile": "standard",
            "backend_scope": "cluster_local",
            "query_scope": "cluster",
            "namespaces": [],
            "required_matchers": matchers,
        }


def test_standard_policy_collects_bounded_traffic_metrics_inside_the_agent() -> None:
    policy = default_agent_policy(
        cluster_id="cluster-a",
        evidence_profile=STANDARD_EVIDENCE_PROFILE,
    )
    queries = {query["name"]: query for query in policy.evidence.providers["metrics"].queries}

    assert set(queries) >= {
        TRAFFIC_CARETTA_FLOW_METRIC,
        TRAFFIC_HUBBLE_FLOW_METRIC,
        TRAFFIC_ISTIO_FLOW_METRIC,
    }
    for name in (
        TRAFFIC_CARETTA_FLOW_METRIC,
        TRAFFIC_HUBBLE_FLOW_METRIC,
        TRAFFIC_ISTIO_FLOW_METRIC,
    ):
        assert queries[name]["source"] == "prometheus"
        assert queries[name]["provenance"] == {
            "cluster_id": "cluster-a",
            "evidence_profile": "standard",
            "backend_scope": "cluster_local",
            "query_scope": "cluster",
            "namespaces": [],
            "required_matchers": [],
        }
    assert (
        "increase(hubble_flows_processed_total[5m])" in queries[TRAFFIC_HUBBLE_FLOW_METRIC]["query"]
    )
