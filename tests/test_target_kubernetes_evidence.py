from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

import httpx
import pytest

from domains.inventory.kubernetes_snapshot import kubernetes_evidence_to_inventory_snapshot
from domains.inventory_filter.physical_topology import build_physical_topology
from packages.contracts.gateway.requests import (
    AgentEvidenceRequest,
    EvidenceJobResultRequest,
    EvidenceProviderPolicy,
)
from packages.kubernetes_provider import detect_kubernetes_provider

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_DIR = ROOT_DIR / "src" / "services" / "target" / "cluster-agent"


def load_evidence_modules():
    module_names = (
        "config",
        "queries",
        "queries.registry",
        "span",
        "span.base",
        "span.otel",
        "providers",
        "providers.base",
        "providers.collection_limits",
        "providers.kubernetes_utils",
        "providers.kubernetes_providers",
        "providers.loki_providers",
        "providers.metadata_config_objects",
        "providers.metadata_config_refs",
        "providers.metadata_endpoint_slices",
        "providers.metadata_ownership",
        "providers.metadata_resource_quotas",
        "providers.metadata_providers",
        "providers.metadata_service_selectors",
        "providers.metadata_workload_snapshots",
        "providers.prometheus_analysis",
        "providers.prometheus_providers",
        "providers.tempo_analysis",
        "providers.tempo_providers",
        "kubernetes_api",
        "evidence",
        "evidence.collector",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(TARGET_AGENT_DIR))
    try:
        evidence_module = importlib.import_module("evidence")
        kubernetes_module = importlib.import_module("providers.kubernetes_providers")
        return evidence_module, kubernetes_module
    finally:
        sys.path.remove(str(TARGET_AGENT_DIR))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


def _exact_resource_access(**overrides: object) -> dict[str, object]:
    access: dict[str, object] = {
        "completeness": "exact",
        "reason_codes": [],
        "roles": [],
        "cluster_roles": [],
        "role_bindings": [],
        "cluster_role_bindings": [],
        "service_accounts": [],
        "pod_subjects": [],
    }
    access.update(overrides)
    return access


@pytest.mark.parametrize(
    ("collection", "resource", "normalized_collection", "nested_collection"),
    [
        (
            "roles",
            {"metadata": {"name": "reader", "namespace": "shop"}, "rules": None},
            "roles",
            "rules",
        ),
        (
            "role_bindings",
            {
                "metadata": {"name": "reader", "namespace": "shop"},
                "roleRef": {"kind": "Role", "name": "reader"},
                "subjects": None,
            },
            "role_bindings",
            "subjects",
        ),
    ],
)
def test_resource_access_normalizes_null_rbac_collections_as_empty_lists(
    collection: str,
    resource: dict[str, object],
    normalized_collection: str,
    nested_collection: str,
) -> None:
    _, kubernetes_module = load_evidence_modules()

    normalized = kubernetes_module.normalize_resource_access(
        _exact_resource_access(**{collection: [resource]}),
        observed_at="2026-07-17T00:00:00Z",
    )

    assert normalized["completeness"] == "exact"
    assert normalized[normalized_collection][0][nested_collection] == []


@pytest.mark.parametrize(
    ("subject", "expected_namespace"),
    [
        ({"kind": "ServiceAccount", "name": "reader"}, "shop"),
        (
            {"kind": "ServiceAccount", "namespace": "shared", "name": "reader"},
            "shared",
        ),
    ],
)
def test_role_binding_defaults_only_missing_service_account_namespace(
    subject: dict[str, object],
    expected_namespace: str,
) -> None:
    _, kubernetes_module = load_evidence_modules()

    normalized = kubernetes_module.normalize_resource_access(
        _exact_resource_access(
            role_bindings=[
                {
                    "metadata": {"name": "reader", "namespace": "shop"},
                    "roleRef": {"kind": "Role", "name": "reader"},
                    "subjects": [subject],
                }
            ]
        ),
        observed_at="2026-07-17T00:00:00Z",
    )

    assert normalized["completeness"] == "exact"
    assert normalized["role_bindings"][0]["subjects"][0]["namespace"] == expected_namespace


def test_cluster_role_binding_rejects_missing_service_account_namespace() -> None:
    _, kubernetes_module = load_evidence_modules()

    normalized = kubernetes_module.normalize_resource_access(
        _exact_resource_access(
            cluster_role_bindings=[
                {
                    "metadata": {"name": "reader"},
                    "roleRef": {"kind": "ClusterRole", "name": "reader"},
                    "subjects": [{"kind": "ServiceAccount", "name": "reader"}],
                }
            ]
        ),
        observed_at="2026-07-17T00:00:00Z",
    )

    assert normalized["completeness"] == "unavailable"
    assert normalized["reason_codes"] == ["invalid_access_observation"]


def test_role_binding_keeps_user_and_group_subjects_cluster_scoped() -> None:
    _, kubernetes_module = load_evidence_modules()

    normalized = kubernetes_module.normalize_resource_access(
        _exact_resource_access(
            role_bindings=[
                {
                    "metadata": {"name": "reader", "namespace": "shop"},
                    "roleRef": {"kind": "Role", "name": "reader"},
                    "subjects": [
                        {"kind": "User", "namespace": "ignored", "name": "alice"},
                        {"kind": "Group", "namespace": "ignored", "name": "operators"},
                    ],
                }
            ]
        ),
        observed_at="2026-07-17T00:00:00Z",
    )

    assert normalized["completeness"] == "exact"
    assert [subject["namespace"] for subject in normalized["role_bindings"][0]["subjects"]] == [
        "",
        "",
    ]


@pytest.mark.parametrize("namespace", [None, "", 7])
def test_role_binding_rejects_invalid_binding_namespace(namespace: object) -> None:
    _, kubernetes_module = load_evidence_modules()

    normalized = kubernetes_module.normalize_resource_access(
        _exact_resource_access(
            role_bindings=[
                {
                    "metadata": {"name": "reader", "namespace": namespace},
                    "roleRef": {"kind": "Role", "name": "reader"},
                    "subjects": [{"kind": "ServiceAccount", "name": "reader"}],
                }
            ]
        ),
        observed_at="2026-07-17T00:00:00Z",
    )

    assert normalized["completeness"] == "unavailable"
    assert normalized["reason_codes"] == ["invalid_access_observation"]


@pytest.mark.parametrize(
    ("collection", "resource"),
    [
        (
            "roles",
            {"metadata": {"name": "reader", "namespace": "shop"}, "rules": {}},
        ),
        (
            "role_bindings",
            {
                "metadata": {"name": "reader", "namespace": "shop"},
                "roleRef": {"kind": "Role", "name": "reader"},
                "subjects": "checkout",
            },
        ),
    ],
)
def test_resource_access_rejects_malformed_rbac_collections(
    collection: str,
    resource: dict[str, object],
) -> None:
    _, kubernetes_module = load_evidence_modules()

    normalized = kubernetes_module.normalize_resource_access(
        _exact_resource_access(**{collection: [resource]}),
        observed_at="2026-07-17T00:00:00Z",
    )

    assert normalized["completeness"] == "unavailable"
    assert normalized["reason_codes"] == ["invalid_access_observation"]


def test_endpoint_slice_summary_normalizes_null_collections() -> None:
    _, kubernetes_module = load_evidence_modules()

    summary = kubernetes_module.endpoint_slice_summary(
        {
            "metadata": {"name": "checkout-api-abc", "namespace": "target"},
            "addressType": "IPv4",
            "endpoints": None,
            "ports": None,
        }
    )

    assert summary["endpoint_count"] == 0
    assert summary["ports"] == []


def test_pod_requests_survive_provider_inventory_and_physical_usage_projection() -> None:
    _, kubernetes_module = load_evidence_modules()
    pod = {
        "metadata": {"uid": "pod-1", "name": "checkout-0", "namespace": "shop"},
        "spec": {
            "containers": [
                {
                    "name": "app",
                    "resources": {"requests": {"cpu": "250m", "memory": "128Mi"}},
                },
                {
                    "name": "sidecar",
                    "resources": {"requests": {"cpu": "0.1", "memory": "1Gi"}},
                },
            ]
        },
        "status": {"phase": "Running", "containerStatuses": []},
    }

    summary = kubernetes_module.pod_summary(pod)

    assert summary["cpu_request_mcores"] == 350.0
    assert summary["mem_request_mib"] == 1152.0

    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {"pods": [summary]},
        cluster_id="cluster-1",
        agent_id="agent-1",
    )
    inventory_pod = snapshot["resources"][0]
    assert inventory_pod["summary"]["cpu_request_mcores"] == 350.0
    assert inventory_pod["summary"]["mem_request_mib"] == 1152.0

    topology = build_physical_topology(
        {
            "servers": [],
            "pods": [
                {
                    "inventory_key": "pod-key-1",
                    "name": "checkout-0",
                    "namespace": "shop",
                    "status": "Running",
                    "health": "healthy",
                    "summary": inventory_pod["summary"],
                    "placement_node_name": "",
                    "matches_filter": True,
                }
            ],
        },
        latest_usage_sample={
            "sampled_at": "2026-07-15T03:00:00Z",
            "usage": {"pods": {"shop/checkout-0": {"cpu_mcores": 175.0}}},
        },
        matched_count_completeness="exact",
        total_count_completeness="exact",
    )
    assert topology["pods"][0]["usage_pct"] == 50.0


