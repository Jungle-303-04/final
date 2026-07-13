from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

import httpx

from packages.contracts.gateway.requests import EvidenceJobResultRequest

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
        "providers.collection_limits",
        "providers.kubernetes_utils",
        "providers.kubernetes_providers",
        "providers.loki_providers",
        "providers.metadata_config_objects",
        "providers.metadata_config_refs",
        "providers.metadata_endpoint_slices",
        "providers.metadata_ownership",
        "providers.metadata_resource_quotas",
        "providers.metadata_service_selectors",
        "providers.metadata_workload_snapshots",
        "providers.metadata_providers",
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
        metadata_module = importlib.import_module("providers.metadata_providers")
        return evidence_module, metadata_module
    finally:
        sys.path.remove(str(TARGET_AGENT_DIR))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


def test_metadata_query_target_accepts_namespace_query() -> None:
    _module, metadata_module = load_metadata_modules()

    target = metadata_module.metadata_query_target(
        metadata_module.MetadataSnapshotQuery(
            "rca_test_metadata_snapshot",
            "RCA test run scoped metadata snapshot",
            "sandbox",
        )
    )

    assert target.namespace == "sandbox"
    assert target.deployment_name is None


def test_metadata_normalize_limits_large_namespace_lists() -> None:
    _module, metadata_module = load_metadata_modules()
    provider = metadata_module.MetadataProvider(cluster_id="cluster-1")

    normalized = provider.normalize_payload(
        {
            metadata_module.CHANGE_CONTEXT_KEY: {
                metadata_module.CURRENT_WORKLOAD_SNAPSHOTS_KEY: [
                    {"workload": {"name": f"app-{index}"}}
                    for index in range(metadata_module.MAX_CURRENT_WORKLOAD_SNAPSHOTS + 2)
                ],
                metadata_module.SERVICE_SELECTOR_MATCHES_KEY: [
                    {"service": {"name": f"svc-{index}"}}
                    for index in range(metadata_module.MAX_SERVICE_SELECTOR_MATCHES + 1)
                ],
                metadata_module.ENDPOINT_SLICE_READY_ENDPOINTS_KEY: [
                    {"endpoint_slice": {"name": f"slice-{index}"}}
                    for index in range(metadata_module.MAX_ENDPOINT_SLICE_READY_ENDPOINTS + 1)
                ],
                metadata_module.RESOURCE_QUOTAS_KEY: [
                    {"name": f"quota-{index}"}
                    for index in range(metadata_module.MAX_RESOURCE_QUOTAS + 1)
                ],
            }
        },
        metadata_module.MetadataSnapshotQuery(
            "change_context",
            "Namespace metadata snapshots.",
            "change_context",
        ),
    )

    assert len(normalized[metadata_module.CURRENT_WORKLOAD_SNAPSHOTS_KEY]) == (
        metadata_module.MAX_CURRENT_WORKLOAD_SNAPSHOTS
    )
    assert len(normalized[metadata_module.SERVICE_SELECTOR_MATCHES_KEY]) == (
        metadata_module.MAX_SERVICE_SELECTOR_MATCHES
    )
    assert len(normalized[metadata_module.ENDPOINT_SLICE_READY_ENDPOINTS_KEY]) == (
        metadata_module.MAX_ENDPOINT_SLICE_READY_ENDPOINTS
    )
    assert len(normalized[metadata_module.RESOURCE_QUOTAS_KEY]) == (
        metadata_module.MAX_RESOURCE_QUOTAS
    )
    assert normalized[metadata_module.COLLECTION_LIMITS_KEY] == {
        "truncated": True,
        "lists": {
            metadata_module.CURRENT_WORKLOAD_SNAPSHOTS_KEY: {
                "truncated": True,
                "original_count": metadata_module.MAX_CURRENT_WORKLOAD_SNAPSHOTS + 2,
                "returned_count": metadata_module.MAX_CURRENT_WORKLOAD_SNAPSHOTS,
            },
            metadata_module.SERVICE_SELECTOR_MATCHES_KEY: {
                "truncated": True,
                "original_count": metadata_module.MAX_SERVICE_SELECTOR_MATCHES + 1,
                "returned_count": metadata_module.MAX_SERVICE_SELECTOR_MATCHES,
            },
            metadata_module.ENDPOINT_SLICE_READY_ENDPOINTS_KEY: {
                "truncated": True,
                "original_count": (metadata_module.MAX_ENDPOINT_SLICE_READY_ENDPOINTS + 1),
                "returned_count": metadata_module.MAX_ENDPOINT_SLICE_READY_ENDPOINTS,
            },
            metadata_module.RESOURCE_QUOTAS_KEY: {
                "truncated": True,
                "original_count": metadata_module.MAX_RESOURCE_QUOTAS + 1,
                "returned_count": metadata_module.MAX_RESOURCE_QUOTAS,
            },
        },
    }


