export interface ProviderConditionEndpoint {
  type: string;
  status: "True" | "False" | "Unknown";
  reason: string | null;
  message: string | null;
  last_transition_time: string | null;
}

export interface ProviderAddressEndpoint {
  type: string;
  address: string;
}

export interface ProviderKeyValueEndpoint {
  key: string;
  value: string;
}

export interface ProviderScalingEndpoint {
  minimum: number | null;
  maximum: number | null;
  current: number | null;
}

export interface ProviderReferenceEndpoint {
  api_version: string | null;
  kind: string;
  namespace: string | null;
  name: string;
}

export interface ProviderNamedReferenceEndpoint {
  api_version: string | null;
  kind: string | null;
  namespace: string | null;
  name: string;
}

export interface ProviderReplicasEndpoint {
  desired: number | null;
  ready: number | null;
  available: number | null;
  up_to_date: number | null;
}

export interface GatewayRouteMatchEndpoint {
  method: string | null;
  path_type: string | null;
  path_value: string | null;
  grpc_type: string | null;
  grpc_service: string | null;
  grpc_method: string | null;
  headers: ProviderKeyValueEndpoint[];
  query_params: ProviderKeyValueEndpoint[];
}

export interface GatewayRouteBackendEndpoint {
  reference: ProviderNamedReferenceEndpoint;
  port: number | null;
  weight: number | null;
}

export interface GatewayRouteFilterEndpoint {
  type: string;
  summary: string | null;
}

export interface GatewayRouteRuleEndpoint {
  matches: GatewayRouteMatchEndpoint[];
  backends: GatewayRouteBackendEndpoint[];
  filters: GatewayRouteFilterEndpoint[];
}

export interface GatewayRouteParentStatusEndpoint {
  reference: ProviderNamedReferenceEndpoint | null;
  section_name: string | null;
  accepted: boolean | null;
  resolved_refs: boolean | null;
  conditions: ProviderConditionEndpoint[];
}

interface ProviderDetailBaseEndpoint {
  conditions: ProviderConditionEndpoint[];
}

export interface AwsMachineProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "aws-machine";
  instance_type: string | null;
  instance_id: string | null;
  instance_state: string | null;
  provider_id: string | null;
  iam_instance_profile: string | null;
  ssh_key_name: string | null;
  subnet_id: string | null;
  secrets_backend: string | null;
  addresses: ProviderAddressEndpoint[];
}

export interface AwsManagedClusterProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "aws-managed-cluster";
  endpoint: string | null;
  failure_domains: string[];
}

export interface AwsSubnetEndpoint {
  id: string | null;
  availability_zone: string | null;
  public: boolean | null;
  cidr_block: string | null;
}

export interface AwsSecurityGroupEndpoint {
  role: string;
  id: string | null;
  name: string | null;
}

export interface AwsAddonEndpoint {
  name: string;
  requested_version: string | null;
  current_version: string | null;
  status: string | null;
}

export interface AwsManagedControlPlaneProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "aws-managed-control-plane";
  cluster_name: string | null;
  region: string | null;
  version: string | null;
  endpoint_access: "public" | "private" | "public-and-private" | null;
  role_name: string | null;
  identity: string | null;
  vpc_id: string | null;
  vpc_cidr_block: string | null;
  subnets: AwsSubnetEndpoint[];
  security_groups: AwsSecurityGroupEndpoint[];
  nat_gateway_ips: string[];
  failure_domains: string[];
  addons: AwsAddonEndpoint[];
}

export interface AwsManagedMachinePoolProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "aws-managed-machine-pool";
  node_group_name: string | null;
  instance_type: string | null;
  ami_type: string | null;
  capacity_type: string | null;
  role_name: string | null;
  scaling: ProviderScalingEndpoint;
  max_unavailable: number | null;
  subnet_ids: string[];
  labels: ProviderKeyValueEndpoint[];
}

export interface AzureMachineProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "azure-machine";
  vm_size: string | null;
  availability_zone: string | null;
  os_type: string | null;
  os_disk_size_gb: number | null;
  provider_id: string | null;
  subnet_name: string | null;
}

export interface AzureManagedControlPlaneProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "azure-managed-control-plane";
  location: string | null;
  resource_group_name: string | null;
  version: string | null;
  sku_tier: string | null;
  dns_prefix: string | null;
  subscription_id: string | null;
  network_plugin: string | null;
  network_policy: string | null;
  private_cluster: boolean | null;
  dns_service_ip: string | null;
  load_balancer_sku: string | null;
  upgrade_channel: string | null;
  authorized_ip_ranges: string[];
}

export interface ProviderTaintEndpoint {
  key: string;
  value: string | null;
  effect: string | null;
}

export interface AzureManagedMachinePoolProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "azure-managed-machine-pool";
  pool_name: string | null;
  vm_size: string | null;
  mode: string | null;
  os_type: string | null;
  os_disk_type: string | null;
  os_disk_size_gb: number | null;
  priority: string | null;
  max_pods: number | null;
  scaling: ProviderScalingEndpoint;
  scale_down_mode: string | null;
  availability_zones: string[];
  labels: ProviderKeyValueEndpoint[];
  taints: ProviderTaintEndpoint[];
}

export interface CapiClusterProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "capi-cluster";
  phase: string | null;
  version: string | null;
  cluster_class: string | null;
  endpoint: string | null;
  provider: string | null;
  paused: boolean;
  control_plane: ProviderReplicasEndpoint;
  workers: ProviderReplicasEndpoint;
  control_plane_ref: ProviderReferenceEndpoint | null;
  infrastructure_ref: ProviderReferenceEndpoint | null;
}

export interface CapiKubeadmControlPlaneProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "capi-kubeadm-control-plane";
  cluster_name: string | null;
  version: string | null;
  initialized: boolean | null;
  update_strategy: string | null;
  replicas: ProviderReplicasEndpoint;
  infrastructure_ref: ProviderReferenceEndpoint | null;
  node_drain_timeout: string | null;
  node_volume_detach_timeout: string | null;
  node_deletion_timeout: string | null;
  certificate_sans: string[];
  remediation_machine: string | null;
  remediation_retry_count: number | null;
  remediation_timestamp: string | null;
}

export interface CapiMachineDeploymentProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "capi-machine-deployment";
  phase: string | null;
  cluster_name: string | null;
  version: string | null;
  paused: boolean;
  replicas: ProviderReplicasEndpoint;
  strategy_type: string | null;
  max_surge: string | null;
  max_unavailable: string | null;
  infrastructure_ref: ProviderReferenceEndpoint | null;
  bootstrap_ref: ProviderReferenceEndpoint | null;
}

export interface CapiMachineHealthCheckProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "capi-machine-health-check";
  cluster_name: string | null;
  expected_machines: number | null;
  current_healthy: number | null;
  remediations_allowed: number | null;
  node_startup_timeout: string | null;
  max_unhealthy: string | null;
  unhealthy_range: string | null;
  selector: ProviderKeyValueEndpoint[];
  unhealthy_conditions: Array<{ type: string; status: string | null; timeout: string | null }>;
  remediation_template: ProviderReferenceEndpoint | null;
}

export interface CapiMachinePoolProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "capi-machine-pool";
  phase: string | null;
  cluster_name: string | null;
  min_ready_seconds: number | null;
  replicas: ProviderReplicasEndpoint;
  infrastructure_ref: ProviderReferenceEndpoint | null;
  bootstrap_ref: ProviderReferenceEndpoint | null;
}

export interface CapiMachineProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "capi-machine";
  phase: string | null;
  role: "control-plane" | "worker";
  cluster_name: string | null;
  version: string | null;
  failure_domain: string | null;
  provider: string | null;
  provider_id: string | null;
  provider_region: string | null;
  provider_instance_id: string | null;
  node_name: string | null;
  node_uid: string | null;
  bootstrap_ref: ProviderReferenceEndpoint | null;
  infrastructure_ref: ProviderReferenceEndpoint | null;
  addresses: ProviderAddressEndpoint[];
  os_image: string | null;
  architecture: string | null;
  kernel_version: string | null;
  container_runtime_version: string | null;
  kubelet_version: string | null;
}