def test_pod_summary_preserves_ephemeral_debug_container_identity_for_terminal_handoff() -> None:
    _, kubernetes_module = load_evidence_modules()

    summary = kubernetes_module.pod_summary(
        {
            "metadata": {
                "uid": "pod-1",
                "resourceVersion": "18",
                "name": "checkout-0",
                "namespace": "shop",
            },
            "spec": {
                "containers": [{"name": "app"}],
                "ephemeralContainers": [
                    {
                        "name": "opsia-debug-abc123",
                        "targetContainerName": "app",
                    }
                ],
            },
            "status": {"phase": "Running", "containerStatuses": []},
        }
    )

    assert summary["ephemeral_containers"] == [{"name": "opsia-debug-abc123"}]


def test_pod_requests_and_limits_survive_one_provider_inventory_projection() -> None:
    _, kubernetes_module = load_evidence_modules()
    summary = kubernetes_module.pod_summary(
        {
            "metadata": {"uid": "pod-1", "name": "checkout-0", "namespace": "shop"},
            "spec": {
                "containers": [
                    {
                        "name": "app",
                        "resources": {
                            "requests": {"cpu": "250m", "memory": "128Mi"},
                            "limits": {"cpu": "500m", "memory": "256Mi"},
                        },
                    },
                    {
                        "name": "sidecar",
                        "resources": {
                            "requests": {"cpu": "0.1", "memory": "1Gi"},
                            "limits": {"cpu": "200m", "memory": "2Gi"},
                        },
                    },
                ]
            },
            "status": {"phase": "Running", "containerStatuses": []},
        }
    )

    assert summary["cpu_request_mcores"] == 350.0
    assert summary["cpu_limit_mcores"] == 700.0
    assert summary["mem_request_mib"] == 1152.0
    assert summary["mem_limit_mib"] == 2304.0

    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {"pods": [summary]},
        cluster_id="cluster-1",
        agent_id="agent-1",
    )
    persisted = snapshot["resources"][0]["summary"]
    assert persisted["cpu_limit_mcores"] == 700.0
    assert persisted["mem_limit_mib"] == 2304.0


def test_node_scheduled_pod_count_excludes_completed_pods() -> None:
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {
            "pods": [
                {"name": "running", "node_name": "worker-a", "phase": "Running"},
                {"name": "pending", "node_name": "worker-a", "phase": "Pending"},
                {"name": "done", "node_name": "worker-a", "phase": "Succeeded"},
                {"name": "failed", "node_name": "worker-a", "phase": "Failed"},
                {"name": "other", "node_name": "worker-b", "phase": "Running"},
            ],
            "nodes": [{"name": "worker-a", "ready": True}],
        },
        cluster_id="cluster-1",
        agent_id="agent-1",
    )

    node = next(
        resource for resource in snapshot["resources"] if resource["resource_type"] == "node"
    )
    assert node["summary"]["pod_count"] == 2
    assert snapshot["summary"]["nodes"][0]["pod_count"] == 2


def test_pod_summary_preserves_spec_container_ports_and_honest_completeness() -> None:
    _, kubernetes_module = load_evidence_modules()
    summary = kubernetes_module.pod_summary(
        {
            "metadata": {"uid": "pod-1", "name": "checkout-0", "namespace": "shop"},
            "spec": {
                "containers": [
                    {
                        "name": "app",
                        "ports": [
                            {"containerPort": 8080, "name": "http"},
                            {"containerPort": 5353, "name": "dns", "protocol": "UDP"},
                        ],
                    },
                    {
                        "name": "sidecar",
                        "ports": [{"containerPort": 9090, "name": "metrics", "protocol": "TCP"}],
                    },
                ]
            },
            "status": {
                "phase": "Running",
                "containerStatuses": [
                    {"name": "app", "ready": True, "restartCount": 0},
                ],
            },
        }
    )

    assert summary["container_ports_complete"] is True
    assert [(container["name"], container["ports"]) for container in summary["containers"]] == [
        (
            "app",
            [
                {"container_port": 8080, "name": "http", "protocol": "TCP"},
                {"container_port": 5353, "name": "dns", "protocol": "UDP"},
            ],
        ),
        (
            "sidecar",
            [{"container_port": 9090, "name": "metrics", "protocol": "TCP"}],
        ),
    ]
    assert summary["containers"][0]["ready"] is True
    assert summary["containers"][1]["ready"] is None


def test_pod_summary_marks_malformed_port_observation_partial_without_inventing_ports() -> None:
    _, kubernetes_module = load_evidence_modules()
    summary = kubernetes_module.pod_summary(
        {
            "metadata": {"name": "checkout-0", "namespace": "shop"},
            "spec": {
                "containers": [
                    {
                        "name": "app",
                        "ports": [
                            {"containerPort": 8080, "name": "http"},
                            {"containerPort": "not-observed", "name": "invalid"},
                        ],
                    }
                ]
            },
            "status": {"containerStatuses": []},
        }
    )

    assert summary["container_ports_complete"] is False
    assert summary["containers"][0]["ports"] == [
        {"container_port": 8080, "name": "http", "protocol": "TCP"}
    ]


@pytest.mark.parametrize(
    ("requests", "expected_cpu", "expected_memory"),
    [
        (
            [{"cpu": "100m", "memory": "64Mi"}, {"memory": "64Mi"}],
            None,
            128.0,
        ),
        (
            [{"cpu": "100m", "memory": "64Mi"}, {"cpu": "0", "memory": "64Mi"}],
            None,
            128.0,
        ),
        (
            [{"cpu": "100m", "memory": "64Mi"}, {"cpu": "invalid", "memory": "64Mi"}],
            None,
            128.0,
        ),
        (
            [{"cpu": "100m", "memory": "64Mi"}, {"cpu": "200m"}],
            300.0,
            None,
        ),
    ],
)
def test_pod_request_totals_fail_closed_per_axis(
    requests: list[dict[str, str]],
    expected_cpu: float | None,
    expected_memory: float | None,
) -> None:
    _, kubernetes_module = load_evidence_modules()
    summary = kubernetes_module.pod_summary(
        {
            "metadata": {"name": "checkout-0", "namespace": "shop"},
            "spec": {
                "containers": [
                    {"name": f"container-{index}", "resources": {"requests": request}}
                    for index, request in enumerate(requests)
                ]
            },
            "status": {"containerStatuses": []},
        }
    )

    assert summary["cpu_request_mcores"] == expected_cpu
    assert summary["mem_request_mib"] == expected_memory


def test_pod_without_regular_containers_has_no_request_denominator() -> None:
    _, kubernetes_module = load_evidence_modules()
    summary = kubernetes_module.pod_summary(
        {
            "metadata": {"name": "checkout-0", "namespace": "shop"},
            "spec": {
                "containers": [],
                "initContainers": [
                    {
                        "name": "init",
                        "resources": {"requests": {"cpu": "1", "memory": "1Gi"}},
                    }
                ],
            },
            "status": {"containerStatuses": []},
        }
    )

    assert summary["cpu_request_mcores"] is None
    assert summary["mem_request_mib"] is None


def test_relationship_summaries_preserve_authoritative_graph_evidence() -> None:
    _, kubernetes_module = load_evidence_modules()
    labels = {f"example.com/key-{index:02d}": str(index) for index in range(13)}
    labels["kubernetes.io/service-name"] = "checkout-api"

    workload = kubernetes_module.workload_summary(
        "ReplicaSet",
        {
            "metadata": {
                "name": "checkout-api-abc",
                "namespace": "target",
                "ownerReferences": [
                    {
                        "kind": "Deployment",
                        "name": "checkout-api",
                        "uid": "deployment-uid",
                    }
                ],
            },
            "spec": {"selector": {"matchLabels": {"app": "checkout-api"}}},
        },
    )
    endpoint_slice = kubernetes_module.endpoint_slice_summary(
        {
            "metadata": {
                "name": "checkout-api-abc",
                "namespace": "target",
                "labels": labels,
            },
            "addressType": "IPv4",
            "endpoints": [],
            "ports": [],
        }
    )

    assert workload["owner_kind"] == "Deployment"
    assert workload["owner_name"] == "checkout-api"
    assert workload["owner_uid"] == "deployment-uid"
    assert workload["owner_references_complete"] is True
    assert endpoint_slice["service_name"] == "checkout-api"
    assert endpoint_slice["labels_complete"] is False

    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {"workloads": [workload], "endpoints": [endpoint_slice]},
        cluster_id="cluster-a",
        agent_id="agent-a",
    )
    by_type = {resource["resource_type"]: resource for resource in snapshot["resources"]}
    assert by_type["workload"]["summary"]["owner_name"] == "checkout-api"
    assert by_type["endpoint"]["summary"]["service_name"] == "checkout-api"


@pytest.mark.parametrize(
    ("node", "expected"),
    [
        ({"spec": {"providerID": "aws:///ap-northeast-2a/i-123"}}, "eks"),
        ({"spec": {"providerID": "azure:///subscriptions/sub/vm"}}, "aks"),
        ({"spec": {"providerID": "gce://project/zone/node"}}, "gke"),
        ({"metadata": {"labels": {"eks.amazonaws.com/nodegroup": "workers"}}}, "eks"),
        ({"metadata": {"labels": {"topology.kubernetes.io/region": "test"}}}, None),
    ],
)
def test_detect_kubernetes_provider_uses_provider_id_then_vendor_labels(
    node: dict[str, object],
    expected: str | None,
) -> None:
    assert detect_kubernetes_provider([node]) == expected


