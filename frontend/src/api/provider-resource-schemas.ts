import { z } from "zod";

const nullableString = z.string().nullable();
const nullableInteger = z.number().int().safe().nullable();
const nonnegativeSafeInteger = z.number().int().safe().nonnegative();
const nullableExternalHttpUrl = z.string().max(2_000).url().refine((value) => {
  const parsed = new URL(value);
  return (
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    parsed.username === "" &&
    parsed.password === ""
  );
}).nullable();
const condition = z.strictObject({
  type: z.string().min(1),
  status: z.enum(["True", "False", "Unknown"]),
  reason: nullableString,
  message: nullableString,
  last_transition_time: nullableString,
});
const conditions = z.array(condition).max(100);
const keyValue = z.strictObject({ key: z.string().min(1), value: z.string() });
const scaling = z.strictObject({
  minimum: nullableInteger,
  maximum: nullableInteger,
  current: nullableInteger,
});
const reference = z.strictObject({
  api_version: nullableString,
  kind: z.string().min(1),
  namespace: nullableString,
  name: z.string().min(1),
});
const namedReference = z.strictObject({
  api_version: nullableString,
  kind: nullableString,
  namespace: nullableString,
  name: z.string().min(1),
});
const replicas = z.strictObject({
  desired: nullableInteger,
  ready: nullableInteger,
  available: nullableInteger,
  up_to_date: nullableInteger,
});

const awsMachine = z.strictObject({
  type: z.literal("aws-machine"),
  instance_type: nullableString,
  instance_id: nullableString,
  instance_state: nullableString,
  provider_id: nullableString,
  iam_instance_profile: nullableString,
  ssh_key_name: nullableString,
  subnet_id: nullableString,
  secrets_backend: nullableString,
  addresses: z.array(z.strictObject({ type: z.string().min(1), address: z.string().min(1) })).max(100),
  conditions,
});

const awsManagedCluster = z.strictObject({
  type: z.literal("aws-managed-cluster"),
  endpoint: nullableString,
  failure_domains: z.array(z.string()).max(100),
  conditions,
});

const awsManagedControlPlane = z.strictObject({
  type: z.literal("aws-managed-control-plane"),
  cluster_name: nullableString,
  region: nullableString,
  version: nullableString,
  endpoint_access: z.enum(["public", "private", "public-and-private"]).nullable(),
  role_name: nullableString,
  identity: nullableString,
  vpc_id: nullableString,
  vpc_cidr_block: nullableString,
  subnets: z.array(z.strictObject({
    id: nullableString,
    availability_zone: nullableString,
    public: z.boolean().nullable(),
    cidr_block: nullableString,
  })).max(100),
  security_groups: z.array(z.strictObject({
    role: z.string().min(1),
    id: nullableString,
    name: nullableString,
  })).max(100),
  nat_gateway_ips: z.array(z.string()).max(100),
  failure_domains: z.array(z.string()).max(100),
  addons: z.array(z.strictObject({
    name: z.string().min(1),
    requested_version: nullableString,
    current_version: nullableString,
    status: nullableString,
  })).max(100),
  conditions,
});

const awsManagedMachinePool = z.strictObject({
  type: z.literal("aws-managed-machine-pool"),
  node_group_name: nullableString,
  instance_type: nullableString,
  ami_type: nullableString,
  capacity_type: nullableString,
  role_name: nullableString,
  scaling,
  max_unavailable: nullableInteger,
  subnet_ids: z.array(z.string()).max(100),
  labels: z.array(keyValue).max(100),
  conditions,
});

const azureMachine = z.strictObject({
  type: z.literal("azure-machine"),
  vm_size: nullableString,
  availability_zone: nullableString,
  os_type: nullableString,
  os_disk_size_gb: nullableInteger,
  provider_id: nullableString,
  subnet_name: nullableString,
  conditions,
});

const azureManagedControlPlane = z.strictObject({
  type: z.literal("azure-managed-control-plane"),
  location: nullableString,
  resource_group_name: nullableString,
  version: nullableString,
  sku_tier: nullableString,
  dns_prefix: nullableString,
  subscription_id: nullableString,
  network_plugin: nullableString,
  network_policy: nullableString,
  private_cluster: z.boolean().nullable(),
  dns_service_ip: nullableString,
  load_balancer_sku: nullableString,
  upgrade_channel: nullableString,
  authorized_ip_ranges: z.array(z.string()).max(100),
  conditions,
});

