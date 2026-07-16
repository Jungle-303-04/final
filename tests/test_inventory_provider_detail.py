from __future__ import annotations

from typing import Any

import pytest

from domains.inventory.provider_detail import (
    MAX_COLLECTION_ITEMS,
    provider_detail_projection,
)


def resource(
    kind: str, raw: dict[str, Any], *, api_version: str = "infrastructure.cluster.x-k8s.io/v1beta2"
) -> dict[str, Any]:
    return {"api_version": api_version, "kind": kind, "raw": raw}


@pytest.mark.parametrize(
    ("kind", "raw", "detail_type", "expected"),
    [
        (
            "AWSMachine",
            {
                "spec": {
                    "instanceType": "m6i.large",
                    "instanceID": "i-123",
                    "providerID": "aws:///zone/i-123",
                    "iamInstanceProfile": "nodes",
                    "sshKeyName": "ops",
                    "subnet": {"id": "subnet-a"},
                    "cloudInit": {"secureSecretsBackend": "secrets-manager"},
                },
                "status": {
                    "instanceState": "running",
                    "addresses": [{"type": "InternalIP", "address": "10.0.0.2"}],
                    "conditions": [{"type": "Ready", "status": "True"}],
                },
            },
            "aws-machine",
            {"instance_type": "m6i.large", "instance_id": "i-123"},
        ),
        (
            "AWSManagedCluster",
            {
                "spec": {"controlPlaneEndpoint": {"host": "api.example.test", "port": 6443}},
                "status": {"failureDomains": {"a": {}, "b": {}}},
            },
            "aws-managed-cluster",
            {"endpoint": "api.example.test:6443", "failure_domains": ["a", "b"]},
        ),
        (
            "AWSManagedControlPlane",
            {
                "spec": {
                    "eksClusterName": "prod",
                    "region": "ap-northeast-2",
                    "version": "1.33",
                    "endpointAccess": {"public": True, "private": True},
                    "roleName": "control-plane",
                    "identityRef": {"kind": "AWSClusterRoleIdentity", "name": "prod"},
                    "network": {
                        "vpc": {"id": "vpc-a", "cidrBlock": "10.0.0.0/16"},
                        "subnets": [{"id": "subnet-a", "availabilityZone": "a", "isPublic": False}],
                    },
                    "addons": [{"name": "coredns", "version": "v1"}],
                },
                "status": {
                    "addons": [{"name": "coredns", "currentVersion": "v1", "status": "ACTIVE"}],
                    "networkStatus": {
                        "securityGroups": {"control-plane": {"id": "sg-a", "name": "eks"}},
                        "natGatewaysIPs": ["203.0.113.3"],
                    },
                    "failureDomains": {"a": {}},
                },
            },
            "aws-managed-control-plane",
            {"cluster_name": "prod", "endpoint_access": "public-and-private", "vpc_id": "vpc-a"},
        ),
        (
            "AWSManagedMachinePool",
            {
                "spec": {
                    "eksNodegroupName": "workers",
                    "instanceType": "m6i.large",
                    "amiType": "AL2023",
                    "capacityType": "spot",
                    "scaling": {"minSize": 2, "maxSize": 10},
                    "labels": {"role": "worker"},
                },
                "status": {"replicas": 4},
            },
            "aws-managed-machine-pool",
            {"node_group_name": "workers", "scaling": {"minimum": 2, "maximum": 10, "current": 4}},
        ),
        (
            "AzureMachine",
            {
                "spec": {
                    "vmSize": "Standard_D4s_v5",
                    "failureDomain": "1",
                    "osDisk": {"osType": "Linux", "diskSizeGB": 128},
                    "providerID": "azure:///vm-a",
                    "subnetName": "nodes",
                }
            },
            "azure-machine",
            {"vm_size": "Standard_D4s_v5", "os_disk_size_gb": 128},
        ),
        (
            "AzureManagedControlPlane",
            {
                "spec": {
                    "location": "koreacentral",
                    "resourceGroupName": "rg-prod",
                    "version": "1.33",
                    "sku": {"tier": "Standard"},
                    "networkPlugin": "azure",
                    "networkPolicy": "cilium",
                    "apiServerAccessProfile": {
                        "enablePrivateCluster": True,
                        "authorizedIPRanges": ["203.0.113.0/24"],
                    },
                }
            },
            "azure-managed-control-plane",
            {"location": "koreacentral", "private_cluster": True},
        ),
        (
            "AzureManagedMachinePool",
            {
                "spec": {
                    "name": "system",
                    "sku": "Standard_D4s_v5",
                    "mode": "System",
                    "osType": "Linux",
                    "osDiskType": "Managed",
                    "osDiskSizeGB": 128,
                    "scaleSetPriority": "Regular",
                    "maxPods": 60,
                    "scaling": {"minSize": 3, "maxSize": 12},
                    "nodeLabels": {"pool": "system"},
                    "taints": [{"key": "CriticalAddonsOnly", "effect": "NoSchedule"}],
                },
                "status": {"replicas": 5},
            },
            "azure-managed-machine-pool",
            {"pool_name": "system", "scaling": {"minimum": 3, "maximum": 12, "current": 5}},
        ),
    ],
)
def test_provider_detail_projects_only_typed_allow_listed_facts(
    kind: str,
    raw: dict[str, Any],
    detail_type: str,
    expected: dict[str, Any],
) -> None:
    api_version = (
        "controlplane.cluster.x-k8s.io/v1beta2"
        if kind == "AWSManagedControlPlane"
        else "infrastructure.cluster.x-k8s.io/v1beta2"
    )
    detail = provider_detail_projection(resource(kind, raw, api_version=api_version))

    assert detail is not None
    payload = detail.model_dump()
    assert payload["type"] == detail_type
    for key, value in expected.items():
        assert payload[key] == value
    assert "raw" not in payload


