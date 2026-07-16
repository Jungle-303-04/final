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
    CapiClusterProviderDetail,
    CapiKubeadmControlPlaneProviderDetail,
    CapiMachineDeploymentProviderDetail,
    CapiMachineHealthCheckProviderDetail,
    CapiMachinePoolProviderDetail,
    CapiMachineProviderDetail,
    CapiMachineSetProviderDetail,
    CapiUnhealthyCondition,
    ProviderAddress,
    ProviderCondition,
    ProviderKeyValue,
    ProviderReference,
    ProviderReplicas,
    ProviderScaling,
    ProviderTaint,
    ResourceProviderDetail,
)

INFRASTRUCTURE_GROUP = "infrastructure.cluster.x-k8s.io"
CONTROL_PLANE_GROUP = "controlplane.cluster.x-k8s.io"
CAPI_GROUP = "cluster.x-k8s.io"
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


def _capi_cluster(raw: Mapping[str, Any]) -> CapiClusterProviderDetail:
    host = _text_at(raw, "spec", "controlPlaneEndpoint", "host")
    port = _int_at(raw, "spec", "controlPlaneEndpoint", "port")
    infrastructure_ref = _reference_at(raw, "spec", "infrastructureRef")
    return CapiClusterProviderDetail(
        phase=_text_at(raw, "status", "phase"),
        version=_text_at(raw, "spec", "topology", "version"),
        cluster_class=_text_at(raw, "spec", "topology", "class"),
        endpoint=None if host is None else f"{host}:{port}" if port is not None else host,
        provider=_provider_from_kind(infrastructure_ref.kind) if infrastructure_ref else None,
        paused=_bool_at(raw, "spec", "paused") is True,
        control_plane=ProviderReplicas(
            desired=_first_present_int(
                _int_at(raw, "status", "controlPlane", "desiredReplicas"),
                _int_at(raw, "spec", "topology", "controlPlane", "replicas"),
            ),
            ready=_int_at(raw, "status", "controlPlane", "readyReplicas"),
            available=_int_at(raw, "status", "controlPlane", "availableReplicas"),
            up_to_date=_int_at(raw, "status", "controlPlane", "upToDateReplicas"),
        ),
        workers=ProviderReplicas(
            desired=_int_at(raw, "status", "workers", "desiredReplicas"),
            ready=_int_at(raw, "status", "workers", "readyReplicas"),
            available=_int_at(raw, "status", "workers", "availableReplicas"),
            up_to_date=_int_at(raw, "status", "workers", "upToDateReplicas"),
        ),
        control_plane_ref=_reference_at(raw, "spec", "controlPlaneRef"),
        infrastructure_ref=infrastructure_ref,
        conditions=_conditions(raw),
    )


def _capi_kubeadm_control_plane(
    raw: Mapping[str, Any],
) -> CapiKubeadmControlPlaneProviderDetail:
    machine_template = _mapping_at(raw, "spec", "machineTemplate")
    remediation = _mapping_at(raw, "status", "lastRemediation")
    initialized = _bool_at(raw, "status", "initialized")
    if initialized is None:
        initialized = _condition_truth(raw, "Initialized")
    return CapiKubeadmControlPlaneProviderDetail(
        cluster_name=_cluster_name(raw),
        version=_text_at(raw, "spec", "version"),
        initialized=initialized,
        update_strategy=(
            "RollingUpdate"
            if _value_at(raw, "spec", "rolloutStrategy") is not None
            or _value_at(raw, "spec", "upgradeAfter") is not None
            else None
        ),
        replicas=_standard_replicas(raw),
        infrastructure_ref=_reference_at(machine_template, "infrastructureRef"),
        node_drain_timeout=_text(machine_template.get("nodeDrainTimeout")),
        node_volume_detach_timeout=_text(machine_template.get("nodeVolumeDetachTimeout")),
        node_deletion_timeout=_text(machine_template.get("nodeDeletionTimeout")),
        certificate_sans=_text_items_at(
            raw,
            "spec",
            "kubeadmConfigSpec",
            "clusterConfiguration",
            "certSANs",
        ),
        remediation_machine=_text(remediation.get("machine")),
        remediation_retry_count=_int(remediation.get("retryCount")),
        remediation_timestamp=_text(remediation.get("timestamp")),
        conditions=_conditions(raw),
    )


