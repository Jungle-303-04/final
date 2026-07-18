from __future__ import annotations

from typing import Any

import pytest

from domains.inventory.provider_detail import (
    MAX_COLLECTION_ITEMS,
    MAX_PROMETHEUS_RULES,
    MAX_SBOM_COMPONENTS,
    MAX_VULNERABILITIES,
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


@pytest.mark.parametrize(
    ("kind", "api_version", "raw", "detail_type"),
    [
        (
            "EC2NodeClass",
            "karpenter.k8s.aws/v1",
            {
                "spec": {
                    "role": "KarpenterNodeRole",
                    "amiFamily": "AL2023",
                    "amiSelectorTerms": [{"alias": "al2023@latest"}],
                    "blockDeviceMappings": [
                        {
                            "deviceName": "/dev/xvda",
                            "ebs": {
                                "volumeType": "gp3",
                                "volumeSize": "100Gi",
                                "iops": 3000,
                                "throughput": 125,
                                "encrypted": True,
                                "deleteOnTermination": True,
                            },
                        }
                    ],
                    "tags": {"team": "platform"},
                },
                "status": {
                    "instanceProfile": "nodes",
                    "amis": [{"id": "ami-123", "name": "al2023"}],
                    "subnets": [{"id": "subnet-a", "zone": "ap-northeast-2a"}],
                    "securityGroups": [{"id": "sg-a", "name": "nodes"}],
                    "conditions": [{"type": "Ready", "status": "True"}],
                },
            },
            "karpenter-ec2-node-class",
        ),
        (
            "NodeClaim",
            "karpenter.sh/v1",
            {
                "metadata": {
                    "labels": {
                        "karpenter.sh/capacity-type": "spot",
                        "karpenter.sh/nodepool": "general",
                        "topology.kubernetes.io/zone": "ap-northeast-2a",
                        "kubernetes.io/arch": "arm64",
                    }
                },
                "spec": {
                    "requirements": [
                        {
                            "key": "node.kubernetes.io/instance-type",
                            "operator": "In",
                            "values": ["m7g.large"],
                        }
                    ],
                    "nodeClassRef": {
                        "group": "karpenter.k8s.aws",
                        "kind": "EC2NodeClass",
                        "name": "default",
                    },
                    "expireAfter": "720h",
                },
                "status": {
                    "nodeName": "ip-10-0-0-1",
                    "imageID": "ami-123",
                    "capacity": {"cpu": "2", "memory": "8Gi", "pods": "29"},
                    "conditions": [
                        {"type": "Launched", "status": "True"},
                        {"type": "Registered", "status": "True"},
                    ],
                },
            },
            "karpenter-node-claim",
        ),
        (
            "NodePool",
            "karpenter.sh/v1",
            {
                "spec": {
                    "limits": {"cpu": "100", "memory": "400Gi"},
                    "weight": 50,
                    "disruption": {
                        "consolidationPolicy": "WhenEmptyOrUnderutilized",
                        "consolidateAfter": "5m",
                        "budgets": [{"nodes": "10%", "duration": "2h"}],
                    },
                    "template": {
                        "metadata": {"labels": {"team": "platform"}},
                        "spec": {
                            "nodeClassRef": {
                                "group": "karpenter.k8s.aws",
                                "kind": "EC2NodeClass",
                                "name": "default",
                            },
                            "requirements": [
                                {
                                    "key": "kubernetes.io/arch",
                                    "operator": "In",
                                    "values": ["arm64"],
                                }
                            ],
                        },
                    },
                },
                "status": {
                    "resources": {"cpu": "24", "memory": "96Gi"},
                    "conditions": [{"type": "Ready", "status": "True"}],
                },
            },
            "karpenter-node-pool",
        ),
        (
            "ScaledObject",
            "keda.sh/v1alpha1",
            {
                "metadata": {"namespace": "shop"},
                "spec": {
                    "scaleTargetRef": {"kind": "Deployment", "name": "api"},
                    "minReplicaCount": 1,
                    "maxReplicaCount": 20,
                    "pollingInterval": 15,
                    "cooldownPeriod": 60,
                    "triggers": [
                        {
                            "type": "rabbitmq",
                            "name": "orders",
                            "metadata": {"queueName": "orders"},
                            "authenticationRef": {
                                "kind": "TriggerAuthentication",
                                "name": "rabbitmq",
                            },
                        }
                    ],
                },
                "status": {
                    "hpaName": "keda-hpa-api",
                    "conditions": [{"type": "Active", "status": "True"}],
                },
            },
            "keda-scaled-object",
        ),
        (
            "ScaledJob",
            "keda.sh/v1alpha1",
            {
                "metadata": {"namespace": "batch"},
                "spec": {
                    "jobTargetRef": {"name": "worker"},
                    "scalingStrategy": {"strategy": "accurate"},
                    "maxReplicaCount": 10,
                    "triggers": [{"type": "kafka", "metadata": {"topic": "jobs"}}],
                },
                "status": {
                    "conditions": [
                        {"type": "Ready", "status": "True"},
                        {"type": "Active", "status": "False"},
                    ]
                },
            },
            "keda-scaled-job",
        ),
        (
            "PrometheusRule",
            "monitoring.coreos.com/v1",
            {
                "spec": {
                    "groups": [
                        {
                            "name": "api",
                            "interval": "30s",
                            "rules": [
                                {
                                    "alert": "HighErrorRate",
                                    "expr": "rate(http_errors_total[5m]) > 0.05",
                                    "for": "10m",
                                    "labels": {"severity": "critical"},
                                    "annotations": {"summary": "API error rate is high"},
                                },
                                {
                                    "record": "api:http_requests:rate5m",
                                    "expr": "rate(http_requests_total[5m])",
                                },
                            ],
                        }
                    ]
                }
            },
            "prometheus-rule",
        ),
        (
            "TCPRoute",
            "gateway.networking.k8s.io/v1alpha2",
            {
                "metadata": {"namespace": "network"},
                "spec": {
                    "parentRefs": [{"name": "public"}],
                    "rules": [{"backendRefs": [{"name": "tcp-api", "port": 9000}]}],
                },
            },
            "tcp-route",
        ),
        (
            "TLSRoute",
            "gateway.networking.k8s.io/v1alpha2",
            {
                "metadata": {"namespace": "network"},
                "spec": {
                    "hostnames": ["tls.example.test"],
                    "rules": [{"backendRefs": [{"name": "tls-api", "port": 9443}]}],
                },
            },
            "tls-route",
        ),
    ],
)
def test_provider_detail_projects_karpenter_keda_prometheus_and_simple_routes(
    kind: str,
    api_version: str,
    raw: dict[str, Any],
    detail_type: str,
) -> None:
    detail = provider_detail_projection(resource(kind, raw, api_version=api_version))

    assert detail is not None
    assert detail.type == detail_type
    assert "raw" not in detail.model_dump()


def test_dynamic_extension_projection_redacts_untyped_secret_values() -> None:
    node_class = provider_detail_projection(
        resource(
            "EC2NodeClass",
            {
                "spec": {
                    "amiSelectorTerms": [
                        {
                            "alias": "al2023@latest",
                            "userData": "must-not-leak-user-data",
                        }
                    ],
                    "blockDeviceMappings": [
                        {
                            "ebs": {
                                "volumeType": "gp3",
                                "kmsKeyID": "must-not-leak-kms-key",
                            }
                        }
                    ],
                    "tags": {
                        "team": "platform",
                        "password": "must-not-leak-tag-value",
                    },
                }
            },
            api_version="karpenter.k8s.aws/v1",
        )
    )
    scaled_object = provider_detail_projection(
        resource(
            "ScaledObject",
            {
                "spec": {
                    "triggers": [
                        {
                            "type": "rabbitmq",
                            "metadata": {
                                "queueName": "orders",
                                "authToken": "must-not-leak-trigger-token",
                                "connectionString": "must-not-leak-connection",
                            },
                        }
                    ]
                }
            },
            api_version="keda.sh/v1alpha1",
        )
    )
    prometheus_rule = provider_detail_projection(
        resource(
            "PrometheusRule",
            {
                "spec": {
                    "groups": [
                        {
                            "name": "api",
                            "rules": [
                                {
                                    "alert": "HighErrorRate",
                                    "expr": "vector(1)",
                                    "labels": {
                                        "severity": "critical",
                                        "apiKey": "must-not-leak-label",
                                    },
                                }
                            ],
                        }
                    ]
                }
            },
            api_version="monitoring.coreos.com/v1",
        )
    )

    serialized = " ".join(
        detail.model_dump_json()
        for detail in (node_class, scaled_object, prometheus_rule)
        if detail is not None
    )
    assert "must-not-leak" not in serialized
    assert "queueName" in serialized
    assert "authToken" not in serialized


def test_prometheus_rule_projection_applies_one_global_rule_budget() -> None:
    detail = provider_detail_projection(
        resource(
            "PrometheusRule",
            {
                "spec": {
                    "groups": [
                        {
                            "name": f"group-{group}",
                            "rules": [
                                {"record": f"metric_{group}_{rule}", "expr": "vector(1)"}
                                for rule in range(MAX_COLLECTION_ITEMS)
                            ],
                        }
                        for group in range(10)
                    ]
                }
            },
            api_version="monitoring.coreos.com/v1",
        )
    )

    assert detail is not None
    assert detail.type == "prometheus-rule"
    assert detail.total_rules == 1_000
    assert detail.projected_rules == MAX_PROMETHEUS_RULES
    assert detail.truncated is True
    assert sum(len(group.rules) for group in detail.groups) == MAX_PROMETHEUS_RULES


def test_trivy_report_projection_redacts_open_fields_and_unsafe_urls() -> None:
    sbom = provider_detail_projection(
        resource(
            "SbomReport",
            {
                "metadata": {
                    "labels": {"trivy-operator.container.name": "api"},
                },
                "report": {
                    "artifact": {"repository": "platform/api", "tag": "1.2.3"},
                    "registry": {"server": "registry.example.test"},
                    "scanner": {"name": "Trivy", "version": "0.64.1"},
                    "summary": {"componentsCount": 2, "dependenciesCount": 1},
                    "components": {
                        "bomFormat": "CycloneDX",
                        "specVersion": "1.6",
                        "components": [
                            {
                                "name": "fastapi",
                                "version": "0.116.0",
                                "type": "library",
                                "purl": "pkg:pypi/fastapi@0.116.0?repository_url=https://user:must-not-leak@example.test",
                                "licenses": [{"license": {"id": "MIT"}}],
                                "properties": {"token": "must-not-leak-component"},
                            },
                            {
                                "name": "uvicorn",
                                "version": "0.35.0",
                                "type": "library",
                            },
                        ],
                    },
                },
            },
            api_version="aquasecurity.github.io/v1alpha1",
        )
    )
    vulnerability = provider_detail_projection(
        resource(
            "VulnerabilityReport",
            {
                "metadata": {
                    "labels": {"trivy-operator.container.name": "api"},
                },
                "report": {
                    "artifact": {"repository": "platform/api", "tag": "1.2.3"},
                    "registry": {"server": "https://registry.example.test"},
                    "summary": {"criticalCount": 1, "highCount": 1},
                    "vulnerabilities": [
                        {
                            "vulnerabilityID": "CVE-2026-0001",
                            "severity": "CRITICAL",
                            "score": 9.8,
                            "resource": "openssl",
                            "installedVersion": "3.0.1",
                            "fixedVersion": "3.0.2",
                            "primaryLink": "https://security.example.test/CVE-2026-0001",
                            "title": "must-not-leak-title",
                            "description": "must-not-leak-description",
                        },
                        {
                            "vulnerabilityID": "CVE-2026-0002",
                            "severity": "HIGH",
                            "primaryLink": "https://user:must-not-leak@example.test/CVE-2026-0002",
                        },
                    ],
                },
            },
            api_version="aquasecurity.github.io/v1alpha1",
        )
    )

    assert sbom is not None
    assert sbom.type == "sbom-report"
    assert sbom.image == "registry.example.test/platform/api:1.2.3"
    assert sbom.components[0].package_url == "pkg:pypi/fastapi@0.116.0"
    assert sbom.components[0].package_url_qualifiers_redacted is True
    assert vulnerability is not None
    assert vulnerability.type == "vulnerability-report"
    assert vulnerability.vulnerabilities[0].primary_link == (
        "https://security.example.test/CVE-2026-0001"
    )
    assert vulnerability.vulnerabilities[1].primary_link is None
    serialized = f"{sbom.model_dump_json()} {vulnerability.model_dump_json()}"
    assert "must-not-leak" not in serialized
    assert "description" not in serialized
    assert "raw" not in serialized


def test_trivy_report_projection_applies_global_collection_budgets() -> None:
    sbom = provider_detail_projection(
        resource(
            "ClusterSbomReport",
            {
                "report": {
                    "components": {
                        "components": [
                            {"name": f"component-{index}"}
                            for index in range(MAX_SBOM_COMPONENTS + 7)
                        ]
                    }
                }
            },
            api_version="aquasecurity.github.io/v1alpha1",
        )
    )
    vulnerability = provider_detail_projection(
        resource(
            "VulnerabilityReport",
            {
                "report": {
                    "vulnerabilities": [
                        {
                            "vulnerabilityID": f"CVE-2026-{index:04d}",
                            "severity": "LOW",
                        }
                        for index in range(MAX_VULNERABILITIES + 7)
                    ]
                }
            },
            api_version="aquasecurity.github.io/v1alpha1",
        )
    )

    assert sbom is not None
    assert sbom.type == "sbom-report"
    assert sbom.observed_component_count == MAX_SBOM_COMPONENTS + 7
    assert sbom.projected_component_count == MAX_SBOM_COMPONENTS
    assert sbom.truncated is True
    assert vulnerability is not None
    assert vulnerability.type == "vulnerability-report"
    assert vulnerability.observed_vulnerability_count == MAX_VULNERABILITIES + 7
    assert vulnerability.projected_vulnerability_count == MAX_VULNERABILITIES
    assert vulnerability.truncated is True


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


def test_provider_detail_projects_crossplane_managed_resource_without_values() -> None:
    detail = provider_detail_projection(
        resource(
            "Bucket",
            {
                "metadata": {
                    "annotations": {
                        "crossplane.io/external-name": "observed-bucket",
                        "crossplane.io/paused": "true",
                    }
                },
                "spec": {
                    "providerConfigRef": {"name": "prod"},
                    "forProvider": {
                        "region": "ap-northeast-2",
                        "secretAccessKey": "must-not-project",
                    },
                    "managementPolicies": ["Observe", "Update"],
                    "deletionPolicy": "Orphan",
                },
                "status": {
                    "atProvider": {
                        "arn": "arn:aws:s3:::observed-bucket",
                        "password": "must-not-project",
                    },
                    "conditions": [{"type": "Ready", "status": "True"}],
                },
            },
            api_version="s3.aws.upbound.io/v1beta1",
        )
    )

    assert detail is not None
    assert detail.type == "crossplane-managed-resource"
    assert detail.external_name == "observed-bucket"
    assert detail.paused is True
    assert detail.observed_spec_fields == ["region", "secretAccessKey"]
    assert detail.observed_status_fields == ["arn", "password"]
    serialized = detail.model_dump_json()
    assert "must-not-project" not in serialized
    assert "arn:aws" not in serialized


@pytest.mark.parametrize(
    ("kind", "api_version", "raw", "detail_type"),
    [
        (
            "PersistentVolumeClaim",
            "v1",
            {
                "metadata": {
                    "annotations": {
                        "volume.kubernetes.io/storage-provisioner": "ebs.csi.aws.com",
                        "pv.kubernetes.io/bind-completed": "true",
                    }
                },
                "spec": {
                    "storageClassName": "gp3",
                    "accessModes": ["ReadWriteOnce"],
                    "volumeMode": "Filesystem",
                    "volumeName": "pvc-volume",
                    "resources": {"requests": {"storage": "20Gi"}},
                },
                "status": {
                    "phase": "Bound",
                    "capacity": {"storage": "20Gi"},
                },
            },
            "persistent-volume-claim",
        ),
        (
            "SealedSecret",
            "sealedsecrets.bitnami.com/v1alpha1",
            {
                "metadata": {
                    "name": "database",
                    "annotations": {
                        "sealedsecrets.bitnami.com/namespace-wide": "true",
                    },
                },
                "spec": {
                    "encryptedData": {
                        "password": "encrypted-secret-value",
                        "username": "encrypted-secret-value",
                    },
                    "template": {
                        "type": "Opaque",
                        "metadata": {
                            "labels": {"app": "database"},
                            "annotations": {
                                "description": "database credentials",
                                "token-hint": "must-not-project",
                            },
                        },
                    },
                },
                "status": {
                    "observedGeneration": 3,
                    "conditions": [{"type": "Synced", "status": "True"}],
                },
            },
            "sealed-secret",
        ),
        (
            "Secret",
            "v1",
            {
                "type": "Opaque",
                "immutable": True,
                "data": {
                    "password": "c2VjcmV0",
                    "username": "YWRtaW4=",
                },
            },
            "secret",
        ),
        (
            "SecretStore",
            "external-secrets.io/v1beta1",
            {
                "spec": {
                    "provider": {
                        "aws": {
                            "region": "ap-northeast-2",
                            "service": "SecretsManager",
                            "auth": {
                                "jwt": {
                                    "serviceAccountRef": {
                                        "name": "external-secrets",
                                        "token": "must-not-project",
                                    }
                                }
                            },
                            "secretAccessKey": "must-not-project",
                        }
                    },
                    "retrySettings": {"maxRetries": 5, "retryInterval": "10s"},
                },
                "status": {"conditions": [{"type": "Ready", "status": "True"}]},
            },
            "secret-store",
        ),
    ],
)
def test_provider_detail_projects_storage_and_secret_metadata_without_values(
    kind: str,
    api_version: str,
    raw: dict[str, Any],
    detail_type: str,
) -> None:
    detail = provider_detail_projection(resource(kind, raw, api_version=api_version))

    assert detail is not None
    assert detail.type == detail_type
    serialized = detail.model_dump_json()
    assert "encrypted-secret-value" not in serialized
    assert "c2VjcmV0" not in serialized
    assert "YWRtaW4=" not in serialized
    assert "must-not-project" not in serialized


def test_provider_detail_projects_bounded_workflow_execution_without_retry_false_positive() -> None:
    detail = provider_detail_projection(
        resource(
            "Workflow",
            {
                "metadata": {"name": "retry-workflow", "namespace": "shop"},
                "spec": {
                    "workflowTemplateRef": {"name": "release"},
                    "arguments": {
                        "parameters": [
                            {"name": "environment", "value": "production"},
                            {"name": "token", "value": "must-not-project"},
                        ]
                    },
                },
                "status": {
                    "phase": "Succeeded",
                    "progress": "1/1",
                    "nodes": {
                        "root": {
                            "displayName": "retry-workflow",
                            "type": "Retry",
                            "phase": "Succeeded",
                            "children": ["attempt"],
                        },
                        "attempt": {
                            "displayName": "retry-workflow(0)",
                            "type": "Pod",
                            "phase": "Failed",
                            "message": "first attempt failed",
                        },
                    },
                },
            },
            api_version="argoproj.io/v1alpha1",
        )
    )

    assert detail is not None
    assert detail.type == "workflow"
    assert detail.problem_summaries == []
    assert detail.argument_names == ["environment", "token"]
    assert [node.id for node in detail.execution_nodes] == ["root", "attempt"]
    assert {node.id: node.depth for node in detail.execution_nodes} == {
        "root": 0,
        "attempt": 1,
    }
    assert detail.workflow_template_ref is not None
    assert detail.workflow_template_ref.name == "release"
    assert "production" not in detail.model_dump_json()
    assert "must-not-project" not in detail.model_dump_json()


def test_provider_detail_bounds_workflow_failure_summaries() -> None:
    detail = provider_detail_projection(
        resource(
            "Workflow",
            {
                "status": {
                    "phase": "Failed",
                    "message": "workflow failed",
                    "nodes": {
                        "root": {
                            "displayName": "prepare",
                            "type": "Pod",
                            "phase": "Failed",
                            "message": "x" * 500,
                        },
                        "publish": {
                            "displayName": "publish",
                            "type": "Pod",
                            "phase": "Error",
                        },
                    },
                }
            },
            api_version="argoproj.io/v1alpha1",
        )
    )

    assert detail is not None
    assert detail.type == "workflow"
    assert detail.problem_summaries[0] == "workflow failed"
    assert "publish failed" in detail.problem_summaries
    assert all(len(summary) <= 300 for summary in detail.problem_summaries)


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
        ("EC2NodeClass", "attacker.test/v1"),
        ("NodeClaim", "attacker.test/v1"),
        ("NodePool", "attacker.test/v1"),
        ("ScaledObject", "attacker.test/v1"),
        ("ScaledJob", "attacker.test/v1"),
        ("SbomReport", "attacker.test/v1"),
        ("ClusterSbomReport", "attacker.test/v1"),
        ("VulnerabilityReport", "attacker.test/v1"),
        ("PrometheusRule", "attacker.test/v1"),
        ("TCPRoute", "attacker.test/v1"),
        ("TLSRoute", "attacker.test/v1"),
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


@pytest.mark.parametrize(
    ("api_version", "kind", "raw", "detail_type"),
    [
        (
            "apps/v1",
            "DaemonSet",
            {
                "kind": "DaemonSet",
                "desired_replicas": 4,
                "ready_replicas": 3,
                "available_replicas": 3,
                "updated_replicas": 4,
                "unavailable_replicas": 1,
                "strategy_type": "RollingUpdate",
                "max_unavailable": "1",
                "selector": {"matchLabels": {"k8s-app": "aws-node"}},
                "pod_template": {
                    "spec": {
                        "serviceAccountName": "aws-node",
                        "containers": [
                            {
                                "name": "aws-node",
                                "image": "example.invalid/aws-node:v1",
                                "ports": [{"containerPort": 61678, "protocol": "TCP"}],
                                "resources": {"requests": {"cpu": "25m"}},
                            }
                        ],
                    }
                },
                "conditions": [{"type": "Available", "status": "True"}],
            },
            "core-workload",
        ),
        (
            "v1",
            "Pod",
            {
                "phase": "Running",
                "node_name": "worker-a",
                "service_account_name": "checkout",
                "containers": [
                    {
                        "name": "api",
                        "image": "example.invalid/api:v1",
                        "state": "running",
                        "restart_count": 2,
                        "resources": {"limits": {"memory": "256Mi"}},
                    }
                ],
            },
            "core-pod",
        ),
        (
            "v1",
            "Service",
            {
                "type": "LoadBalancer",
                "cluster_ip": "10.0.0.10",
                "external_hosts": ["lb.example.test"],
                "ports": [{"name": "https", "port": 443, "targetPort": 8443}],
                "selector": {"app": "checkout"},
            },
            "core-service",
        ),
        (
            "networking.k8s.io/v1",
            "Ingress",
            {
                "spec": {
                    "ingressClassName": "nginx",
                    "rules": [
                        {
                            "host": "shop.example.test",
                            "http": {
                                "paths": [
                                    {
                                        "path": "/api",
                                        "pathType": "Prefix",
                                        "backend": {
                                            "service": {"name": "checkout", "port": {"number": 80}}
                                        },
                                    }
                                ]
                            },
                        }
                    ],
                    "tls": [{"secretName": "shop-tls", "hosts": ["shop.example.test"]}],
                },
                "status": {"loadBalancer": {"ingress": [{"ip": "203.0.113.10"}]}},
            },
            "core-ingress",
        ),
        (
            "argoproj.io/v1alpha1",
            "Application",
            {
                "spec": {
                    "source": {
                        "repoURL": "https://example.test/repo.git",
                        "path": "deploy",
                        "targetRevision": "main",
                    },
                    "destination": {
                        "server": "https://kubernetes.default.svc",
                        "namespace": "shop",
                    },
                    "syncPolicy": {"automated": {"prune": True, "selfHeal": True}},
                },
                "status": {
                    "sync": {"status": "Synced"},
                    "health": {"status": "Healthy"},
                    "resources": [{"kind": "Deployment"}],
                },
            },
            "argo-application",
        ),
    ],
)
def test_core_resource_projection_matrix(
    api_version: str,
    kind: str,
    raw: dict[str, Any],
    detail_type: str,
) -> None:
    detail = provider_detail_projection(resource(kind, raw, api_version=api_version))

    assert detail is not None
    assert detail.type == detail_type


def test_secret_values_never_enter_core_pod_projection() -> None:
    detail = provider_detail_projection(
        resource(
            "Pod",
            {
                "phase": "Running",
                "containers": [
                    {
                        "name": "api",
                        "image": "example.invalid/api:v1",
                        "env": [{"name": "TOKEN", "value": "must-not-leak"}],
                    }
                ],
            },
            api_version="v1",
        )
    )

    assert detail is not None
    assert "must-not-leak" not in detail.model_dump_json()
