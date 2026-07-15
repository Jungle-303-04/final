from __future__ import annotations

from domains.target.evidence_policy import default_agent_policy


def test_default_target_policy_collects_live_color_turf_failures() -> None:
    policy = default_agent_policy(cluster_id="cluster-demo")

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