export interface CapiMachineSetProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "capi-machine-set";
  cluster_name: string | null;
  delete_policy: string | null;
  min_ready_seconds: number | null;
  replicas: ProviderReplicasEndpoint;
  infrastructure_ref: ProviderReferenceEndpoint | null;
  bootstrap_ref: ProviderReferenceEndpoint | null;
}

export interface CertificateProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "certificate";
  ready: boolean | null;
  secret_name: string | null;
  revision: number | null;
  is_ca: boolean | null;
  duration: string | null;
  renew_before: string | null;
  not_before: string | null;
  not_after: string | null;
  renewal_time: string | null;
  failed_issuance_attempts: number | null;
  last_failure_time: string | null;
  private_key: {
    algorithm: string | null;
    size: number | null;
    encoding: string | null;
    rotation_policy: string | null;
  } | null;
  dns_names: string[];
  issuer_ref: ProviderNamedReferenceEndpoint | null;
  usages: string[];
}

export interface CertificateRequestProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "certificate-request";
  ready: boolean | null;
  approved: boolean | null;
  denied: boolean | null;
  issuer_ref: ProviderNamedReferenceEndpoint | null;
  owner_certificate: ProviderNamedReferenceEndpoint | null;
  duration: string | null;
  usages: string[];
  certificate_issued: boolean | null;
}

export interface ComplianceControlDetailEndpoint {
  id: string;
  name: string | null;
  description: string | null;
  severity: string | null;
  total_pass: number | null;
  total_fail: number | null;
  check_ids: string[];
}

export interface ClusterComplianceReportProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "cluster-compliance-report";
  framework_id: string | null;
  framework_title: string | null;
  framework_description: string | null;
  framework_version: string | null;
  platform: string | null;
  updated_at: string | null;
  pass_count: number | null;
  fail_count: number | null;
  controls: ComplianceControlDetailEndpoint[];
}

export interface CrossplaneCompositeProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "crossplane-composite";
  claim: boolean;
  paused: boolean;
  composition_ref: ProviderNamedReferenceEndpoint | null;
  composition_revision_ref: ProviderNamedReferenceEndpoint | null;
  composition_update_policy: string | null;
  bound_resource_ref: ProviderNamedReferenceEndpoint | null;
  composed_resource_refs: ProviderNamedReferenceEndpoint[];
}

export interface CronWorkflowProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "cron-workflow";
  schedules: string[];
  timezone: string | null;
  suspended: boolean | null;
  concurrency_policy: string | null;
  last_scheduled_time: string | null;
  active_workflows: ProviderNamedReferenceEndpoint[];
  workflow_template_ref: ProviderNamedReferenceEndpoint | null;
  workflow_template_cluster_scope: boolean | null;
  entrypoint: string | null;
  argument_count: number | null;
  template_count: number | null;
  successful_history_limit: number | null;
  failed_history_limit: number | null;
  starting_deadline_seconds: number | null;
}

export interface ExternalSecretProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "external-secret";
  ready: boolean | null;
  last_sync_time: string | null;
  refresh_interval: string | null;
  target_name: string | null;
  synced_resource_version: string | null;
  binding_name: string | null;
  store_name: string | null;
  store_kind: string | null;
  mappings: Array<{
    secret_key: string | null;
    remote_key: string | null;
    remote_property: string | null;
    remote_version: string | null;
  }>;
  data_sources: Array<{
    type: "extract" | "find" | "source-ref" | "unknown";
    detail: string | null;
  }>;
  target_creation_policy: string | null;
  target_deletion_policy: string | null;
  template_type: string | null;
  template_engine_version: string | null;
  template_labels: ProviderKeyValueEndpoint[];
  template_annotations: ProviderKeyValueEndpoint[];
}

export interface GatewayClassProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "gateway-class";
  controller_name: string | null;
  description: string | null;
  accepted: boolean | null;
  parameters_ref: ProviderNamedReferenceEndpoint | null;
}

