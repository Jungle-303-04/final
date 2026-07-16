import type { ProviderResourceDetailEndpoint } from "./providerResourceEndpointContract";
import type {
  ProviderCondition,
  ProviderKeyValue,
  ProviderNamedReference,
  ProviderReference,
  ProviderReplicas,
  ProviderResourceDetail,
  ProviderScaling,
} from "./providerResourceContract";
import { invalidResponse } from "./resourcesValidation";

export function toProviderResourceDetail(
  value: ProviderResourceDetailEndpoint | null | undefined,
): ProviderResourceDetail | null {
  if (value === null || value === undefined) return null;
  const raw = record(value);
  const type = requiredString(raw.type);
  const conditions = conditionList(raw.conditions);
  if (type === "aws-machine") return {
    type,
    conditions,
    instanceType: optionalString(raw.instance_type),
    instanceId: optionalString(raw.instance_id),
    instanceState: optionalString(raw.instance_state),
    providerId: optionalString(raw.provider_id),
    iamInstanceProfile: optionalString(raw.iam_instance_profile),
    sshKeyName: optionalString(raw.ssh_key_name),
    subnetId: optionalString(raw.subnet_id),
    secretsBackend: optionalString(raw.secrets_backend),
    addresses: records(raw.addresses).map((item) => ({
      type: requiredString(item.type),
      address: requiredString(item.address),
    })),
  };
  if (type === "aws-managed-cluster") return {
    type,
    conditions,
    endpoint: optionalString(raw.endpoint),
    failureDomains: stringList(raw.failure_domains),
  };
  if (type === "aws-managed-control-plane") return {
    type,
    conditions,
    clusterName: optionalString(raw.cluster_name),
    region: optionalString(raw.region),
    version: optionalString(raw.version),
    endpointAccess: endpointAccess(raw.endpoint_access),
    roleName: optionalString(raw.role_name),
    identity: optionalString(raw.identity),
    vpcId: optionalString(raw.vpc_id),
    vpcCidrBlock: optionalString(raw.vpc_cidr_block),
    subnets: records(raw.subnets).map((item) => ({
      id: optionalString(item.id),
      availabilityZone: optionalString(item.availability_zone),
      public: optionalBoolean(item.public),
      cidrBlock: optionalString(item.cidr_block),
    })),
    securityGroups: records(raw.security_groups).map((item) => ({
      role: requiredString(item.role),
      id: optionalString(item.id),
      name: optionalString(item.name),
    })),
    natGatewayIps: stringList(raw.nat_gateway_ips),
    failureDomains: stringList(raw.failure_domains),
    addons: records(raw.addons).map((item) => ({
      name: requiredString(item.name),
      requestedVersion: optionalString(item.requested_version),
      currentVersion: optionalString(item.current_version),
      status: optionalString(item.status),
    })),
  };
  if (type === "aws-managed-machine-pool") return {
    type,
    conditions,
    nodeGroupName: optionalString(raw.node_group_name),
    instanceType: optionalString(raw.instance_type),
    amiType: optionalString(raw.ami_type),
    capacityType: optionalString(raw.capacity_type),
    roleName: optionalString(raw.role_name),
    scaling: scaling(raw.scaling),
    maxUnavailable: optionalInteger(raw.max_unavailable),
    subnetIds: stringList(raw.subnet_ids),
    labels: keyValues(raw.labels),
  };
  if (type === "azure-machine") return {
    type,
    conditions,
    vmSize: optionalString(raw.vm_size),
    availabilityZone: optionalString(raw.availability_zone),
    osType: optionalString(raw.os_type),
    osDiskSizeGb: optionalInteger(raw.os_disk_size_gb),
    providerId: optionalString(raw.provider_id),
    subnetName: optionalString(raw.subnet_name),
  };
  if (type === "azure-managed-control-plane") return {
    type,
    conditions,
    location: optionalString(raw.location),
    resourceGroupName: optionalString(raw.resource_group_name),
    version: optionalString(raw.version),
    skuTier: optionalString(raw.sku_tier),
    dnsPrefix: optionalString(raw.dns_prefix),
    subscriptionId: optionalString(raw.subscription_id),
    networkPlugin: optionalString(raw.network_plugin),
    networkPolicy: optionalString(raw.network_policy),
    privateCluster: optionalBoolean(raw.private_cluster),
    dnsServiceIp: optionalString(raw.dns_service_ip),
    loadBalancerSku: optionalString(raw.load_balancer_sku),
    upgradeChannel: optionalString(raw.upgrade_channel),
    authorizedIpRanges: stringList(raw.authorized_ip_ranges),
  };
  if (type === "azure-managed-machine-pool") return {
    type,
    conditions,
    poolName: optionalString(raw.pool_name),
    vmSize: optionalString(raw.vm_size),
    mode: optionalString(raw.mode),
    osType: optionalString(raw.os_type),
    osDiskType: optionalString(raw.os_disk_type),
    osDiskSizeGb: optionalInteger(raw.os_disk_size_gb),
    priority: optionalString(raw.priority),
    maxPods: optionalInteger(raw.max_pods),
    scaling: scaling(raw.scaling),
    scaleDownMode: optionalString(raw.scale_down_mode),
    availabilityZones: stringList(raw.availability_zones),
    labels: keyValues(raw.labels),
    taints: records(raw.taints).map((item) => ({
      key: requiredString(item.key),
      value: optionalString(item.value),
      effect: optionalString(item.effect),
    })),
  };
  if (type === "capi-cluster") return {
    type,
    conditions,
    phase: optionalString(raw.phase),
    version: optionalString(raw.version),
    clusterClass: optionalString(raw.cluster_class),
    endpoint: optionalString(raw.endpoint),
    provider: optionalString(raw.provider),
    paused: requiredBoolean(raw.paused),
    controlPlane: replicas(raw.control_plane),
    workers: replicas(raw.workers),
    controlPlaneRef: reference(raw.control_plane_ref),
    infrastructureRef: reference(raw.infrastructure_ref),
  };
  if (type === "capi-kubeadm-control-plane") return {
    type,
    conditions,
    clusterName: optionalString(raw.cluster_name),
    version: optionalString(raw.version),
    initialized: optionalBoolean(raw.initialized),
    updateStrategy: optionalString(raw.update_strategy),
    replicas: replicas(raw.replicas),
    infrastructureRef: reference(raw.infrastructure_ref),
    nodeDrainTimeout: optionalString(raw.node_drain_timeout),
    nodeVolumeDetachTimeout: optionalString(raw.node_volume_detach_timeout),
    nodeDeletionTimeout: optionalString(raw.node_deletion_timeout),
    certificateSans: stringList(raw.certificate_sans),
    remediationMachine: optionalString(raw.remediation_machine),
    remediationRetryCount: optionalInteger(raw.remediation_retry_count),
    remediationTimestamp: optionalString(raw.remediation_timestamp),
  };
  if (type === "capi-machine-deployment") return {
    type,
    conditions,
    phase: optionalString(raw.phase),
    clusterName: optionalString(raw.cluster_name),
    version: optionalString(raw.version),
    paused: requiredBoolean(raw.paused),
    replicas: replicas(raw.replicas),
    strategyType: optionalString(raw.strategy_type),
    maxSurge: optionalString(raw.max_surge),
    maxUnavailable: optionalString(raw.max_unavailable),
    infrastructureRef: reference(raw.infrastructure_ref),
    bootstrapRef: reference(raw.bootstrap_ref),
  };
  if (type === "capi-machine-health-check") return {
    type,
    conditions,
    clusterName: optionalString(raw.cluster_name),
    expectedMachines: optionalInteger(raw.expected_machines),
    currentHealthy: optionalInteger(raw.current_healthy),
    remediationsAllowed: optionalInteger(raw.remediations_allowed),
    nodeStartupTimeout: optionalString(raw.node_startup_timeout),
    maxUnhealthy: optionalString(raw.max_unhealthy),
    unhealthyRange: optionalString(raw.unhealthy_range),
    selector: keyValues(raw.selector),
    unhealthyConditions: records(raw.unhealthy_conditions).map((item) => ({
      type: requiredString(item.type),
      status: optionalString(item.status),
      timeout: optionalString(item.timeout),
    })),
    remediationTemplate: reference(raw.remediation_template),
  };
  if (type === "capi-machine-pool") return {
    type,
    conditions,
    phase: optionalString(raw.phase),
    clusterName: optionalString(raw.cluster_name),
    minReadySeconds: optionalInteger(raw.min_ready_seconds),
    replicas: replicas(raw.replicas),
    infrastructureRef: reference(raw.infrastructure_ref),
    bootstrapRef: reference(raw.bootstrap_ref),
  };
  if (type === "capi-machine") return {
    type,
    conditions,
    phase: optionalString(raw.phase),
    role: machineRole(raw.role),
    clusterName: optionalString(raw.cluster_name),
    version: optionalString(raw.version),
    failureDomain: optionalString(raw.failure_domain),
    provider: optionalString(raw.provider),
    providerId: optionalString(raw.provider_id),
    providerRegion: optionalString(raw.provider_region),
    providerInstanceId: optionalString(raw.provider_instance_id),
    nodeName: optionalString(raw.node_name),
    nodeUid: optionalString(raw.node_uid),
    bootstrapRef: reference(raw.bootstrap_ref),
    infrastructureRef: reference(raw.infrastructure_ref),
    addresses: records(raw.addresses).map((item) => ({
      type: requiredString(item.type),
      address: requiredString(item.address),
    })),
    osImage: optionalString(raw.os_image),
    architecture: optionalString(raw.architecture),
    kernelVersion: optionalString(raw.kernel_version),
    containerRuntimeVersion: optionalString(raw.container_runtime_version),
    kubeletVersion: optionalString(raw.kubelet_version),
  };
  if (type === "capi-machine-set") return {
    type,
    conditions,
    clusterName: optionalString(raw.cluster_name),
    deletePolicy: optionalString(raw.delete_policy),
    minReadySeconds: optionalInteger(raw.min_ready_seconds),
    replicas: replicas(raw.replicas),
    infrastructureRef: reference(raw.infrastructure_ref),
    bootstrapRef: reference(raw.bootstrap_ref),
  };
  if (type === "certificate") {
    const privateKey = raw.private_key === null ? null : record(raw.private_key);
    return {
      type,
      conditions,
      ready: optionalBoolean(raw.ready),
      secretName: optionalString(raw.secret_name),
      revision: optionalInteger(raw.revision),
      isCa: optionalBoolean(raw.is_ca),
      duration: optionalString(raw.duration),
      renewBefore: optionalString(raw.renew_before),
      notBefore: optionalString(raw.not_before),
      notAfter: optionalString(raw.not_after),
      renewalTime: optionalString(raw.renewal_time),
      failedIssuanceAttempts: optionalInteger(raw.failed_issuance_attempts),
      lastFailureTime: optionalString(raw.last_failure_time),
      privateKey: privateKey === null ? null : {
        algorithm: optionalString(privateKey.algorithm),
        size: optionalInteger(privateKey.size),
        encoding: optionalString(privateKey.encoding),
        rotationPolicy: optionalString(privateKey.rotation_policy),
      },
      dnsNames: stringList(raw.dns_names),
      issuerRef: namedReference(raw.issuer_ref),
      usages: stringList(raw.usages),
    };
  }
  if (type === "certificate-request") return {
    type,
    conditions,
    ready: optionalBoolean(raw.ready),
    approved: optionalBoolean(raw.approved),
    denied: optionalBoolean(raw.denied),
    issuerRef: namedReference(raw.issuer_ref),
    ownerCertificate: namedReference(raw.owner_certificate),
    duration: optionalString(raw.duration),
    usages: stringList(raw.usages),
    certificateIssued: optionalBoolean(raw.certificate_issued),
  };
  if (type === "cluster-compliance-report") return {
    type,
    conditions,
    frameworkId: optionalString(raw.framework_id),
    frameworkTitle: optionalString(raw.framework_title),
    frameworkDescription: optionalString(raw.framework_description),
    frameworkVersion: optionalString(raw.framework_version),
    platform: optionalString(raw.platform),
    updatedAt: optionalString(raw.updated_at),
    passCount: optionalInteger(raw.pass_count),
    failCount: optionalInteger(raw.fail_count),
    controls: records(raw.controls).map((item) => ({
      id: requiredString(item.id),
      name: optionalString(item.name),
      description: optionalString(item.description),
      severity: optionalString(item.severity),
      totalPass: optionalInteger(item.total_pass),
      totalFail: optionalInteger(item.total_fail),
      checkIds: stringList(item.check_ids),
    })),
  };
  if (type === "crossplane-composite") return {
    type,
    conditions,
    claim: requiredBoolean(raw.claim),
    paused: requiredBoolean(raw.paused),
    compositionRef: namedReference(raw.composition_ref),
    compositionRevisionRef: namedReference(raw.composition_revision_ref),
    compositionUpdatePolicy: optionalString(raw.composition_update_policy),
    boundResourceRef: namedReference(raw.bound_resource_ref),
    composedResourceRefs: namedReferences(raw.composed_resource_refs),
  };
  if (type === "cron-workflow") return {
    type,
    conditions,
    schedules: stringList(raw.schedules),
    timezone: optionalString(raw.timezone),
    suspended: optionalBoolean(raw.suspended),
    concurrencyPolicy: optionalString(raw.concurrency_policy),
    lastScheduledTime: optionalString(raw.last_scheduled_time),
    activeWorkflows: namedReferences(raw.active_workflows),
    workflowTemplateRef: namedReference(raw.workflow_template_ref),
    workflowTemplateClusterScope: optionalBoolean(raw.workflow_template_cluster_scope),
    entrypoint: optionalString(raw.entrypoint),
    argumentCount: optionalInteger(raw.argument_count),
    templateCount: optionalInteger(raw.template_count),
    successfulHistoryLimit: optionalInteger(raw.successful_history_limit),
    failedHistoryLimit: optionalInteger(raw.failed_history_limit),
    startingDeadlineSeconds: optionalInteger(raw.starting_deadline_seconds),
  };
  if (type === "external-secret") return {
    type,
    conditions,
    ready: optionalBoolean(raw.ready),
    lastSyncTime: optionalString(raw.last_sync_time),
    refreshInterval: optionalString(raw.refresh_interval),
    targetName: optionalString(raw.target_name),
    syncedResourceVersion: optionalString(raw.synced_resource_version),
    bindingName: optionalString(raw.binding_name),
    storeName: optionalString(raw.store_name),
    storeKind: optionalString(raw.store_kind),
    mappings: records(raw.mappings).map((item) => ({
      secretKey: optionalString(item.secret_key),
      remoteKey: optionalString(item.remote_key),
      remoteProperty: optionalString(item.remote_property),
      remoteVersion: optionalString(item.remote_version),
    })),
    dataSources: records(raw.data_sources).map((item) => ({
      type: externalSecretSourceType(item.type),
      detail: optionalString(item.detail),
    })),
    targetCreationPolicy: optionalString(raw.target_creation_policy),
    targetDeletionPolicy: optionalString(raw.target_deletion_policy),
    templateType: optionalString(raw.template_type),
    templateEngineVersion: optionalString(raw.template_engine_version),
    templateLabels: keyValues(raw.template_labels),
    templateAnnotations: keyValues(raw.template_annotations),
  };
  if (type === "gateway-class") return {
    type,
    conditions,
    controllerName: optionalString(raw.controller_name),
    description: optionalString(raw.description),
    accepted: optionalBoolean(raw.accepted),
    parametersRef: namedReference(raw.parameters_ref),
  };
  return invalidResponse();
}