@pytest.mark.parametrize(
    ("kind", "raw", "detail_type", "expected"),
    [
        (
            "Cluster",
            {
                "spec": {
                    "paused": True,
                    "topology": {"class": "prod", "version": "v1.33.1"},
                    "controlPlaneEndpoint": {"host": "api.example.test", "port": 6443},
                    "infrastructureRef": {
                        "apiVersion": "infrastructure.cluster.x-k8s.io/v1beta2",
                        "kind": "AWSCluster",
                        "name": "prod",
                    },
                },
                "status": {
                    "phase": "Provisioned",
                    "controlPlane": {"desiredReplicas": 3, "readyReplicas": 2},
                    "workers": {"desiredReplicas": 5, "readyReplicas": 4},
                },
            },
            "capi-cluster",
            {"endpoint": "api.example.test:6443", "provider": "AWS", "paused": True},
        ),
        (
            "KubeadmControlPlane",
            {
                "metadata": {"labels": {"cluster.x-k8s.io/cluster-name": "prod"}},
                "spec": {"version": "v1.33.1", "replicas": 3},
                "status": {"initialized": True, "readyReplicas": 3},
            },
            "capi-kubeadm-control-plane",
            {"cluster_name": "prod", "initialized": True},
        ),
        (
            "MachineDeployment",
            {
                "spec": {
                    "clusterName": "prod",
                    "replicas": 4,
                    "template": {"spec": {"version": "v1.33.1"}},
                    "strategy": {"type": "RollingUpdate", "rollingUpdate": {"maxSurge": "25%"}},
                },
                "status": {"readyReplicas": 3},
            },
            "capi-machine-deployment",
            {"cluster_name": "prod", "max_surge": "25%"},
        ),
        (
            "MachineHealthCheck",
            {
                "spec": {
                    "clusterName": "prod",
                    "selector": {"matchLabels": {"pool": "workers"}},
                    "unhealthyConditions": [{"type": "Ready", "status": "False", "timeout": "5m"}],
                },
                "status": {"expectedMachines": 4, "currentHealthy": 3},
            },
            "capi-machine-health-check",
            {"expected_machines": 4, "current_healthy": 3},
        ),
        (
            "MachinePool",
            {"spec": {"clusterName": "prod", "replicas": 5}, "status": {"readyReplicas": 4}},
            "capi-machine-pool",
            {
                "cluster_name": "prod",
                "replicas": {"desired": 5, "ready": 4, "available": None, "up_to_date": None},
            },
        ),
        (
            "Machine",
            {
                "metadata": {
                    "labels": {
                        "cluster.x-k8s.io/cluster-name": "prod",
                        "cluster.x-k8s.io/control-plane": "",
                    }
                },
                "spec": {"providerID": "aws:///ap-northeast-2a/i-123", "version": "v1.33.1"},
                "status": {"nodeRef": {"name": "node-a", "uid": "uid-a"}},
            },
            "capi-machine",
            {"role": "control-plane", "provider_region": "ap-northeast-2a", "node_name": "node-a"},
        ),
        (
            "MachineSet",
            {
                "spec": {"clusterName": "prod", "deletePolicy": "Newest", "replicas": 2},
                "status": {"readyReplicas": 2},
            },
            "capi-machine-set",
            {"cluster_name": "prod", "delete_policy": "Newest"},
        ),
    ],
)
def test_provider_detail_projects_capi_resources(
    kind: str,
    raw: dict[str, Any],
    detail_type: str,
    expected: dict[str, Any],
) -> None:
    group = "controlplane.cluster.x-k8s.io" if kind == "KubeadmControlPlane" else "cluster.x-k8s.io"
    detail = provider_detail_projection(resource(kind, raw, api_version=f"{group}/v1beta2"))

    assert detail is not None
    payload = detail.model_dump()
    assert payload["type"] == detail_type
    for key, value in expected.items():
        assert payload[key] == value
    assert "raw" not in payload