const azureManagedMachinePool = z.strictObject({
  type: z.literal("azure-managed-machine-pool"),
  pool_name: nullableString,
  vm_size: nullableString,
  mode: nullableString,
  os_type: nullableString,
  os_disk_type: nullableString,
  os_disk_size_gb: nullableInteger,
  priority: nullableString,
  max_pods: nullableInteger,
  scaling,
  scale_down_mode: nullableString,
  availability_zones: z.array(z.string()).max(100),
  labels: z.array(keyValue).max(100),
  taints: z.array(z.strictObject({
    key: z.string().min(1),
    value: nullableString,
    effect: nullableString,
  })).max(100),
  conditions,
});

const capiCluster = z.strictObject({
  type: z.literal("capi-cluster"),
  phase: nullableString,
  version: nullableString,
  cluster_class: nullableString,
  endpoint: nullableString,
  provider: nullableString,
  paused: z.boolean(),
  control_plane: replicas,
  workers: replicas,
  control_plane_ref: reference.nullable(),
  infrastructure_ref: reference.nullable(),
  conditions,
});

const capiKubeadmControlPlane = z.strictObject({
  type: z.literal("capi-kubeadm-control-plane"),
  cluster_name: nullableString,
  version: nullableString,
  initialized: z.boolean().nullable(),
  update_strategy: nullableString,
  replicas,
  infrastructure_ref: reference.nullable(),
  node_drain_timeout: nullableString,
  node_volume_detach_timeout: nullableString,
  node_deletion_timeout: nullableString,
  certificate_sans: z.array(z.string()).max(100),
  remediation_machine: nullableString,
  remediation_retry_count: nullableInteger,
  remediation_timestamp: nullableString,
  conditions,
});

const capiMachineDeployment = z.strictObject({
  type: z.literal("capi-machine-deployment"),
  phase: nullableString,
  cluster_name: nullableString,
  version: nullableString,
  paused: z.boolean(),
  replicas,
  strategy_type: nullableString,
  max_surge: nullableString,
  max_unavailable: nullableString,
  infrastructure_ref: reference.nullable(),
  bootstrap_ref: reference.nullable(),
  conditions,
});

const capiMachineHealthCheck = z.strictObject({
  type: z.literal("capi-machine-health-check"),
  cluster_name: nullableString,
  expected_machines: nullableInteger,
  current_healthy: nullableInteger,
  remediations_allowed: nullableInteger,
  node_startup_timeout: nullableString,
  max_unhealthy: nullableString,
  unhealthy_range: nullableString,
  selector: z.array(keyValue).max(100),
  unhealthy_conditions: z.array(z.strictObject({
    type: z.string().min(1),
    status: nullableString,
    timeout: nullableString,
  })).max(100),
  remediation_template: reference.nullable(),
  conditions,
});

const capiMachinePool = z.strictObject({
  type: z.literal("capi-machine-pool"),
  phase: nullableString,
  cluster_name: nullableString,
  min_ready_seconds: nullableInteger,
  replicas,
  infrastructure_ref: reference.nullable(),
  bootstrap_ref: reference.nullable(),
  conditions,
});

const capiMachine = z.strictObject({
  type: z.literal("capi-machine"),
  phase: nullableString,
  role: z.enum(["control-plane", "worker"]),
  cluster_name: nullableString,
  version: nullableString,
  failure_domain: nullableString,
  provider: nullableString,
  provider_id: nullableString,
  provider_region: nullableString,
  provider_instance_id: nullableString,
  node_name: nullableString,
  node_uid: nullableString,
  bootstrap_ref: reference.nullable(),
  infrastructure_ref: reference.nullable(),
  addresses: z.array(z.strictObject({ type: z.string().min(1), address: z.string().min(1) })).max(100),
  os_image: nullableString,
  architecture: nullableString,
  kernel_version: nullableString,
  container_runtime_version: nullableString,
  kubelet_version: nullableString,
  conditions,
});

const capiMachineSet = z.strictObject({
  type: z.literal("capi-machine-set"),
  cluster_name: nullableString,
  delete_policy: nullableString,
  min_ready_seconds: nullableInteger,
  replicas,
  infrastructure_ref: reference.nullable(),
  bootstrap_ref: reference.nullable(),
  conditions,
});

