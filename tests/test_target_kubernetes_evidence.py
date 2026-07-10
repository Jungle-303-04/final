from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

import httpx

from packages.contracts.gateway.requests import AgentEvidenceRequest

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
        "providers.kubernetes_utils",
        "providers.kubernetes_providers",
        "providers.loki_providers",
        "providers.metadata_config_refs",
        "providers.metadata_endpoint_slices",
        "providers.metadata_ownership",
        "providers.metadata_providers",
        "providers.metadata_service_selectors",
        "providers.metadata_workload_snapshots",
        "providers.prometheus_providers",
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
                                    "image": "checkout:v1",
                                    "ready": True,
                                    "restartCount": 2,
                                    "state": {"running": {"startedAt": "2026-07-05T00:00:00Z"}},
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
                    }
                ]
            },
            "/api/v1/nodes": {
                "items": [
                    {
                        "metadata": {"name": "node-a"},
                        "spec": {"taints": []},
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
    assert validated.kubernetes["pods"][0]["name"] == "checkout-api-7f5c"
    assert validated.kubernetes["pods"][0]["restart_total"] == 2
    assert validated.kubernetes["pods"][0]["cpu_mcores"] == 125.0
    assert validated.kubernetes["pods"][0]["mem_mib"] == 64.0
    assert validated.kubernetes["events"][0]["reason"] == "BackOff"
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
        "events": 1,
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