@pytest.mark.parametrize(
    ("kind", "api_version", "raw", "detail_type", "expected"),
    [
        (
            "Certificate",
            "cert-manager.io/v1",
            {
                "spec": {
                    "secretName": "api-tls",
                    "dnsNames": ["api.example.test"],
                    "issuerRef": {
                        "group": "cert-manager.io",
                        "kind": "ClusterIssuer",
                        "name": "prod",
                    },
                    "privateKey": {"algorithm": "ECDSA", "size": 256},
                },
                "status": {
                    "revision": 3,
                    "notAfter": "2026-08-15T00:00:00Z",
                    "conditions": [{"type": "Ready", "status": "True"}],
                },
            },
            "certificate",
            {"secret_name": "api-tls", "ready": True, "revision": 3},
        ),
        (
            "CertificateRequest",
            "cert-manager.io/v1",
            {
                "metadata": {
                    "ownerReferences": [
                        {"apiVersion": "cert-manager.io/v1", "kind": "Certificate", "name": "api"}
                    ]
                },
                "spec": {
                    "issuerRef": {"group": "cert-manager.io", "kind": "Issuer", "name": "prod"},
                    "duration": "2160h",
                    "usages": ["server auth"],
                },
                "status": {
                    "certificate": "redacted-pem",
                    "conditions": [
                        {"type": "Approved", "status": "True"},
                        {"type": "Ready", "status": "False", "reason": "Pending"},
                    ],
                },
            },
            "certificate-request",
            {"approved": True, "ready": False, "certificate_issued": True},
        ),
        (
            "ClusterComplianceReport",
            "aquasecurity.github.io/v1alpha1",
            {
                "spec": {
                    "compliance": {
                        "id": "cis",
                        "title": "CIS Kubernetes",
                        "controls": [
                            {
                                "id": "1.1",
                                "description": "Protect API server",
                                "checks": [{"id": "AVD-KCV-0001"}],
                            }
                        ],
                    }
                },
                "status": {
                    "summary": {"passCount": 4, "failCount": 1},
                    "summaryReport": {
                        "controlCheck": [
                            {
                                "id": "1.1",
                                "name": "API server",
                                "severity": "HIGH",
                                "totalPass": 4,
                                "totalFail": 1,
                            }
                        ]
                    },
                },
            },
            "cluster-compliance-report",
            {"framework_id": "cis", "pass_count": 4, "fail_count": 1},
        ),
        (
            "CronWorkflow",
            "argoproj.io/v1alpha1",
            {
                "spec": {
                    "schedules": ["0 2 * * *"],
                    "timezone": "Asia/Seoul",
                    "suspend": False,
                    "workflowSpec": {
                        "entrypoint": "backup",
                        "templates": [{"name": "backup"}],
                        "workflowTemplateRef": {"name": "backup-template", "clusterScope": True},
                    },
                },
                "status": {"active": [{"name": "backup-123", "namespace": "ops"}]},
            },
            "cron-workflow",
            {"schedules": ["0 2 * * *"], "entrypoint": "backup", "template_count": 1},
        ),
        (
            "ExternalSecret",
            "external-secrets.io/v1beta1",
            {
                "metadata": {"name": "api-secret"},
                "spec": {
                    "secretStoreRef": {"name": "vault", "kind": "ClusterSecretStore"},
                    "refreshInterval": "1h",
                    "target": {"name": "api", "creationPolicy": "Owner"},
                    "data": [
                        {
                            "secretKey": "TOKEN",
                            "remoteRef": {"key": "prod/api", "property": "token"},
                        }
                    ],
                },
                "status": {
                    "refreshTime": "2026-07-16T00:00:00Z",
                    "conditions": [{"type": "Ready", "status": "True"}],
                },
            },
            "external-secret",
            {"ready": True, "target_name": "api", "store_name": "vault"},
        ),
        (
            "GatewayClass",
            "gateway.networking.k8s.io/v1",
            {
                "spec": {
                    "controllerName": "example.test/gateway-controller",
                    "parametersRef": {
                        "group": "example.test",
                        "kind": "GatewayConfig",
                        "name": "prod",
                    },
                },
                "status": {"conditions": [{"type": "Accepted", "status": "True"}]},
            },
            "gateway-class",
            {"controller_name": "example.test/gateway-controller", "accepted": True},
        ),
    ],
)
def test_provider_detail_projects_operational_extension_resources(
    kind: str,
    api_version: str,
    raw: dict[str, Any],
    detail_type: str,
    expected: dict[str, Any],
) -> None:
    detail = provider_detail_projection(resource(kind, raw, api_version=api_version))

    assert detail is not None
    payload = detail.model_dump()
    assert payload["type"] == detail_type
    for key, value in expected.items():
        assert payload[key] == value
    assert "raw" not in payload
    assert "redacted-pem" not in str(payload)


