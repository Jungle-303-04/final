"""Typed, redacted provider detail projections for dynamic inventory resources."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from packages.contracts.modeling import StrictModel


class ProviderCondition(StrictModel):
    type: str
    status: Literal["True", "False", "Unknown"]
    reason: str | None = None
    message: str | None = None
    last_transition_time: str | None = None


class ProviderAddress(StrictModel):
    type: str
    address: str


class ProviderKeyValue(StrictModel):
    key: str
    value: str


class ProviderScaling(StrictModel):
    minimum: int | None = None
    maximum: int | None = None
    current: int | None = None


class ProviderReference(StrictModel):
    api_version: str | None = None
    kind: str
    namespace: str | None = None
    name: str


class ProviderNamedReference(StrictModel):
    """A redacted object reference whose source may omit Kubernetes type metadata."""

    api_version: str | None = None
    kind: str | None = None
    namespace: str | None = None
    name: str


class ProviderReplicas(StrictModel):
    desired: int | None = None
    ready: int | None = None
    available: int | None = None
    up_to_date: int | None = None


class CapiUnhealthyCondition(StrictModel):
    type: str
    status: str | None = None
    timeout: str | None = None


class AwsMachineProviderDetail(StrictModel):
    type: Literal["aws-machine"] = "aws-machine"
    instance_type: str | None = None
    instance_id: str | None = None
    instance_state: str | None = None
    provider_id: str | None = None
    iam_instance_profile: str | None = None
    ssh_key_name: str | None = None
    subnet_id: str | None = None
    secrets_backend: str | None = None
    addresses: list[ProviderAddress] = Field(default_factory=list)
    conditions: list[ProviderCondition] = Field(default_factory=list)


class AwsManagedClusterProviderDetail(StrictModel):
    type: Literal["aws-managed-cluster"] = "aws-managed-cluster"
    endpoint: str | None = None
    failure_domains: list[str] = Field(default_factory=list)
    conditions: list[ProviderCondition] = Field(default_factory=list)


class AwsSubnet(StrictModel):
    id: str | None = None
    availability_zone: str | None = None
    public: bool | None = None
    cidr_block: str | None = None


class AwsSecurityGroup(StrictModel):
    role: str
    id: str | None = None
    name: str | None = None


class AwsAddon(StrictModel):
    name: str
    requested_version: str | None = None
    current_version: str | None = None
    status: str | None = None


class AwsManagedControlPlaneProviderDetail(StrictModel):
    type: Literal["aws-managed-control-plane"] = "aws-managed-control-plane"
    cluster_name: str | None = None
    region: str | None = None
    version: str | None = None
    endpoint_access: Literal["public", "private", "public-and-private"] | None = None
    role_name: str | None = None
    identity: str | None = None
    vpc_id: str | None = None
    vpc_cidr_block: str | None = None
    subnets: list[AwsSubnet] = Field(default_factory=list)
    security_groups: list[AwsSecurityGroup] = Field(default_factory=list)
    nat_gateway_ips: list[str] = Field(default_factory=list)
    failure_domains: list[str] = Field(default_factory=list)
    addons: list[AwsAddon] = Field(default_factory=list)
    conditions: list[ProviderCondition] = Field(default_factory=list)


class AwsManagedMachinePoolProviderDetail(StrictModel):
    type: Literal["aws-managed-machine-pool"] = "aws-managed-machine-pool"
    node_group_name: str | None = None
    instance_type: str | None = None
    ami_type: str | None = None
    capacity_type: str | None = None
    role_name: str | None = None
    scaling: ProviderScaling
    max_unavailable: int | None = None
    subnet_ids: list[str] = Field(default_factory=list)
    labels: list[ProviderKeyValue] = Field(default_factory=list)
    conditions: list[ProviderCondition] = Field(default_factory=list)


class AzureMachineProviderDetail(StrictModel):
    type: Literal["azure-machine"] = "azure-machine"
    vm_size: str | None = None
    availability_zone: str | None = None
    os_type: str | None = None
    os_disk_size_gb: int | None = None
    provider_id: str | None = None
    subnet_name: str | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


class AzureManagedControlPlaneProviderDetail(StrictModel):
    type: Literal["azure-managed-control-plane"] = "azure-managed-control-plane"
    location: str | None = None
    resource_group_name: str | None = None
    version: str | None = None
    sku_tier: str | None = None
    dns_prefix: str | None = None
    subscription_id: str | None = None
    network_plugin: str | None = None
    network_policy: str | None = None
    private_cluster: bool | None = None
    dns_service_ip: str | None = None
    load_balancer_sku: str | None = None
    upgrade_channel: str | None = None
    authorized_ip_ranges: list[str] = Field(default_factory=list)
    conditions: list[ProviderCondition] = Field(default_factory=list)


class ProviderTaint(StrictModel):
    key: str
    value: str | None = None
    effect: str | None = None


class AzureManagedMachinePoolProviderDetail(StrictModel):
    type: Literal["azure-managed-machine-pool"] = "azure-managed-machine-pool"
    pool_name: str | None = None
    vm_size: str | None = None
    mode: str | None = None
    os_type: str | None = None
    os_disk_type: str | None = None
    os_disk_size_gb: int | None = None
    priority: str | None = None
    max_pods: int | None = None
    scaling: ProviderScaling
    scale_down_mode: str | None = None
    availability_zones: list[str] = Field(default_factory=list)
    labels: list[ProviderKeyValue] = Field(default_factory=list)
    taints: list[ProviderTaint] = Field(default_factory=list)
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CapiClusterProviderDetail(StrictModel):
    type: Literal["capi-cluster"] = "capi-cluster"
    phase: str | None = None
    version: str | None = None
    cluster_class: str | None = None
    endpoint: str | None = None
    provider: str | None = None
    paused: bool = False
    control_plane: ProviderReplicas
    workers: ProviderReplicas
    control_plane_ref: ProviderReference | None = None
    infrastructure_ref: ProviderReference | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CapiKubeadmControlPlaneProviderDetail(StrictModel):
    type: Literal["capi-kubeadm-control-plane"] = "capi-kubeadm-control-plane"
    cluster_name: str | None = None
    version: str | None = None
    initialized: bool | None = None
    update_strategy: str | None = None
    replicas: ProviderReplicas
    infrastructure_ref: ProviderReference | None = None
    node_drain_timeout: str | None = None
    node_volume_detach_timeout: str | None = None
    node_deletion_timeout: str | None = None
    certificate_sans: list[str] = Field(default_factory=list)
    remediation_machine: str | None = None
    remediation_retry_count: int | None = None
    remediation_timestamp: str | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CapiMachineDeploymentProviderDetail(StrictModel):
    type: Literal["capi-machine-deployment"] = "capi-machine-deployment"
    phase: str | None = None
    cluster_name: str | None = None
    version: str | None = None
    paused: bool = False
    replicas: ProviderReplicas
    strategy_type: str | None = None
    max_surge: str | None = None
    max_unavailable: str | None = None
    infrastructure_ref: ProviderReference | None = None
    bootstrap_ref: ProviderReference | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CapiMachineHealthCheckProviderDetail(StrictModel):
    type: Literal["capi-machine-health-check"] = "capi-machine-health-check"
    cluster_name: str | None = None
    expected_machines: int | None = None
    current_healthy: int | None = None
    remediations_allowed: int | None = None
    node_startup_timeout: str | None = None
    max_unhealthy: str | None = None
    unhealthy_range: str | None = None
    selector: list[ProviderKeyValue] = Field(default_factory=list)
    unhealthy_conditions: list[CapiUnhealthyCondition] = Field(default_factory=list)
    remediation_template: ProviderReference | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CapiMachinePoolProviderDetail(StrictModel):
    type: Literal["capi-machine-pool"] = "capi-machine-pool"
    phase: str | None = None
    cluster_name: str | None = None
    min_ready_seconds: int | None = None
    replicas: ProviderReplicas
    infrastructure_ref: ProviderReference | None = None
    bootstrap_ref: ProviderReference | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CapiMachineProviderDetail(StrictModel):
    type: Literal["capi-machine"] = "capi-machine"
    phase: str | None = None
    role: Literal["control-plane", "worker"]
    cluster_name: str | None = None
    version: str | None = None
    failure_domain: str | None = None
    provider: str | None = None
    provider_id: str | None = None
    provider_region: str | None = None
    provider_instance_id: str | None = None
    node_name: str | None = None
    node_uid: str | None = None
    bootstrap_ref: ProviderReference | None = None
    infrastructure_ref: ProviderReference | None = None
    addresses: list[ProviderAddress] = Field(default_factory=list)
    os_image: str | None = None
    architecture: str | None = None
    kernel_version: str | None = None
    container_runtime_version: str | None = None
    kubelet_version: str | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CapiMachineSetProviderDetail(StrictModel):
    type: Literal["capi-machine-set"] = "capi-machine-set"
    cluster_name: str | None = None
    delete_policy: str | None = None
    min_ready_seconds: int | None = None
    replicas: ProviderReplicas
    infrastructure_ref: ProviderReference | None = None
    bootstrap_ref: ProviderReference | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CertificatePrivateKeyDetail(StrictModel):
    algorithm: str | None = None
    size: int | None = None
    encoding: str | None = None
    rotation_policy: str | None = None


class CertificateProviderDetail(StrictModel):
    type: Literal["certificate"] = "certificate"
    ready: bool | None = None
    secret_name: str | None = None
    revision: int | None = None
    is_ca: bool | None = None
    duration: str | None = None
    renew_before: str | None = None
    not_before: str | None = None
    not_after: str | None = None
    renewal_time: str | None = None
    failed_issuance_attempts: int | None = None
    last_failure_time: str | None = None
    private_key: CertificatePrivateKeyDetail | None = None
    dns_names: list[str] = Field(default_factory=list)
    issuer_ref: ProviderNamedReference | None = None
    usages: list[str] = Field(default_factory=list)
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CertificateRequestProviderDetail(StrictModel):
    type: Literal["certificate-request"] = "certificate-request"
    ready: bool | None = None
    approved: bool | None = None
    denied: bool | None = None
    issuer_ref: ProviderNamedReference | None = None
    owner_certificate: ProviderNamedReference | None = None
    duration: str | None = None
    usages: list[str] = Field(default_factory=list)
    certificate_issued: bool | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


class ComplianceControlDetail(StrictModel):
    id: str
    name: str | None = None
    description: str | None = None
    severity: str | None = None
    total_pass: int | None = None
    total_fail: int | None = None
    check_ids: list[str] = Field(default_factory=list)


class ClusterComplianceReportProviderDetail(StrictModel):
    type: Literal["cluster-compliance-report"] = "cluster-compliance-report"
    framework_id: str | None = None
    framework_title: str | None = None
    framework_description: str | None = None
    framework_version: str | None = None
    platform: str | None = None
    updated_at: str | None = None
    pass_count: int | None = None
    fail_count: int | None = None
    controls: list[ComplianceControlDetail] = Field(default_factory=list)
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CrossplaneCompositeProviderDetail(StrictModel):
    type: Literal["crossplane-composite"] = "crossplane-composite"
    claim: bool
    paused: bool
    composition_ref: ProviderNamedReference | None = None
    composition_revision_ref: ProviderNamedReference | None = None
    composition_update_policy: str | None = None
    bound_resource_ref: ProviderNamedReference | None = None
    composed_resource_refs: list[ProviderNamedReference] = Field(default_factory=list)
    conditions: list[ProviderCondition] = Field(default_factory=list)


class CronWorkflowProviderDetail(StrictModel):
    type: Literal["cron-workflow"] = "cron-workflow"
    schedules: list[str] = Field(default_factory=list)
    timezone: str | None = None
    suspended: bool | None = None
    concurrency_policy: str | None = None
    last_scheduled_time: str | None = None
    active_workflows: list[ProviderNamedReference] = Field(default_factory=list)
    workflow_template_ref: ProviderNamedReference | None = None
    workflow_template_cluster_scope: bool | None = None
    entrypoint: str | None = None
    argument_count: int | None = None
    template_count: int | None = None
    successful_history_limit: int | None = None
    failed_history_limit: int | None = None
    starting_deadline_seconds: int | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


class ExternalSecretMappingDetail(StrictModel):
    secret_key: str | None = None
    remote_key: str | None = None
    remote_property: str | None = None
    remote_version: str | None = None


class ExternalSecretSourceDetail(StrictModel):
    type: Literal["extract", "find", "source-ref", "unknown"]
    detail: str | None = None


class ExternalSecretProviderDetail(StrictModel):
    type: Literal["external-secret"] = "external-secret"
    ready: bool | None = None
    last_sync_time: str | None = None
    refresh_interval: str | None = None
    target_name: str | None = None
    synced_resource_version: str | None = None
    binding_name: str | None = None
    store_name: str | None = None
    store_kind: str | None = None
    mappings: list[ExternalSecretMappingDetail] = Field(default_factory=list)
    data_sources: list[ExternalSecretSourceDetail] = Field(default_factory=list)
    target_creation_policy: str | None = None
    target_deletion_policy: str | None = None
    template_type: str | None = None
    template_engine_version: str | None = None
    template_labels: list[ProviderKeyValue] = Field(default_factory=list)
    template_annotations: list[ProviderKeyValue] = Field(default_factory=list)
    conditions: list[ProviderCondition] = Field(default_factory=list)


class GatewayClassProviderDetail(StrictModel):
    type: Literal["gateway-class"] = "gateway-class"
    controller_name: str | None = None
    description: str | None = None
    accepted: bool | None = None
    parameters_ref: ProviderNamedReference | None = None
    conditions: list[ProviderCondition] = Field(default_factory=list)


ResourceProviderDetail = Annotated[
    AwsMachineProviderDetail
    | AwsManagedClusterProviderDetail
    | AwsManagedControlPlaneProviderDetail
    | AwsManagedMachinePoolProviderDetail
    | AzureMachineProviderDetail
    | AzureManagedControlPlaneProviderDetail
    | AzureManagedMachinePoolProviderDetail
    | CapiClusterProviderDetail
    | CapiKubeadmControlPlaneProviderDetail
    | CapiMachineDeploymentProviderDetail
    | CapiMachineHealthCheckProviderDetail
    | CapiMachinePoolProviderDetail
    | CapiMachineProviderDetail
    | CapiMachineSetProviderDetail
    | CertificateProviderDetail
    | CertificateRequestProviderDetail
    | ClusterComplianceReportProviderDetail
    | CrossplaneCompositeProviderDetail
    | CronWorkflowProviderDetail
    | ExternalSecretProviderDetail
    | GatewayClassProviderDetail,
    Field(discriminator="type"),
]
