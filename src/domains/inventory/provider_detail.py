"""Project allow-listed cloud provider facts from stored Kubernetes observations."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, Protocol

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
    CertificatePrivateKeyDetail,
    CertificateProviderDetail,
    CertificateRequestProviderDetail,
    ClusterComplianceReportProviderDetail,
    ComplianceControlDetail,
    CronWorkflowProviderDetail,
    CrossplaneCompositeProviderDetail,
    ExternalSecretMappingDetail,
    ExternalSecretProviderDetail,
    ExternalSecretSourceDetail,
    GatewayClassProviderDetail,
    GatewayRouteBackendDetail,
    GatewayRouteFilterDetail,
    GatewayRouteMatchDetail,
    GatewayRouteParentStatusDetail,
    GatewayRouteRuleDetail,
    GcpAdditionalDiskDetail,
    GcpAuthorizedNetworkDetail,
    GcpMachineProviderDetail,
    GcpManagedControlPlaneProviderDetail,
    GcpManagedMachinePoolProviderDetail,
    GrpcRouteProviderDetail,
    HttpRouteProviderDetail,
    JobProviderDetail,
    ProviderAddress,
    ProviderCondition,
    ProviderKeyValue,
    ProviderNamedReference,
    ProviderReference,
    ProviderReplicas,
    ProviderScaling,
    ProviderTaint,
    ResourceProviderDetail,
)

INFRASTRUCTURE_GROUP = "infrastructure.cluster.x-k8s.io"
CONTROL_PLANE_GROUP = "controlplane.cluster.x-k8s.io"
CAPI_GROUP = "cluster.x-k8s.io"
CERT_MANAGER_GROUP = "cert-manager.io"
COMPLIANCE_GROUP = "aquasecurity.github.io"
ARGO_GROUP = "argoproj.io"
EXTERNAL_SECRETS_GROUP = "external-secrets.io"
GATEWAY_GROUP = "gateway.networking.k8s.io"
BATCH_GROUP = "batch"
MAX_COLLECTION_ITEMS = 100
MAX_TEXT_LENGTH = 2_000
MAX_ROUTE_RULES = 50
MAX_ROUTE_ITEMS = 50
COMPLIANCE_SEVERITY_ORDER = {
    "CRITICAL": 0,
    "HIGH": 1,
    "MEDIUM": 2,
    "LOW": 3,
    "UNKNOWN": 4,
}
SENSITIVE_ROUTE_VALUE_NAMES = frozenset(
    {
        "api-key",
        "authorization",
        "cookie",
        "password",
        "proxy-authorization",
        "secret",
        "set-cookie",
        "token",
        "x-api-key",
    }
)


class ProviderDetailProjector(Protocol):
    def __call__(self, raw: Mapping[str, Any]) -> ResourceProviderDetail: ...


class ProviderDetailMatcher(Protocol):
    def __call__(
        self, resource: Mapping[str, Any], raw: Mapping[str, Any]
    ) -> ResourceProviderDetail | None: ...


def provider_detail_projection(resource: Mapping[str, Any]) -> ResourceProviderDetail | None:
    """Return one redacted projection only for an exact supported API-group/kind pair."""
    raw = _mapping(resource.get("raw"))
    if not raw:
        return None
    kind = _text(resource.get("kind")) or ""
    projector = PROVIDER_DETAIL_PROJECTORS.get((_api_group(resource.get("api_version")), kind))
    if projector is not None:
        return projector(raw)
    for matcher in PROVIDER_DETAIL_MATCHERS:
        if detail := matcher(resource, raw):
            return detail
    return None


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


def _certificate(raw: Mapping[str, Any]) -> CertificateProviderDetail:
    private_key = _mapping_at(raw, "spec", "privateKey")
    return CertificateProviderDetail(
        ready=_condition_truth(raw, "Ready"),
        secret_name=_text_at(raw, "spec", "secretName"),
        revision=_int_at(raw, "status", "revision"),
        is_ca=_bool_at(raw, "spec", "isCA"),
        duration=_text_at(raw, "spec", "duration"),
        renew_before=_text_at(raw, "spec", "renewBefore"),
        not_before=_text_at(raw, "status", "notBefore"),
        not_after=_text_at(raw, "status", "notAfter"),
        renewal_time=_text_at(raw, "status", "renewalTime"),
        failed_issuance_attempts=_int_at(raw, "status", "failedIssuanceAttempts"),
        last_failure_time=_text_at(raw, "status", "lastFailureTime"),
        private_key=(
            CertificatePrivateKeyDetail(
                algorithm=_text(private_key.get("algorithm")),
                size=_int(private_key.get("size")),
                encoding=_text(private_key.get("encoding")),
                rotation_policy=_text(private_key.get("rotationPolicy")),
            )
            if private_key
            else None
        ),
        dns_names=_text_items_at(raw, "spec", "dnsNames"),
        issuer_ref=_named_reference_at(raw, "spec", "issuerRef"),
        usages=_text_items_at(raw, "spec", "usages"),
        conditions=_conditions(raw),
    )


def _certificate_request(raw: Mapping[str, Any]) -> CertificateRequestProviderDetail:
    owner_certificate: ProviderNamedReference | None = None
    for item in _mapping_items_at(raw, "metadata", "ownerReferences"):
        if _text(item.get("kind")) == "Certificate":
            owner_certificate = _named_reference(item)
            if owner_certificate is not None:
                break
    return CertificateRequestProviderDetail(
        ready=_condition_truth(raw, "Ready"),
        approved=_condition_truth(raw, "Approved"),
        denied=_condition_truth(raw, "Denied"),
        issuer_ref=_named_reference_at(raw, "spec", "issuerRef"),
        owner_certificate=owner_certificate,
        duration=_text_at(raw, "spec", "duration"),
        usages=_text_items_at(raw, "spec", "usages"),
        certificate_issued=_present_at(raw, "status", "certificate"),
        conditions=_conditions(raw),
    )


def _cluster_compliance_report(
    raw: Mapping[str, Any],
) -> ClusterComplianceReportProviderDetail:
    definitions = {
        control_id: item
        for item in _mapping_items_at(raw, "spec", "compliance", "controls")
        if (control_id := _text(item.get("id"))) is not None
    }
    controls: list[ComplianceControlDetail] = []
    seen_control_ids: set[str] = set()
    for item in _mapping_items_at(raw, "status", "summaryReport", "controlCheck"):
        control_id = _text(item.get("id"))
        if control_id is None or control_id in seen_control_ids:
            continue
        seen_control_ids.add(control_id)
        definition = definitions.get(control_id, {})
        controls.append(
            ComplianceControlDetail(
                id=control_id,
                name=_text(item.get("name")),
                description=_text(definition.get("description")),
                severity=_text(item.get("severity")),
                total_pass=_int(item.get("totalPass")),
                total_fail=_int(item.get("totalFail")),
                check_ids=[
                    check_id
                    for check in _mapping_items(definition.get("checks"))
                    if (check_id := _text(check.get("id"))) is not None
                ],
            )
        )
    controls.sort(
        key=lambda control: (
            (control.total_fail or 0) == 0,
            COMPLIANCE_SEVERITY_ORDER.get((control.severity or "").upper(), 99),
            control.id,
        )
    )
    return ClusterComplianceReportProviderDetail(
        framework_id=_text_at(raw, "spec", "compliance", "id"),
        framework_title=_text_at(raw, "spec", "compliance", "title"),
        framework_description=_text_at(raw, "spec", "compliance", "description"),
        framework_version=_text_at(raw, "spec", "compliance", "version"),
        platform=_text_at(raw, "spec", "compliance", "platform"),
        updated_at=_text_at(raw, "status", "updateTimestamp"),
        pass_count=_int_at(raw, "status", "summary", "passCount"),
        fail_count=_int_at(raw, "status", "summary", "failCount"),
        controls=controls,
        conditions=_conditions(raw),
    )


def _crossplane_composite(
    resource: Mapping[str, Any], raw: Mapping[str, Any]
) -> CrossplaneCompositeProviderDetail | None:
    del resource
    spec = _mapping_at(raw, "spec")
    crossplane = _mapping(spec.get("crossplane"))
    if _mapping(spec.get("providerConfigRef")) or _mapping(crossplane.get("providerConfigRef")):
        return None
    resource_refs = crossplane.get("resourceRefs")
    if not isinstance(resource_refs, list):
        resource_refs = spec.get("resourceRefs")
    claim = bool(_mapping(spec.get("resourceRef")) and _mapping(spec.get("compositionRef")))
    if not isinstance(resource_refs, list) and not claim:
        return None
    composition = _mapping(crossplane.get("compositionRef")) or _mapping(spec.get("compositionRef"))
    composition_revision = _mapping(crossplane.get("compositionRevisionRef")) or _mapping(
        spec.get("compositionRevisionRef")
    )
    return CrossplaneCompositeProviderDetail(
        claim=claim,
        paused=_text_at(raw, "metadata", "annotations", "crossplane.io/paused") == "true",
        composition_ref=_named_reference(composition),
        composition_revision_ref=_named_reference(composition_revision),
        composition_update_policy=_text(crossplane.get("compositionUpdatePolicy"))
        or _text(spec.get("compositionUpdatePolicy")),
        bound_resource_ref=_named_reference(_mapping(spec.get("resourceRef"))) if claim else None,
        composed_resource_refs=[
            reference
            for item in _mapping_items(resource_refs)
            if (reference := _named_reference(item)) is not None
        ],
        conditions=_conditions(raw),
    )


def _cron_workflow(raw: Mapping[str, Any]) -> CronWorkflowProviderDetail:
    schedules = _text_items_at(raw, "spec", "schedules")
    if not schedules and (schedule := _text_at(raw, "spec", "schedule")) is not None:
        schedules = [schedule]
    workflow_spec = _mapping_at(raw, "spec", "workflowSpec")
    template_ref = _mapping(workflow_spec.get("workflowTemplateRef"))
    template_name = _text(template_ref.get("name")) or _text(template_ref.get("template"))
    template_reference = (
        ProviderNamedReference(name=template_name) if template_name is not None else None
    )
    return CronWorkflowProviderDetail(
        schedules=schedules,
        timezone=_text_at(raw, "spec", "timezone"),
        suspended=_bool_at(raw, "spec", "suspend"),
        concurrency_policy=_text_at(raw, "spec", "concurrencyPolicy"),
        last_scheduled_time=_text_at(raw, "status", "lastScheduledTime"),
        active_workflows=[
            reference
            for item in _mapping_items_at(raw, "status", "active")
            if (reference := _named_reference(item)) is not None
        ],
        workflow_template_ref=template_reference,
        workflow_template_cluster_scope=_bool(template_ref.get("clusterScope")),
        entrypoint=_text(workflow_spec.get("entrypoint")),
        argument_count=_collection_length_at(workflow_spec, "arguments", "parameters"),
        template_count=_collection_length_at(workflow_spec, "templates"),
        successful_history_limit=_int_at(raw, "spec", "successfulJobsHistoryLimit"),
        failed_history_limit=_int_at(raw, "spec", "failedJobsHistoryLimit"),
        starting_deadline_seconds=_int_at(raw, "spec", "startingDeadlineSeconds"),
        conditions=_conditions(raw),
    )


def _external_secret(raw: Mapping[str, Any]) -> ExternalSecretProviderDetail:
    target = _mapping_at(raw, "spec", "target")
    template = _mapping(target.get("template"))
    store = _mapping_at(raw, "spec", "secretStoreRef")
    target_name = _text(target.get("name")) or _text_at(raw, "metadata", "name")
    return ExternalSecretProviderDetail(
        ready=_condition_truth(raw, "Ready"),
        last_sync_time=_text_at(raw, "status", "refreshTime"),
        refresh_interval=_text_at(raw, "spec", "refreshInterval"),
        target_name=target_name,
        synced_resource_version=_text_at(raw, "status", "syncedResourceVersion"),
        binding_name=_text_at(raw, "status", "binding", "name"),
        store_name=_text(store.get("name")),
        store_kind=_text(store.get("kind")),
        mappings=[
            ExternalSecretMappingDetail(
                secret_key=_text(item.get("secretKey")),
                remote_key=_text_at(item, "remoteRef", "key"),
                remote_property=_text_at(item, "remoteRef", "property"),
                remote_version=_text_at(item, "remoteRef", "version"),
            )
            for item in _mapping_items_at(raw, "spec", "data")
        ],
        data_sources=[
            _external_secret_source(item) for item in _mapping_items_at(raw, "spec", "dataFrom")
        ],
        target_creation_policy=_text(target.get("creationPolicy")),
        target_deletion_policy=_text(target.get("deletionPolicy")),
        template_type=_text(template.get("type")),
        template_engine_version=_text(template.get("engineVersion")),
        template_labels=_key_values_at(template, "metadata", "labels"),
        template_annotations=_key_values_at(template, "metadata", "annotations"),
        conditions=_conditions(raw),
    )


def _external_secret_source(item: Mapping[str, Any]) -> ExternalSecretSourceDetail:
    extract = _mapping(item.get("extract"))
    if extract:
        return ExternalSecretSourceDetail(type="extract", detail=_text(extract.get("key")))
    find = _mapping(item.get("find"))
    if find:
        return ExternalSecretSourceDetail(
            type="find",
            detail=_text_at(find, "name", "regexp")
            or ("tags" if _mapping(find.get("tags")) else "name"),
        )
    source_ref = _mapping(item.get("sourceRef"))
    if source_ref:
        return ExternalSecretSourceDetail(
            type="source-ref",
            detail=_joined_text(source_ref.get("kind"), source_ref.get("name")),
        )
    return ExternalSecretSourceDetail(type="unknown")


def _gateway_class(raw: Mapping[str, Any]) -> GatewayClassProviderDetail:
    return GatewayClassProviderDetail(
        controller_name=_text_at(raw, "spec", "controllerName"),
        description=_text_at(raw, "spec", "description"),
        accepted=_condition_truth(raw, "Accepted"),
        parameters_ref=_named_reference_at(raw, "spec", "parametersRef"),
        conditions=_conditions(raw),
    )


def _gcp_machine(raw: Mapping[str, Any]) -> GcpMachineProviderDetail:
    return GcpMachineProviderDetail(
        ready=_condition_truth(raw, "Ready"),
        instance_type=_text_at(raw, "spec", "instanceType"),
        zone=_text_at(raw, "spec", "zone") or _text_at(raw, "spec", "failureDomain"),
        instance_id=_text_at(raw, "status", "instanceID") or _text_at(raw, "spec", "providerID"),
        image=_text_at(raw, "spec", "image"),
        additional_disks=[
            GcpAdditionalDiskDetail(
                device_type=_text(item.get("deviceType")),
                size_gb=_int(item.get("size")),
            )
            for item in _mapping_items_at(raw, "spec", "additionalDisks")
        ],
        conditions=_conditions(raw),
    )


def _gcp_managed_control_plane(
    raw: Mapping[str, Any],
) -> GcpManagedControlPlaneProviderDetail:
    return GcpManagedControlPlaneProviderDetail(
        ready=_condition_truth(raw, "Ready"),
        cluster_name=_text_at(raw, "spec", "clusterName") or _text_at(raw, "metadata", "name"),
        project=_text_at(raw, "spec", "project"),
        location=_text_at(raw, "spec", "location"),
        version=_text_at(raw, "status", "version") or _text_at(raw, "spec", "version"),
        release_channel=_text_at(raw, "spec", "releaseChannel"),
        autopilot=_bool_at(raw, "spec", "enableAutopilot"),
        endpoint=_first_endpoint(
            _mapping_at(raw, "spec", "endpoint"),
            _mapping_at(raw, "spec", "controlPlaneEndpoint"),
        ),
        pod_cidr=_text_at(raw, "spec", "clusterNetwork", "pod", "cidrBlock"),
        service_cidr=_text_at(raw, "spec", "clusterNetwork", "service", "cidrBlock"),
        ip_aliases=_bool_at(raw, "spec", "clusterNetwork", "useIPAliases"),
        logging_service=_text_at(raw, "spec", "loggingService"),
        monitoring_service=_text_at(raw, "spec", "monitoringService"),
        authorized_networks=[
            GcpAuthorizedNetworkDetail(
                name=_text(item.get("display_name")),
                cidr=cidr,
            )
            for item in _mapping_items_at(
                raw,
                "spec",
                "master_authorized_networks_config",
                "cidr_blocks",
            )
            if (cidr := _text(item.get("cidr_block"))) is not None
        ],
        conditions=_conditions(raw),
    )


def _gcp_managed_machine_pool(
    raw: Mapping[str, Any],
) -> GcpManagedMachinePoolProviderDetail:
    management = _mapping_at(raw, "spec", "management")
    return GcpManagedMachinePoolProviderDetail(
        ready=_condition_truth(raw, "Ready"),
        node_pool_name=_text_at(raw, "spec", "nodePoolName") or _text_at(raw, "metadata", "name"),
        machine_type=_text_at(raw, "spec", "machineType") or _text_at(raw, "spec", "instanceType"),
        disk_type=_text_at(raw, "spec", "diskType"),
        disk_size_gb=_first_present_int(
            _int_at(raw, "spec", "diskSizeGb"),
            _int_at(raw, "spec", "diskSizeGB"),
        ),
        image_type=_text_at(raw, "spec", "imageType"),
        max_pods_per_node=_int_at(raw, "spec", "maxPodsPerNode"),
        autoscaling_enabled=_bool_at(raw, "spec", "scaling", "enableAutoscaling"),
        scaling=ProviderScaling(
            minimum=_int_at(raw, "spec", "scaling", "minCount"),
            maximum=_int_at(raw, "spec", "scaling", "maxCount"),
            current=_int_at(raw, "status", "replicas"),
        ),
        auto_repair=_bool(management.get("autoRepair")),
        auto_upgrade=_bool(management.get("autoUpgrade")),
        node_locations=_text_items_at(raw, "spec", "nodeLocations"),
        labels=_key_values_at(raw, "spec", "kubernetesLabels"),
        taints=[
            ProviderTaint(
                key=key,
                value=_text(item.get("value")),
                effect=_text(item.get("effect")),
            )
            for item in _mapping_items_at(raw, "spec", "kubernetesTaints")
            if (key := _text(item.get("key"))) is not None
        ],
        conditions=_conditions(raw),
    )


def _grpc_route(raw: Mapping[str, Any]) -> GrpcRouteProviderDetail:
    parent_statuses = _gateway_route_parent_statuses(raw)
    return GrpcRouteProviderDetail(
        hostnames=_text_items_at(raw, "spec", "hostnames"),
        parent_refs=_gateway_route_parent_refs(raw),
        rules=_gateway_route_rules(raw, grpc=True),
        parent_statuses=parent_statuses,
        conditions=parent_statuses[0].conditions if parent_statuses else [],
    )


def _http_route(raw: Mapping[str, Any]) -> HttpRouteProviderDetail:
    parent_statuses = _gateway_route_parent_statuses(raw)
    return HttpRouteProviderDetail(
        hostnames=_text_items_at(raw, "spec", "hostnames"),
        parent_refs=_gateway_route_parent_refs(raw),
        rules=_gateway_route_rules(raw, grpc=False),
        parent_statuses=parent_statuses,
        conditions=parent_statuses[0].conditions if parent_statuses else [],
    )


def _gateway_route_parent_refs(raw: Mapping[str, Any]) -> list[ProviderNamedReference]:
    namespace = _text_at(raw, "metadata", "namespace")
    return [
        reference
        for item in _mapping_items_at(raw, "spec", "parentRefs")[:MAX_ROUTE_ITEMS]
        if (
            reference := _route_reference(
                item,
                default_namespace=namespace,
            )
        )
        is not None
    ]


def _gateway_route_rules(raw: Mapping[str, Any], *, grpc: bool) -> list[GatewayRouteRuleDetail]:
    namespace = _text_at(raw, "metadata", "namespace")
    return [
        GatewayRouteRuleDetail(
            matches=[
                _gateway_route_match(item, grpc=grpc)
                for item in _mapping_items(rule.get("matches"))[:MAX_ROUTE_ITEMS]
            ],
            backends=[
                backend
                for item in _mapping_items(rule.get("backendRefs"))[:MAX_ROUTE_ITEMS]
                if (
                    backend := _gateway_route_backend(
                        item,
                        default_namespace=namespace,
                    )
                )
                is not None
            ],
            filters=[
                GatewayRouteFilterDetail(
                    type=filter_type,
                    summary=_gateway_route_filter_summary(item, filter_type),
                )
                for item in _mapping_items(rule.get("filters"))[:MAX_ROUTE_ITEMS]
                if (filter_type := _text(item.get("type"))) is not None
            ],
        )
        for rule in _mapping_items_at(raw, "spec", "rules")[:MAX_ROUTE_RULES]
    ]


def _gateway_route_match(item: Mapping[str, Any], *, grpc: bool) -> GatewayRouteMatchDetail:
    method = _mapping(item.get("method"))
    path = _mapping(item.get("path"))
    return GatewayRouteMatchDetail(
        method=None if grpc else _text(item.get("method")),
        path_type=None if grpc else _text(path.get("type")),
        path_value=None if grpc else _text(path.get("value")),
        grpc_type=_text(method.get("type")) if grpc else None,
        grpc_service=_text(method.get("service")) if grpc else None,
        grpc_method=_text(method.get("method")) if grpc else None,
        headers=_named_value_items(item.get("headers")),
        query_params=[] if grpc else _named_value_items(item.get("queryParams")),
    )


def _gateway_route_backend(
    item: Mapping[str, Any], *, default_namespace: str | None
) -> GatewayRouteBackendDetail | None:
    reference = _route_reference(item, default_namespace=default_namespace)
    if reference is None:
        return None
    return GatewayRouteBackendDetail(
        reference=reference,
        port=_int(item.get("port")),
        weight=_int(item.get("weight")),
    )


def _gateway_route_parent_statuses(
    raw: Mapping[str, Any],
) -> list[GatewayRouteParentStatusDetail]:
    namespace = _text_at(raw, "metadata", "namespace")
    result: list[GatewayRouteParentStatusDetail] = []
    for item in _mapping_items_at(raw, "status", "parents")[:MAX_ROUTE_ITEMS]:
        conditions = _condition_items(item.get("conditions"))
        result.append(
            GatewayRouteParentStatusDetail(
                reference=_route_reference(
                    _mapping(item.get("parentRef")),
                    default_namespace=namespace,
                ),
                section_name=_text_at(item, "parentRef", "sectionName"),
                accepted=_condition_truth_from(conditions, "Accepted"),
                resolved_refs=_condition_truth_from(conditions, "ResolvedRefs"),
                conditions=conditions,
            )
        )
    return result


def _route_reference(
    item: Mapping[str, Any], *, default_namespace: str | None
) -> ProviderNamedReference | None:
    name = _text(item.get("name"))
    if name is None:
        return None
    return ProviderNamedReference(
        api_version=_text(item.get("group")),
        kind=_text(item.get("kind")),
        namespace=_text(item.get("namespace")) or default_namespace,
        name=name,
    )


def _named_value_items(value: object) -> list[ProviderKeyValue]:
    return [
        ProviderKeyValue(key=name, value=item_value)
        for item in _mapping_items(value)[:MAX_ROUTE_ITEMS]
        if (name := _text(item.get("name"))) is not None
        and _normalized_route_value_name(name) not in SENSITIVE_ROUTE_VALUE_NAMES
        and (item_value := _text(item.get("value"))) is not None
    ]


def _normalized_route_value_name(value: str) -> str:
    return value.strip().lower().replace("_", "-")


def _gateway_route_filter_summary(item: Mapping[str, Any], filter_type: str) -> str | None:
    if filter_type == "RequestHeaderModifier":
        return _header_modifier_summary(_mapping(item.get("requestHeaderModifier")))
    if filter_type == "ResponseHeaderModifier":
        return _header_modifier_summary(_mapping(item.get("responseHeaderModifier")))
    if filter_type == "RequestRedirect":
        redirect = _mapping(item.get("requestRedirect"))
        return _joined_text(
            redirect.get("scheme"),
            redirect.get("hostname"),
            redirect.get("port"),
            redirect.get("statusCode"),
        )
    if filter_type == "URLRewrite":
        rewrite = _mapping(item.get("urlRewrite"))
        return _joined_text(
            rewrite.get("hostname"),
            _value_at(rewrite, "path", "replacePrefixMatch"),
        )
    if filter_type == "RequestMirror":
        mirror = _mapping_at(item, "requestMirror", "backendRef")
        return _joined_text(mirror.get("name"), mirror.get("port"))
    return None


def _header_modifier_summary(modifier: Mapping[str, Any]) -> str | None:
    parts: list[str] = []
    for operation in ("set", "add"):
        names = [
            name
            for item in _mapping_items(modifier.get(operation))[:MAX_ROUTE_ITEMS]
            if (name := _text(item.get("name"))) is not None
        ]
        if names:
            parts.append(f"{operation}: {', '.join(names)}")
    removed = _text_items(modifier.get("remove"))[:MAX_ROUTE_ITEMS]
    if removed:
        parts.append(f"remove: {', '.join(removed)}")
    return "; ".join(parts) if parts else None


def _job(raw: Mapping[str, Any]) -> JobProviderDetail:
    conditions = _conditions(raw)
    complete = _condition_by_type(conditions, "Complete")
    failed = _condition_by_type(conditions, "Failed")
    suspended = _bool_at(raw, "spec", "suspend")
    active = _int_at(raw, "status", "active")
    state: Literal["completed", "failed", "suspended", "running", "pending"] = (
        "completed"
        if complete is not None and complete.status == "True"
        else "failed"
        if failed is not None and failed.status == "True"
        else "suspended"
        if suspended is True
        else "running"
        if (active or 0) > 0 or _text_at(raw, "status", "startTime") is not None
        else "pending"
    )
    terminal = failed if state == "failed" else complete if state == "completed" else None
    return JobProviderDetail(
        state=state,
        succeeded=_int_at(raw, "status", "succeeded"),
        failed=_int_at(raw, "status", "failed"),
        active=active,
        completions=_int_at(raw, "spec", "completions"),
        parallelism=_int_at(raw, "spec", "parallelism"),
        backoff_limit=_int_at(raw, "spec", "backoffLimit"),
        active_deadline_seconds=_int_at(raw, "spec", "activeDeadlineSeconds"),
        ttl_seconds_after_finished=_int_at(raw, "spec", "ttlSecondsAfterFinished"),
        suspended=suspended,
        start_time=_text_at(raw, "status", "startTime"),
        completion_time=_text_at(raw, "status", "completionTime")
        or (terminal.last_transition_time if terminal is not None else None),
        terminal_reason=terminal.reason if terminal is not None else None,
        terminal_message=terminal.message if terminal is not None else None,
        conditions=conditions,
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
    (CERT_MANAGER_GROUP, "Certificate"): _certificate,
    (CERT_MANAGER_GROUP, "CertificateRequest"): _certificate_request,
    (COMPLIANCE_GROUP, "ClusterComplianceReport"): _cluster_compliance_report,
    (ARGO_GROUP, "CronWorkflow"): _cron_workflow,
    (EXTERNAL_SECRETS_GROUP, "ExternalSecret"): _external_secret,
    (GATEWAY_GROUP, "GatewayClass"): _gateway_class,
    (INFRASTRUCTURE_GROUP, "GCPMachine"): _gcp_machine,
    (INFRASTRUCTURE_GROUP, "GCPManagedControlPlane"): _gcp_managed_control_plane,
    (INFRASTRUCTURE_GROUP, "GCPManagedMachinePool"): _gcp_managed_machine_pool,
    (GATEWAY_GROUP, "GRPCRoute"): _grpc_route,
    (GATEWAY_GROUP, "HTTPRoute"): _http_route,
    (BATCH_GROUP, "Job"): _job,
}

PROVIDER_DETAIL_MATCHERS: tuple[ProviderDetailMatcher, ...] = (_crossplane_composite,)


def _conditions(raw: Mapping[str, Any]) -> list[ProviderCondition]:
    items = _mapping_items_at(raw, "status", "v1beta2", "conditions")
    if not items:
        items = _mapping_items_at(raw, "status", "conditions")
    return _condition_items(items)


def _condition_items(value: object) -> list[ProviderCondition]:
    result: list[ProviderCondition] = []
    for item in _mapping_items(value):
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


def _condition_truth_from(conditions: list[ProviderCondition], condition_type: str) -> bool | None:
    condition = _condition_by_type(conditions, condition_type)
    if condition is None:
        return None
    return True if condition.status == "True" else False if condition.status == "False" else None


def _condition_by_type(
    conditions: list[ProviderCondition], condition_type: str
) -> ProviderCondition | None:
    return next(
        (condition for condition in conditions if condition.type == condition_type),
        None,
    )


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


def _first_endpoint(*items: Mapping[str, Any]) -> str | None:
    for item in items:
        host = _text(item.get("host"))
        if host is None:
            continue
        port = _int(item.get("port"))
        return f"{host}:{port}" if port not in (None, 443) else host
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


def _named_reference_at(value: Mapping[str, Any], *path: str) -> ProviderNamedReference | None:
    return _named_reference(_mapping_at(value, *path))


def _named_reference(value: Mapping[str, Any]) -> ProviderNamedReference | None:
    name = _text(value.get("name"))
    if name is None:
        return None
    return ProviderNamedReference(
        api_version=_text(value.get("apiVersion")) or _text(value.get("group")),
        kind=_text(value.get("kind")),
        namespace=_text(value.get("namespace")),
        name=name,
    )


def _cluster_name(raw: Mapping[str, Any]) -> str | None:
    return _text_at(raw, "spec", "clusterName") or _text_at(
        raw, "metadata", "labels", "cluster.x-k8s.io/cluster-name"
    )


def _condition_truth(raw: Mapping[str, Any], condition_type: str) -> bool | None:
    return _condition_truth_from(_conditions(raw), condition_type)


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
    return _mapping_items(_value_at(value, *path))


def _mapping_items(raw: object) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    return [_mapping(item) for item in raw[:MAX_COLLECTION_ITEMS] if isinstance(item, Mapping)]


def _text_items_at(value: Mapping[str, Any], *path: str) -> list[str]:
    return _text_items(_value_at(value, *path))


def _text_items(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [text for item in raw[:MAX_COLLECTION_ITEMS] if (text := _text(item)) is not None]


def _mapping_keys_at(value: Mapping[str, Any], *path: str) -> list[str]:
    return sorted(_mapping_at(value, *path))[:MAX_COLLECTION_ITEMS]


def _key_values_at(value: Mapping[str, Any], *path: str) -> list[ProviderKeyValue]:
    result: list[ProviderKeyValue] = []
    for raw_key, raw in sorted(_mapping_at(value, *path).items())[:MAX_COLLECTION_ITEMS]:
        key = _text(raw_key)
        normalized = _text(str(raw)) if isinstance(raw, (str, int, float, bool)) else None
        if key is not None and normalized is not None:
            result.append(ProviderKeyValue(key=key, value=normalized))
    return result


def _present_at(value: Mapping[str, Any], *path: str) -> bool | None:
    raw = _value_at(value, *path)
    return None if raw is None else bool(raw)


def _collection_length_at(value: Mapping[str, Any], *path: str) -> int | None:
    raw = _value_at(value, *path)
    return len(raw) if isinstance(raw, list) else None


def _joined_text(*values: object) -> str | None:
    parts = [
        part
        for value in values
        if (part := _text(value) or (str(value) if _int(value) is not None else None)) is not None
    ]
    return "/".join(parts) if parts else None