@pytest.mark.parametrize(
    ("kind", "api_version", "raw", "detail_type", "expected"),
    [
        (
            "GCPMachine",
            "infrastructure.cluster.x-k8s.io/v1beta1",
            {
                "spec": {
                    "instanceType": "n2-standard-4",
                    "zone": "asia-northeast3-a",
                    "image": "projects/cos-cloud/global/images/cos-stable",
                    "additionalDisks": [
                        {
                            "deviceType": "pd-balanced",
                            "size": 200,
                            "encryptionKey": {"suppliedKey": {"rawKey": "must-not-leak"}},
                        }
                    ],
                },
                "status": {
                    "instanceID": "projects/p/zones/z/instances/node-1",
                    "conditions": [{"type": "Ready", "status": "True"}],
                },
            },
            "gcp-machine",
            {
                "ready": True,
                "instance_type": "n2-standard-4",
                "zone": "asia-northeast3-a",
            },
        ),
        (
            "GCPManagedControlPlane",
            "infrastructure.cluster.x-k8s.io/v1beta1",
            {
                "metadata": {"name": "prod-control-plane"},
                "spec": {
                    "clusterName": "prod",
                    "project": "platform-prod",
                    "location": "asia-northeast3",
                    "releaseChannel": "regular",
                    "enableAutopilot": True,
                    "endpoint": {"host": "34.64.1.2", "port": 443},
                    "clusterNetwork": {
                        "pod": {"cidrBlock": "10.20.0.0/16"},
                        "service": {"cidrBlock": "10.30.0.0/20"},
                        "useIPAliases": True,
                    },
                    "master_authorized_networks_config": {
                        "cidr_blocks": [
                            {
                                "display_name": "office",
                                "cidr_block": "203.0.113.0/24",
                            }
                        ]
                    },
                },
                "status": {
                    "version": "1.33.2-gke.100",
                    "conditions": [{"type": "Ready", "status": "True"}],
                },
            },
            "gcp-managed-control-plane",
            {
                "cluster_name": "prod",
                "version": "1.33.2-gke.100",
                "endpoint": "34.64.1.2",
            },
        ),
        (
            "GCPManagedMachinePool",
            "infrastructure.cluster.x-k8s.io/v1beta1",
            {
                "metadata": {"name": "workers"},
                "spec": {
                    "nodePoolName": "workers",
                    "machineType": "n2-standard-8",
                    "diskType": "pd-balanced",
                    "diskSizeGb": 150,
                    "imageType": "COS_CONTAINERD",
                    "maxPodsPerNode": 64,
                    "scaling": {
                        "enableAutoscaling": True,
                        "minCount": 3,
                        "maxCount": 20,
                    },
                    "management": {"autoRepair": True, "autoUpgrade": False},
                    "nodeLocations": ["asia-northeast3-a", "asia-northeast3-b"],
                    "kubernetesLabels": {"pool": "workers"},
                    "kubernetesTaints": [
                        {"key": "dedicated", "value": "batch", "effect": "NoSchedule"}
                    ],
                },
                "status": {
                    "replicas": 5,
                    "conditions": [{"type": "Ready", "status": "False"}],
                },
            },
            "gcp-managed-machine-pool",
            {
                "node_pool_name": "workers",
                "autoscaling_enabled": True,
                "scaling": {"minimum": 3, "maximum": 20, "current": 5},
            },
        ),
        (
            "GRPCRoute",
            "gateway.networking.k8s.io/v1",
            {
                "metadata": {"namespace": "shop"},
                "spec": {
                    "hostnames": ["grpc.example.test"],
                    "parentRefs": [{"name": "public", "sectionName": "grpc"}],
                    "rules": [
                        {
                            "matches": [
                                {
                                    "method": {
                                        "type": "Exact",
                                        "service": "shop.Inventory",
                                        "method": "Get",
                                    },
                                    "headers": [{"name": "x-tenant", "value": "blue"}],
                                }
                            ],
                            "backendRefs": [{"name": "inventory", "port": 8080, "weight": 100}],
                            "filters": [{"type": "ExtensionRef"}],
                        }
                    ],
                },
                "status": {
                    "parents": [
                        {
                            "parentRef": {"name": "public", "sectionName": "grpc"},
                            "conditions": [
                                {"type": "Accepted", "status": "True"},
                                {"type": "ResolvedRefs", "status": "True"},
                            ],
                        }
                    ]
                },
            },
            "grpc-route",
            {"hostnames": ["grpc.example.test"]},
        ),
        (
            "HTTPRoute",
            "gateway.networking.k8s.io/v1",
            {
                "metadata": {"namespace": "shop"},
                "spec": {
                    "hostnames": ["api.example.test"],
                    "parentRefs": [{"name": "public"}],
                    "rules": [
                        {
                            "matches": [
                                {
                                    "method": "GET",
                                    "path": {
                                        "type": "PathPrefix",
                                        "value": "/inventory",
                                    },
                                    "queryParams": [{"name": "region", "value": "kr"}],
                                    "headers": [
                                        {
                                            "name": "authorization",
                                            "value": "must-not-leak-route-token",
                                        }
                                    ],
                                }
                            ],
                            "backendRefs": [
                                {"name": "inventory", "port": 8080, "weight": 80},
                                {"name": "inventory-canary", "port": 8080, "weight": 20},
                            ],
                            "filters": [
                                {
                                    "type": "RequestHeaderModifier",
                                    "requestHeaderModifier": {
                                        "set": [
                                            {
                                                "name": "x-platform",
                                                "value": "must-not-project",
                                            }
                                        ]
                                    },
                                }
                            ],
                        }
                    ],
                },
                "status": {
                    "parents": [
                        {
                            "parentRef": {"name": "public"},
                            "conditions": [
                                {
                                    "type": "Accepted",
                                    "status": "False",
                                    "reason": "NotAllowedByListeners",
                                }
                            ],
                        }
                    ]
                },
            },
            "http-route",
            {"hostnames": ["api.example.test"]},
        ),
        (
            "Job",
            "batch/v1",
            {
                "spec": {
                    "completions": 4,
                    "parallelism": 2,
                    "backoffLimit": 5,
                    "activeDeadlineSeconds": 600,
                    "ttlSecondsAfterFinished": 3600,
                },
                "status": {
                    "succeeded": 4,
                    "failed": 1,
                    "active": 0,
                    "startTime": "2026-07-16T00:00:00Z",
                    "completionTime": "2026-07-16T00:03:00Z",
                    "conditions": [
                        {
                            "type": "Complete",
                            "status": "True",
                            "reason": "CompletionsReached",
                        }
                    ],
                },
            },
            "job",
            {"state": "completed", "succeeded": 4, "completions": 4},
        ),
    ],
)
def test_provider_detail_projects_gcp_gateway_routes_and_jobs(
    kind: str,
    api_version: str,
    raw: dict[str, Any],
    detail_type: str,
    expected: dict[str, Any],
) -> None:
    detail = provider_detail_projection(resource(kind, raw, api_version=api_version))

    assert detail is not None
    payload = detail.model_dump()
    assert payload["type"] == detail_type
    for key, value in expected.items():
        assert payload[key] == value
    assert "raw" not in payload
    assert "must-not-leak" not in str(payload)
    assert "must-not-leak-route-token" not in str(payload)
    assert "must-not-project" not in str(payload)


