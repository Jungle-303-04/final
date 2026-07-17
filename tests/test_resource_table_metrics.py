from __future__ import annotations

from domains.inventory_filter.resource_table_metrics import attach_resource_table_metrics


def _row(resource_type: str, summary: dict[str, object]) -> dict[str, object]:
    namespace = "shop" if resource_type == "pod" else None
    kind = "Pod" if resource_type == "pod" else "Node"
    name = "checkout-0" if resource_type == "pod" else "worker-a"
    return {
        "resource": {
            "inventory_key": f"cluster-a:v1:{kind}:{namespace or ''}:{name}",
            "snapshot_id": "snapshot-42",
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "resource_type": resource_type,
            "api_version": "v1",
            "kind": kind,
            "namespace": namespace,
            "name": name,
            "uid": f"uid-{name}",
            "status": "Running" if resource_type == "pod" else "Ready",
            "health": "healthy",
            "labels": {},
            "annotations": {},
            "summary": summary,
        },
        "cluster": {"cluster_id": "cluster-a", "name": "prod", "provider": "eks"},
        "application_ids": [],
        "application_binding_completeness": "exact",
    }


def test_pod_table_metrics_preserve_usage_requests_limits_uid_and_snapshot() -> None:
    row = _row(
        "pod",
        {
            "cpu_mcores": 250.0,
            "mem_mib": 192.0,
            "cpu_request_mcores": 150.0,
            "cpu_limit_mcores": 600.0,
            "mem_request_mib": 192.0,
            "mem_limit_mib": 384.0,
            "metrics_observed_at": "2026-07-17T01:00:00Z",
            "metrics_window": "30s",
        },
    )

    result = attach_resource_table_metrics([row])

    assert result[0]["metrics"] == {
        "kind": "pod",
        "resource_uid": "uid-checkout-0",
        "source_snapshot_id": "snapshot-42",
        "observed_at": "2026-07-17T01:00:00Z",
        "measurement_window": "30s",
        "cpu_mcores": 250.0,
        "memory_mib": 192.0,
        "cpu_request_mcores": 150.0,
        "cpu_limit_mcores": 600.0,
        "memory_request_mib": 192.0,
        "memory_limit_mib": 384.0,
        "completeness": "exact",
        "reason_codes": [],
    }


def test_node_table_metrics_preserve_allocatable_and_scheduled_pod_count() -> None:
    row = _row(
        "node",
        {
            "cpu_mcores": 1200.0,
            "mem_mib": 4096.0,
            "allocatable": {"cpu": "3900m", "memory": "8Gi", "pods": "58"},
            "pod_count": 23,
            "metrics_observed_at": "2026-07-17T01:00:00Z",
            "metrics_window": "30s",
        },
    )

    result = attach_resource_table_metrics([row])

    assert result[0]["metrics"] == {
        "kind": "node",
        "resource_uid": "uid-worker-a",
        "source_snapshot_id": "snapshot-42",
        "observed_at": "2026-07-17T01:00:00Z",
        "measurement_window": "30s",
        "cpu_mcores": 1200.0,
        "memory_mib": 4096.0,
        "cpu_allocatable_mcores": 3900.0,
        "memory_allocatable_mib": 8192.0,
        "pod_count": 23,
        "pod_allocatable": 58,
        "completeness": "exact",
        "reason_codes": [],
    }


def test_table_metrics_never_turn_missing_or_invalid_evidence_into_zero() -> None:
    pod = _row(
        "pod",
        {
            "cpu_mcores": 0.0,
            "mem_mib": None,
            "cpu_request_mcores": None,
            "cpu_limit_mcores": "invalid",
            "metrics_observed_at": "2026-07-17T01:00:00Z",
            "metrics_window": "30s",
        },
    )
    resource = pod["resource"]
    assert isinstance(resource, dict)
    resource["uid"] = None

    metrics = attach_resource_table_metrics([pod])[0]["metrics"]

    assert isinstance(metrics, dict)
    assert metrics["cpu_mcores"] == 0.0
    assert metrics["memory_mib"] is None
    assert metrics["cpu_request_mcores"] is None
    assert metrics["cpu_limit_mcores"] is None
    assert metrics["resource_uid"] is None
    assert metrics["completeness"] == "partial"
    assert metrics["reason_codes"] == [
        "pod_cpu_limit_unavailable",
        "pod_cpu_request_unavailable",
        "pod_memory_limit_unavailable",
        "pod_memory_request_unavailable",
        "pod_memory_usage_unavailable",
        "resource_uid_unavailable",
    ]


def test_non_metric_resource_uses_no_parallel_projection() -> None:
    row = _row("workload", {"ready_replicas": 2})
    resource = row["resource"]
    assert isinstance(resource, dict)
    resource["kind"] = "Deployment"
    resource["namespace"] = "shop"

    assert attach_resource_table_metrics([row])[0]["metrics"] is None