def _capi_machine_deployment(raw: Mapping[str, Any]) -> CapiMachineDeploymentProviderDetail:
    template = _mapping_at(raw, "spec", "template", "spec")
    return CapiMachineDeploymentProviderDetail(
        phase=_text_at(raw, "status", "phase"),
        cluster_name=_cluster_name(raw),
        version=_text_at(raw, "spec", "template", "spec", "version"),
        paused=_bool_at(raw, "spec", "paused") is True,
        replicas=_standard_replicas(raw),
        strategy_type=_text_at(raw, "spec", "strategy", "type"),
        max_surge=_scalar_text_at(raw, "spec", "strategy", "rollingUpdate", "maxSurge"),
        max_unavailable=_scalar_text_at(raw, "spec", "strategy", "rollingUpdate", "maxUnavailable"),
        infrastructure_ref=_reference_at(template, "infrastructureRef"),
        bootstrap_ref=_reference_at(template, "bootstrap", "configRef"),
        conditions=_conditions(raw),
    )


def _capi_machine_health_check(raw: Mapping[str, Any]) -> CapiMachineHealthCheckProviderDetail:
    unhealthy = [
        CapiUnhealthyCondition(
            type=condition_type,
            status=_text(item.get("status")),
            timeout=_text(item.get("timeout")),
        )
        for path in (
            ("spec", "unhealthyConditions"),
            ("spec", "unhealthyNodeConditions"),
            ("spec", "unhealthyMachineConditions"),
        )
        for item in _mapping_items_at(raw, *path)
        if (condition_type := _text(item.get("type"))) is not None
    ][:MAX_COLLECTION_ITEMS]
    return CapiMachineHealthCheckProviderDetail(
        cluster_name=_text_at(raw, "spec", "clusterName") or _cluster_name(raw),
        expected_machines=_int_at(raw, "status", "expectedMachines"),
        current_healthy=_int_at(raw, "status", "currentHealthy"),
        remediations_allowed=_int_at(raw, "status", "remediationsAllowed"),
        node_startup_timeout=_text_at(raw, "spec", "nodeStartupTimeout"),
        max_unhealthy=_scalar_text_at(raw, "spec", "maxUnhealthy"),
        unhealthy_range=_text_at(raw, "spec", "unhealthyRange"),
        selector=_key_values_at(raw, "spec", "selector", "matchLabels"),
        unhealthy_conditions=unhealthy,
        remediation_template=_reference_at(raw, "spec", "remediationTemplate"),
        conditions=_conditions(raw),
    )


def _capi_machine_pool(raw: Mapping[str, Any]) -> CapiMachinePoolProviderDetail:
    template = _mapping_at(raw, "spec", "template", "spec")
    return CapiMachinePoolProviderDetail(
        phase=_text_at(raw, "status", "phase"),
        cluster_name=_cluster_name(raw),
        min_ready_seconds=_int_at(raw, "spec", "minReadySeconds"),
        replicas=_standard_replicas(raw),
        infrastructure_ref=_reference_at(template, "infrastructureRef"),
        bootstrap_ref=_reference_at(template, "bootstrap", "configRef"),
        conditions=_conditions(raw),
    )


def _capi_machine(raw: Mapping[str, Any]) -> CapiMachineProviderDetail:
    provider_id = _text_at(raw, "spec", "providerID")
    provider, region, instance_id = _provider_id_parts(provider_id)
    labels = _mapping_at(raw, "metadata", "labels")
    control_plane = (
        "cluster.x-k8s.io/control-plane" in labels
        or _text(labels.get("cluster.x-k8s.io/control-plane-name")) is not None
    )
    return CapiMachineProviderDetail(
        phase=_text_at(raw, "status", "phase"),
        role="control-plane" if control_plane else "worker",
        cluster_name=_cluster_name(raw),
        version=_text_at(raw, "spec", "version"),
        failure_domain=_text_at(raw, "spec", "failureDomain"),
        provider=provider,
        provider_id=provider_id,
        provider_region=region,
        provider_instance_id=instance_id,
        node_name=_text_at(raw, "status", "nodeRef", "name"),
        node_uid=_text_at(raw, "status", "nodeRef", "uid"),
        bootstrap_ref=_reference_at(raw, "spec", "bootstrap", "configRef"),
        infrastructure_ref=_reference_at(raw, "spec", "infrastructureRef"),
        addresses=[
            ProviderAddress(type=address_type, address=address)
            for item in _mapping_items_at(raw, "status", "addresses")
            if (address_type := _text(item.get("type"))) is not None
            and (address := _text(item.get("address"))) is not None
        ],
        os_image=_text_at(raw, "status", "nodeInfo", "osImage"),
        architecture=_text_at(raw, "status", "nodeInfo", "architecture"),
        kernel_version=_text_at(raw, "status", "nodeInfo", "kernelVersion"),
        container_runtime_version=_text_at(raw, "status", "nodeInfo", "containerRuntimeVersion"),
        kubelet_version=_text_at(raw, "status", "nodeInfo", "kubeletVersion"),
        conditions=_conditions(raw),
    )