function conditionList(value: unknown): ProviderCondition[] {
  return records(value).map((item) => {
    const status = requiredString(item.status);
    if (status !== "True" && status !== "False" && status !== "Unknown") invalidResponse();
    return {
      type: requiredString(item.type),
      status,
      reason: optionalString(item.reason),
      message: optionalString(item.message),
      lastTransitionTime: optionalString(item.last_transition_time),
    };
  });
}

function scaling(value: unknown): ProviderScaling {
  const item = record(value);
  return {
    minimum: optionalInteger(item.minimum),
    maximum: optionalInteger(item.maximum),
    current: optionalInteger(item.current),
  };
}

function replicas(value: unknown): ProviderReplicas {
  const item = record(value);
  return {
    desired: optionalInteger(item.desired),
    ready: optionalInteger(item.ready),
    available: optionalInteger(item.available),
    upToDate: optionalInteger(item.up_to_date),
  };
}

function reference(value: unknown): ProviderReference | null {
  if (value === null) return null;
  const item = record(value);
  return {
    apiVersion: optionalString(item.api_version),
    kind: requiredString(item.kind),
    namespace: optionalString(item.namespace),
    name: requiredString(item.name),
  };
}

function namedReference(value: unknown): ProviderNamedReference | null {
  if (value === null) return null;
  const item = record(value);
  return {
    apiVersion: optionalString(item.api_version),
    kind: optionalString(item.kind),
    namespace: optionalString(item.namespace),
    name: requiredString(item.name),
  };
}

