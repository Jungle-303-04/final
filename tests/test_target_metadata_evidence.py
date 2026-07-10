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
                                "uid": "replicaset-1",
                                "creationTimestamp": "2026-07-10T09:00:00Z",
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
                            },
                            "spec": {
                                "replicas": 2,
                            },
                            "status": {
                                "replicas": 2,
                                "readyReplicas": 1,
                                "availableReplicas": 1,
                                "fullyLabeledReplicas": 2,
                                "conditions": [
                                    {
                                        "type": "ReplicaFailure",
                                        "status": "False",
                                    }
                                ],
                            }
                        },
                        {
                            "metadata": {
                                "name": "other-api-def456",
                                "uid": "replicaset-2",
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
                        "replicas": 3,
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
                                        "resources": {
                                            "requests": {
                                                "cpu": "100m",
                                                "memory": "256Mi",
                                            },
                                            "limits": {
                                                "cpu": "500m",
                                                "memory": "512Mi",
                                            },
                                        },
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
                    "status": {
                        "observedGeneration": 12,
                        "replicas": 3,
                        "updatedReplicas": 2,
                        "readyReplicas": 1,
                        "availableReplicas": 1,
                        "unavailableReplicas": 2,
                        "conditions": [
                            {
                                "type": "Progressing",
                                "status": "False",
                                "reason": "ProgressDeadlineExceeded",
                                "message": "ReplicaSet timed out.",
                                "lastTransitionTime": "2026-07-10T10:00:00Z",
                            }
                        ],
                    },
                },
            )
        if request.url.path == "/api/v1/namespaces/sandbox/pods":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "checkout-api-pod-1",
                                "labels": {"app": "checkout-api", "release": "stable"},
                                "ownerReferences": [
                                    {
                                        "kind": "ReplicaSet",
                                        "name": "checkout-api-abc123",
                                        "uid": "replicaset-1",
                                    }
                                ],
                            },
                            "status": {
                                "phase": "Running",
                                "startTime": "2026-07-10T09:01:00Z",
                                "conditions": [
                                    {
                                        "type": "Ready",
                                        "status": "False",
                                        "reason": "ContainersNotReady",
                                        "message": "containers with unready status",
                                        "lastTransitionTime": "2026-07-10T10:01:00Z",
                                    },
                                    {
                                        "type": "PodScheduled",
                                        "status": "True",
                                    },
                                ],
                            },
                        },
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "other-api-pod-1",
                                "labels": {"app": "other-api"},
                                "ownerReferences": [
                                    {
                                        "kind": "ReplicaSet",
                                        "name": "other-api-def456",
                                        "uid": "replicaset-2",
                                    }
                                ],
                            },
                            "status": {
                                "phase": "Running",
                                "conditions": [
                                    {
                                        "type": "Ready",
                                        "status": "True",
                                    }
                                ],
                            },
                        },
                    ]
                },
            )
        if request.url.path == "/api/v1/namespaces/sandbox/services":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "checkout-api",
                            },
                            "spec": {"selector": {"app": "checkout-api"}},
                        },
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "stale-api",
                            },
                            "spec": {"selector": {"app": "missing-api"}},
                        },
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "checkout-live",
                            },
                            "spec": {"selector": {"release": "stable"}},
                        },
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "manual-endpoints",
                            },
                            "spec": {},
                        },
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "billing-api",
                            },
                            "spec": {"selector": {"component": "billing"}},
                        },
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
        "/apis/apps/v1/namespaces/sandbox/deployments/checkout-api",
        "/apis/apps/v1/namespaces/sandbox/replicasets",
        "/api/v1/namespaces/sandbox/pods",
        "/api/v1/namespaces/sandbox/services",
    ]
    assert "current_workload_snapshots" not in change_context
    assert change_context["service_selector_matches"] == [
        {
            "service": {"namespace": "sandbox", "name": "checkout-api"},
            "selector": {"app": "checkout-api"},
            "match_status": "matched",
            "target_relation": "exact_selector_match",
            "matched_pod_count": 1,
            "matched_pods": [
                {"namespace": "sandbox", "name": "checkout-api-pod-1"}
            ],
        },
        {
            "service": {"namespace": "sandbox", "name": "checkout-live"},
            "selector": {"release": "stable"},
            "match_status": "matched",
            "target_relation": "live_pod_match",
            "matched_pod_count": 1,
            "matched_pods": [
                {"namespace": "sandbox", "name": "checkout-api-pod-1"}
            ],
        },
        {
            "service": {"namespace": "sandbox", "name": "stale-api"},
            "selector": {"app": "missing-api"},
            "match_status": "no_matching_pods",
            "target_relation": "selector_key_overlap",
            "matched_pod_count": 0,
        },
    ]
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
    assert snapshot["deployment_status"] == {
        "observed_generation": 12,
        "desired_replicas": 3,
        "replicas": 3,
        "updated_replicas": 2,
        "ready_replicas": 1,
        "available_replicas": 1,
        "unavailable_replicas": 2,
        "conditions": [
            {
                "type": "Progressing",
                "status": "False",
                "reason": "ProgressDeadlineExceeded",
                "message": "ReplicaSet timed out.",
                "last_transition_time": "2026-07-10T10:00:00Z",
            }
        ],
    }
    assert snapshot["pod_statuses"] == [
        {
            "name": "checkout-api-pod-1",
            "phase": "Running",
            "ready": False,
            "start_time": "2026-07-10T09:01:00Z",
            "conditions": [
                {
                    "type": "Ready",
                    "status": "False",
                    "reason": "ContainersNotReady",
                    "message": "containers with unready status",
                    "last_transition_time": "2026-07-10T10:01:00Z",
                },
                {
                    "type": "PodScheduled",
                    "status": "True",
                },
            ],
        }
    ]
    assert snapshot["containers"][0]["image"] == "repo/checkout:v2"
    assert snapshot["containers"][0]["readiness_probe"] == {
        "path": "/ready",
        "port": 8080,
        "timeout_seconds": 2,
        "period_seconds": 5,
        "failure_threshold": 4,
    }
    assert snapshot["containers"][0]["resources"] == {
        "requests": {"cpu": "100m", "memory": "256Mi"},
        "limits": {"cpu": "500m", "memory": "512Mi"},
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
        {
            "name": "checkout-api-abc123",
            "revision": "7",
            "created_at": "2026-07-10T09:00:00Z",
            "desired_replicas": 2,
            "replicas": 2,
            "ready_replicas": 1,
            "available_replicas": 1,
            "fully_labeled_replicas": 2,
            "conditions": [
                {
                    "type": "ReplicaFailure",
                    "status": "False",
                }
            ],
        }
    ]