const certificate = z.strictObject({
  type: z.literal("certificate"),
  ready: z.boolean().nullable(),
  secret_name: nullableString,
  revision: nullableInteger,
  is_ca: z.boolean().nullable(),
  duration: nullableString,
  renew_before: nullableString,
  not_before: nullableString,
  not_after: nullableString,
  renewal_time: nullableString,
  failed_issuance_attempts: nullableInteger,
  last_failure_time: nullableString,
  private_key: z.strictObject({
    algorithm: nullableString,
    size: nullableInteger,
    encoding: nullableString,
    rotation_policy: nullableString,
  }).nullable(),
  dns_names: z.array(z.string()).max(100),
  issuer_ref: namedReference.nullable(),
  usages: z.array(z.string()).max(100),
  conditions,
});

const certificateRequest = z.strictObject({
  type: z.literal("certificate-request"),
  ready: z.boolean().nullable(),
  approved: z.boolean().nullable(),
  denied: z.boolean().nullable(),
  issuer_ref: namedReference.nullable(),
  owner_certificate: namedReference.nullable(),
  duration: nullableString,
  usages: z.array(z.string()).max(100),
  certificate_issued: z.boolean().nullable(),
  conditions,
});

const complianceControl = z.strictObject({
  id: z.string().min(1),
  name: nullableString,
  description: nullableString,
  severity: nullableString,
  total_pass: nullableInteger,
  total_fail: nullableInteger,
  check_ids: z.array(z.string()).max(100),
});

const clusterComplianceReport = z.strictObject({
  type: z.literal("cluster-compliance-report"),
  framework_id: nullableString,
  framework_title: nullableString,
  framework_description: nullableString,
  framework_version: nullableString,
  platform: nullableString,
  updated_at: nullableString,
  pass_count: nullableInteger,
  fail_count: nullableInteger,
  controls: z.array(complianceControl).max(100),
  conditions,
});

const crossplaneComposite = z.strictObject({
  type: z.literal("crossplane-composite"),
  claim: z.boolean(),
  paused: z.boolean(),
  composition_ref: namedReference.nullable(),
  composition_revision_ref: namedReference.nullable(),
  composition_update_policy: nullableString,
  bound_resource_ref: namedReference.nullable(),
  composed_resource_refs: z.array(namedReference).max(100),
  conditions,
});

const crossplaneManagedResource = z.strictObject({
  type: z.literal("crossplane-managed-resource"),
  api_group: nullableString,
  kind: z.string().min(1),
  external_name: nullableString,
  management_policies: z.array(z.string()).max(100),
  deletion_policy: nullableString,
  paused: z.boolean(),
  provider_config_ref: namedReference.nullable(),
  composing_resource_ref: namedReference.nullable(),
  observed_spec_fields: z.array(z.string().min(1)).max(100),
  observed_status_fields: z.array(z.string().min(1)).max(100),
  conditions,
});

const cronWorkflow = z.strictObject({
  type: z.literal("cron-workflow"),
  schedules: z.array(z.string()).max(100),
  timezone: nullableString,
  suspended: z.boolean().nullable(),
  concurrency_policy: nullableString,
  last_scheduled_time: nullableString,
  active_workflows: z.array(namedReference).max(100),
  workflow_template_ref: namedReference.nullable(),
  workflow_template_cluster_scope: z.boolean().nullable(),
  entrypoint: nullableString,
  argument_count: nullableInteger,
  template_count: nullableInteger,
  successful_history_limit: nullableInteger,
  failed_history_limit: nullableInteger,
  starting_deadline_seconds: nullableInteger,
  conditions,
});

const externalSecret = z.strictObject({
  type: z.literal("external-secret"),
  ready: z.boolean().nullable(),
  last_sync_time: nullableString,
  refresh_interval: nullableString,
  target_name: nullableString,
  synced_resource_version: nullableString,
  binding_name: nullableString,
  store_name: nullableString,
  store_kind: nullableString,
  mappings: z.array(z.strictObject({
    secret_key: nullableString,
    remote_key: nullableString,
    remote_property: nullableString,
    remote_version: nullableString,
  })).max(100),
  data_sources: z.array(z.strictObject({
    type: z.enum(["extract", "find", "source-ref", "unknown"]),
    detail: nullableString,
  })).max(100),
  target_creation_policy: nullableString,
  target_deletion_policy: nullableString,
  template_type: nullableString,
  template_engine_version: nullableString,
  template_labels: z.array(keyValue).max(100),
  template_annotations: z.array(keyValue).max(100),
  conditions,
});