def test_metadata_normalize_can_drop_single_oversized_top_level_item() -> None:
    _module, metadata_module = load_metadata_modules()
    provider = metadata_module.MetadataProvider(cluster_id="cluster-1")

    normalized = provider.normalize_payload(
        {
            metadata_module.CHANGE_CONTEXT_KEY: {
                metadata_module.CURRENT_WORKLOAD_SNAPSHOTS_KEY: [
                    {
                        "workload": {"kind": "Deployment", "namespace": "target", "name": "app"},
                        "deployment_labels": {"large": "x" * 1_100_000},
                    }
                ]
            }
        },
        metadata_module.MetadataSnapshotQuery(
            "change_context",
            "Namespace metadata snapshots.",
            "change_context",
        ),
    )

    assert normalized[metadata_module.CURRENT_WORKLOAD_SNAPSHOTS_KEY] == []
    assert normalized[metadata_module.COLLECTION_LIMITS_KEY]["lists"][
        metadata_module.CURRENT_WORKLOAD_SNAPSHOTS_KEY
    ] == {
        "truncated": True,
        "original_count": 1,
        "returned_count": 0,
    }
    EvidenceJobResultRequest(
        agent_id="agent-1",
        lease_id="lease-1",
        status="completed",
        result={"metadata": {metadata_module.CHANGE_CONTEXT_KEY: normalized}},
    )


def test_endpoint_slice_omitted_ready_condition_defaults_to_ready() -> None:
    _module, metadata_module = load_metadata_modules()

    snapshots = metadata_module.endpoint_slice_ready_endpoint_snapshots(
        [
            {
                "metadata": {
                    "namespace": "sandbox",
                    "name": "checkout-api-abc",
                    "labels": {"kubernetes.io/service-name": "checkout-api"},
                },
                "addressType": "IPv4",
                "endpoints": [
                    {
                        "conditions": {},
                        "targetRef": {
                            "kind": "Pod",
                            "namespace": "sandbox",
                            "name": "checkout-api-pod-1",
                        },
                    }
                ],
            }
        ]
    )

    assert snapshots == [
        {
            "service": {"namespace": "sandbox", "name": "checkout-api"},
            "endpoint_slice": {"namespace": "sandbox", "name": "checkout-api-abc"},
            "address_type": "IPv4",
            "endpoint_count": 1,
            "ready_endpoint_count": 1,
            "not_ready_endpoint_count": 0,
            "unknown_ready_endpoint_count": 0,
            "serving_endpoint_count": 1,
            "terminating_endpoint_count": 0,
            "ready_targets": [
                {
                    "kind": "Pod",
                    "namespace": "sandbox",
                    "name": "checkout-api-pod-1",
                }
            ],
        }
    ]