def test_metadata_provider_skips_pods_when_deployment_is_missing(
    monkeypatch,
) -> None:
    module, metadata_module = load_metadata_modules()
    requests: list[str] = []

    def handle_request(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path == "/apis/apps/v1/namespaces/sandbox/replicasets":
            return httpx.Response(200, json={"items": []})
        if request.url.path == "/apis/apps/v1/namespaces/sandbox/deployments/missing-api":
            return httpx.Response(404, json={})
        if request.url.path == "/api/v1/namespaces/sandbox/pods":
            return httpx.Response(500, json={"error": "pods should not be queried"})
        if request.url.path == "/api/v1/namespaces/sandbox/services":
            return httpx.Response(500, json={"error": "services should not be queried"})
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
                "name": "missing_snapshot",
                "description": "Missing Deployment metadata snapshot.",
                "query": "deployment/sandbox/missing-api",
            }
        )
    )

    metadata = asyncio.run(collector.collect("metadata"))["metadata"]

    assert requests == [
        "/apis/apps/v1/namespaces/sandbox/deployments/missing-api",
    ]
    assert metadata["change_context"] == {"current_workload_snapshots": []}


def test_metadata_provider_collects_service_matches_without_deployments(
    monkeypatch,
) -> None:
    module, metadata_module = load_metadata_modules()
    requests: list[str] = []

    def handle_request(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path == "/apis/apps/v1/namespaces/target/deployments":
            return httpx.Response(200, json={"items": []})
        if request.url.path == "/api/v1/namespaces/target/pods":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "target",
                                "name": "worker-pod-1",
                                "labels": {"app": "worker"},
                            }
                        }
                    ]
                },
            )
        if request.url.path == "/api/v1/namespaces/target/services":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "target",
                                "name": "worker",
                            },
                            "spec": {"selector": {"app": "worker"}},
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

    assert requests == [
        "/apis/apps/v1/namespaces/target/deployments",
        "/api/v1/namespaces/target/pods",
        "/api/v1/namespaces/target/services",
    ]
    assert metadata["change_context"] == {
        "current_workload_snapshots": [],
        "service_selector_matches": [
            {
                "service": {"namespace": "target", "name": "worker"},
                "selector": {"app": "worker"},
                "match_status": "matched",
                "matched_pod_count": 1,
                "matched_pods": [
                    {"namespace": "target", "name": "worker-pod-1"}
                ],
            }
        ],
    }


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
                                "uid": "replicaset-3",
                                "creationTimestamp": "2026-07-10T08:00:00Z",
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
                            },
                            "spec": {
                                "replicas": 1,
                            },
                            "status": {
                                "replicas": 1,
                                "readyReplicas": 1,
                                "availableReplicas": 1,
                                "fullyLabeledReplicas": 1,
                                "conditions": [
                                    {
                                        "type": "ReplicaFailure",
                                        "status": "False",
                                    }
                                ],
                            },
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
                                "managedFields": [
                                    {"manager": "argocd-controller"},
                                ],
                            },
                            "spec": {
                                "replicas": 1,
                                "template": {
                                    "metadata": {
                                        "labels": {"app": "shop-api"},
                                        "annotations": {
                                            "prometheus.io/port": "8080",
                                            "token.example.com/value": "hidden",
                                        },
                                    },
                                    "spec": {
                                        "volumes": [
                                            {
                                                "name": "shop-config",
                                                "configMap": {
                                                    "name": "shop-config",
                                                },
                                            }
                                        ],
                                        "containers": [
                                            {
                                                "name": "app",
                                                "image": "repo/shop:v3",
                                                "resources": {
                                                    "requests": {
                                                        "cpu": "50m",
                                                        "memory": "128Mi",
                                                    },
                                                },
                                                "env": [
                                                    {
                                                        "name": "SHOP_MODE",
                                                        "valueFrom": {
                                                            "configMapKeyRef": {
                                                                "name": "shop-config",
                                                                "key": "mode",
                                                            }
                                                        },
                                                    }
                                                ],
                                                "volumeMounts": [
                                                    {
                                                        "name": "shop-config",
                                                        "mountPath": "/etc/shop",
                                                    }
                                                ],
                                                "livenessProbe": {
                                                    "tcpSocket": {"port": 8080},
                                                    "timeoutSeconds": 1,
                                                },
                                            }
                                        ]
                                    },
                                }
                            },
                            "status": {
                                "observedGeneration": 4,
                                "replicas": 1,
                                "updatedReplicas": 1,
                                "readyReplicas": 1,
                                "availableReplicas": 1,
                                "conditions": [
                                    {
                                        "type": "Available",
                                        "status": "True",
                                    }
                                ],
                            },
                        }
                    ]
                },
            )
        if request.url.path == "/api/v1/namespaces/target/pods":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "target",
                                "name": "shop-api-pod-1",
                                "labels": {"app": "shop-api"},
                                "ownerReferences": [
                                    {
                                        "kind": "ReplicaSet",
                                        "name": "shop-api-abc123",
                                        "uid": "replicaset-3",
                                    }
                                ],
                            },
                            "status": {
                                "phase": "Running",
                                "startTime": "2026-07-10T08:01:00Z",
                                "conditions": [
                                    {
                                        "type": "Ready",
                                        "status": "True",
                                        "lastTransitionTime": "2026-07-10T08:02:00Z",
                                    }
                                ],
                            },
                        }
                    ]
                },
            )
        if request.url.path == "/api/v1/namespaces/target/services":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "target",
                                "name": "shop-api",
                            },
                            "spec": {"selector": {"app": "shop-api"}},
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
        "/apis/apps/v1/namespaces/target/deployments",
        "/apis/apps/v1/namespaces/target/replicasets",
        "/api/v1/namespaces/target/pods",
        "/api/v1/namespaces/target/services",
    ]
    assert "current_workload_snapshot" not in change_context
    assert change_context["service_selector_matches"] == [
        {
            "service": {"namespace": "target", "name": "shop-api"},
            "selector": {"app": "shop-api"},
            "match_status": "matched",
            "matched_pod_count": 1,
            "matched_pods": [
                {"namespace": "target", "name": "shop-api-pod-1"}
            ],
        }
    ]
    assert snapshot["workload"] == {
        "kind": "Deployment",
        "namespace": "target",
        "name": "shop-api",
    }
    assert snapshot["deployment_labels"] == {"app": "shop-api"}
    assert snapshot["pod_template_labels"] == {"app": "shop-api"}
    assert "deployment_annotations" not in snapshot
    assert "pod_template_annotations" not in snapshot
    assert "managed_fields_managers" not in snapshot
    assert snapshot["deployment_status"] == {
        "observed_generation": 4,
        "desired_replicas": 1,
        "replicas": 1,
        "updated_replicas": 1,
        "ready_replicas": 1,
        "available_replicas": 1,
        "conditions": [
            {
                "type": "Available",
                "status": "True",
            }
        ],
    }
    assert snapshot["pod_statuses"] == [
        {
            "name": "shop-api-pod-1",
            "phase": "Running",
            "ready": True,
            "start_time": "2026-07-10T08:01:00Z",
            "conditions": [
                {
                    "type": "Ready",
                    "status": "True",
                    "last_transition_time": "2026-07-10T08:02:00Z",
                }
            ],
        }
    ]
    assert snapshot["containers"][0]["liveness_probe"] == {
        "port": 8080,
        "timeout_seconds": 1,
    }
    assert snapshot["containers"][0]["resources"] == {
        "requests": {"cpu": "50m", "memory": "128Mi"}
    }
    assert "env_refs" not in snapshot["containers"][0]
    assert "env_from_refs" not in snapshot["containers"][0]
    assert "volume_mount_refs" not in snapshot["containers"][0]
    assert snapshot["replicaset_revisions"] == [
        {
            "name": "shop-api-abc123",
            "revision": "2",
            "desired_replicas": 1,
            "replicas": 1,
            "ready_replicas": 1,
            "available_replicas": 1,
            "fully_labeled_replicas": 1,
        }
    ]
    assert "created_at" not in snapshot["replicaset_revisions"][0]
    assert "conditions" not in snapshot["replicaset_revisions"][0]