def _capi_machine_set(raw: Mapping[str, Any]) -> CapiMachineSetProviderDetail:
    template = _mapping_at(raw, "spec", "template", "spec")
    return CapiMachineSetProviderDetail(
        cluster_name=_cluster_name(raw),
        delete_policy=_text_at(raw, "spec", "deletePolicy"),
        min_ready_seconds=_int_at(raw, "spec", "minReadySeconds"),
        replicas=_standard_replicas(raw),
        infrastructure_ref=_reference_at(template, "infrastructureRef"),
        bootstrap_ref=_reference_at(template, "bootstrap", "configRef"),
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
    (CAPI_GROUP, "Cluster"): _capi_cluster,
    (CONTROL_PLANE_GROUP, "KubeadmControlPlane"): _capi_kubeadm_control_plane,
    (CAPI_GROUP, "MachineDeployment"): _capi_machine_deployment,
    (CAPI_GROUP, "MachineHealthCheck"): _capi_machine_health_check,
    (CAPI_GROUP, "MachinePool"): _capi_machine_pool,
    (CAPI_GROUP, "Machine"): _capi_machine,
    (CAPI_GROUP, "MachineSet"): _capi_machine_set,
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
    return _int(raw)


def _int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _first_present_int(*values: int | None) -> int | None:
    return next((value for value in values if value is not None), None)


def _scalar_text_at(value: Mapping[str, Any], *path: str) -> str | None:
    raw = _value_at(value, *path)
    return _text(raw) if isinstance(raw, str) else str(raw) if _int(raw) is not None else None


def _standard_replicas(raw: Mapping[str, Any]) -> ProviderReplicas:
    return ProviderReplicas(
        desired=_int_at(raw, "spec", "replicas"),
        ready=_int_at(raw, "status", "readyReplicas"),
        available=_int_at(raw, "status", "availableReplicas"),
        up_to_date=_int_at(raw, "status", "upToDateReplicas")
        if _int_at(raw, "status", "upToDateReplicas") is not None
        else _int_at(raw, "status", "updatedReplicas"),
    )


def _reference_at(value: Mapping[str, Any], *path: str) -> ProviderReference | None:
    item = _mapping_at(value, *path)
    kind = _text(item.get("kind"))
    name = _text(item.get("name"))
    if kind is None or name is None:
        return None
    return ProviderReference(
        api_version=_text(item.get("apiVersion")),
        kind=kind,
        namespace=_text(item.get("namespace")),
        name=name,
    )


def _cluster_name(raw: Mapping[str, Any]) -> str | None:
    return _text_at(raw, "spec", "clusterName") or _text_at(
        raw, "metadata", "labels", "cluster.x-k8s.io/cluster-name"
    )


def _condition_truth(raw: Mapping[str, Any], condition_type: str) -> bool | None:
    for condition in _conditions(raw):
        if condition.type == condition_type:
            return (
                True
                if condition.status == "True"
                else False
                if condition.status == "False"
                else None
            )
    return None


def _provider_from_kind(kind: str) -> str | None:
    lowered = kind.lower()
    for prefix, label in (
        ("aws", "AWS"),
        ("azure", "Azure"),
        ("gcp", "GCP"),
        ("vsphere", "vSphere"),
        ("docker", "Docker"),
    ):
        if lowered.startswith(prefix):
            return label
    return None


def _provider_id_parts(provider_id: str | None) -> tuple[str | None, str | None, str | None]:
    if provider_id is None:
        return None, None, None
    if provider_id.startswith("aws://"):
        parts = provider_id.removeprefix("aws://").lstrip("/").split("/")
        return "AWS", parts[0] if parts else None, parts[1] if len(parts) > 1 else None
    if provider_id.startswith("gce://"):
        parts = provider_id.removeprefix("gce://").lstrip("/").split("/")
        return "GCP", parts[1] if len(parts) > 1 else None, parts[2] if len(parts) > 2 else None
    if provider_id.startswith("azure://"):
        parts = provider_id.removeprefix("azure://").lstrip("/").split("/")
        resource_group = _path_value(parts, "resourceGroups")
        instance = _path_value(parts, "virtualMachines")
        return "Azure", resource_group, instance
    if provider_id.startswith("vsphere://"):
        return "vSphere", None, provider_id.removeprefix("vsphere://").lstrip("/") or None
    return None, None, None


def _path_value(parts: list[str], marker: str) -> str | None:
    try:
        index = parts.index(marker)
    except ValueError:
        return None
    return parts[index + 1] if index + 1 < len(parts) else None


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
