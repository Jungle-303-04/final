import { z } from "zod";

const nullableString = z.string().nullable();
const nullableInteger = z.number().int().safe().nullable();
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
  cronWorkflow,
  externalSecret,
  gatewayClass,
  gcpMachine,
  gcpManagedControlPlane,
  gcpManagedMachinePool,
  grpcRoute,
  httpRoute,
  job,
]);
