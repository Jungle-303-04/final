from __future__ import annotations

from domains.target.evidence_policy import (
    COST_NAMESPACE_HOURLY_QUERY,
    COST_NAMESPACE_STORAGE_QUERY,
    DEMO_EVIDENCE_PROFILE,
    default_agent_policy,
)
from packages.contracts.cost.observations import (
    COST_NAMESPACE_HOURLY_METRIC,
    COST_NAMESPACE_STORAGE_METRIC,
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
    for name in (COST_NAMESPACE_HOURLY_METRIC, COST_NAMESPACE_STORAGE_METRIC):
        assert by_name[name]["collection_scope"] == "cluster_cost_observation"
        assert by_name[name]["provenance"] == {
            "cluster_id": "cluster-prod",
            "evidence_profile": "standard",
            "backend_scope": "cluster_local",
            "query_scope": "cluster",
            "namespaces": [],
            "required_matchers": [],
        }