def test_kubernetes_snapshot_provider_collects_namespace_state(monkeypatch) -> None:
    module, kubernetes_module = load_evidence_modules()
    requests: list[httpx.Request] = []

    def handle_request(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        payload_by_path: dict[str, dict[str, object]] = {
            "/api/v1/namespaces/target/pods": {
                "items": [
                    {
                        "metadata": {
                            "uid": "pod-1",
                            "name": "checkout-api-7f5c",
                            "namespace": "target",
                            "labels": {"app": "checkout-api"},
                            "ownerReferences": [
                                {"kind": "ReplicaSet", "name": "checkout-api-7f5c"}
                            ],
                        },
                        "spec": {"nodeName": "node-a"},
                        "status": {
                            "phase": "Running",
                            "podIP": "10.0.0.12",
                            "hostIP": "10.0.0.1",
                            "containerStatuses": [
                                {
                                    "name": "checkout-api",
                                    "containerID": "containerd://container-123",
                                    "image": "checkout:v1",
                                    "imageID": "docker-pullable://checkout@sha256:abc123",
                                    "ready": True,
                                    "restartCount": 2,
                                    "state": {"running": {"startedAt": "2026-07-05T00:00:00Z"}},
                                    "lastState": {
                                        "terminated": {
                                            "reason": "OOMKilled",
                                            "message": "Container used too much memory",
                                            "exitCode": 137,
                                            "startedAt": "2026-07-04T23:55:00Z",
                                            "finishedAt": "2026-07-04T23:59:00Z",
                                        }
                                    },
                                }
                            ],
                        },
                    }
                ]
            },
            "/api/v1/namespaces/target/events": {
                "items": [
                    {
                        "metadata": {"uid": "event-1", "namespace": "target"},
                        "type": "Warning",
                        "reason": "BackOff",
                        "message": "Back-off restarting failed container",
                        "count": 3,
                        "eventTime": "2026-07-05T00:01:00Z",
                        "reportingComponent": "kubelet",
                        "involvedObject": {
                            "kind": "Pod",
                            "name": "checkout-api-7f5c",
                            "uid": "pod-1",
                        },
                    },
                    {
                        "metadata": {"uid": "event-2", "namespace": "target"},
                        "type": "Warning",
                        "reason": "FailedScheduling",
                        "message": (
                            "0/2 nodes are available: 1 Insufficient cpu, "
                            "1 node(s) didn't match Pod's node affinity/selector."
                        ),
                        "count": 2,
                        "eventTime": "2026-07-05T00:02:00Z",
                        "reportingComponent": "default-scheduler",
                        "involvedObject": {
                            "kind": "Pod",
                            "name": "checkout-api-7f5c",
                            "uid": "pod-1",
                        },
                    },
                    {
                        "metadata": {"uid": "event-3", "namespace": "target"},
                        "type": "Warning",
                        "reason": "Unhealthy",
                        "message": "Readiness probe failed: connection refused",
                        "count": 4,
                        "eventTime": "2026-07-05T00:03:00Z",
                        "reportingComponent": "kubelet",
                        "involvedObject": {
                            "kind": "Pod",
                            "name": "checkout-api-7f5c",
                            "uid": "pod-1",
                        },
                    },
                    {
                        "metadata": {"uid": "event-4", "namespace": "target"},
                        "type": "Normal",
                        "reason": "Pulled",
                        "message": "Successfully pulled image",
                        "count": 1,
                        "eventTime": "2026-07-05T00:04:00Z",
                        "reportingComponent": "kubelet",
                        "involvedObject": {
                            "kind": "Pod",
                            "name": "checkout-api-7f5c",
                            "uid": "pod-1",
                        },
                    },
                ]
            },
            "/api/v1/nodes": {
                "items": [
                    {
                        "metadata": {"name": "node-a"},
                        "spec": {
                            "taints": [],
                            "providerID": "aws:///ap-northeast-2a/i-123",
                        },
                        "status": {
                            "conditions": [{"type": "Ready", "status": "True"}],
                            "capacity": {"cpu": "4"},
                            "allocatable": {"cpu": "3900m", "memory": "8Gi"},
                            "nodeInfo": {"kubeletVersion": "v1.30.0"},
                        },
                    }
                ]
            },
            "/apis/metrics.k8s.io/v1beta1/namespaces/target/pods": {
                "items": [
                    {
                        "metadata": {"name": "checkout-api-7f5c", "namespace": "target"},
                        "timestamp": "2026-07-16T02:00:00Z",
                        "window": "30s",
                        "containers": [
                            {"name": "checkout-api", "usage": {"cpu": "125m", "memory": "64Mi"}}
                        ],
                    }
                ]
            },
            "/apis/metrics.k8s.io/v1beta1/nodes": {
                "items": [
                    {
                        "metadata": {"name": "node-a"},
                        "timestamp": "2026-07-16T02:00:00Z",
                        "window": "30s",
                        "usage": {"cpu": "390m", "memory": "1Gi"},
                    }
                ]
            },
            "/apis/apps/v1/namespaces/target/deployments": {
                "items": [
                    {
                        "metadata": {
                            "name": "checkout-api",
                            "namespace": "target",
                            "generation": 4,
                        },
                        "spec": {"replicas": 2, "selector": {"matchLabels": {"app": "checkout"}}},
                        "status": {
                            "observedGeneration": 4,
                            "readyReplicas": 1,
                            "availableReplicas": 1,
                            "updatedReplicas": 2,
                            "unavailableReplicas": 1,
                        },
                    }
                ]
            },
            "/apis/apps/v1/namespaces/target/statefulsets": {"items": []},
            "/apis/apps/v1/namespaces/target/daemonsets": {"items": []},
            "/apis/apps/v1/namespaces/target/replicasets": {"items": []},
            "/apis/apps/v1/namespaces/target/controllerrevisions": {"items": []},
            "/api/v1/namespaces/target/services": {
                "items": [
                    {
                        "metadata": {"name": "checkout-api", "namespace": "target"},
                        "spec": {
                            "type": "LoadBalancer",
                            "clusterIP": "10.96.10.20",
                            "ports": [{"port": 80, "targetPort": "http"}],
                            "selector": {"app": "checkout"},
                        },
                        "status": {
                            "loadBalancer": {
                                "ingress": [{"hostname": "checkout.example.elb.amazonaws.com"}]
                            }
                        },
                    }
                ]
            },
            "/apis/discovery.k8s.io/v1/namespaces/target/endpointslices": {
                "items": [
                    {
                        "metadata": {"name": "checkout-api-abc", "namespace": "target"},
                        "addressType": "IPv4",
                        "endpoints": [{"addresses": ["10.0.0.12"]}],
                        "ports": [{"port": 8080}],
                    }
                ]
            },
        }
        payload = payload_by_path.get(request.url.path)
        if payload is None:
            return httpx.Response(status_code=404, json={"items": []})
        return httpx.Response(status_code=200, json=payload)

    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")

    transport = getattr(httpx, "Mo" + "ckTransport")(handle_request)
    provider = module.KubernetesSnapshotProvider(cluster_id="cluster-1", transport=transport)
    collector = module.EvidenceCollector([provider])
    collector.register_query(
        module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "kubernetes",
                "name": "target_namespace_snapshot",
                "description": "Target namespace snapshot.",
                "query": "target",
            }
        )
    )

    kubernetes = asyncio.run(collector.collect("kubernetes"))["kubernetes"]
    validated = AgentEvidenceRequest.model_validate(
        {
            "cluster_id": "cluster-1",
            "kubernetes": kubernetes,
            "metrics": {},
            "logs": [],
            "traces": {},
        }
    )

    assert [request.headers["authorization"] for request in requests] == ["Bearer token-1"] * 16
    assert validated.kubernetes["cluster"]["cluster_id"] == "cluster-1"
    assert validated.kubernetes["cluster"]["namespace"] == "target"
    assert validated.kubernetes["detected_provider"] == "eks"
    assert validated.kubernetes["pods"][0]["name"] == "checkout-api-7f5c"
    assert (
        validated.kubernetes["pods"][0]["containers"][0]["image_id"]
        == "docker-pullable://checkout@sha256:abc123"
    )
    assert (
        validated.kubernetes["pods"][0]["containers"][0]["container_id"]
        == "containerd://container-123"
    )
    assert validated.kubernetes["pods"][0]["containers"][0]["last_state_message"] == (
        "Container used too much memory"
    )
    assert (
        validated.kubernetes["pods"][0]["containers"][0]["last_started_at"]
        == "2026-07-04T23:55:00Z"
    )
    assert (
        validated.kubernetes["pods"][0]["containers"][0]["last_finished_at"]
        == "2026-07-04T23:59:00Z"
    )
    assert validated.kubernetes["pods"][0]["restart_total"] == 2
    assert validated.kubernetes["pods"][0]["cpu_mcores"] == 125.0
    assert validated.kubernetes["pods"][0]["mem_mib"] == 64.0
    assert validated.kubernetes["pods"][0]["metrics_observed_at"] == "2026-07-16T02:00:00Z"
    assert validated.kubernetes["pods"][0]["metrics_window"] == "30s"
    assert validated.kubernetes["pods"][0]["container_metrics"] == [
        {"name": "checkout-api", "cpu_mcores": 125.0, "mem_mib": 64.0}
    ]
    assert validated.kubernetes["pods"][0]["container_metrics_complete"] is True
    assert validated.kubernetes["events"][0]["reason"] == "BackOff"
    assert validated.kubernetes["events"][0]["reason_summary"] == {
        "category": "container_restart",
        "signal": "CrashLoopBackOff",
        "symptom": "CrashLoopBackOff",
    }
    assert validated.kubernetes["events"][1]["reason_summary"] == {
        "category": "scheduling",
        "signal": "FailedScheduling",
        "symptom": "FailedScheduling",
        "scheduling_causes": ["insufficient_cpu", "node_selector_mismatch"],
    }
    assert validated.kubernetes["events"][2]["reason_summary"] == {
        "category": "probe",
        "signal": "ReadinessProbeFailed",
        "symptom": "ProbeFailure",
    }
    assert "reason_summary" not in validated.kubernetes["events"][3]
    assert validated.kubernetes["nodes"][0]["ready"] is True
    assert validated.kubernetes["nodes"][0]["provider_id"] == "aws:///ap-northeast-2a/i-123"
    assert validated.kubernetes["nodes"][0]["cpu_mcores"] == 390.0
    assert validated.kubernetes["nodes"][0]["metrics_observed_at"] == "2026-07-16T02:00:00Z"
    assert validated.kubernetes["nodes"][0]["metrics_window"] == "30s"
    assert validated.kubernetes["nodes"][0]["cpu_ratio"] == 0.1
    assert validated.kubernetes["nodes"][0]["mem_ratio"] == 0.125
    assert validated.kubernetes["workloads"][0]["kind"] == "Deployment"
    assert validated.kubernetes["workloads"][0]["ready_replicas"] == 1
    assert validated.kubernetes["services"][0]["name"] == "checkout-api"
    assert validated.kubernetes["services"][0]["external_hosts"] == [
        "checkout.example.elb.amazonaws.com"
    ]
    assert (
        validated.kubernetes["services"][0]["external_url"]
        == "http://checkout.example.elb.amazonaws.com"
    )
    assert validated.kubernetes["endpoints"][0]["endpoint_count"] == 1
    assert validated.kubernetes["provider_status"]["target_namespace_snapshot"]["counts"] == {
        "pods": 1,
        "events": 4,
        "nodes": 1,
        "pod_metrics": 1,
        "node_metrics": 1,
        "workloads": 1,
        "workload_revisions": 0,
        "services": 1,
        "endpoints": 1,
        "ingresses": 0,
        "resourcequotas": 0,
    }