def test_gateway_route_projection_bounds_nested_collections() -> None:
    detail = provider_detail_projection(
        resource(
            "HTTPRoute",
            {
                "spec": {
                    "rules": [
                        {
                            "matches": [
                                {"path": {"value": f"/{item}"}}
                                for item in range(MAX_COLLECTION_ITEMS + 20)
                            ],
                            "backendRefs": [
                                {"name": f"service-{item}"}
                                for item in range(MAX_COLLECTION_ITEMS + 20)
                            ],
                        }
                        for _ in range(MAX_COLLECTION_ITEMS + 20)
                    ]
                }
            },
            api_version="gateway.networking.k8s.io/v1",
        )
    )

    assert detail is not None
    assert detail.type == "http-route"
    assert len(detail.rules) == 50
    assert len(detail.rules[0].matches) == 50
    assert len(detail.rules[0].backends) == 50


def test_provider_detail_projects_crossplane_composite_by_bounded_shape() -> None:
    detail = provider_detail_projection(
        resource(
            "Database",
            {
                "metadata": {"annotations": {"crossplane.io/paused": "true"}},
                "spec": {
                    "crossplane": {
                        "compositionRef": {"name": "postgres"},
                        "resourceRefs": [
                            {
                                "apiVersion": "sql.example.test/v1",
                                "kind": "Instance",
                                "namespace": "data",
                                "name": f"db-{index}",
                            }
                            for index in range(MAX_COLLECTION_ITEMS + 5)
                        ],
                    }
                },
                "status": {"conditions": [{"type": "Ready", "status": "False"}]},
            },
            api_version="platform.example.test/v1alpha1",
        )
    )

    assert detail is not None
    assert detail.type == "crossplane-composite"
    assert detail.paused is True
    assert len(detail.composed_resource_refs) == MAX_COLLECTION_ITEMS
    assert detail.composition_ref is not None
    assert detail.composition_ref.name == "postgres"


