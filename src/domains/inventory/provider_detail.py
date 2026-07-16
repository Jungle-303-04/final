"""Project allow-listed cloud provider facts from stored Kubernetes observations."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol

from packages.contracts.inventory_provider import (
    AwsAddon,
    AwsMachineProviderDetail,
    AwsManagedClusterProviderDetail,
    AwsManagedControlPlaneProviderDetail,
    AwsManagedMachinePoolProviderDetail,
    AwsSecurityGroup,
    AwsSubnet,
    AzureMachineProviderDetail,
    AzureManagedControlPlaneProviderDetail,
    AzureManagedMachinePoolProviderDetail,
    ProviderAddress,
    ProviderCondition,
    ProviderKeyValue,
    ProviderScaling,
    ProviderTaint,
    ResourceProviderDetail,
)

INFRASTRUCTURE_GROUP = "infrastructure.cluster.x-k8s.io"
CONTROL_PLANE_GROUP = "controlplane.cluster.x-k8s.io"
MAX_COLLECTION_ITEMS = 100
MAX_TEXT_LENGTH = 2_000


class ProviderDetailProjector(Protocol):
    def __call__(self, raw: Mapping[str, Any]) -> ResourceProviderDetail: ...


def provider_detail_projection(resource: Mapping[str, Any]) -> ResourceProviderDetail | None:
    """Return one redacted projection only for an exact supported API-group/kind pair."""
    raw = _mapping(resource.get("raw"))
    if not raw:
        return None
    kind = _text(resource.get("kind")) or ""
    projector = PROVIDER_DETAIL_PROJECTORS.get((_api_group(resource.get("api_version")), kind))
    return projector(raw) if projector is not None else None


def _aws_machine(raw: Mapping[str, Any]) -> AwsMachineProviderDetail:
    return AwsMachineProviderDetail(
        instance_type=_text_at(raw, "spec", "instanceType"),
        instance_id=_text_at(raw, "spec", "instanceID"),
        instance_state=_text_at(raw, "status", "instanceState"),
        provider_id=_text_at(raw, "spec", "providerID"),
        iam_instance_profile=_text_at(raw, "spec", "iamInstanceProfile"),
        ssh_key_name=_text_at(raw, "spec", "sshKeyName"),
        subnet_id=_text_at(raw, "spec", "subnet", "id"),
        secrets_backend=_text_at(raw, "spec", "cloudInit", "secureSecretsBackend"),
        addresses=[
            ProviderAddress(type=address_type, address=value)
            for item in _mapping_items_at(raw, "status", "addresses")
            if (address_type := _text(item.get("type"))) is not None
            and (value := _text(item.get("address"))) is not None
        ],
        conditions=_conditions(raw),
    )


def _aws_managed_cluster(raw: Mapping[str, Any]) -> AwsManagedClusterProviderDetail:
    host = _text_at(raw, "spec", "controlPlaneEndpoint", "host")
    port = _int_at(raw, "spec", "controlPlaneEndpoint", "port")
    endpoint = None if host is None else f"{host}:{port}" if port not in (None, 443) else host
    return AwsManagedClusterProviderDetail(
        endpoint=endpoint,
        failure_domains=_mapping_keys_at(raw, "status", "failureDomains"),
        conditions=_conditions(raw),
    )


def _aws_managed_control_plane(
    raw: Mapping[str, Any],
) -> AwsManagedControlPlaneProviderDetail:
    endpoint_access = _endpoint_access(raw)
    identity_kind = _text_at(raw, "spec", "identityRef", "kind")
    identity_name = _text_at(raw, "spec", "identityRef", "name")
    identity = (
        f"{identity_kind}/{identity_name}"
        if identity_kind is not None and identity_name is not None
        else None
    )
    status_addons = {
        name: item
        for item in _mapping_items_at(raw, "status", "addons")
        if (name := _text(item.get("name"))) is not None
    }
    addons: list[AwsAddon] = []
    for item in _mapping_items_at(raw, "spec", "addons"):
        name = _text(item.get("name"))
        if name is None:
            continue
        current = status_addons.get(name, {})
        addons.append(
            AwsAddon(
                name=name,
                requested_version=_text(item.get("version")),
                current_version=_text(current.get("currentVersion"))
                or _text(current.get("version")),
                status=_text(current.get("status")),
            )
        )
    subnets = [
        AwsSubnet(
            id=_text(item.get("id")) or _text(item.get("resourceID")),
            availability_zone=_text(item.get("availabilityZone")),
            public=_bool(item.get("isPublic")),
            cidr_block=_text(item.get("cidrBlock")),
        )
        for item in _mapping_items_at(raw, "spec", "network", "subnets")
    ]
    security_groups = [
        AwsSecurityGroup(
            role=role,
            id=_text(item.get("id")),
            name=_text(item.get("name")),
        )
        for role, item in _mapping_at(raw, "status", "networkStatus", "securityGroups").items()
        if isinstance(role, str) and isinstance(item, Mapping)
    ][:MAX_COLLECTION_ITEMS]
    return AwsManagedControlPlaneProviderDetail(
        cluster_name=_text_at(raw, "spec", "eksClusterName"),
        region=_text_at(raw, "spec", "region"),
        version=_text_at(raw, "spec", "version"),
        endpoint_access=endpoint_access,
        role_name=_text_at(raw, "spec", "roleName"),
        identity=identity,
        vpc_id=_text_at(raw, "spec", "network", "vpc", "id"),
        vpc_cidr_block=_text_at(raw, "spec", "network", "vpc", "cidrBlock"),
        subnets=subnets,
        security_groups=security_groups,
        nat_gateway_ips=_text_items_at(raw, "status", "networkStatus", "natGatewaysIPs"),
        failure_domains=_mapping_keys_at(raw, "status", "failureDomains"),
        addons=addons,
        conditions=_conditions(raw),
    )


def _aws_managed_machine_pool(
    raw: Mapping[str, Any],
) -> AwsManagedMachinePoolProviderDetail:
    return AwsManagedMachinePoolProviderDetail(
        node_group_name=_text_at(raw, "spec", "eksNodegroupName"),
        instance_type=_text_at(raw, "spec", "instanceType"),
        ami_type=_text_at(raw, "spec", "amiType"),
        capacity_type=_text_at(raw, "spec", "capacityType"),
        role_name=_text_at(raw, "spec", "roleName"),
        scaling=ProviderScaling(
            minimum=_int_at(raw, "spec", "scaling", "minSize"),
            maximum=_int_at(raw, "spec", "scaling", "maxSize"),
            current=_int_at(raw, "status", "replicas"),
        ),
        max_unavailable=_int_at(raw, "spec", "updateConfig", "maxUnavailable"),
        subnet_ids=_text_items_at(raw, "spec", "subnetIDs"),
        labels=_key_values_at(raw, "spec", "labels"),
        conditions=_conditions(raw),
    )


def _azure_machine(raw: Mapping[str, Any]) -> AzureMachineProviderDetail:
    return AzureMachineProviderDetail(
        vm_size=_text_at(raw, "spec", "vmSize"),
        availability_zone=_text_at(raw, "spec", "failureDomain"),
        os_type=_text_at(raw, "spec", "osDisk", "osType"),
        os_disk_size_gb=_int_at(raw, "spec", "osDisk", "diskSizeGB"),
        provider_id=_text_at(raw, "spec", "providerID"),
        subnet_name=_text_at(raw, "spec", "subnetName"),
        conditions=_conditions(raw),
    )


def _azure_managed_control_plane(
    raw: Mapping[str, Any],
) -> AzureManagedControlPlaneProviderDetail:
    return AzureManagedControlPlaneProviderDetail(
        location=_text_at(raw, "spec", "location"),
        resource_group_name=_text_at(raw, "spec", "resourceGroupName"),
        version=_text_at(raw, "spec", "version"),
        sku_tier=_text_at(raw, "spec", "sku", "tier"),
        dns_prefix=_text_at(raw, "spec", "dnsPrefix"),
        subscription_id=_text_at(raw, "spec", "subscriptionID"),
        network_plugin=_text_at(raw, "spec", "networkPlugin"),
        network_policy=_text_at(raw, "spec", "networkPolicy"),
        private_cluster=_bool_at(raw, "spec", "apiServerAccessProfile", "enablePrivateCluster"),
        dns_service_ip=_text_at(raw, "spec", "dnsServiceIP"),
        load_balancer_sku=_text_at(raw, "spec", "loadBalancerSKU"),
        upgrade_channel=_text_at(raw, "spec", "autoUpgradeProfile", "upgradeChannel"),
        authorized_ip_ranges=_text_items_at(
            raw, "spec", "apiServerAccessProfile", "authorizedIPRanges"
        ),
        conditions=_conditions(raw),
    )


def _azure_managed_machine_pool(
    raw: Mapping[str, Any],
) -> AzureManagedMachinePoolProviderDetail:
    taints = [
        ProviderTaint(
            key=key,
            value=_text(item.get("value")),
            effect=_text(item.get("effect")),
        )
        for item in _mapping_items_at(raw, "spec", "taints")
        if (key := _text(item.get("key"))) is not None
    ]
    return AzureManagedMachinePoolProviderDetail(
        pool_name=_text_at(raw, "spec", "name"),
        vm_size=_text_at(raw, "spec", "sku"),
        mode=_text_at(raw, "spec", "mode"),
        os_type=_text_at(raw, "spec", "osType"),
        os_disk_type=_text_at(raw, "spec", "osDiskType"),
        os_disk_size_gb=_int_at(raw, "spec", "osDiskSizeGB"),
        priority=_text_at(raw, "spec", "scaleSetPriority"),
        max_pods=_int_at(raw, "spec", "maxPods"),
        scaling=ProviderScaling(
            minimum=_int_at(raw, "spec", "scaling", "minSize"),
            maximum=_int_at(raw, "spec", "scaling", "maxSize"),
            current=_int_at(raw, "status", "replicas"),
        ),
        scale_down_mode=_text_at(raw, "spec", "scaleDownMode"),
        availability_zones=_text_items_at(raw, "spec", "availabilityZones"),
        labels=_key_values_at(raw, "spec", "nodeLabels"),
        taints=taints,
        conditions=_conditions(raw),
    )


PROVIDER_DETAIL_PROJECTORS: dict[tuple[str, str], ProviderDetailProjector] = {
    (INFRASTRUCTURE_GROUP, "AWSMachine"): _aws_machine,
    (INFRASTRUCTURE_GROUP, "AWSManagedCluster"): _aws_managed_cluster,
    (CONTROL_PLANE_GROUP, "AWSManagedControlPlane"): _aws_managed_control_plane,
    (INFRASTRUCTURE_GROUP, "AWSManagedMachinePool"): _aws_managed_machine_pool,
    (INFRASTRUCTURE_GROUP, "AzureMachine"): _azure_machine,
    (INFRASTRUCTURE_GROUP, "AzureManagedControlPlane"): _azure_managed_control_plane,
    (INFRASTRUCTURE_GROUP, "AzureManagedMachinePool"): _azure_managed_machine_pool,
}


def _conditions(raw: Mapping[str, Any]) -> list[ProviderCondition]:
    items = _mapping_items_at(raw, "status", "v1beta2", "conditions")
    if not items:
        items = _mapping_items_at(raw, "status", "conditions")
    result: list[ProviderCondition] = []
    for item in items:
        condition_type = _text(item.get("type"))
        status = _text(item.get("status"))
        if condition_type is None or status not in {"True", "False", "Unknown"}:
            continue
        result.append(
            ProviderCondition(
                type=condition_type,
                status=status,
                reason=_text(item.get("reason")),
                message=_text(item.get("message")),
                last_transition_time=_text(item.get("lastTransitionTime")),
            )
        )
    return result


def _endpoint_access(
    raw: Mapping[str, Any],
) -> str | None:
    public = _bool_at(raw, "spec", "endpointAccess", "public")
    private = _bool_at(raw, "spec", "endpointAccess", "private")
    if public is True and private is True:
        return "public-and-private"
    if public is True:
        return "public"
    if private is True:
        return "private"
    return None


def _api_group(value: object) -> str:
    text = _text(value) or ""
    return text.split("/", 1)[0] if "/" in text else ""


def _mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _mapping_at(value: Mapping[str, Any], *path: str) -> dict[str, Any]:
    current: object = value
    for key in path:
        if not isinstance(current, Mapping):
            return {}
        current = current.get(key)
    return _mapping(current)


def _value_at(value: Mapping[str, Any], *path: str) -> object:
    current: object = value
    for key in path:
        if not isinstance(current, Mapping):
            return None
        current = current.get(key)
    return current


def _text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized[:MAX_TEXT_LENGTH] if normalized else None


def _text_at(value: Mapping[str, Any], *path: str) -> str | None:
    return _text(_value_at(value, *path))


def _bool(value: object) -> bool | None:
    return value if isinstance(value, bool) else None


def _bool_at(value: Mapping[str, Any], *path: str) -> bool | None:
    return _bool(_value_at(value, *path))


def _int_at(value: Mapping[str, Any], *path: str) -> int | None:
    raw = _value_at(value, *path)
    return raw if isinstance(raw, int) and not isinstance(raw, bool) else None


def _mapping_items_at(value: Mapping[str, Any], *path: str) -> list[dict[str, Any]]:
    raw = _value_at(value, *path)
    if not isinstance(raw, list):
        return []
    return [_mapping(item) for item in raw[:MAX_COLLECTION_ITEMS] if isinstance(item, Mapping)]


def _text_items_at(value: Mapping[str, Any], *path: str) -> list[str]:
    raw = _value_at(value, *path)
    if not isinstance(raw, list):
        return []
    return [text for item in raw[:MAX_COLLECTION_ITEMS] if (text := _text(item)) is not None]


def _mapping_keys_at(value: Mapping[str, Any], *path: str) -> list[str]:
    return sorted(_mapping_at(value, *path))[:MAX_COLLECTION_ITEMS]


def _key_values_at(value: Mapping[str, Any], *path: str) -> list[ProviderKeyValue]:
    result: list[ProviderKeyValue] = []
    for key, raw in sorted(_mapping_at(value, *path).items())[:MAX_COLLECTION_ITEMS]:
        normalized = _text(str(raw)) if isinstance(raw, (str, int, float, bool)) else None
        if normalized is not None:
            result.append(ProviderKeyValue(key=key, value=normalized))
    return result
