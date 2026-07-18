import type { ProviderResourceDetailEndpoint } from "./providerResourceEndpointContract";
import type {
  GatewayRouteParentStatus,
  GatewayRouteRule,
  KedaTrigger,
  PrometheusRuleGroup,
  ProviderCondition,
  ProviderKeyValue,
  ProviderNamedReference,
  ProviderReference,
  ProviderRequirement,
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
  if (type === "core-workload") return {
    type,
    conditions,
    kind: requiredString(raw.kind),
    owner: namedReference(raw.owner),
    replicas: replicas(raw.replicas),
    unavailable: optionalInteger(raw.unavailable),
    strategyType: optionalString(raw.strategy_type),
    maxSurge: optionalString(raw.max_surge),
    maxUnavailable: optionalString(raw.max_unavailable),
    minReadySeconds: optionalInteger(raw.min_ready_seconds),
    revisionHistoryCount: optionalInteger(raw.revision_history_count),
    serviceAccountName: optionalString(raw.service_account_name),
    selector: keyValues(raw.selector),
    initContainers: containerProjections(raw.init_containers),
    containers: containerProjections(raw.containers),
  };
  if (type === "core-pod") return {
    type,
    conditions,
    phase: optionalString(raw.phase),
    nodeName: optionalString(raw.node_name),
    podIp: optionalString(raw.pod_ip),
    hostIp: optionalString(raw.host_ip),
    serviceAccountName: optionalString(raw.service_account_name),
    owner: namedReference(raw.owner),
    initContainers: containerProjections(raw.init_containers),
    containers: containerProjections(raw.containers),
    ephemeralContainerNames: stringList(raw.ephemeral_container_names),
  };
  if (type === "core-service") return {
    type,
    conditions,
    serviceType: optionalString(raw.service_type),
    clusterIp: optionalString(raw.cluster_ip),
    externalName: optionalString(raw.external_name),
    externalIps: stringList(raw.external_ips),
    loadBalancerAddresses: stringList(raw.load_balancer_addresses),
    externalTrafficPolicy: optionalString(raw.external_traffic_policy),
    internalTrafficPolicy: optionalString(raw.internal_traffic_policy),
    ipFamilies: stringList(raw.ip_families),
    ports: stringList(raw.ports),
    selector: keyValues(raw.selector),
  };
  if (type === "core-ingress") return {
    type,
    conditions,
    ingressClassName: optionalString(raw.ingress_class_name),
    addresses: stringList(raw.addresses),
    routes: records(raw.routes).map((item) => ({
      host: optionalString(item.host),
      path: requiredString(item.path),
      pathType: optionalString(item.path_type),
      backendService: requiredString(item.backend_service),
      backendPort: optionalString(item.backend_port),
    })),
    tls: records(raw.tls).map((item) => ({
      secretName: optionalString(item.secret_name),
      hosts: stringList(item.hosts),
    })),
  };
  if (type === "argo-application") return {
    type,
    conditions,
    syncStatus: optionalString(raw.sync_status),
    healthStatus: optionalString(raw.health_status),
    operationPhase: optionalString(raw.operation_phase),
    repositoryUrl: optionalString(raw.repository_url),
    sourcePath: optionalString(raw.source_path),
    targetRevision: optionalString(raw.target_revision),
    chart: optionalString(raw.chart),
    destinationServer: optionalString(raw.destination_server),
    destinationNamespace: optionalString(raw.destination_namespace),
    automated: requiredBoolean(raw.automated),
    selfHeal: requiredBoolean(raw.self_heal),
    prune: requiredBoolean(raw.prune),
    retryEnabled: requiredBoolean(raw.retry_enabled),
    managedResourceCount: requiredInteger(raw.managed_resource_count),
    revisionHistory: stringList(raw.revision_history),
  };
  if (type === "core-cron-job") return {
    type,
    conditions,
    schedule: optionalString(raw.schedule),
    scheduleDescription: optionalString(raw.schedule_description),
    timezone: optionalString(raw.timezone),
    suspended: requiredBoolean(raw.suspended),
    lastScheduleTime: optionalString(raw.last_schedule_time),
    lastSuccessfulTime: optionalString(raw.last_successful_time),
    activeJobs: namedReferences(raw.active_jobs),
    concurrencyPolicy: optionalString(raw.concurrency_policy),
    startingDeadlineSeconds: optionalInteger(raw.starting_deadline_seconds),
    successfulHistoryLimit: optionalInteger(raw.successful_history_limit),
    failedHistoryLimit: optionalInteger(raw.failed_history_limit),
  };
  if (type === "core-config-map") return {
    type,
    conditions,
    immutable: requiredBoolean(raw.immutable),
    keyCount: requiredInteger(raw.key_count),
    entries: records(raw.entries).map((item) => ({
      key: requiredString(item.key),
      sizeBytes: requiredInteger(item.size_bytes),
      preview: optionalString(item.preview),
      truncated: requiredBoolean(item.truncated),
      binary: requiredBoolean(item.binary),
    })),
  };
  if (type === "core-hpa") return {
    type,
    conditions,
    target: namedReference(raw.target),
    minimumReplicas: optionalInteger(raw.minimum_replicas),
    maximumReplicas: optionalInteger(raw.maximum_replicas),
    currentReplicas: optionalInteger(raw.current_replicas),
    desiredReplicas: optionalInteger(raw.desired_replicas),
    lastScaleTime: optionalString(raw.last_scale_time),
    metrics: records(raw.metrics).map((item) => ({
      type: requiredString(item.type),
      name: requiredString(item.name),
      current: optionalString(item.current),
      target: optionalString(item.target),
      unavailableReason: optionalString(item.unavailable_reason),
    })),
  };
  if (type === "core-node") return {
    type,
    conditions,
    ready: optionalBoolean(raw.ready),
    unschedulable: requiredBoolean(raw.unschedulable),
    providerId: optionalString(raw.provider_id),
    osImage: optionalString(raw.os_image),
    architecture: optionalString(raw.architecture),
    kernelVersion: optionalString(raw.kernel_version),
    containerRuntimeVersion: optionalString(raw.container_runtime_version),
    kubeletVersion: optionalString(raw.kubelet_version),
    capacity: keyValues(raw.capacity),
    allocatable: keyValues(raw.allocatable),
    usage: keyValues(raw.usage),
    addresses: records(raw.addresses).map((item) => ({
      type: requiredString(item.type),
      address: requiredString(item.address),
    })),
    zone: optionalString(raw.zone),
    region: optionalString(raw.region),
    nodePool: optionalString(raw.node_pool),
    taints: records(raw.taints).map((item) => ({
      key: requiredString(item.key),
      value: optionalString(item.value),
      effect: optionalString(item.effect),
    })),
    managedPodCount: optionalInteger(raw.managed_pod_count),
    metricsObservedAt: optionalString(raw.metrics_observed_at),
  };
  if (type === "core-namespace") return {
    type,
    conditions,
    phase: optionalString(raw.phase),
    manager: optionalString(raw.manager),
    injection: optionalString(raw.injection),
    quotas: records(raw.quotas).map((item) => ({
      name: requiredString(item.name),
      hard: keyValues(item.hard),
      used: keyValues(item.used),
    })),
    serviceAccountCount: optionalInteger(raw.service_account_count),
    roleBindingCount: optionalInteger(raw.role_binding_count),
    clusterRoleBindingCount: optionalInteger(raw.cluster_role_binding_count),
  };
  if (type === "core-event") return {
    type,
    conditions,
    eventType: optionalString(raw.event_type),
    reason: optionalString(raw.reason),
    message: optionalString(raw.message),
    involvedObject: reference(raw.involved_object),
    count: optionalInteger(raw.count),
    firstObservedAt: optionalString(raw.first_observed_at),
    lastObservedAt: optionalString(raw.last_observed_at),
    durationSeconds: optionalInteger(raw.duration_seconds),
    sourceComponent: optionalString(raw.source_component),
    sourceHost: optionalString(raw.source_host),
    reportingController: optionalString(raw.reporting_controller),
    reportingInstance: optionalString(raw.reporting_instance),
    apiVersion: optionalString(raw.api_version),
    resourceVersion: optionalString(raw.resource_version),
  };
  if (type === "core-rbac") return {
    type,
    conditions,
    kind: requiredString(raw.kind),
    automountServiceAccountToken: optionalBoolean(raw.automount_service_account_token),
    secretNames: stringList(raw.secret_names),
    imagePullSecretNames: stringList(raw.image_pull_secret_names),
    roleRef: namedReference(raw.role_ref),
    subjects: records(raw.subjects).map((item) => ({
      kind: requiredString(item.kind),
      namespace: optionalString(item.namespace),
      name: requiredString(item.name),
    })),
    rules: records(raw.rules).map((item) => ({
      verbs: stringList(item.verbs),
      apiGroups: stringList(item.api_groups),
      resources: stringList(item.resources),
      resourceNames: stringList(item.resource_names),
      nonResourceUrls: stringList(item.non_resource_urls),
      wildcard: requiredBoolean(item.wildcard),
      escalation: requiredBoolean(item.escalation),
    })),
    wildcardWarning: requiredBoolean(raw.wildcard_warning),
    escalationWarning: requiredBoolean(raw.escalation_warning),
  };
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
  if (type === "crossplane-managed-resource") return {
    type,
    conditions,
    apiGroup: optionalString(raw.api_group),
    kind: requiredString(raw.kind),
    externalName: optionalString(raw.external_name),
    managementPolicies: stringList(raw.management_policies),
    deletionPolicy: optionalString(raw.deletion_policy),
    paused: requiredBoolean(raw.paused),
    providerConfigRef: namedReference(raw.provider_config_ref),
    composingResourceRef: namedReference(raw.composing_resource_ref),
    observedSpecFields: stringList(raw.observed_spec_fields),
    observedStatusFields: stringList(raw.observed_status_fields),
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
  if (type === "persistent-volume-claim") return {
    type,
    conditions,
    phase: optionalString(raw.phase),
    capacity: optionalString(raw.capacity),
    requested: optionalString(raw.requested),
    storageClassName: optionalString(raw.storage_class_name),
    accessModes: stringList(raw.access_modes),
    volumeMode: optionalString(raw.volume_mode),
    volumeName: optionalString(raw.volume_name),
    provisioner: optionalString(raw.provisioner),
    selectedNode: optionalString(raw.selected_node),
    bindCompleted: optionalBoolean(raw.bind_completed),
  };
  if (type === "sealed-secret") return {
    type,
    conditions,
    synced: optionalBoolean(raw.synced),
    targetSecretName: optionalString(raw.target_secret_name),
    secretType: optionalString(raw.secret_type),
    scope: sealedSecretScope(raw.scope),
    observedGeneration: optionalInteger(raw.observed_generation),
    encryptedKeys: stringList(raw.encrypted_keys),
    templateLabels: keyValues(raw.template_labels),
    templateAnnotations: keyValues(raw.template_annotations),
  };
  if (type === "secret") return {
    type,
    conditions,
    secretType: optionalString(raw.secret_type),
    immutable: optionalBoolean(raw.immutable),
    keyNames: stringList(raw.key_names),
  };
  if (type === "secret-store") return {
    type,
    conditions,
    clusterScope: requiredBoolean(raw.cluster_scope),
    ready: optionalBoolean(raw.ready),
    providerKey: optionalString(raw.provider_key),
    providerType: optionalString(raw.provider_type),
    providerDetails: keyValues(raw.provider_details),
    controller: optionalString(raw.controller),
    maxRetries: optionalInteger(raw.max_retries),
    retryInterval: optionalString(raw.retry_interval),
  };
  if (type === "workflow") return {
    type,
    conditions,
    phase: requiredString(raw.phase),
    startedAt: optionalString(raw.started_at),
    finishedAt: optionalString(raw.finished_at),
    progress: optionalString(raw.progress),
    estimatedDurationSeconds: optionalInteger(raw.estimated_duration_seconds),
    workflowTemplateRef: namedReference(raw.workflow_template_ref),
    argumentNames: stringList(raw.argument_names),
    resourceDurations: keyValues(raw.resource_durations),
    executionNodes: records(raw.execution_nodes).map((item) => ({
      id: requiredString(item.id),
      label: requiredString(item.label),
      nodeType: requiredString(item.node_type),
      phase: requiredString(item.phase),
      depth: requiredInteger(item.depth),
      startedAt: optionalString(item.started_at),
      finishedAt: optionalString(item.finished_at),
      message: optionalString(item.message),
      templateRef: namedReference(item.template_ref),
    })),
    observedNodeCount: requiredInteger(raw.observed_node_count),
    projectedNodeCount: requiredInteger(raw.projected_node_count),
    truncated: requiredBoolean(raw.truncated),
    problemSummaries: stringList(raw.problem_summaries),
  };
  if (type === "gateway-class") return {
    type,
    conditions,
    controllerName: optionalString(raw.controller_name),
    description: optionalString(raw.description),
    accepted: optionalBoolean(raw.accepted),
    parametersRef: namedReference(raw.parameters_ref),
  };
  if (type === "gcp-machine") return {
    type,
    conditions,
    ready: optionalBoolean(raw.ready),
    instanceType: optionalString(raw.instance_type),
    zone: optionalString(raw.zone),
    instanceId: optionalString(raw.instance_id),
    image: optionalString(raw.image),
    additionalDisks: records(raw.additional_disks).map((item) => ({
      deviceType: optionalString(item.device_type),
      sizeGb: optionalInteger(item.size_gb),
    })),
  };
  if (type === "gcp-managed-control-plane") return {
    type,
    conditions,
    ready: optionalBoolean(raw.ready),
    clusterName: optionalString(raw.cluster_name),
    project: optionalString(raw.project),
    location: optionalString(raw.location),
    version: optionalString(raw.version),
    releaseChannel: optionalString(raw.release_channel),
    autopilot: optionalBoolean(raw.autopilot),
    endpoint: optionalString(raw.endpoint),
    podCidr: optionalString(raw.pod_cidr),
    serviceCidr: optionalString(raw.service_cidr),
    ipAliases: optionalBoolean(raw.ip_aliases),
    loggingService: optionalString(raw.logging_service),
    monitoringService: optionalString(raw.monitoring_service),
    authorizedNetworks: records(raw.authorized_networks).map((item) => ({
      name: optionalString(item.name),
      cidr: requiredString(item.cidr),
    })),
  };
  if (type === "gcp-managed-machine-pool") return {
    type,
    conditions,
    ready: optionalBoolean(raw.ready),
    nodePoolName: optionalString(raw.node_pool_name),
    machineType: optionalString(raw.machine_type),
    diskType: optionalString(raw.disk_type),
    diskSizeGb: optionalInteger(raw.disk_size_gb),
    imageType: optionalString(raw.image_type),
    maxPodsPerNode: optionalInteger(raw.max_pods_per_node),
    autoscalingEnabled: optionalBoolean(raw.autoscaling_enabled),
    scaling: scaling(raw.scaling),
    autoRepair: optionalBoolean(raw.auto_repair),
    autoUpgrade: optionalBoolean(raw.auto_upgrade),
    nodeLocations: stringList(raw.node_locations),
    labels: keyValues(raw.labels),
    taints: records(raw.taints).map((item) => ({
      key: requiredString(item.key),
      value: optionalString(item.value),
      effect: optionalString(item.effect),
    })),
  };
  if (
    type === "grpc-route" ||
    type === "http-route" ||
    type === "tcp-route" ||
    type === "tls-route"
  ) return {
    type,
    conditions,
    hostnames: stringList(raw.hostnames),
    parentRefs: namedReferences(raw.parent_refs),
    rules: gatewayRouteRules(raw.rules),
    parentStatuses: gatewayRouteParentStatuses(raw.parent_statuses),
  };
  if (type === "job") return {
    type,
    conditions,
    state: jobState(raw.state),
    succeeded: optionalInteger(raw.succeeded),
    failed: optionalInteger(raw.failed),
    active: optionalInteger(raw.active),
    completions: optionalInteger(raw.completions),
    parallelism: optionalInteger(raw.parallelism),
    backoffLimit: optionalInteger(raw.backoff_limit),
    activeDeadlineSeconds: optionalInteger(raw.active_deadline_seconds),
    ttlSecondsAfterFinished: optionalInteger(raw.ttl_seconds_after_finished),
    suspended: optionalBoolean(raw.suspended),
    startTime: optionalString(raw.start_time),
    completionTime: optionalString(raw.completion_time),
    terminalReason: optionalString(raw.terminal_reason),
    terminalMessage: optionalString(raw.terminal_message),
  };
  if (type === "karpenter-ec2-node-class") {
    const metadataOptions = raw.metadata_options === null ? null : record(raw.metadata_options);
    return {
      type,
      conditions,
      ready: optionalBoolean(raw.ready),
      role: optionalString(raw.role),
      instanceProfile: optionalString(raw.instance_profile),
      amiFamily: optionalString(raw.ami_family),
      amiSelectorTerms: karpenterSelectorTerms(raw.ami_selector_terms),
      blockDevices: records(raw.block_devices).map((item) => ({
        deviceName: optionalString(item.device_name),
        volumeType: optionalString(item.volume_type),
        volumeSize: optionalString(item.volume_size),
        iops: optionalInteger(item.iops),
        throughput: optionalInteger(item.throughput),
        encrypted: optionalBoolean(item.encrypted),
        deleteOnTermination: optionalBoolean(item.delete_on_termination),
      })),
      subnetSelectorTerms: karpenterSelectorTerms(raw.subnet_selector_terms),
      securityGroupSelectorTerms: karpenterSelectorTerms(raw.security_group_selector_terms),
      metadataOptions: metadataOptions === null ? null : {
        httpTokens: optionalString(metadataOptions.http_tokens),
        httpPutResponseHopLimit: optionalInteger(metadataOptions.http_put_response_hop_limit),
        httpEndpoint: optionalString(metadataOptions.http_endpoint),
      },
      resolvedAmis: records(raw.resolved_amis).map((item) => ({
        id: requiredString(item.id),
        name: optionalString(item.name),
        requirements: providerRequirements(item.requirements),
      })),
      resolvedSubnets: karpenterResolvedNetworks(raw.resolved_subnets),
      resolvedSecurityGroups: karpenterResolvedNetworks(raw.resolved_security_groups),
      tags: keyValues(raw.tags),
    };
  }
  if (type === "karpenter-node-claim") {
    const capacity = record(raw.capacity);
    return {
      type,
      conditions,
      state: karpenterNodeClaimState(raw.state),
      instanceType: optionalString(raw.instance_type),
      capacityType: optionalString(raw.capacity_type),
      nodeName: optionalString(raw.node_name),
      zone: optionalString(raw.zone),
      architecture: optionalString(raw.architecture),
      nodePool: optionalString(raw.node_pool),
      nodeClassRef: namedReference(raw.node_class_ref),
      imageId: optionalString(raw.image_id),
      expireAfter: optionalString(raw.expire_after),
      capacity: {
        cpu: optionalString(capacity.cpu),
        memory: optionalString(capacity.memory),
        pods: optionalString(capacity.pods),
        ephemeralStorage: optionalString(capacity.ephemeral_storage),
      },
      requirements: providerRequirements(raw.requirements),
    };
  }
  if (type === "karpenter-node-pool") return {
    type,
    conditions,
    ready: optionalBoolean(raw.ready),
    nodeClassRef: namedReference(raw.node_class_ref),
    limitCpu: optionalString(raw.limit_cpu),
    limitMemory: optionalString(raw.limit_memory),
    weight: optionalInteger(raw.weight),
    currentCpu: optionalString(raw.current_cpu),
    currentMemory: optionalString(raw.current_memory),
    consolidationPolicy: optionalString(raw.consolidation_policy),
    consolidateAfter: optionalString(raw.consolidate_after),
    expireAfter: optionalString(raw.expire_after),
    disruptionBudgets: records(raw.disruption_budgets).map((item) => ({
      nodes: optionalString(item.nodes),
      schedule: optionalString(item.schedule),
      duration: optionalString(item.duration),
    })),
    templateLabels: keyValues(raw.template_labels),
    templateTaints: providerTaints(raw.template_taints),
    startupTaints: providerTaints(raw.startup_taints),
    requirements: providerRequirements(raw.requirements),
  };
  if (type === "keda-scaled-object") return {
    type,
    conditions,
    state: kedaScaledObjectState(raw.state),
    targetRef: namedReference(raw.target_ref),
    scaling: scaling(raw.scaling),
    idleReplicas: optionalInteger(raw.idle_replicas),
    pollingIntervalSeconds: optionalInteger(raw.polling_interval_seconds),
    cooldownPeriodSeconds: optionalInteger(raw.cooldown_period_seconds),
    hpaName: optionalString(raw.hpa_name),
    lastActiveTime: optionalString(raw.last_active_time),
    fallbackFailureThreshold: optionalInteger(raw.fallback_failure_threshold),
    fallbackReplicas: optionalInteger(raw.fallback_replicas),
    restoreOriginalReplicas: optionalBoolean(raw.restore_original_replicas),
    scaleUpStabilizationSeconds: optionalInteger(raw.scale_up_stabilization_seconds),
    scaleDownStabilizationSeconds: optionalInteger(raw.scale_down_stabilization_seconds),
    scalingPolicies: records(raw.scaling_policies).map((item) => ({
      direction: kedaScalingDirection(item.direction),
      type: optionalString(item.type),
      value: optionalInteger(item.value),
      periodSeconds: optionalInteger(item.period_seconds),
    })),
    triggers: kedaTriggers(raw.triggers),
  };
  if (type === "keda-scaled-job") return {
    type,
    conditions,
    state: kedaScaledJobState(raw.state),
    jobTargetName: optionalString(raw.job_target_name),
    strategy: optionalString(raw.strategy),
    pollingIntervalSeconds: optionalInteger(raw.polling_interval_seconds),
    successfulHistoryLimit: optionalInteger(raw.successful_history_limit),
    failedHistoryLimit: optionalInteger(raw.failed_history_limit),
    minimumReplicas: optionalInteger(raw.minimum_replicas),
    maximumReplicas: optionalInteger(raw.maximum_replicas),
    triggers: kedaTriggers(raw.triggers),
  };
  if (type === "sbom-report") return {
    type,
    conditions,
    containerName: optionalString(raw.container_name),
    image: optionalString(raw.image),
    bomFormat: optionalString(raw.bom_format),
    specVersion: optionalString(raw.spec_version),
    componentCount: requiredInteger(raw.component_count),
    dependencyCount: requiredInteger(raw.dependency_count),
    observedComponentCount: requiredInteger(raw.observed_component_count),
    projectedComponentCount: requiredInteger(raw.projected_component_count),
    truncated: requiredBoolean(raw.truncated),
    scannerName: optionalString(raw.scanner_name),
    scannerVersion: optionalString(raw.scanner_version),
    scannedAt: optionalString(raw.scanned_at),
    components: records(raw.components).map((item) => ({
      name: requiredString(item.name),
      version: optionalString(item.version),
      type: optionalString(item.type),
      packageUrl: optionalString(item.package_url),
      packageUrlQualifiersRedacted: requiredBoolean(item.package_url_qualifiers_redacted),
      license: optionalString(item.license),
    })),
  };
  if (type === "vulnerability-report") {
    const severity = record(raw.severity);
    return {
      type,
      conditions,
      containerName: optionalString(raw.container_name),
      image: optionalString(raw.image),
      osFamily: optionalString(raw.os_family),
      osName: optionalString(raw.os_name),
      osEndOfServiceLife: optionalBoolean(raw.os_end_of_service_life),
      scannerName: optionalString(raw.scanner_name),
      scannerVersion: optionalString(raw.scanner_version),
      scannedAt: optionalString(raw.scanned_at),
      severity: {
        critical: requiredInteger(severity.critical),
        high: requiredInteger(severity.high),
        medium: requiredInteger(severity.medium),
        low: requiredInteger(severity.low),
        unknown: requiredInteger(severity.unknown),
      },
      observedVulnerabilityCount: requiredInteger(raw.observed_vulnerability_count),
      projectedVulnerabilityCount: requiredInteger(raw.projected_vulnerability_count),
      truncated: requiredBoolean(raw.truncated),
      vulnerabilities: records(raw.vulnerabilities).map((item) => ({
        vulnerabilityId: requiredString(item.vulnerability_id),
        severity: vulnerabilitySeverity(item.severity),
        score: optionalFiniteNumber(item.score),
        package: optionalString(item.package),
        installedVersion: optionalString(item.installed_version),
        fixedVersion: optionalString(item.fixed_version),
        primaryLink: optionalString(item.primary_link),
      })),
    };
  }
  if (type === "prometheus-rule") return {
    type,
    conditions,
    groupCount: requiredInteger(raw.group_count),
    totalRules: requiredInteger(raw.total_rules),
    totalAlerts: requiredInteger(raw.total_alerts),
    totalRecordings: requiredInteger(raw.total_recordings),
    projectedRules: requiredInteger(raw.projected_rules),
    truncated: requiredBoolean(raw.truncated),
    groups: prometheusRuleGroups(raw.groups),
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

function containerProjections(value: unknown) {
  return records(value).map((item) => ({
    name: requiredString(item.name),
    image: optionalString(item.image),
    state: optionalString(item.state),
    stateReason: optionalString(item.state_reason),
    ready: optionalBoolean(item.ready),
    restartCount: requiredInteger(item.restart_count),
    ports: records(item.ports).map((port) => ({
      name: optionalString(port.name),
      containerPort: requiredInteger(port.container_port),
      protocol: requiredString(port.protocol),
    })),
    requests: keyValues(item.requests),
    limits: keyValues(item.limits),
  }));
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

function gatewayRouteRules(value: unknown): GatewayRouteRule[] {
  return records(value).map((rule) => ({
    matches: records(rule.matches).map((match) => ({
      method: optionalString(match.method),
      pathType: optionalString(match.path_type),
      pathValue: optionalString(match.path_value),
      grpcType: optionalString(match.grpc_type),
      grpcService: optionalString(match.grpc_service),
      grpcMethod: optionalString(match.grpc_method),
      headers: keyValues(match.headers),
      queryParams: keyValues(match.query_params),
    })),
    backends: records(rule.backends).map((backend) => {
      const backendReference = namedReference(backend.reference);
      if (backendReference === null) return invalidResponse();
      return {
        reference: backendReference,
        port: optionalInteger(backend.port),
        weight: optionalInteger(backend.weight),
      };
    }),
    filters: records(rule.filters).map((filter) => ({
      type: requiredString(filter.type),
      summary: optionalString(filter.summary),
    })),
  }));
}

function gatewayRouteParentStatuses(value: unknown): GatewayRouteParentStatus[] {
  return records(value).map((parent) => ({
    reference: namedReference(parent.reference),
    sectionName: optionalString(parent.section_name),
    accepted: optionalBoolean(parent.accepted),
    resolvedRefs: optionalBoolean(parent.resolved_refs),
    conditions: conditionList(parent.conditions),
  }));
}

function providerRequirements(value: unknown): ProviderRequirement[] {
  return records(value).map((item) => ({
    key: requiredString(item.key),
    operator: optionalString(item.operator),
    values: stringList(item.values),
    minValues: optionalInteger(item.min_values),
  }));
}

function karpenterSelectorTerms(value: unknown) {
  return records(value).map((item) => ({
    id: optionalString(item.id),
    name: optionalString(item.name),
    alias: optionalString(item.alias),
    owner: optionalString(item.owner),
    tags: keyValues(item.tags),
  }));
}

function karpenterResolvedNetworks(value: unknown) {
  return records(value).map((item) => ({
    id: requiredString(item.id),
    name: optionalString(item.name),
    zone: optionalString(item.zone),
  }));
}

function providerTaints(value: unknown) {
  return records(value).map((item) => ({
    key: requiredString(item.key),
    value: optionalString(item.value),
    effect: optionalString(item.effect),
  }));
}

function kedaTriggers(value: unknown): KedaTrigger[] {
  return records(value).map((item) => ({
    type: requiredString(item.type),
    name: optionalString(item.name),
    authenticationRef: namedReference(item.authentication_ref),
    metadataKeys: stringList(item.metadata_keys),
    redactedMetadataCount: requiredInteger(item.redacted_metadata_count),
  }));
}

function prometheusRuleGroups(value: unknown): PrometheusRuleGroup[] {
  return records(value).map((group) => ({
    name: requiredString(group.name),
    interval: optionalString(group.interval),
    ruleCount: requiredInteger(group.rule_count),
    alertCount: requiredInteger(group.alert_count),
    recordingCount: requiredInteger(group.recording_count),
    rules: records(group.rules).map((rule) => ({
      type: prometheusRuleType(rule.type),
      name: requiredString(rule.name),
      expression: requiredString(rule.expression),
      duration: optionalString(rule.duration),
      severity: optionalString(rule.severity),
      summary: optionalString(rule.summary),
      description: optionalString(rule.description),
      labels: keyValues(rule.labels),
    })),
  }));
}

function karpenterNodeClaimState(
  value: unknown,
): "ready" | "registered" | "launched" | "initialized" | "not-ready" | "pending" | "unknown" {
  const normalized = requiredString(value);
  if (
    normalized !== "ready" &&
    normalized !== "registered" &&
    normalized !== "launched" &&
    normalized !== "initialized" &&
    normalized !== "not-ready" &&
    normalized !== "pending" &&
    normalized !== "unknown"
  ) return invalidResponse();
  return normalized;
}

function kedaScaledObjectState(
  value: unknown,
): "paused" | "fallback" | "not-ready" | "active" | "idle" | "ready" | "unknown" {
  const normalized = requiredString(value);
  if (
    normalized !== "paused" &&
    normalized !== "fallback" &&
    normalized !== "not-ready" &&
    normalized !== "active" &&
    normalized !== "idle" &&
    normalized !== "ready" &&
    normalized !== "unknown"
  ) return invalidResponse();
  return normalized;
}

function kedaScaledJobState(
  value: unknown,
): "not-ready" | "active" | "idle" | "ready" | "unknown" {
  const normalized = requiredString(value);
  if (
    normalized !== "not-ready" &&
    normalized !== "active" &&
    normalized !== "idle" &&
    normalized !== "ready" &&
    normalized !== "unknown"
  ) return invalidResponse();
  return normalized;
}

function kedaScalingDirection(value: unknown): "up" | "down" {
  const normalized = requiredString(value);
  if (normalized !== "up" && normalized !== "down") return invalidResponse();
  return normalized;
}

function prometheusRuleType(value: unknown): "alert" | "recording" {
  const normalized = requiredString(value);
  if (normalized !== "alert" && normalized !== "recording") return invalidResponse();
  return normalized;
}

function vulnerabilitySeverity(
  value: unknown,
): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" {
  const normalized = requiredString(value);
  if (
    normalized !== "CRITICAL" &&
    normalized !== "HIGH" &&
    normalized !== "MEDIUM" &&
    normalized !== "LOW" &&
    normalized !== "UNKNOWN"
  ) return invalidResponse();
  return normalized;
}

function jobState(
  value: unknown,
): "completed" | "failed" | "suspended" | "running" | "pending" {
  const normalized = requiredString(value);
  if (
    normalized !== "completed" &&
    normalized !== "failed" &&
    normalized !== "suspended" &&
    normalized !== "running" &&
    normalized !== "pending"
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

function sealedSecretScope(
  value: unknown,
): "strict" | "namespace-wide" | "cluster-wide" {
  const normalized = requiredString(value);
  if (
    normalized !== "strict"
    && normalized !== "namespace-wide"
    && normalized !== "cluster-wide"
  ) return invalidResponse();
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

function requiredInteger(value: unknown): number {
  const parsed = optionalInteger(value);
  return parsed ?? invalidResponse();
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return invalidResponse();
  return value;
}