function namedReferences(value: unknown): ProviderNamedReference[] {
  return records(value).map((item) => {
    const reference = namedReference(item);
    return reference ?? invalidResponse();
  });
}

function externalSecretSourceType(
  value: unknown,
): "extract" | "find" | "source-ref" | "unknown" {
  const normalized = requiredString(value);
  if (
    normalized !== "extract" &&
    normalized !== "find" &&
    normalized !== "source-ref" &&
    normalized !== "unknown"
  ) return invalidResponse();
  return normalized;
}

function machineRole(value: unknown): "control-plane" | "worker" {
  const normalized = requiredString(value);
  if (normalized !== "control-plane" && normalized !== "worker") return invalidResponse();
  return normalized;
}

function keyValues(value: unknown): ProviderKeyValue[] {
  return records(value).map((item) => ({
    key: requiredString(item.key),
    value: requiredString(item.value),
  }));
}

function endpointAccess(
  value: unknown,
): "public" | "private" | "public-and-private" | null {
  const normalized = optionalString(value);
  if (
    normalized !== null &&
    normalized !== "public" &&
    normalized !== "private" &&
    normalized !== "public-and-private"
  ) invalidResponse();
  return normalized;
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return invalidResponse();
  return value.map(record);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidResponse();
  }
  return value as Record<string, unknown>;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return invalidResponse();
  }
  return [...value] as string[];
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return invalidResponse();
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === null) return null;
  return requiredString(value);
}

function optionalBoolean(value: unknown): boolean | null {
  if (value === null) return null;
  if (typeof value !== "boolean") return invalidResponse();
  return value;
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") return invalidResponse();
  return value;
}

function optionalInteger(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value)) return invalidResponse();
  return value as number;
}