def test_metadata_ownership_requires_uid_when_owner_uid_is_available() -> None:
    _module, metadata_module = load_metadata_modules()
    deployment = {
        "metadata": {
            "namespace": "sandbox",
            "name": "checkout-api",
            "uid": "deployment-current",
        }
    }
    current_replicaset = {
        "metadata": {
            "namespace": "sandbox",
            "name": "checkout-api-abc",
            "uid": "replicaset-current",
            "ownerReferences": [
                {
                    "kind": "Deployment",
                    "name": "checkout-api",
                    "uid": "deployment-current",
                }
            ],
        }
    }
    stale_replicaset = {
        "metadata": {
            "namespace": "sandbox",
            "name": "checkout-api-old",
            "uid": "replicaset-old",
            "ownerReferences": [
                {
                    "kind": "Deployment",
                    "name": "checkout-api",
                    "uid": "deployment-old",
                }
            ],
        }
    }
    current_pod = {
        "metadata": {
            "namespace": "sandbox",
            "name": "checkout-api-pod-1",
            "ownerReferences": [
                {
                    "kind": "ReplicaSet",
                    "name": "checkout-api-abc",
                    "uid": "replicaset-current",
                }
            ],
        }
    }
    stale_pod = {
        "metadata": {
            "namespace": "sandbox",
            "name": "checkout-api-pod-old",
            "ownerReferences": [
                {
                    "kind": "ReplicaSet",
                    "name": "checkout-api-abc",
                    "uid": "replicaset-old",
                }
            ],
        }
    }

    owned_pods = metadata_module.pods_for_deployment(
        deployment,
        [current_replicaset, stale_replicaset],
        [current_pod, stale_pod],
    )
    assert [pod["metadata"]["name"] for pod in owned_pods] == ["checkout-api-pod-1"]

    assert (
        metadata_module.pods_for_deployment(
            deployment,
            [current_replicaset],
            [stale_pod],
        )
        == []
    )


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
                                "annotations": {"deployment.kubernetes.io/revision": "7"},
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
                            },
                        },
                        {
                            "metadata": {
                                "name": "other-api-def456",
                                "uid": "replicaset-2",
                                "annotations": {"deployment.kubernetes.io/revision": "3"},
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
                                "serviceAccountName": "checkout-api-sa",
                                "automountServiceAccountToken": False,
                                "imagePullSecrets": [{"name": "registry-credentials"}],
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
                                    {
                                        "name": "checkout-data",
                                        "persistentVolumeClaim": {"claimName": "checkout-data-pvc"},
                                    },
                                ],
                                "nodeSelector": {
                                    "disk": "ssd",
                                    "workload": "checkout",
                                },
                                "tolerations": [
                                    {
                                        "key": "dedicated",
                                        "operator": "Equal",
                                        "value": "checkout",
                                        "effect": "NoSchedule",
                                        "tolerationSeconds": 300,
                                        "ignoredField": "do-not-include",
                                    }
                                ],
                                "affinity": {
                                    "nodeAffinity": {
                                        "requiredDuringSchedulingIgnoredDuringExecution": {
                                            "nodeSelectorTerms": [
                                                {
                                                    "matchExpressions": [
                                                        {
                                                            "key": "disk",
                                                            "operator": "In",
                                                            "values": ["ssd"],
                                                        }
                                                    ]
                                                }
                                            ]
                                        },
                                        "preferredDuringSchedulingIgnoredDuringExecution": [
                                            {
                                                "weight": 50,
                                                "preference": {
                                                    "matchExpressions": [
                                                        {
                                                            "key": "zone",
                                                            "operator": "In",
                                                            "values": ["a"],
                                                        }
                                                    ]
                                                },
                                            }
                                        ],
                                    },
                                    "podAntiAffinity": {
                                        "requiredDuringSchedulingIgnoredDuringExecution": [
                                            {
                                                "labelSelector": {
                                                    "matchLabels": {"app": "checkout-api"}
                                                },
                                                "topologyKey": "kubernetes.io/hostname",
                                            }
                                        ]
                                    },
                                },
                                "containers": [
                                    {
                                        "name": "app",
                                        "image": "repo/checkout:v2",
                                        "ports": [
                                            {
                                                "name": "http",
                                                "containerPort": 8080,
                                                "protocol": "TCP",
                                                "hostPort": 30080,
                                            }
                                        ],
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
                                                "name": "MISSING_MODE",
                                                "valueFrom": {
                                                    "configMapKeyRef": {
                                                        "name": "checkout-config",
                                                        "key": "missing-mode",
                                                        "optional": False,
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
                                ],
                            },
                        },
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
        if request.url.path == "/api/v1/namespaces/sandbox/resourcequotas":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "compute-quota",
                            },
                            "status": {
                                "hard": {
                                    "requests.cpu": "4",
                                    "requests.memory": "8Gi",
                                    "pods": "20",
                                },
                                "used": {
                                    "requests.cpu": "1200m",
                                    "requests.memory": "1Gi",
                                    "pods": "5",
                                },
                            },
                        }
                    ]
                },
            )
        if request.url.path == "/apis/discovery.k8s.io/v1/namespaces/sandbox/endpointslices":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "billing-api-abcde",
                                "labels": {"kubernetes.io/service-name": "billing-api"},
                            },
                            "addressType": "IPv4",
                            "ports": [
                                {
                                    "name": "http",
                                    "port": 8080,
                                    "protocol": "TCP",
                                }
                            ],
                            "endpoints": [
                                {
                                    "conditions": {"ready": True},
                                    "targetRef": {
                                        "kind": "Pod",
                                        "namespace": "sandbox",
                                        "name": "billing-api-pod-1",
                                    },
                                    "addresses": ["10.0.0.10"],
                                }
                            ],
                        },
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "checkout-api-abcde",
                                "labels": {"kubernetes.io/service-name": "checkout-api"},
                            },
                            "addressType": "IPv4",
                            "ports": [
                                {
                                    "name": "http",
                                    "port": 8080,
                                    "protocol": "TCP",
                                }
                            ],
                            "endpoints": [
                                {
                                    "conditions": {
                                        "ready": True,
                                        "serving": True,
                                        "terminating": False,
                                    },
                                    "targetRef": {
                                        "kind": "Pod",
                                        "namespace": "sandbox",
                                        "name": "checkout-api-pod-1",
                                    },
                                    "addresses": ["10.0.0.1"],
                                },
                                {
                                    "conditions": {
                                        "ready": False,
                                        "serving": False,
                                        "terminating": False,
                                    },
                                    "targetRef": {
                                        "kind": "Pod",
                                        "namespace": "sandbox",
                                        "name": "checkout-api-pod-2",
                                    },
                                    "addresses": ["10.0.0.2"],
                                },
                            ],
                        },
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "checkout-live-bcdef",
                                "labels": {"kubernetes.io/service-name": "checkout-live"},
                            },
                            "addressType": "IPv4",
                            "endpoints": [
                                {
                                    "conditions": {"ready": True},
                                    "targetRef": {
                                        "kind": "Pod",
                                        "namespace": "sandbox",
                                        "name": "checkout-api-pod-1",
                                    },
                                }
                            ],
                        },
                        {
                            "metadata": {
                                "namespace": "sandbox",
                                "name": "stale-api-cdefg",
                                "labels": {"kubernetes.io/service-name": "stale-api"},
                            },
                            "addressType": "IPv4",
                            "endpoints": [],
                        },
                    ]
                },
            )
        if request.url.path == "/api/v1/namespaces/sandbox/configmaps/checkout-config":
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "namespace": "sandbox",
                        "name": "checkout-config",
                        "creationTimestamp": "2026-07-10T08:30:00Z",
                        "labels": {
                            "app": "checkout-api",
                            "password": "do-not-include",
                        },
                        "annotations": {"ops.service/restarted-at": "do-not-include"},
                    },
                    "data": {
                        "mode": "do-not-include",
                        "application.yaml": "do-not-include",
                    },
                },
            )
        if request.url.path == "/api/v1/namespaces/sandbox/configmaps/checkout-env":
            return httpx.Response(404, json={"message": "not found"})
        if request.url.path == "/api/v1/namespaces/sandbox/secrets/checkout-env-secret":
            return httpx.Response(403, json={"message": "forbidden"})
        if request.url.path == "/api/v1/namespaces/sandbox/secrets/checkout-secret":
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "namespace": "sandbox",
                        "name": "checkout-secret",
                        "creationTimestamp": "2026-07-10T08:31:00Z",
                        "labels": {
                            "app": "checkout-api",
                            "token-owner": "do-not-include",
                        },
                    },
                    "type": "Opaque",
                    "data": {
                        "database-url": "do-not-include",
                    },
                    "stringData": {
                        "raw": "do-not-include",
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
        "/apis/apps/v1/namespaces/sandbox/deployments/checkout-api",
        "/apis/apps/v1/namespaces/sandbox/replicasets",
        "/api/v1/namespaces/sandbox/pods",
        "/api/v1/namespaces/sandbox/services",
        "/api/v1/namespaces/sandbox/resourcequotas",
        "/apis/discovery.k8s.io/v1/namespaces/sandbox/endpointslices",
        "/api/v1/namespaces/sandbox/configmaps/checkout-config",
        "/api/v1/namespaces/sandbox/configmaps/checkout-env",
        "/api/v1/namespaces/sandbox/secrets/checkout-env-secret",
        "/api/v1/namespaces/sandbox/secrets/checkout-secret",
    ]
    assert "current_workload_snapshots" not in change_context
    assert change_context["service_selector_matches"] == [
        {
            "service": {"namespace": "sandbox", "name": "checkout-api"},
            "selector": {"app": "checkout-api"},
            "match_status": "matched",
            "target_relation": "exact_selector_match",
            "matched_pod_count": 1,
            "matched_pods": [{"namespace": "sandbox", "name": "checkout-api-pod-1"}],
        },
        {
            "service": {"namespace": "sandbox", "name": "checkout-live"},
            "selector": {"release": "stable"},
            "match_status": "matched",
            "target_relation": "live_pod_match",
            "matched_pod_count": 1,
            "matched_pods": [{"namespace": "sandbox", "name": "checkout-api-pod-1"}],
        },
        {
            "service": {"namespace": "sandbox", "name": "stale-api"},
            "selector": {"app": "missing-api"},
            "match_status": "no_matching_pods",
            "target_relation": "selector_key_overlap",
            "matched_pod_count": 0,
        },
    ]
    assert change_context["endpoint_slice_ready_endpoints"] == [
        {
            "service": {"namespace": "sandbox", "name": "checkout-api"},
            "endpoint_slice": {"namespace": "sandbox", "name": "checkout-api-abcde"},
            "address_type": "IPv4",
            "ports": [{"name": "http", "port": 8080, "protocol": "TCP"}],
            "endpoint_count": 2,
            "ready_endpoint_count": 1,
            "not_ready_endpoint_count": 1,
            "unknown_ready_endpoint_count": 0,
            "serving_endpoint_count": 1,
            "terminating_endpoint_count": 0,
            "ready_targets": [
                {
                    "kind": "Pod",
                    "namespace": "sandbox",
                    "name": "checkout-api-pod-1",
                }
            ],
        },
        {
            "service": {"namespace": "sandbox", "name": "checkout-live"},
            "endpoint_slice": {"namespace": "sandbox", "name": "checkout-live-bcdef"},
            "address_type": "IPv4",
            "endpoint_count": 1,
            "ready_endpoint_count": 1,
            "not_ready_endpoint_count": 0,
            "unknown_ready_endpoint_count": 0,
            "serving_endpoint_count": 1,
            "terminating_endpoint_count": 0,
            "ready_targets": [
                {
                    "kind": "Pod",
                    "namespace": "sandbox",
                    "name": "checkout-api-pod-1",
                }
            ],
        },
        {
            "service": {"namespace": "sandbox", "name": "stale-api"},
            "endpoint_slice": {"namespace": "sandbox", "name": "stale-api-cdefg"},
            "address_type": "IPv4",
            "endpoint_count": 0,
            "ready_endpoint_count": 0,
            "not_ready_endpoint_count": 0,
            "unknown_ready_endpoint_count": 0,
            "serving_endpoint_count": 0,
            "terminating_endpoint_count": 0,
        },
    ]
    assert "10.0.0.1" not in str(change_context["endpoint_slice_ready_endpoints"])
    assert "billing-api-pod-1" not in str(change_context["endpoint_slice_ready_endpoints"])
    assert change_context["resource_quotas"] == [
        {
            "name": "compute-quota",
            "namespace": "sandbox",
            "hard": {
                "requests.cpu": "4",
                "requests.memory": "8Gi",
                "pods": "20",
            },
            "used": {
                "requests.cpu": "1200m",
                "requests.memory": "1Gi",
                "pods": "5",
            },
        }
    ]
    assert change_context["referenced_config_objects"] == [
        {
            "kind": "ConfigMap",
            "namespace": "sandbox",
            "name": "checkout-config",
            "exists": True,
            "access": "ok",
            "referenced_by": [
                {
                    "container_name": "app",
                    "source": "env",
                    "env_name": "APP_MODE",
                    "key": "mode",
                    "optional": False,
                },
                {
                    "container_name": "app",
                    "source": "env",
                    "env_name": "MISSING_MODE",
                    "key": "missing-mode",
                    "optional": False,
                },
                {
                    "source": "volume",
                    "volume_name": "app-config",
                    "optional": False,
                },
                {
                    "container_name": "app",
                    "source": "volume_mount",
                    "volume_name": "app-config",
                    "mount_path": "/etc/app",
                    "read_only": True,
                    "optional": False,
                },
            ],
            "created_at": "2026-07-10T08:30:00Z",
            "labels": {"app": "checkout-api"},
            "referenced_key_checks": [
                {
                    "key": "application.yaml",
                    "exists": True,
                    "sources": ["volume"],
                },
                {
                    "key": "missing-mode",
                    "exists": False,
                    "sources": ["env"],
                },
                {
                    "key": "mode",
                    "exists": True,
                    "sources": ["env"],
                },
            ],
        },
        {
            "kind": "ConfigMap",
            "namespace": "sandbox",
            "name": "checkout-env",
            "exists": False,
            "access": "not_found",
            "referenced_by": [
                {
                    "container_name": "app",
                    "source": "env_from",
                    "prefix": "APP_",
                    "optional": False,
                }
            ],
        },
        {
            "kind": "Secret",
            "namespace": "sandbox",
            "name": "checkout-env-secret",
            "exists": None,
            "access": "forbidden",
            "referenced_by": [
                {
                    "container_name": "app",
                    "source": "env_from",
                    "optional": True,
                }
            ],
        },
        {
            "kind": "Secret",
            "namespace": "sandbox",
            "name": "checkout-secret",
            "exists": True,
            "access": "ok",
            "referenced_by": [
                {
                    "container_name": "app",
                    "source": "env",
                    "env_name": "DATABASE_URL",
                    "key": "database-url",
                    "optional": True,
                },
                {
                    "source": "volume",
                    "volume_name": "app-secret",
                    "optional": True,
                },
                {
                    "container_name": "app",
                    "source": "volume_mount",
                    "volume_name": "app-secret",
                    "mount_path": "/etc/secret",
                    "read_only": True,
                    "optional": True,
                },
            ],
            "created_at": "2026-07-10T08:31:00Z",
            "labels": {"app": "checkout-api"},
            "referenced_key_checks": [
                {
                    "key": "database-url",
                    "exists": True,
                    "sources": ["env", "volume"],
                }
            ],
        },
    ]
    assert "do-not-include" not in str(change_context["referenced_config_objects"])
    assert "annotations" not in str(change_context["referenced_config_objects"])
    assert "stringData" not in str(change_context["referenced_config_objects"])
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
        "kubectl.kubernetes.io/last-applied-configuration" not in snapshot["deployment_annotations"]
    )
    assert snapshot["pod_template_labels"] == {"app": "checkout-api"}
    assert snapshot["pod_template_auth"] == {
        "service_account_name": "checkout-api-sa",
        "automount_service_account_token": False,
        "image_pull_secret_refs": [{"name": "registry-credentials"}],
    }
    assert snapshot["pod_template_annotations"] == {
        "prometheus.io/path": "/metrics",
        "prometheus.io/scrape": "true",
    }
    assert snapshot["persistent_volume_claim_refs"] == [
        {
            "volume_name": "checkout-data",
            "claim_name": "checkout-data-pvc",
        }
    ]
    assert "secret.example.com/name" not in snapshot["pod_template_annotations"]
    assert snapshot["managed_fields_managers"] == [
        "helm",
        "kube-controller-manager",
    ]
    assert snapshot["scheduling_constraints"] == {
        "node_selector": {
            "disk": "ssd",
            "workload": "checkout",
        },
        "tolerations": [
            {
                "key": "dedicated",
                "operator": "Equal",
                "value": "checkout",
                "effect": "NoSchedule",
                "toleration_seconds": 300,
            }
        ],
        "affinity_summary": {
            "has_node_affinity": True,
            "has_required_node_affinity": True,
            "has_preferred_node_affinity": True,
            "has_pod_affinity": False,
            "has_pod_anti_affinity": True,
        },
    }
    assert "do-not-include" not in str(snapshot["scheduling_constraints"])
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
    assert snapshot["containers"][0]["ports"] == [
        {
            "name": "http",
            "container_port": 8080,
            "protocol": "TCP",
        }
    ]
    assert "hostPort" not in str(snapshot["containers"][0]["ports"])
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
        {
            "env_name": "MISSING_MODE",
            "source": "config_map_key_ref",
            "config_map_name": "checkout-config",
            "key": "missing-mode",
            "optional": False,
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
        if request.url.path == "/api/v1/namespaces/target/resourcequotas":
            return httpx.Response(403, json={"message": "forbidden"})
        if request.url.path == "/apis/discovery.k8s.io/v1/namespaces/target/endpointslices":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "target",
                                "name": "worker-abcde",
                                "labels": {"kubernetes.io/service-name": "worker"},
                            },
                            "addressType": "IPv4",
                            "endpoints": [
                                {
                                    "conditions": {"ready": True},
                                    "targetRef": {
                                        "kind": "Pod",
                                        "namespace": "target",
                                        "name": "worker-pod-1",
                                    },
                                }
                            ],
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
        "/api/v1/namespaces/target/resourcequotas",
        "/apis/discovery.k8s.io/v1/namespaces/target/endpointslices",
    ]
    assert metadata["change_context"] == {
        "current_workload_snapshots": [],
        "service_selector_matches": [
            {
                "service": {"namespace": "target", "name": "worker"},
                "selector": {"app": "worker"},
                "match_status": "matched",
                "matched_pod_count": 1,
                "matched_pods": [{"namespace": "target", "name": "worker-pod-1"}],
            }
        ],
        "endpoint_slice_ready_endpoints": [
            {
                "service": {"namespace": "target", "name": "worker"},
                "endpoint_slice": {"namespace": "target", "name": "worker-abcde"},
                "address_type": "IPv4",
                "endpoint_count": 1,
                "ready_endpoint_count": 1,
                "not_ready_endpoint_count": 0,
                "unknown_ready_endpoint_count": 0,
                "serving_endpoint_count": 1,
                "terminating_endpoint_count": 0,
                "ready_targets": [
                    {
                        "kind": "Pod",
                        "namespace": "target",
                        "name": "worker-pod-1",
                    }
                ],
            }
        ],
        "resource_quotas": [],
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
                                "annotations": {"deployment.kubernetes.io/revision": "2"},
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
                                        "serviceAccountName": "shop-api-sa",
                                        "automountServiceAccountToken": True,
                                        "imagePullSecrets": [{"name": "shop-registry"}],
                                        "volumes": [
                                            {
                                                "name": "shop-config",
                                                "configMap": {
                                                    "name": "shop-config",
                                                },
                                            },
                                            {
                                                "name": "shop-data",
                                                "persistentVolumeClaim": {
                                                    "claimName": "shop-data-pvc"
                                                },
                                            },
                                        ],
                                        "containers": [
                                            {
                                                "name": "app",
                                                "image": "repo/shop:v3",
                                                "ports": [
                                                    {
                                                        "name": "http",
                                                        "containerPort": 8080,
                                                        "protocol": "TCP",
                                                    }
                                                ],
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
                                        ],
                                    },
                                },
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
        if request.url.path == "/api/v1/namespaces/target/resourcequotas":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "target",
                                "name": "target-quota",
                            },
                            "status": {
                                "hard": {
                                    "requests.cpu": "8",
                                    "requests.memory": "16Gi",
                                },
                                "used": {
                                    "requests.cpu": "50m",
                                    "requests.memory": "128Mi",
                                },
                            },
                        }
                    ]
                },
            )
        if request.url.path == "/apis/discovery.k8s.io/v1/namespaces/target/endpointslices":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "target",
                                "name": "shop-api-abcde",
                                "labels": {"kubernetes.io/service-name": "shop-api"},
                            },
                            "addressType": "IPv4",
                            "ports": [
                                {
                                    "name": "http",
                                    "port": 8080,
                                    "protocol": "TCP",
                                    "appProtocol": "http",
                                }
                            ],
                            "endpoints": [
                                {
                                    "conditions": {
                                        "ready": True,
                                        "serving": True,
                                    },
                                    "targetRef": {
                                        "kind": "Pod",
                                        "namespace": "target",
                                        "name": "shop-api-pod-1",
                                    },
                                }
                            ],
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
        "/api/v1/namespaces/target/resourcequotas",
        "/apis/discovery.k8s.io/v1/namespaces/target/endpointslices",
    ]
    assert "current_workload_snapshot" not in change_context
    assert change_context["service_selector_matches"] == [
        {
            "service": {"namespace": "target", "name": "shop-api"},
            "selector": {"app": "shop-api"},
            "match_status": "matched",
            "matched_pod_count": 1,
            "matched_pods": [{"namespace": "target", "name": "shop-api-pod-1"}],
        }
    ]
    assert change_context["endpoint_slice_ready_endpoints"] == [
        {
            "service": {"namespace": "target", "name": "shop-api"},
            "endpoint_slice": {"namespace": "target", "name": "shop-api-abcde"},
            "address_type": "IPv4",
            "ports": [
                {
                    "name": "http",
                    "port": 8080,
                    "protocol": "TCP",
                    "app_protocol": "http",
                }
            ],
            "endpoint_count": 1,
            "ready_endpoint_count": 1,
            "not_ready_endpoint_count": 0,
            "unknown_ready_endpoint_count": 0,
            "serving_endpoint_count": 1,
            "terminating_endpoint_count": 0,
            "ready_targets": [
                {
                    "kind": "Pod",
                    "namespace": "target",
                    "name": "shop-api-pod-1",
                }
            ],
        }
    ]
    assert change_context["resource_quotas"] == [
        {
            "name": "target-quota",
            "namespace": "target",
            "hard": {
                "requests.cpu": "8",
                "requests.memory": "16Gi",
            },
            "used": {
                "requests.cpu": "50m",
                "requests.memory": "128Mi",
            },
        }
    ]
    assert snapshot["workload"] == {
        "kind": "Deployment",
        "namespace": "target",
        "name": "shop-api",
    }
    assert snapshot["deployment_labels"] == {"app": "shop-api"}
    assert snapshot["pod_template_labels"] == {"app": "shop-api"}
    assert snapshot["pod_template_auth"] == {
        "service_account_name": "shop-api-sa",
        "automount_service_account_token": True,
        "image_pull_secret_refs": [{"name": "shop-registry"}],
    }
    assert snapshot["persistent_volume_claim_refs"] == [
        {
            "volume_name": "shop-data",
            "claim_name": "shop-data-pvc",
        }
    ]
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
    assert snapshot["containers"][0]["ports"] == [
        {
            "name": "http",
            "container_port": 8080,
            "protocol": "TCP",
        }
    ]
    assert snapshot["containers"][0]["resources"] == {"requests": {"cpu": "50m", "memory": "128Mi"}}
    assert "env_refs" not in snapshot["containers"][0]
    assert "env_from_refs" not in snapshot["containers"][0]
    assert "volume_mount_refs" not in snapshot["containers"][0]
    assert "scheduling_constraints" not in snapshot
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