def test_cluster_access_snapshot_collects_one_exact_reverse_index(monkeypatch) -> None:
    module, kubernetes_module = load_evidence_modules()

    def handle_request(request: httpx.Request) -> httpx.Response:
        rows: dict[str, list[dict[str, object]]] = {
            "/apis/rbac.authorization.k8s.io/v1/roles": [
                {
                    "metadata": {"name": "reader", "namespace": "shop"},
                    "rules": [{"verbs": ["get"], "apiGroups": [""], "resources": ["pods"]}],
                }
            ],
            "/api/v1/serviceaccounts": [
                {
                    "metadata": {"name": "checkout", "namespace": "shop"},
                }
            ],
            "/api/v1/pods": [
                {
                    "metadata": {
                        "uid": "pod-checkout-0",
                        "name": "checkout-0",
                        "namespace": "shop",
                    },
                    "spec": {"serviceAccountName": "checkout"},
                }
            ],
        }
        return httpx.Response(200, json={"metadata": {}, "items": rows.get(request.url.path, [])})

    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    provider = module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=getattr(httpx, "Mo" + "ckTransport")(handle_request),
    )
    collector = module.EvidenceCollector([provider])
    collector.register_query(
        module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "kubernetes",
                "name": "cluster_access_snapshot",
                "description": "Cluster RBAC evidence.",
                "query": "*",
                "collection_scope": "cluster_access",
            }
        )
    )

    access = asyncio.run(collector.collect("kubernetes"))["kubernetes"]["resource_access"]

    assert access["completeness"] == "exact"
    assert access["roles"][0]["name"] == "reader"
    assert access["service_accounts"] == [{"namespace": "shop", "name": "checkout"}]
    assert access["pod_subjects"] == [
        {
            "uid": "pod-checkout-0",
            "namespace": "shop",
            "name": "checkout-0",
            "service_account_name": "checkout",
        }
    ]


def test_cluster_access_snapshot_fails_closed_when_one_collection_is_denied(monkeypatch) -> None:
    module, kubernetes_module = load_evidence_modules()

    def handle_request(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/rolebindings"):
            return httpx.Response(403, json={})
        return httpx.Response(200, json={"metadata": {}, "items": []})

    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    provider = module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=getattr(httpx, "Mo" + "ckTransport")(handle_request),
    )
    collector = module.EvidenceCollector([provider])
    collector.register_query(
        module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "kubernetes",
                "name": "cluster_access_snapshot",
                "description": "Cluster RBAC evidence.",
                "query": "*",
                "collection_scope": "cluster_access",
            }
        )
    )

    access = asyncio.run(collector.collect("kubernetes"))["kubernetes"]["resource_access"]

    assert access["completeness"] == "unavailable"
    assert access["reason_codes"] == ["role_bindings:rbac_denied"]


def test_resource_quota_preserves_exact_identity_and_quantities_in_inventory() -> None:
    _, kubernetes_module = load_evidence_modules()
    summary = kubernetes_module.resource_quota_summary(
        {
            "metadata": {
                "uid": "quota-uid",
                "resourceVersion": "42",
                "name": "compute",
                "namespace": "shop",
            },
            "status": {
                "hard": {"pods": "20", "requests.cpu": "4"},
                "used": {"pods": "7", "requests.cpu": "1250m"},
            },
        }
    )

    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {"resourcequotas": [summary]},
        cluster_id="cluster-1",
        agent_id="agent-1",
    )
    resource = snapshot["resources"][0]

    assert resource["resource_type"] == "resourcequota"
    assert resource["uid"] == "quota-uid"
    assert resource["resource_version"] == "42"
    assert resource["summary"] == {
        "hard": {"pods": "20", "requests.cpu": "4"},
        "used": {"pods": "7", "requests.cpu": "1250m"},
    }


def test_ingress_preserves_routes_without_tls_secret_names_and_reports_address_state() -> None:
    _, kubernetes_module = load_evidence_modules()
    summary = kubernetes_module.ingress_summary(
        {
            "metadata": {
                "uid": "ingress-uid",
                "resourceVersion": "7",
                "name": "opsia-console",
                "namespace": "sandbox",
            },
            "spec": {
                "ingressClassName": "nginx",
                "tls": [{"hosts": ["opsia.local"], "secretName": "must-not-leak"}],
                "rules": [
                    {
                        "host": "opsia.local",
                        "http": {
                            "paths": [
                                {
                                    "path": "/",
                                    "backend": {"service": {"name": "opsia-web"}},
                                }
                            ]
                        },
                    }
                ],
            },
            "status": {"loadBalancer": {"ingress": [{"ip": "127.0.0.1"}]}},
        }
    )

    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {"ingresses": [summary]},
        cluster_id="cluster-1",
        agent_id="agent-1",
    )
    resource = snapshot["resources"][0]

    assert resource["resource_type"] == "ingress"
    assert resource["kind"] == "Ingress"
    assert resource["status"] == "address-assigned"
    assert resource["health"] == "healthy"
    assert resource["summary"]["hosts"] == ["opsia.local"]
    assert resource["summary"]["backend_service_names"] == ["opsia-web"]
    assert "must-not-leak" not in str(resource)

    pending = kubernetes_evidence_to_inventory_snapshot(
        {"ingresses": [{**summary, "external_hosts": [], "address_count": 0}]},
        cluster_id="cluster-1",
        agent_id="agent-1",
    )["resources"][0]
    assert pending["status"] == "pending"
    assert pending["health"] == "degraded"


def test_kubernetes_snapshot_provider_deduplicates_cluster_scoped_nodes(monkeypatch) -> None:
    module, kubernetes_module = load_evidence_modules()

    def handle_request(request: httpx.Request) -> httpx.Response:
        namespace = "sandbox" if "/sandbox/" in request.url.path else "target"
        if request.url.path == "/api/v1/nodes":
            return httpx.Response(
                status_code=200,
                json={
                    "items": [
                        {
                            "metadata": {"uid": "node-uid-a", "name": "node-a"},
                            "status": {"conditions": [{"type": "Ready", "status": "True"}]},
                        }
                    ]
                },
            )
        if request.url.path.endswith("/pods"):
            return httpx.Response(
                status_code=200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "uid": f"pod-{namespace}",
                                "name": f"pod-{namespace}",
                                "namespace": namespace,
                            },
                            "spec": {"nodeName": "node-a"},
                            "status": {"phase": "Running", "containerStatuses": []},
                        }
                    ]
                },
            )
        return httpx.Response(status_code=200, json={"items": []})

    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")

    provider = module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=getattr(httpx, "Mo" + "ckTransport")(handle_request),
    )
    collector = module.EvidenceCollector([provider])
    for namespace in ("target", "sandbox"):
        collector.register_query(
            module.TelemetryQueryDefinition.from_mapping(
                {
                    "source": "kubernetes",
                    "name": f"{namespace}_snapshot",
                    "description": f"{namespace} namespace snapshot.",
                    "query": namespace,
                }
            )
        )

    kubernetes = asyncio.run(collector.collect("kubernetes"))["kubernetes"]

    assert [node["name"] for node in kubernetes["nodes"]] == ["node-a"]
    assert sorted(pod["namespace"] for pod in kubernetes["pods"]) == ["sandbox", "target"]