const persistentVolumeClaim = z.strictObject({
  type: z.literal("persistent-volume-claim"),
  phase: nullableString,
  capacity: nullableString,
  requested: nullableString,
  storage_class_name: nullableString,
  access_modes: z.array(z.string()).max(100),
  volume_mode: nullableString,
  volume_name: nullableString,
  provisioner: nullableString,
  selected_node: nullableString,
  bind_completed: z.boolean().nullable(),
  conditions,
});

const sealedSecret = z.strictObject({
  type: z.literal("sealed-secret"),
  synced: z.boolean().nullable(),
  target_secret_name: nullableString,
  secret_type: nullableString,
  scope: z.enum(["strict", "namespace-wide", "cluster-wide"]),
  observed_generation: nullableInteger,
  encrypted_keys: z.array(z.string().min(1)).max(100),
  template_labels: z.array(keyValue).max(100),
  template_annotations: z.array(keyValue).max(100),
  conditions,
});

const secret = z.strictObject({
  type: z.literal("secret"),
  secret_type: nullableString,
  immutable: z.boolean().nullable(),
  key_names: z.array(z.string().min(1)).max(100),
  conditions,
});

const secretStore = z.strictObject({
  type: z.literal("secret-store"),
  cluster_scope: z.boolean(),
  ready: z.boolean().nullable(),
  provider_key: nullableString,
  provider_type: nullableString,
  provider_details: z.array(keyValue).max(100),
  controller: nullableString,
  max_retries: nullableInteger,
  retry_interval: nullableString,
  conditions,
});

const workflowExecutionNode = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  node_type: z.string().min(1),
  phase: z.string().min(1),
  depth: z.number().int().safe().min(0).max(20),
  started_at: nullableString,
  finished_at: nullableString,
  message: z.string().max(300).nullable(),
  template_ref: namedReference.nullable(),
});

const workflow = z.strictObject({
  type: z.literal("workflow"),
  phase: z.string().min(1),
  started_at: nullableString,
  finished_at: nullableString,
  progress: nullableString,
  estimated_duration_seconds: nullableInteger,
  workflow_template_ref: namedReference.nullable(),
  argument_names: z.array(z.string().min(1)).max(100),
  resource_durations: z.array(keyValue).max(100),
  execution_nodes: z.array(workflowExecutionNode).max(500),
  observed_node_count: nonnegativeSafeInteger,
  projected_node_count: nonnegativeSafeInteger,
  truncated: z.boolean(),
  problem_summaries: z.array(z.string().min(1).max(300)).max(100),
  conditions,
});

const gatewayClass = z.strictObject({
  type: z.literal("gateway-class"),
  controller_name: nullableString,
  description: nullableString,
  accepted: z.boolean().nullable(),
  parameters_ref: namedReference.nullable(),
  conditions,
});

const gcpMachine = z.strictObject({
  type: z.literal("gcp-machine"),
  ready: z.boolean().nullable(),
  instance_type: nullableString,
  zone: nullableString,
  instance_id: nullableString,
  image: nullableString,
  additional_disks: z.array(z.strictObject({
    device_type: nullableString,
    size_gb: nullableInteger,
  })).max(100),
  conditions,
});

const gcpManagedControlPlane = z.strictObject({
  type: z.literal("gcp-managed-control-plane"),
  ready: z.boolean().nullable(),
  cluster_name: nullableString,
  project: nullableString,
  location: nullableString,
  version: nullableString,
  release_channel: nullableString,
  autopilot: z.boolean().nullable(),
  endpoint: nullableString,
  pod_cidr: nullableString,
  service_cidr: nullableString,
  ip_aliases: z.boolean().nullable(),
  logging_service: nullableString,
  monitoring_service: nullableString,
  authorized_networks: z.array(z.strictObject({
    name: nullableString,
    cidr: z.string().min(1),
  })).max(100),
  conditions,
});