export interface GcpMachineProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "gcp-machine";
  ready: boolean | null;
  instance_type: string | null;
  zone: string | null;
  instance_id: string | null;
  image: string | null;
  additional_disks: Array<{
    device_type: string | null;
    size_gb: number | null;
  }>;
}

export interface GcpManagedControlPlaneProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "gcp-managed-control-plane";
  ready: boolean | null;
  cluster_name: string | null;
  project: string | null;
  location: string | null;
  version: string | null;
  release_channel: string | null;
  autopilot: boolean | null;
  endpoint: string | null;
  pod_cidr: string | null;
  service_cidr: string | null;
  ip_aliases: boolean | null;
  logging_service: string | null;
  monitoring_service: string | null;
  authorized_networks: Array<{ name: string | null; cidr: string }>;
}

export interface GcpManagedMachinePoolProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "gcp-managed-machine-pool";
  ready: boolean | null;
  node_pool_name: string | null;
  machine_type: string | null;
  disk_type: string | null;
  disk_size_gb: number | null;
  image_type: string | null;
  max_pods_per_node: number | null;
  autoscaling_enabled: boolean | null;
  scaling: ProviderScalingEndpoint;
  auto_repair: boolean | null;
  auto_upgrade: boolean | null;
  node_locations: string[];
  labels: ProviderKeyValueEndpoint[];
  taints: ProviderTaintEndpoint[];
}

export interface GrpcRouteProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "grpc-route";
  hostnames: string[];
  parent_refs: ProviderNamedReferenceEndpoint[];
  rules: GatewayRouteRuleEndpoint[];
  parent_statuses: GatewayRouteParentStatusEndpoint[];
}

export interface HttpRouteProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "http-route";
  hostnames: string[];
  parent_refs: ProviderNamedReferenceEndpoint[];
  rules: GatewayRouteRuleEndpoint[];
  parent_statuses: GatewayRouteParentStatusEndpoint[];
}

export interface JobProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "job";
  state: "completed" | "failed" | "suspended" | "running" | "pending";
  succeeded: number | null;
  failed: number | null;
  active: number | null;
  completions: number | null;
  parallelism: number | null;
  backoff_limit: number | null;
  active_deadline_seconds: number | null;
  ttl_seconds_after_finished: number | null;
  suspended: boolean | null;
  start_time: string | null;
  completion_time: string | null;
  terminal_reason: string | null;
  terminal_message: string | null;
}

export type ProviderResourceDetailEndpoint =
  | AwsMachineProviderDetailEndpoint
  | AwsManagedClusterProviderDetailEndpoint
  | AwsManagedControlPlaneProviderDetailEndpoint
  | AwsManagedMachinePoolProviderDetailEndpoint
  | AzureMachineProviderDetailEndpoint
  | AzureManagedControlPlaneProviderDetailEndpoint
  | AzureManagedMachinePoolProviderDetailEndpoint
  | CapiClusterProviderDetailEndpoint
  | CapiKubeadmControlPlaneProviderDetailEndpoint
  | CapiMachineDeploymentProviderDetailEndpoint
  | CapiMachineHealthCheckProviderDetailEndpoint
  | CapiMachinePoolProviderDetailEndpoint
  | CapiMachineProviderDetailEndpoint
  | CapiMachineSetProviderDetailEndpoint
  | CertificateProviderDetailEndpoint
  | CertificateRequestProviderDetailEndpoint
  | ClusterComplianceReportProviderDetailEndpoint
  | CrossplaneCompositeProviderDetailEndpoint
  | CronWorkflowProviderDetailEndpoint
  | ExternalSecretProviderDetailEndpoint
  | GatewayClassProviderDetailEndpoint
  | GcpMachineProviderDetailEndpoint
  | GcpManagedControlPlaneProviderDetailEndpoint
  | GcpManagedMachinePoolProviderDetailEndpoint
  | GrpcRouteProviderDetailEndpoint
  | HttpRouteProviderDetailEndpoint
  | JobProviderDetailEndpoint;