def test_kubernetes_snapshot_provider_scopes_one_rca_test_run(monkeypatch) -> None:
    module, kubernetes_module = load_evidence_modules()
    requests: list[httpx.Request] = []
    selector_key = "kubeheal.io/rca-test-run"
    run_labels = {**{f"label-{index}": "value" for index in range(13)}, selector_key: "run-a"}

    def resource(name: str, labels: dict[str, str]) -> dict[str, object]:
        return {
            "metadata": {
                "uid": f"uid-{name}",
                "name": name,
                "namespace": "sandbox",
                "labels": labels,
            },
            "spec": {"replicas": 1, "selector": {"matchLabels": {"app": name}}},
            "status": {"phase": "Pending", "containerStatuses": []},
        }

    resources = {
        "pod-a": resource("pod-a", run_labels),
        "pod-b": resource("pod-b", {selector_key: "run-b"}),
        "deployment-a": resource("deployment-a", run_labels),
        "deployment-b": resource("deployment-b", {selector_key: "run-b"}),
        "replicaset-a": resource("replicaset-a", run_labels),
        "replicaset-b": resource("replicaset-b", {selector_key: "run-b"}),
        "service-a": resource("service-a", run_labels),
        "service-b": resource("service-b", {selector_key: "run-b"}),
    }

    def handle_request(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        path = request.url.path
        if path.endswith("/pods") and "metrics.k8s.io" not in path:
            return httpx.Response(200, json={"items": [resources["pod-a"], resources["pod-b"]]})
        if path.endswith("/deployments"):
            return httpx.Response(
                200,
                json={"items": [resources["deployment-a"], resources["deployment-b"]]},
            )
        if path.endswith("/replicasets"):
            return httpx.Response(
                200,
                json={"items": [resources["replicaset-a"], resources["replicaset-b"]]},
            )
        if path.endswith("/services"):
            return httpx.Response(
                200,
                json={"items": [resources["service-a"], resources["service-b"]]},
            )
        if path.endswith("/events"):
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {"name": "event-a", "namespace": "sandbox"},
                            "reason": "Failed",
                            "message": "manifest unknown",
                            "involvedObject": {"name": "pod-a", "uid": "uid-pod-a"},
                        },
                        {
                            "metadata": {"name": "event-b", "namespace": "sandbox"},
                            "reason": "Failed",
                            "message": "other run",
                            "involvedObject": {"name": "pod-b", "uid": "uid-pod-b"},
                        },
                    ]
                },
            )
        if path.endswith("/endpointslices"):
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "name": "slice-random-a",
                                "namespace": "sandbox",
                                "labels": {"kubernetes.io/service-name": "service-a"},
                            },
                            "endpoints": [],
                        },
                        {
                            "metadata": {
                                "name": "slice-random-b",
                                "namespace": "sandbox",
                                "labels": {"kubernetes.io/service-name": "service-b"},
                            },
                            "endpoints": [],
                        },
                    ]
                },
            )
        return httpx.Response(200, json={"items": []})

    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    provider = module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=getattr(httpx, "Mo" + "ckTransport")(handle_request),
    )
    collector = module.EvidenceCollector([provider])
    collector.register_query(
        module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "kubernetes",
                "name": "rca_run_a",
                "description": "RCA run A snapshot.",
                "query": "sandbox",
                "label_selector": f"{selector_key}=run-a",
            }
        )
    )

    kubernetes = asyncio.run(collector.collect("kubernetes"))["kubernetes"]

    selector_paths = {
        request.url.path for request in requests if request.url.params.get("labelSelector")
    }
    assert selector_paths == {
        "/api/v1/namespaces/sandbox/pods",
        "/apis/apps/v1/namespaces/sandbox/deployments",
        "/apis/apps/v1/namespaces/sandbox/statefulsets",
        "/apis/apps/v1/namespaces/sandbox/daemonsets",
        "/apis/apps/v1/namespaces/sandbox/replicasets",
        "/apis/apps/v1/namespaces/sandbox/controllerrevisions",
        "/apis/batch/v1/namespaces/sandbox/jobs",
        "/apis/batch/v1/namespaces/sandbox/cronjobs",
        "/apis/networking.k8s.io/v1/namespaces/sandbox/ingresses",
        "/api/v1/namespaces/sandbox/services",
    }
    assert [item["name"] for item in kubernetes["pods"]] == ["pod-a"]
    assert kubernetes["pods"][0]["labels"][selector_key] == "run-a"
    assert len(kubernetes["pods"][0]["labels"]) == 12
    assert [item["name"] for item in kubernetes["workloads"]] == [
        "deployment-a",
        "replicaset-a",
    ]
    assert [item["name"] for item in kubernetes["services"]] == ["service-a"]
    assert [item["name"] for item in kubernetes["events"]] == ["event-a"]
    assert [item["name"] for item in kubernetes["endpoints"]] == ["slice-random-a"]


def test_regular_kubernetes_snapshot_excludes_rca_test_resources() -> None:
    _module, kubernetes_module = load_evidence_modules()
    provider = kubernetes_module.KubernetesSnapshotProvider(cluster_id="cluster-1")
    test_labels = {"kubeheal.io/rca-test": "true", "kubeheal.io/rca-test-run": "run-a"}
    normal_pod = {
        "metadata": {"uid": "normal", "name": "normal-pod", "namespace": "sandbox"},
        "status": {"containerStatuses": []},
    }
    test_pod = {
        "metadata": {
            "uid": "test",
            "name": "rca-test-pod",
            "namespace": "sandbox",
            "labels": test_labels,
        },
        "status": {"containerStatuses": []},
    }
    snapshot = provider.normalize_payload(
        {
            "namespace": "sandbox",
            "pods": {"items": [normal_pod, test_pod]},
            "events": {
                "items": [
                    {
                        "metadata": {"name": "normal-event", "namespace": "sandbox"},
                        "involvedObject": {"name": "normal-pod", "uid": "normal"},
                    },
                    {
                        "metadata": {"name": "test-event", "namespace": "sandbox"},
                        "involvedObject": {"name": "rca-test-pod", "uid": "test"},
                    },
                ]
            },
            "deployments": {"items": []},
            "statefulsets": {"items": []},
            "daemonsets": {"items": []},
            "replicasets": {"items": []},
            "services": {"items": []},
            "endpointslices": {
                "items": [
                    {"metadata": {"name": "normal-service-abc", "namespace": "sandbox"}},
                    {"metadata": {"name": "rca-test-service-abc", "namespace": "sandbox"}},
                ]
            },
        },
        kubernetes_module.KubernetesSnapshotQuery(
            "regular_snapshot",
            "Regular snapshot.",
            "sandbox",
        ),
    )

    assert [item["name"] for item in snapshot["pods"]] == ["normal-pod"]
    assert [item["name"] for item in snapshot["events"]] == ["normal-event"]
    assert [item["name"] for item in snapshot["endpoints"]] == ["normal-service-abc"]


def test_regular_kubernetes_snapshot_separates_scaled_down_replicaset_history() -> None:
    _module, kubernetes_module = load_evidence_modules()
    provider = kubernetes_module.KubernetesSnapshotProvider(cluster_id="cluster-1")

    def replicaset(name: str, desired: int, current: int) -> dict[str, object]:
        return {
            "metadata": {
                "name": name,
                "namespace": "production",
                "uid": f"uid-{name}",
                "resourceVersion": f"rv-{name}",
                "annotations": {"deployment.kubernetes.io/revision": name.rsplit("-", 1)[-1]},
                "ownerReferences": [
                    {
                        "kind": "Deployment",
                        "name": "orders-api",
                        "uid": "deployment-orders-api",
                    }
                ],
            },
            "spec": {
                "replicas": desired,
                "template": {"spec": {"containers": [{"name": "api", "image": name}]}},
            },
            "status": {"replicas": current, "readyReplicas": current},
        }

    snapshot = provider.normalize_payload(
        {
            "namespace": "production",
            "pods": {"items": []},
            "events": {"items": []},
            "deployments": {"items": []},
            "statefulsets": {"items": []},
            "daemonsets": {"items": []},
            "replicasets": {
                "items": [
                    replicaset("orders-api-old", 0, 0),
                    replicaset("orders-api-current", 2, 2),
                    replicaset("orders-api-terminating", 0, 1),
                ]
            },
            "services": {"items": []},
            "endpointslices": {"items": []},
        },
        kubernetes_module.KubernetesSnapshotQuery(
            "regular_snapshot",
            "Regular snapshot.",
            "production",
        ),
    )

    assert [item["name"] for item in snapshot["workloads"]] == [
        "orders-api-current",
        "orders-api-terminating",
    ]
    assert [item["name"] for item in snapshot["workload_revisions"]] == [
        "orders-api-old",
        "orders-api-current",
        "orders-api-terminating",
    ]


def test_regular_kubernetes_snapshot_excludes_events_for_absent_pods_and_scaled_down_replicasets() -> (
    None
):
    _module, kubernetes_module = load_evidence_modules()
    provider = kubernetes_module.KubernetesSnapshotProvider(cluster_id="cluster-1")

    snapshot = provider.normalize_payload(
        {
            "namespace": "production",
            "pods": {
                "items": [
                    {
                        "metadata": {
                            "uid": "uid-current-pod",
                            "name": "orders-api-current-1",
                            "namespace": "production",
                        },
                        "status": {"containerStatuses": []},
                    }
                ]
            },
            "events": {
                "items": [
                    {
                        "metadata": {"name": "current", "namespace": "production"},
                        "type": "Warning",
                        "reason": "Unhealthy",
                        "message": "Readiness probe failed: connection refused",
                        "involvedObject": {
                            "kind": "Pod",
                            "name": "orders-api-current-1",
                            "uid": "uid-current-pod",
                        },
                    },
                    {
                        "metadata": {"name": "deleted-pod", "namespace": "production"},
                        "type": "Warning",
                        "reason": "Unhealthy",
                        "message": "Readiness probe failed: connection refused",
                        "involvedObject": {
                            "kind": "Pod",
                            "name": "orders-api-old-1",
                            "uid": "uid-old-pod",
                        },
                    },
                    {
                        "metadata": {"name": "scaled-down-rs", "namespace": "production"},
                        "type": "Warning",
                        "reason": "FailedCreate",
                        "message": "old rollout failed",
                        "involvedObject": {
                            "kind": "ReplicaSet",
                            "name": "orders-api-old",
                            "uid": "uid-old-rs",
                        },
                    },
                ]
            },
            "deployments": {"items": []},
            "statefulsets": {"items": []},
            "daemonsets": {"items": []},
            "replicasets": {
                "items": [
                    {
                        "metadata": {
                            "uid": "uid-old-rs",
                            "name": "orders-api-old",
                            "namespace": "production",
                        },
                        "spec": {"replicas": 0},
                        "status": {"replicas": 0, "readyReplicas": 0},
                    }
                ]
            },
            "services": {"items": []},
            "endpointslices": {"items": []},
        },
        kubernetes_module.KubernetesSnapshotQuery(
            "regular_snapshot",
            "Regular snapshot.",
            "production",
        ),
    )

    assert [item["name"] for item in snapshot["events"]] == ["current"]


