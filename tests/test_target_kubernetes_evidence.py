from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

import httpx
import pytest

from domains.inventory.kubernetes_snapshot import kubernetes_evidence_to_inventory_snapshot
from domains.inventory_filter.physical_topology import build_physical_topology
from packages.contracts.gateway.requests import AgentEvidenceRequest, EvidenceJobResultRequest
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
                        "containers": [
                            {"name": "checkout-api", "usage": {"cpu": "125m", "memory": "64Mi"}}
                        ],
                    }
                ]
            },
            "/apis/metrics.k8s.io/v1beta1/nodes": {
                "items": [
                    {"metadata": {"name": "node-a"}, "usage": {"cpu": "390m", "memory": "1Gi"}}
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

    assert [request.headers["authorization"] for request in requests] == ["Bearer token-1"] * 11
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
    assert validated.kubernetes["nodes"][0]["cpu_mcores"] == 390.0
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
        "services": 1,
        "endpoints": 1,
    }


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


def test_regular_kubernetes_snapshot_excludes_scaled_down_replicaset_history() -> None:
    _module, kubernetes_module = load_evidence_modules()
    provider = kubernetes_module.KubernetesSnapshotProvider(cluster_id="cluster-1")

    def replicaset(name: str, desired: int, current: int) -> dict[str, object]:
        return {
            "metadata": {"name": name, "namespace": "production"},
            "spec": {"replicas": desired},
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