const gcpManagedMachinePool = z.strictObject({
  type: z.literal("gcp-managed-machine-pool"),
  ready: z.boolean().nullable(),
  node_pool_name: nullableString,
  machine_type: nullableString,
  disk_type: nullableString,
  disk_size_gb: nullableInteger,
  image_type: nullableString,
  max_pods_per_node: nullableInteger,
  autoscaling_enabled: z.boolean().nullable(),
  scaling,
  auto_repair: z.boolean().nullable(),
  auto_upgrade: z.boolean().nullable(),
  node_locations: z.array(z.string()).max(100),
  labels: z.array(keyValue).max(100),
  taints: z.array(z.strictObject({
    key: z.string().min(1),
    value: nullableString,
    effect: nullableString,
  })).max(100),
  conditions,
});

const gatewayRouteMatch = z.strictObject({
  method: nullableString,
  path_type: nullableString,
  path_value: nullableString,
  grpc_type: nullableString,
  grpc_service: nullableString,
  grpc_method: nullableString,
  headers: z.array(keyValue).max(50),
  query_params: z.array(keyValue).max(50),
});
const gatewayRouteBackend = z.strictObject({
  reference: namedReference,
  port: nullableInteger,
  weight: nullableInteger,
});
const gatewayRouteFilter = z.strictObject({
  type: z.string().min(1),
  summary: nullableString,
});
const gatewayRouteRule = z.strictObject({
  matches: z.array(gatewayRouteMatch).max(50),
  backends: z.array(gatewayRouteBackend).max(50),
  filters: z.array(gatewayRouteFilter).max(50),
});
const gatewayRouteParentStatus = z.strictObject({
  reference: namedReference.nullable(),
  section_name: nullableString,
  accepted: z.boolean().nullable(),
  resolved_refs: z.boolean().nullable(),
  conditions,
});
const gatewayRouteFields = {
  hostnames: z.array(z.string()).max(100),
  parent_refs: z.array(namedReference).max(50),
  rules: z.array(gatewayRouteRule).max(50),
  parent_statuses: z.array(gatewayRouteParentStatus).max(50),
  conditions,
};
const grpcRoute = z.strictObject({
  type: z.literal("grpc-route"),
  ...gatewayRouteFields,
});
const httpRoute = z.strictObject({
  type: z.literal("http-route"),
  ...gatewayRouteFields,
});

const job = z.strictObject({
  type: z.literal("job"),
  state: z.enum(["completed", "failed", "suspended", "running", "pending"]),
  succeeded: nullableInteger,
  failed: nullableInteger,
  active: nullableInteger,
  completions: nullableInteger,
  parallelism: nullableInteger,
  backoff_limit: nullableInteger,
  active_deadline_seconds: nullableInteger,
  ttl_seconds_after_finished: nullableInteger,
  suspended: z.boolean().nullable(),
  start_time: nullableString,
  completion_time: nullableString,
  terminal_reason: nullableString,
  terminal_message: nullableString,
  conditions,
});