def test_cluster_wide_event_capture_pages_all_namespaces_without_changing_scoped_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    requests: list[httpx.Request] = []

    def event(uid: str, name: str, *, count: int = 1) -> dict[str, object]:
        return {
            "metadata": {
                "uid": uid,
                "name": name,
                "namespace": "payments",
                "resourceVersion": "7",
            },
            "type": "Warning",
            "count": count,
            "lastTimestamp": "2026-07-16T00:01:00Z",
            "message": "must never enter the timeline fact contract",
        }

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.params.get("continue"):
            return httpx.Response(
                200,
                json={"metadata": {"resourceVersion": "rv-1"}, "items": [event("evt-2", "b")]},
            )
        return httpx.Response(
            200,
            json={
                "metadata": {"resourceVersion": "rv-1", "continue": "page-2"},
                "items": [event("evt-1", "a")],
            },
        )

    provider = kubernetes_module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(handler),
    )

    collector = module.EvidenceCollector([provider])
    collector.register_query(
        module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "kubernetes",
                "name": "cluster_wide_event_capture",
                "description": "Capture every Kubernetes Event across all namespaces.",
                "query": "*",
                "collection_scope": "cluster_events",
            }
        )
    )
    response = asyncio.run(collector.collect("kubernetes"))["kubernetes"]
    capture = response["event_capture"]
    assert [request.url.path for request in requests] == ["/api/v1/events", "/api/v1/events"]
    assert requests[0].url.params["limit"] == str(
        kubernetes_module.KUBERNETES_EVENT_CAPTURE_PAGE_SIZE
    )
    assert requests[1].url.params["continue"] == "page-2"
    assert capture["complete"] is True
    assert capture["truncated"] is False
    assert capture["reason"] == "complete"
    assert capture["coverage"]["scope"] == "all_namespaces"
    assert capture["coverage"]["page_count"] == 2
    assert capture["coverage"]["event_count"] == 2
    assert capture["freshness"]["max_age_seconds"] > 0
    assert "message" not in capture["events"][0]

    assert response["events"] == []
    assert response["event_capture"] == capture
    inventory_snapshot = kubernetes_evidence_to_inventory_snapshot(
        response,
        cluster_id="cluster-1",
        agent_id="agent-1",
    )
    assert inventory_snapshot["summary"]["kubernetes_event_capture"]["complete"] is True
    assert [fact["uid"] for fact in inventory_snapshot["summary"]["kubernetes_event_facts"]] == [
        "evt-1",
        "evt-2",
    ]
    assert not [
        resource
        for resource in inventory_snapshot["resources"]
        if resource["resource_type"] == "event"
    ]


def test_cluster_api_discovery_collects_bounded_group_versions_and_crd_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    requests: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        responses = {
            "/api": {"versions": ["v1"]},
            "/api/v1": {
                "groupVersion": "v1",
                "resources": [
                    {
                        "name": "pods",
                        "namespaced": True,
                        "kind": "Pod",
                        "verbs": ["get", "list", "watch"],
                    }
                ],
            },
            "/apis": {
                "groups": [
                    {
                        "name": "apps",
                        "versions": [{"groupVersion": "apps/v1", "version": "v1"}],
                    },
                    {
                        "name": "stable.example.com",
                        "versions": [
                            {
                                "groupVersion": "stable.example.com/v1",
                                "version": "v1",
                            }
                        ],
                    },
                ]
            },
            "/apis/apps/v1": {
                "groupVersion": "apps/v1",
                "resources": [
                    {
                        "name": "deployments",
                        "namespaced": True,
                        "kind": "Deployment",
                        "verbs": ["get", "list", "patch"],
                    }
                ],
            },
            "/apis/stable.example.com/v1": {
                "groupVersion": "stable.example.com/v1",
                "resources": [
                    {
                        "name": "crontabs",
                        "singularName": "crontab",
                        "namespaced": True,
                        "kind": "CronTab",
                        "verbs": ["delete", "get", "list", "patch"],
                    }
                ],
            },
            "/apis/apiextensions.k8s.io/v1/customresourcedefinitions": {
                "items": [
                    {
                        "spec": {
                            "group": "stable.example.com",
                            "names": {"kind": "CronTab", "plural": "crontabs"},
                            "scope": "Namespaced",
                            "versions": [{"name": "v1", "served": True}],
                        }
                    }
                ]
            },
        }
        payload = responses.get(request.url.path)
        return httpx.Response(200, json=payload) if payload is not None else httpx.Response(404)

    provider = kubernetes_module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(handler),
    )
    collector = module.EvidenceCollector([provider])
    collector.register_query(
        module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "kubernetes",
                "name": "cluster_api_discovery",
                "description": "Discover authorized Kubernetes API resources.",
                "query": "*",
                "collection_scope": "cluster_discovery",
            }
        )
    )

    response = asyncio.run(collector.collect("kubernetes"))["kubernetes"]

    assert requests == [
        "/api",
        "/api/v1",
        "/apis",
        "/apis/apps/v1",
        "/apis/stable.example.com/v1",
        "/apis/apiextensions.k8s.io/v1/customresourcedefinitions",
    ]
    discovery = response["api_resource_discovery"]
    assert discovery["completeness"] == "exact"
    assert discovery["reason_codes"] == []
    assert [
        (item["api_version"], item["name"], item["is_crd"]) for item in discovery["resources"]
    ] == [
        ("v1", "pods", False),
        ("apps/v1", "deployments", False),
        ("stable.example.com/v1", "crontabs", True),
    ]
    inventory_snapshot = kubernetes_evidence_to_inventory_snapshot(
        response,
        cluster_id="cluster-1",
        agent_id="agent-1",
    )
    assert inventory_snapshot["summary"]["api_resource_discovery"] == discovery


def test_cluster_api_discovery_preserves_partial_group_and_crd_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api":
            return httpx.Response(200, json={"versions": ["v1"]})
        if request.url.path == "/api/v1":
            return httpx.Response(
                200,
                json={"groupVersion": "v1", "resources": []},
            )
        if request.url.path == "/apis":
            return httpx.Response(
                200,
                json={
                    "groups": [
                        {
                            "name": "metrics.k8s.io",
                            "versions": [
                                {
                                    "groupVersion": "metrics.k8s.io/v1beta1",
                                    "version": "v1beta1",
                                }
                            ],
                        }
                    ]
                },
            )
        if request.url.path == "/apis/metrics.k8s.io/v1beta1":
            return httpx.Response(503)
        if request.url.path.endswith("/customresourcedefinitions"):
            return httpx.Response(403)
        return httpx.Response(404)

    provider = kubernetes_module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(handler),
    )
    query = kubernetes_module.KubernetesSnapshotQuery(
        "cluster_api_discovery",
        "Discover authorized Kubernetes API resources.",
        "*",
        collection_scope="cluster_discovery",
    )

    async def collect() -> dict[str, object]:
        async with httpx.AsyncClient() as client:
            return provider.normalize_payload(await provider.query(client, query), query)

    discovery = asyncio.run(collect())["api_resource_discovery"]
    assert discovery["completeness"] == "partial"
    assert discovery["reason_codes"] == [
        "crd_discovery_forbidden",
        "group_version_failed:metrics.k8s.io/v1beta1",
    ]


def test_cluster_wide_event_capture_surfaces_rbac_gap_without_raising(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    provider = kubernetes_module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(lambda _request: httpx.Response(403)),
    )
    query = kubernetes_module.KubernetesSnapshotQuery(
        "cluster_wide_event_capture",
        "Capture every Kubernetes Event across all namespaces.",
        "*",
        collection_scope="cluster_events",
    )

    async def collect() -> dict[str, object]:
        async with httpx.AsyncClient() as client:
            return await provider.query(client, query)

    capture = asyncio.run(collect())["event_capture"]
    assert capture["complete"] is False
    assert capture["truncated"] is False
    assert capture["reason"] == "rbac_denied"
    assert capture["coverage"]["gap"] == "rbac_denied"
    assert capture["events"] == []
    inventory_snapshot = kubernetes_evidence_to_inventory_snapshot(
        {"event_capture": capture},
        cluster_id="cluster-1",
        agent_id="agent-1",
    )
    assert inventory_snapshot["summary"]["kubernetes_event_capture"]["coverage"]["gap"] == (
        "rbac_denied"
    )
    assert inventory_snapshot["summary"]["kubernetes_event_facts"] == []


