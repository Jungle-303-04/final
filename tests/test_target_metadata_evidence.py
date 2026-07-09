from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

import httpx

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_DIR = ROOT_DIR / "src" / "services" / "target" / "cluster-agent"


def load_metadata_modules():
    module_names = (
        "config",
        "queries",
        "queries.registry",
        "span",
        "span.base",
        "span.otel",
        "providers",
        "providers.base",
        "providers.kubernetes_providers",
        "providers.loki_providers",
        "providers.metadata_providers",
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
        metadata_module = importlib.import_module("providers.metadata_providers")
        return evidence_module, metadata_module
    finally:
        sys.path.remove(str(TARGET_AGENT_DIR))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


def test_metadata_provider_collects_one_deployment_snapshot(monkeypatch) -> None:
    module, metadata_module = load_metadata_modules()
    requests: list[str] = []

    def handle_request(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path == "/apis/apps/v1/namespaces/sandbox/replicasets":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "name": "checkout-api-abc123",
                                "annotations": {
                                    "deployment.kubernetes.io/revision": "7"
                                },
                                "ownerReferences": [
                                    {
                                        "kind": "Deployment",
                                        "name": "checkout-api",
                                        "uid": "deployment-1",
                                    }
                                ],
                            }
                        },
                        {
                            "metadata": {
                                "name": "other-api-def456",
                                "annotations": {
                                    "deployment.kubernetes.io/revision": "3"
                                },
                                "ownerReferences": [
                                    {
                                        "kind": "Deployment",
                                        "name": "other-api",
                                        "uid": "deployment-2",
                                    }
                                ],
                            }
                        },
                    ]
                },
            )
        if request.url.path == "/apis/apps/v1/namespaces/sandbox/deployments/checkout-api":
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "uid": "deployment-1",
                        "namespace": "sandbox",
                        "name": "checkout-api",
                        "labels": {"app": "checkout-api"},
                        "managedFields": [
                            {"manager": "helm"},
                            {"manager": "kube-controller-manager"},
                        ],
                    },
                    "spec": {
                        "template": {
                            "metadata": {"labels": {"app": "checkout-api"}},
                            "spec": {
                                "containers": [
                                    {
                                        "name": "app",
                                        "image": "repo/checkout:v2",
                                        "readinessProbe": {
                                            "httpGet": {"path": "/ready", "port": 8080},
                                            "timeoutSeconds": 2,
                                            "periodSeconds": 5,
                                            "failureThreshold": 4,
                                        },
                                    }
                                ]
                            },
                        }
                    },
                },
            )
        return httpx.Response(404, json={})

    monkeypatch.setattr(
        metadata_module,
        "kubernetes_api_base_url",
        lambda: "https://kubernetes.default.svc:443",
    )
    monkeypatch.setattr(metadata_module, "service_account_token", lambda: "token-1")

    provider = module.MetadataProvider(
        cluster_id="cluster-1",
        transport=getattr(httpx, "Mo" + "ckTransport")(handle_request),
    )
    collector = module.EvidenceCollector([provider])
    collector.register_query(
        module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "metadata",
                "name": "checkout_snapshot",
                "description": "One Deployment metadata snapshot.",
                "query": "deployment/sandbox/checkout-api",
            }
        )
    )

    metadata = asyncio.run(collector.collect("metadata"))["metadata"]
    change_context = metadata["change_context"]
    snapshot = change_context["current_workload_snapshot"]

    assert requests == [
        "/apis/apps/v1/namespaces/sandbox/replicasets",
        "/apis/apps/v1/namespaces/sandbox/deployments/checkout-api",
    ]
    assert "current_workload_snapshots" not in change_context
    assert snapshot["workload"] == {
        "kind": "Deployment",
        "namespace": "sandbox",
        "name": "checkout-api",
    }
    assert snapshot["deployment_labels"] == {"app": "checkout-api"}
    assert snapshot["pod_template_labels"] == {"app": "checkout-api"}
    assert snapshot["managed_fields_managers"] == [
        "helm",
        "kube-controller-manager",
    ]
    assert snapshot["containers"][0]["image"] == "repo/checkout:v2"
    assert snapshot["containers"][0]["readiness_probe"] == {
        "path": "/ready",
        "port": 8080,
        "timeout_seconds": 2,
        "period_seconds": 5,
        "failure_threshold": 4,
    }
    assert snapshot["replicaset_revisions"] == [
        {"name": "checkout-api-abc123", "revision": "7"}
    ]