const providerRequirement = z.strictObject({
  key: z.string().min(1),
  operator: nullableString,
  values: z.array(z.string()).max(100),
  min_values: nullableInteger,
});
const karpenterSelectorTerm = z.strictObject({
  id: nullableString,
  name: nullableString,
  alias: nullableString,
  owner: nullableString,
  tags: z.array(keyValue).max(100),
});
const karpenterEc2NodeClass = z.strictObject({
  type: z.literal("karpenter-ec2-node-class"),
  ready: z.boolean().nullable(),
  role: nullableString,
  instance_profile: nullableString,
  ami_family: nullableString,
  ami_selector_terms: z.array(karpenterSelectorTerm).max(100),
  block_devices: z.array(z.strictObject({
    device_name: nullableString,
    volume_type: nullableString,
    volume_size: nullableString,
    iops: nullableInteger,
    throughput: nullableInteger,
    encrypted: z.boolean().nullable(),
    delete_on_termination: z.boolean().nullable(),
  })).max(100),
  subnet_selector_terms: z.array(karpenterSelectorTerm).max(100),
  security_group_selector_terms: z.array(karpenterSelectorTerm).max(100),
  metadata_options: z.strictObject({
    http_tokens: nullableString,
    http_put_response_hop_limit: nullableInteger,
    http_endpoint: nullableString,
  }).nullable(),
  resolved_amis: z.array(z.strictObject({
    id: z.string().min(1),
    name: nullableString,
    requirements: z.array(providerRequirement).max(100),
  })).max(100),
  resolved_subnets: z.array(z.strictObject({
    id: z.string().min(1),
    name: nullableString,
    zone: nullableString,
  })).max(100),
  resolved_security_groups: z.array(z.strictObject({
    id: z.string().min(1),
    name: nullableString,
    zone: nullableString,
  })).max(100),
  tags: z.array(keyValue).max(100),
  conditions,
});
const karpenterNodeClaim = z.strictObject({
  type: z.literal("karpenter-node-claim"),
  state: z.enum([
    "ready",
    "registered",
    "launched",
    "initialized",
    "not-ready",
    "pending",
    "unknown",
  ]),
  instance_type: nullableString,
  capacity_type: nullableString,
  node_name: nullableString,
  zone: nullableString,
  architecture: nullableString,
  node_pool: nullableString,
  node_class_ref: namedReference.nullable(),
  image_id: nullableString,
  expire_after: nullableString,
  capacity: z.strictObject({
    cpu: nullableString,
    memory: nullableString,
    pods: nullableString,
    ephemeral_storage: nullableString,
  }),
  requirements: z.array(providerRequirement).max(100),
  conditions,
});
const karpenterNodePool = z.strictObject({
  type: z.literal("karpenter-node-pool"),
  ready: z.boolean().nullable(),
  node_class_ref: namedReference.nullable(),
  limit_cpu: nullableString,
  limit_memory: nullableString,
  weight: nullableInteger,
  current_cpu: nullableString,
  current_memory: nullableString,
  consolidation_policy: nullableString,
  consolidate_after: nullableString,
  expire_after: nullableString,
  disruption_budgets: z.array(z.strictObject({
    nodes: nullableString,
    schedule: nullableString,
    duration: nullableString,
  })).max(100),
  template_labels: z.array(keyValue).max(100),
  template_taints: z.array(z.strictObject({
    key: z.string().min(1),
    value: nullableString,
    effect: nullableString,
  })).max(100),
  startup_taints: z.array(z.strictObject({
    key: z.string().min(1),
    value: nullableString,
    effect: nullableString,
  })).max(100),
  requirements: z.array(providerRequirement).max(100),
  conditions,
});
const kedaTrigger = z.strictObject({
  type: z.string().min(1),
  name: nullableString,
  authentication_ref: namedReference.nullable(),
  metadata_keys: z.array(z.string()).max(100),
  redacted_metadata_count: z.number().int().safe().nonnegative(),
});
const kedaScaledObject = z.strictObject({
  type: z.literal("keda-scaled-object"),
  state: z.enum(["paused", "fallback", "not-ready", "active", "idle", "ready", "unknown"]),
  target_ref: namedReference.nullable(),
  scaling,
  idle_replicas: nullableInteger,
  polling_interval_seconds: nullableInteger,
  cooldown_period_seconds: nullableInteger,
  hpa_name: nullableString,
  last_active_time: nullableString,
  fallback_failure_threshold: nullableInteger,
  fallback_replicas: nullableInteger,
  restore_original_replicas: z.boolean().nullable(),
  scale_up_stabilization_seconds: nullableInteger,
  scale_down_stabilization_seconds: nullableInteger,
  scaling_policies: z.array(z.strictObject({
    direction: z.enum(["up", "down"]),
    type: nullableString,
    value: nullableInteger,
    period_seconds: nullableInteger,
  })).max(100),
  triggers: z.array(kedaTrigger).max(100),
  conditions,
});
const kedaScaledJob = z.strictObject({
  type: z.literal("keda-scaled-job"),
  state: z.enum(["not-ready", "active", "idle", "ready", "unknown"]),
  job_target_name: nullableString,
  strategy: nullableString,
  polling_interval_seconds: nullableInteger,
  successful_history_limit: nullableInteger,
  failed_history_limit: nullableInteger,
  minimum_replicas: nullableInteger,
  maximum_replicas: nullableInteger,
  triggers: z.array(kedaTrigger).max(100),
  conditions,
});
const sbomReport = z.strictObject({
  type: z.literal("sbom-report"),
  container_name: nullableString,
  image: nullableString,
  bom_format: nullableString,
  spec_version: nullableString,
  component_count: nonnegativeSafeInteger,
  dependency_count: nonnegativeSafeInteger,
  observed_component_count: nonnegativeSafeInteger,
  projected_component_count: nonnegativeSafeInteger,
  truncated: z.boolean(),
  scanner_name: nullableString,
  scanner_version: nullableString,
  scanned_at: nullableString,
  components: z.array(z.strictObject({
    name: z.string().min(1).max(2_000),
    version: nullableString,
    type: nullableString,
    package_url: nullableString,
    package_url_qualifiers_redacted: z.boolean(),
    license: nullableString,
  })).max(1_000),
  conditions,
});
const vulnerabilityReport = z.strictObject({
  type: z.literal("vulnerability-report"),
  container_name: nullableString,
  image: nullableString,
  os_family: nullableString,
  os_name: nullableString,
  os_end_of_service_life: z.boolean().nullable(),
  scanner_name: nullableString,
  scanner_version: nullableString,
  scanned_at: nullableString,
  severity: z.strictObject({
    critical: nonnegativeSafeInteger,
    high: nonnegativeSafeInteger,
    medium: nonnegativeSafeInteger,
    low: nonnegativeSafeInteger,
    unknown: nonnegativeSafeInteger,
  }),
  observed_vulnerability_count: nonnegativeSafeInteger,
  projected_vulnerability_count: nonnegativeSafeInteger,
  truncated: z.boolean(),
  vulnerabilities: z.array(z.strictObject({
    vulnerability_id: z.string().min(1).max(2_000),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
    score: z.number().finite().min(0).max(10).nullable(),
    package: nullableString,
    installed_version: nullableString,
    fixed_version: nullableString,
    primary_link: nullableExternalHttpUrl,
  })).max(500),
  conditions,
});
const prometheusRule = z.strictObject({
  type: z.literal("prometheus-rule"),
  group_count: z.number().int().safe().nonnegative(),
  total_rules: z.number().int().safe().nonnegative(),
  total_alerts: z.number().int().safe().nonnegative(),
  total_recordings: z.number().int().safe().nonnegative(),
  projected_rules: z.number().int().safe().nonnegative(),
  truncated: z.boolean(),
  groups: z.array(z.strictObject({
    name: z.string().min(1),
    interval: nullableString,
    rule_count: z.number().int().safe().nonnegative(),
    alert_count: z.number().int().safe().nonnegative(),
    recording_count: z.number().int().safe().nonnegative(),
    rules: z.array(z.strictObject({
      type: z.enum(["alert", "recording"]),
      name: z.string().min(1),
      expression: z.string().max(2_000),
      duration: nullableString,
      severity: nullableString,
      summary: nullableString,
      description: nullableString,
      labels: z.array(keyValue).max(100),
    })).max(100),
  })).max(50),
  conditions,
});
const tcpRoute = z.strictObject({
  type: z.literal("tcp-route"),
  ...gatewayRouteFields,
});
const tlsRoute = z.strictObject({
  type: z.literal("tls-route"),
  ...gatewayRouteFields,
});

export const providerResourceDetailSchema = z.discriminatedUnion("type", [
  awsMachine,
  awsManagedCluster,
  awsManagedControlPlane,
  awsManagedMachinePool,
  azureMachine,
  azureManagedControlPlane,
  azureManagedMachinePool,
  capiCluster,
  capiKubeadmControlPlane,
  capiMachineDeployment,
  capiMachineHealthCheck,
  capiMachinePool,
  capiMachine,
  capiMachineSet,
  certificate,
  certificateRequest,
  clusterComplianceReport,
  crossplaneComposite,
  crossplaneManagedResource,
  cronWorkflow,
  externalSecret,
  persistentVolumeClaim,
  sealedSecret,
  secret,
  secretStore,
  workflow,
  gatewayClass,
  gcpMachine,
  gcpManagedControlPlane,
  gcpManagedMachinePool,
  grpcRoute,
  httpRoute,
  job,
  karpenterEc2NodeClass,
  karpenterNodeClaim,
  karpenterNodePool,
  kedaScaledObject,
  kedaScaledJob,
  sbomReport,
  vulnerabilityReport,
  prometheusRule,
  tcpRoute,
  tlsRoute,
]);