@pytest.mark.parametrize(
    ("failure", "reason"),
    [
        (httpx.ReadTimeout("event collection timed out"), "timeout"),
        (httpx.ConnectError("event collection network unavailable"), "network_error"),
    ],
)
def test_cluster_wide_event_capture_surfaces_transport_gap_without_raising(
    monkeypatch: pytest.MonkeyPatch,
    failure: httpx.RequestError,
    reason: str,
) -> None:
    _module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")

    def fail_request(_request: httpx.Request) -> httpx.Response:
        raise failure

    provider = kubernetes_module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(fail_request),
    )
    query = kubernetes_module.KubernetesSnapshotQuery(
        "cluster_wide_event_capture",
        "Capture every Kubernetes Event across all namespaces.",
        "*",
        collection_scope="cluster_events",
    )

    async def collect() -> dict[str, object]:
        async with httpx.AsyncClient() as client:
            return await provider.query(client, query)

    capture = asyncio.run(collect())["event_capture"]
    assert capture["complete"] is False
    assert capture["truncated"] is False
    assert capture["reason"] == reason
    assert capture["coverage"]["gap"] == reason
    assert capture["events"] == []


def test_cluster_wide_event_capture_fails_closed_when_item_limit_is_reached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(kubernetes_module, "KUBERNETES_EVENT_CAPTURE_MAX_ITEMS", 1)
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    response_body = {
        "metadata": {"resourceVersion": "rv-1"},
        "items": [
            {
                "metadata": {"uid": "evt-1", "name": "a", "namespace": "payments"},
                "lastTimestamp": "2026-07-16T00:01:00Z",
            },
            {
                "metadata": {"uid": "evt-2", "name": "b", "namespace": "payments"},
                "lastTimestamp": "2026-07-16T00:01:00Z",
            },
        ],
    }
    provider = kubernetes_module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json=response_body)),
    )
    query = kubernetes_module.KubernetesSnapshotQuery(
        "cluster_wide_event_capture",
        "Capture every Kubernetes Event across all namespaces.",
        "*",
        collection_scope="cluster_events",
    )

    async def collect() -> dict[str, object]:
        async with httpx.AsyncClient() as client:
            return await provider.query(client, query)

    capture = asyncio.run(collect())["event_capture"]
    assert capture["complete"] is False
    assert capture["truncated"] is True
    assert capture["reason"] == "item_limit_exceeded"
    assert capture["coverage"]["gap"] == "item_limit_exceeded"
    assert capture["events"] == []


def test_cluster_wide_event_capture_fails_closed_when_pagination_never_ends(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(kubernetes_module, "KUBERNETES_EVENT_CAPTURE_MAX_PAGES", 1)
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    provider = kubernetes_module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(
                200,
                json={
                    "metadata": {"resourceVersion": "rv-1", "continue": "still-more"},
                    "items": [
                        {
                            "metadata": {"uid": "evt-1", "name": "a", "namespace": "payments"},
                            "lastTimestamp": "2026-07-16T00:01:00Z",
                        }
                    ],
                },
            )
        ),
    )
    query = kubernetes_module.KubernetesSnapshotQuery(
        "cluster_wide_event_capture",
        "Capture every Kubernetes Event across all namespaces.",
        "*",
        collection_scope="cluster_events",
    )

    async def collect() -> dict[str, object]:
        async with httpx.AsyncClient() as client:
            return await provider.query(client, query)

    capture = asyncio.run(collect())["event_capture"]
    assert capture["complete"] is False
    assert capture["truncated"] is True
    assert capture["reason"] == "page_limit_exceeded"
    assert capture["coverage"]["gap"] == "page_limit_exceeded"
    assert capture["events"] == []


def test_kubernetes_snapshot_provider_limits_large_payload_before_job_result() -> None:
    _module, kubernetes_module = load_evidence_modules()
    provider = kubernetes_module.KubernetesSnapshotProvider(cluster_id="cluster-1")
    results = provider.empty_results()
    results["pods"] = [
        {
            "uid": f"pod-{index}",
            "name": f"pod-{index}",
            "namespace": "target" if index % 2 == 0 else "sandbox",
            "containers": [
                {
                    "name": "app",
                    "container_id": f"containerd://container-{index}",
                    "image": f"example/app:{index}",
                    "image_id": f"docker-pullable://example/app@sha256:{index:064x}",
                    "restart_count": index % 3,
                }
            ],
        }
        for index in range(1500)
    ]

    limited = provider.build_response(results)

    assert len(limited["pods"]) < 1500
    assert {item["namespace"] for item in limited["pods"]} == {"target", "sandbox"}
    assert limited["collection_limits"]["truncated"] is True
    assert limited["collection_limits"]["lists"]["pods"] == {
        "truncated": True,
        "original_count": 1500,
        "returned_count": len(limited["pods"]),
    }
    EvidenceJobResultRequest(
        agent_id="agent-1",
        lease_id="lease-1",
        status="completed",
        result={"kubernetes": limited},
    )


def test_kubernetes_snapshot_provider_limits_by_payload_bytes() -> None:
    _module, kubernetes_module = load_evidence_modules()
    provider = kubernetes_module.KubernetesSnapshotProvider(cluster_id="cluster-1")
    results = provider.empty_results()
    results["pods"] = [
        {
            "uid": f"pod-{index}",
            "name": f"pod-{index}",
            "namespace": "target",
            "message": "x" * 80_000,
            "containers": [],
        }
        for index in range(20)
    ]

    limited = provider.build_response(results)

    assert len(limited["pods"]) < 20
    assert limited["collection_limits"]["lists"]["pods"]["original_count"] == 20
    assert limited["collection_limits"]["lists"]["pods"]["returned_count"] == len(limited["pods"])
    EvidenceJobResultRequest(
        agent_id="agent-1",
        lease_id="lease-1",
        status="completed",
        result={"kubernetes": limited},
    )


def test_kubernetes_snapshot_provider_can_drop_single_oversized_list_item() -> None:
    _module, kubernetes_module = load_evidence_modules()
    provider = kubernetes_module.KubernetesSnapshotProvider(cluster_id="cluster-1")
    results = provider.empty_results()
    results["pods"] = [
        {
            "uid": "pod-1",
            "name": "pod-1",
            "namespace": "target",
            "message": "x" * 1_100_000,
            "containers": [],
        }
    ]

    limited = provider.build_response(results)

    assert limited["pods"] == []
    assert limited["collection_limits"]["lists"]["pods"] == {
        "truncated": True,
        "original_count": 1,
        "returned_count": 0,
    }
    EvidenceJobResultRequest(
        agent_id="agent-1",
        lease_id="lease-1",
        status="completed",
        result={"kubernetes": limited},
    )


def test_dynamic_resource_payload_limit_revokes_exact_coverage() -> None:
    _module, kubernetes_module = load_evidence_modules()
    provider = kubernetes_module.KubernetesSnapshotProvider(cluster_id="cluster-1")
    results = provider.empty_results()
    results["custom_resources"] = [
        {
            "api_version": "example.io/v1",
            "kind": "Example",
            "namespace": "target",
            "name": "oversized",
            "uid": "example-1",
            "resource_version": "1",
            "raw": {"spec": {"message": "x" * 1_100_000}},
        }
    ]
    results["dynamic_resource_collections"] = [
        {
            "query_name": "examples",
            "completeness": "exact",
            "reason_codes": [],
        }
    ]
    results["provider_status"] = {"examples": {"status": "exact", "reason_codes": []}}

    limited = provider.build_response(results)

    assert limited["custom_resources"] == []
    assert limited["dynamic_resource_collections"] == [
        {
            "query_name": "examples",
            "completeness": "unavailable",
            "reason_codes": ["payload_limit_exceeded"],
        }
    ]
    assert limited["provider_status"]["examples"] == {
        "status": "unavailable",
        "reason_codes": ["payload_limit_exceeded"],
    }


def _dynamic_resource_definition(module, **overrides: object):
    dynamic_resource: dict[str, object] = {
        "group": "argoproj.io",
        "version": "v1alpha1",
        "resource": "applications",
        "namespaces": ["argocd"],
        "page_size": 1,
        "max_pages": 3,
        "max_items": 2,
    }
    dynamic_resource.update(overrides)
    return module.TelemetryQueryDefinition.from_mapping(
        {
            "source": "kubernetes",
            "name": "discovered_application_inventory",
            "description": "Collect one discovery-authorized custom resource.",
            "query": "*",
            "collection_scope": "dynamic_resource",
            "dynamic_resource": dynamic_resource,
        }
    )


def test_dynamic_resource_policy_json_is_backward_compatible() -> None:
    legacy_query = {
        "name": "target_namespace_snapshot",
        "description": "Legacy namespace query.",
        "query": "target",
    }
    dynamic_query = {
        "name": "examples",
        "description": "Structured dynamic query.",
        "query": "*",
        "collection_scope": "dynamic_resource",
        "dynamic_resource": {
            "group": "example.io",
            "version": "v1",
            "resource": "examples",
            "namespaces": ["target"],
            "page_size": 50,
            "max_pages": 4,
            "max_items": 150,
        },
    }

    policy = EvidenceProviderPolicy.model_validate(
        {"interval_seconds": 30, "queries": [legacy_query, dynamic_query]}
    )

    assert policy.model_dump()["queries"] == [legacy_query, dynamic_query]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("group", "argoproj.io/../../api"),
        ("version", "v1alpha1?watch=true"),
        ("resource", "applications/status"),
        ("namespaces", ["argocd?labelSelector=all"]),
        ("url", "/apis/argoproj.io/v1alpha1/applications?watch=true"),
    ],
)
def test_dynamic_resource_query_rejects_path_and_selector_injection(
    field: str,
    value: object,
) -> None:
    module, _kubernetes_module = load_evidence_modules()

    with pytest.raises(ValueError, match="dynamic Kubernetes resource"):
        _dynamic_resource_definition(module, **{field: value}).to_provider_query()