def test_provider_detail_does_not_misclassify_crossplane_managed_resource() -> None:
    assert (
        provider_detail_projection(
            resource(
                "Bucket",
                {
                    "spec": {
                        "providerConfigRef": {"name": "prod"},
                        "resourceRefs": [],
                    }
                },
                api_version="s3.aws.upbound.io/v1beta1",
            )
        )
        is None
    )


@pytest.mark.parametrize(
    ("kind", "api_version"),
    [
        ("Certificate", "networking.internal.knative.dev/v1alpha1"),
        ("CertificateRequest", "attacker.test/v1"),
        ("ClusterComplianceReport", "attacker.test/v1"),
        ("CronWorkflow", "attacker.test/v1"),
        ("ExternalSecret", "attacker.test/v1"),
        ("GatewayClass", "attacker.test/v1"),
        ("GCPMachine", "attacker.test/v1"),
        ("GCPManagedControlPlane", "controlplane.cluster.x-k8s.io/v1beta1"),
        ("GCPManagedMachinePool", "attacker.test/v1"),
        ("GRPCRoute", "attacker.test/v1"),
        ("HTTPRoute", "attacker.test/v1"),
        ("Job", "attacker.test/v1"),
    ],
)
def test_operational_extension_projectors_reject_kind_collisions(
    kind: str, api_version: str
) -> None:
    assert (
        provider_detail_projection(
            resource(
                kind,
                {"spec": {"controllerName": "must-not-project"}},
                api_version=api_version,
            )
        )
        is None
    )


def test_provider_detail_rejects_kind_collision_outside_exact_api_group() -> None:
    assert (
        provider_detail_projection(
            resource("AWSMachine", {"spec": {"instanceID": "secret"}}, api_version="attacker.io/v1")
        )
        is None
    )
    assert (
        provider_detail_projection(resource("UnknownMachine", {"spec": {"instanceID": "secret"}}))
        is None
    )
    assert provider_detail_projection(resource("AWSMachine", {})) is None
    assert (
        provider_detail_projection(
            resource("AWSManagedControlPlane", {"spec": {"eksClusterName": "wrong-group"}})
        )
        is None
    )


def test_provider_detail_bounds_collections_and_omits_invalid_condition_rows() -> None:
    detail = provider_detail_projection(
        resource(
            "AWSMachine",
            {
                "status": {
                    "addresses": [
                        {"type": "InternalIP", "address": f"10.0.0.{index}"}
                        for index in range(MAX_COLLECTION_ITEMS + 20)
                    ],
                    "conditions": [
                        {"type": "Ready", "status": "True", "message": "observed"},
                        {"type": "Forged", "status": "yes"},
                    ],
                }
            },
        )
    )

    assert detail is not None
    assert len(detail.addresses) == MAX_COLLECTION_ITEMS
    assert [condition.type for condition in detail.conditions] == ["Ready"]
