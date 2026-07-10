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
                        "annotations": {
                            "ops.service/restarted-at": "2026-07-10T11:12:13Z",
                            "example.com/token": "secret-value",
                            "kubectl.kubernetes.io/last-applied-configuration": (
                                '{"secret":"raw manifest"}'
                            ),
                        },
                        "managedFields": [
                            {"manager": "helm"},
                            {"manager": "kube-controller-manager"},
                        ],
                    },
                    "spec": {
                        "template": {
                            "metadata": {
                                "labels": {"app": "checkout-api"},
                                "annotations": {
                                    "prometheus.io/path": "/metrics",
                                    "prometheus.io/scrape": "true",
                                    "secret.example.com/name": "checkout-secret",
                                },
                            },
                            "spec": {
                                "volumes": [
                                    {
                                        "name": "app-config",
                                        "configMap": {
                                            "name": "checkout-config",
                                            "items": [
                                                {
                                                    "key": "application.yaml",
                                                    "path": "application.yaml",
                                                }
                                            ],
                                            "optional": False,
                                        },
                                    },
                                    {
                                        "name": "app-secret",
                                        "secret": {
                                            "secretName": "checkout-secret",
                                            "items": [
                                                {
                                                    "key": "database-url",
                                                    "path": "database-url",
                                                }
                                            ],
                                            "optional": True,
                                        },
                                    },
                                ],
                                "containers": [
                                    {
                                        "name": "app",
                                        "image": "repo/checkout:v2",
                                        "env": [
                                            {
                                                "name": "APP_MODE",
                                                "valueFrom": {
                                                    "configMapKeyRef": {
                                                        "name": "checkout-config",
                                                        "key": "mode",
                                                        "optional": False,
                                                    }
                                                },
                                            },
                                            {
                                                "name": "DATABASE_URL",
                                                "valueFrom": {
                                                    "secretKeyRef": {
                                                        "name": "checkout-secret",
                                                        "key": "database-url",
                                                        "optional": True,
                                                    }
                                                },
                                            },
                                            {
                                                "name": "LITERAL_VALUE",
                                                "value": "do-not-include",
                                            },
                                        ],
                                        "envFrom": [
                                            {
                                                "prefix": "APP_",
                                                "configMapRef": {
                                                    "name": "checkout-env",
                                                    "optional": False,
                                                },
                                            },
                                            {
                                                "secretRef": {
                                                    "name": "checkout-env-secret",
                                                    "optional": True,
                                                }
                                            },
                                        ],
                                        "volumeMounts": [
                                            {
                                                "name": "app-config",
                                                "mountPath": "/etc/app",
                                                "readOnly": True,
                                            },
                                            {
                                                "name": "app-secret",
                                                "mountPath": "/etc/secret",
                                                "readOnly": True,
                                                "subPath": "database-url",
                                            },
                                            {
                                                "name": "empty-dir",
                                                "mountPath": "/tmp/cache",
                                            },
                                        ],
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
    assert snapshot["deployment_annotations"] == {
        "ops.service/restarted-at": "2026-07-10T11:12:13Z"
    }
    assert "example.com/token" not in snapshot["deployment_annotations"]
    assert (
        "kubectl.kubernetes.io/last-applied-configuration"
        not in snapshot["deployment_annotations"]
    )
    assert snapshot["pod_template_labels"] == {"app": "checkout-api"}
    assert snapshot["pod_template_annotations"] == {
        "prometheus.io/path": "/metrics",
        "prometheus.io/scrape": "true",
    }
    assert "secret.example.com/name" not in snapshot["pod_template_annotations"]
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
    assert snapshot["containers"][0]["env_refs"] == [
        {
            "env_name": "APP_MODE",
            "source": "config_map_key_ref",
            "config_map_name": "checkout-config",
            "key": "mode",
            "optional": False,
        },
        {
            "env_name": "DATABASE_URL",
            "source": "secret_key_ref",
            "secret_name": "checkout-secret",
            "key": "database-url",
            "optional": True,
        },
    ]
    assert snapshot["containers"][0]["env_from_refs"] == [
        {
            "source": "config_map_ref",
            "config_map_name": "checkout-env",
            "prefix": "APP_",
            "optional": False,
        },
        {
            "source": "secret_ref",
            "secret_name": "checkout-env-secret",
            "optional": True,
        },
    ]
    assert snapshot["containers"][0]["volume_mount_refs"] == [
        {
            "volume_name": "app-config",
            "source": "config_map",
            "config_map_name": "checkout-config",
            "optional": False,
            "items": [{"key": "application.yaml", "path": "application.yaml"}],
            "mount_path": "/etc/app",
            "read_only": True,
        },
        {
            "volume_name": "app-secret",
            "source": "secret",
            "secret_name": "checkout-secret",
            "optional": True,
            "items": [{"key": "database-url", "path": "database-url"}],
            "mount_path": "/etc/secret",
            "read_only": True,
            "sub_path": "database-url",
        },
    ]
    assert "do-not-include" not in str(snapshot["containers"][0])
    assert snapshot["replicaset_revisions"] == [
        {"name": "checkout-api-abc123", "revision": "7"}
    ]


def test_metadata_provider_collects_namespace_deployment_snapshots(monkeypatch) -> None:
    module, metadata_module = load_metadata_modules()
    requests: list[str] = []

    def handle_request(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path == "/apis/apps/v1/namespaces/target/replicasets":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "name": "shop-api-abc123",
                                "annotations": {
                                    "deployment.kubernetes.io/revision": "2"
                                },
                                "ownerReferences": [
                                    {
                                        "kind": "Deployment",
                                        "name": "shop-api",
                                        "uid": "deployment-3",
                                    }
                                ],
                            }
                        }
                    ]
                },
            )
        if request.url.path == "/apis/apps/v1/namespaces/target/deployments":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "uid": "deployment-3",
                                "namespace": "target",
                                "name": "shop-api",
                                "labels": {"app": "shop-api"},
                                "annotations": {
                                    "ops.service/apply-at": "1783612345",
                                    "private.example.com/value": "hidden",
                                },
                            },
                            "spec": {
                                "template": {
                                    "metadata": {
                                        "labels": {"app": "shop-api"},
                                        "annotations": {
                                            "prometheus.io/port": "8080",
                                            "token.example.com/value": "hidden",
                                        },
                                    },
                                    "spec": {
                                        "containers": [
                                            {
                                                "name": "app",
                                                "image": "repo/shop:v3",
                                                "livenessProbe": {
                                                    "tcpSocket": {"port": 8080},
                                                    "timeoutSeconds": 1,
                                                },
                                            }
                                        ]
                                    },
                                }
                            },
                        }
                    ]
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
                "name": "change_context",
                "description": "Namespace metadata snapshots.",
                "query": "change_context",
            }
        )
    )

    metadata = asyncio.run(collector.collect("metadata"))["metadata"]
    change_context = metadata["change_context"]
    snapshot = change_context["current_workload_snapshots"][0]

    assert requests == [
        "/apis/apps/v1/namespaces/target/replicasets",
        "/apis/apps/v1/namespaces/target/deployments",
    ]
    assert "current_workload_snapshot" not in change_context
    assert snapshot["workload"] == {
        "kind": "Deployment",
        "namespace": "target",
        "name": "shop-api",
    }
    assert snapshot["deployment_annotations"] == {"ops.service/apply-at": "1783612345"}
    assert "private.example.com/value" not in snapshot["deployment_annotations"]
    assert snapshot["pod_template_annotations"] == {"prometheus.io/port": "8080"}
    assert "token.example.com/value" not in snapshot["pod_template_annotations"]
    assert snapshot["containers"][0]["liveness_probe"] == {
        "port": 8080,
        "timeout_seconds": 1,
    }