def test_dynamic_resource_query_uses_live_discovery_and_continue_pagination(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    requests: list[tuple[str, dict[str, str]]] = []

    def application(name: str, uid: str, resource_version: str) -> dict[str, object]:
        return {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "Application",
            "metadata": {
                "name": name,
                "namespace": "argocd",
                "uid": uid,
                "resourceVersion": resource_version,
                "generation": 2,
                "labels": {"team": "platform"},
                "managedFields": [{"manager": "ignored"}],
            },
            "spec": {"source": {"repoURL": "https://example.invalid/platform.git"}},
            "status": {
                "sync": {"status": "Synced", "revision": "main@sha1:abc"},
                "health": {"status": "Healthy"},
            },
        }

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append((request.url.path, dict(request.url.params)))
        if request.url.path == "/apis/argoproj.io/v1alpha1":
            return httpx.Response(
                200,
                json={
                    "groupVersion": "argoproj.io/v1alpha1",
                    "resources": [
                        {
                            "name": "applications",
                            "singularName": "application",
                            "namespaced": True,
                            "kind": "Application",
                            "verbs": ["get", "list", "watch"],
                        }
                    ],
                },
            )
        if request.url.path == "/apis/argoproj.io/v1alpha1/namespaces/argocd/applications":
            if request.url.params.get("continue") == "page-2":
                return httpx.Response(
                    200,
                    json={
                        "metadata": {"resourceVersion": "list-rv", "continue": ""},
                        "items": [application("checkout", "app-2", "22")],
                    },
                )
            return httpx.Response(
                200,
                json={
                    "metadata": {"resourceVersion": "list-rv", "continue": "page-2"},
                    "items": [application("storefront", "app-1", "21")],
                },
            )
        return httpx.Response(404)

    provider = module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(handler),
    )
    collector = module.EvidenceCollector([provider])
    collector.register_query(_dynamic_resource_definition(module))

    kubernetes = asyncio.run(collector.collect("kubernetes"))["kubernetes"]
    inventory = kubernetes_evidence_to_inventory_snapshot(
        kubernetes,
        cluster_id="cluster-1",
        agent_id="agent-1",
    )

    assert requests == [
        ("/apis/argoproj.io/v1alpha1", {}),
        (
            "/apis/argoproj.io/v1alpha1/namespaces/argocd/applications",
            {"limit": "1"},
        ),
        (
            "/apis/argoproj.io/v1alpha1/namespaces/argocd/applications",
            {"limit": "1", "continue": "page-2"},
        ),
    ]
    assert kubernetes["dynamic_resource_collections"] == [
        {
            "query_name": "discovered_application_inventory",
            "group": "argoproj.io",
            "version": "v1alpha1",
            "resource": "applications",
            "kind": "Application",
            "namespaced": True,
            "namespaces": ["argocd"],
            "completeness": "exact",
            "reason_codes": [],
            "page_count": 2,
            "observed_count": 2,
            "returned_count": 2,
        }
    ]
    assert [row["name"] for row in kubernetes["custom_resources"]] == [
        "storefront",
        "checkout",
    ]
    assert [row["resource_type"] for row in inventory["resources"]] == [
        "custom_resource",
        "custom_resource",
    ]
    storefront = inventory["resources"][0]
    assert storefront["api_version"] == "argoproj.io/v1alpha1"
    assert storefront["kind"] == "Application"
    assert storefront["uid"] == "app-1"
    assert storefront["resource_version"] == "21"
    assert storefront["raw"] == {
        "apiVersion": "argoproj.io/v1alpha1",
        "kind": "Application",
        "metadata": {
            "name": "storefront",
            "namespace": "argocd",
            "uid": "app-1",
            "resourceVersion": "21",
            "generation": 2,
            "labels": {"team": "platform"},
        },
        "spec": {"source": {"repoURL": "https://example.invalid/platform.git"}},
        "status": {
            "sync": {"status": "Synced", "revision": "main@sha1:abc"},
            "health": {"status": "Healthy"},
        },
    }


def test_dynamic_resource_query_fails_closed_on_rbac_denial(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/apis/argoproj.io/v1alpha1":
            return httpx.Response(
                200,
                json={
                    "groupVersion": "argoproj.io/v1alpha1",
                    "resources": [
                        {
                            "name": "applications",
                            "namespaced": True,
                            "kind": "Application",
                            "verbs": ["list"],
                        }
                    ],
                },
            )
        return httpx.Response(403)

    provider = module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(handler),
    )
    collector = module.EvidenceCollector([provider])
    collector.register_query(_dynamic_resource_definition(module))

    kubernetes = asyncio.run(collector.collect("kubernetes"))["kubernetes"]

    assert kubernetes["custom_resources"] == []
    assert kubernetes["dynamic_resource_collections"][0]["completeness"] == "unavailable"
    assert kubernetes["dynamic_resource_collections"][0]["reason_codes"] == ["rbac_denied"]


def test_dynamic_resource_query_reports_page_limit_without_claiming_exact_coverage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/apis/argoproj.io/v1alpha1":
            return httpx.Response(
                200,
                json={
                    "groupVersion": "argoproj.io/v1alpha1",
                    "resources": [
                        {
                            "name": "applications",
                            "namespaced": True,
                            "kind": "Application",
                            "verbs": ["list"],
                        }
                    ],
                },
            )
        return httpx.Response(
            200,
            json={
                "metadata": {"continue": "still-more"},
                "items": [
                    {
                        "apiVersion": "argoproj.io/v1alpha1",
                        "kind": "Application",
                        "metadata": {
                            "name": "storefront",
                            "namespace": "argocd",
                            "uid": "app-1",
                            "resourceVersion": "21",
                        },
                        "spec": {},
                        "status": {},
                    }
                ],
            },
        )

    provider = module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(handler),
    )
    collector = module.EvidenceCollector([provider])
    collector.register_query(_dynamic_resource_definition(module, max_pages=1))

    kubernetes = asyncio.run(collector.collect("kubernetes"))["kubernetes"]

    assert kubernetes["dynamic_resource_collections"][0]["completeness"] == "partial"
    assert kubernetes["dynamic_resource_collections"][0]["reason_codes"] == ["page_limit_exceeded"]
    assert [row["name"] for row in kubernetes["custom_resources"]] == ["storefront"]


def test_dynamic_resource_query_rejects_namespace_scope_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.path)
        return httpx.Response(
            200,
            json={
                "groupVersion": "argoproj.io/v1alpha1",
                "resources": [
                    {
                        "name": "applications",
                        "namespaced": False,
                        "kind": "Application",
                        "verbs": ["list"],
                    }
                ],
            },
        )

    provider = module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(handler),
    )
    collector = module.EvidenceCollector([provider])
    collector.register_query(_dynamic_resource_definition(module))

    kubernetes = asyncio.run(collector.collect("kubernetes"))["kubernetes"]

    assert requested == ["/apis/argoproj.io/v1alpha1"]
    assert kubernetes["custom_resources"] == []
    assert kubernetes["dynamic_resource_collections"][0]["reason_codes"] == [
        "namespace_scope_mismatch"
    ]


@pytest.mark.parametrize(
    (
        "group",
        "version",
        "resource",
        "namespaces",
        "kind",
        "discovery_path",
        "list_path",
        "observed_namespace",
    ),
    [
        (
            "",
            "v1",
            "configmaps",
            ["target"],
            "ConfigMap",
            "/api/v1",
            "/api/v1/namespaces/target/configmaps",
            "target",
        ),
        (
            "storage.k8s.io",
            "v1",
            "storageclasses",
            [],
            "StorageClass",
            "/apis/storage.k8s.io/v1",
            "/apis/storage.k8s.io/v1/storageclasses",
            None,
        ),
    ],
)
def test_dynamic_resource_query_distinguishes_core_and_cluster_scopes(
    monkeypatch: pytest.MonkeyPatch,
    group: str,
    version: str,
    resource: str,
    namespaces: list[str],
    kind: str,
    discovery_path: str,
    list_path: str,
    observed_namespace: str | None,
) -> None:
    module, kubernetes_module = load_evidence_modules()
    monkeypatch.setattr(
        kubernetes_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(kubernetes_module, "service_account_token", lambda: "token-1")
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.path)
        if request.url.path == discovery_path:
            return httpx.Response(
                200,
                json={
                    "groupVersion": f"{group}/{version}" if group else version,
                    "resources": [
                        {
                            "name": resource,
                            "namespaced": bool(namespaces),
                            "kind": kind,
                            "verbs": ["list"],
                        }
                    ],
                },
            )
        item_metadata: dict[str, object] = {
            "name": "sample",
            "uid": "sample-1",
            "resourceVersion": "4",
        }
        if observed_namespace is not None:
            item_metadata["namespace"] = observed_namespace
        return httpx.Response(
            200,
            json={
                "metadata": {},
                "items": [
                    {
                        "apiVersion": f"{group}/{version}" if group else version,
                        "kind": kind,
                        "metadata": item_metadata,
                        "spec": {},
                        "status": {},
                    }
                ],
            },
        )

    provider = module.KubernetesSnapshotProvider(
        cluster_id="cluster-1",
        transport=httpx.MockTransport(handler),
    )
    collector = module.EvidenceCollector([provider])
    collector.register_query(
        _dynamic_resource_definition(
            module,
            group=group,
            version=version,
            resource=resource,
            namespaces=namespaces,
        )
    )

    kubernetes = asyncio.run(collector.collect("kubernetes"))["kubernetes"]

    assert requested == [discovery_path, list_path]
    assert kubernetes["dynamic_resource_collections"][0]["completeness"] == "exact"
    assert kubernetes["custom_resources"][0]["api_version"] == (
        f"{group}/{version}" if group else version
    )
    assert kubernetes["custom_resources"][0]["namespace"] == observed_namespace
