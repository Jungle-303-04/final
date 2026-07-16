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
