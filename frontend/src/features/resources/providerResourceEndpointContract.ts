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

export interface ProviderRequirementEndpoint {
  key: string;
  operator: string | null;
  values: string[];
  min_values: number | null;
}

export interface KarpenterSelectorTermEndpoint {
  id: string | null;
  name: string | null;
  alias: string | null;
  owner: string | null;
  tags: ProviderKeyValueEndpoint[];
}

export interface KarpenterResolvedNetworkEndpoint {
  id: string;
  name: string | null;
  zone: string | null;
}

export interface KedaTriggerEndpoint {
  type: string;
  name: string | null;
  authentication_ref: ProviderNamedReferenceEndpoint | null;
  metadata_keys: string[];
  redacted_metadata_count: number;
}

export interface PrometheusRuleEntryEndpoint {
  type: "alert" | "recording";
  name: string;
  expression: string;
  duration: string | null;
  severity: string | null;
  summary: string | null;
  description: string | null;
  labels: ProviderKeyValueEndpoint[];
}

export interface PrometheusRuleGroupEndpoint {
  name: string;
  interval: string | null;
  rule_count: number;
  alert_count: number;
  recording_count: number;
  rules: PrometheusRuleEntryEndpoint[];
}

export interface SecuritySeveritySummaryEndpoint {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export interface SbomComponentEndpoint {
  name: string;
  version: string | null;
  type: string | null;
  package_url: string | null;
  package_url_qualifiers_redacted: boolean;
  license: string | null;
}

export interface VulnerabilityFindingEndpoint {
  vulnerability_id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  score: number | null;
  package: string | null;
  installed_version: string | null;
  fixed_version: string | null;
  primary_link: string | null;
}

interface ProviderDetailBaseEndpoint {
  conditions: ProviderConditionEndpoint[];
}

export interface ProviderContainerProjectionEndpoint {
  name: string;
  image: string | null;
  state: string | null;
  state_reason: string | null;
  ready: boolean | null;
  restart_count: number;
  ports: Array<{ name: string | null; container_port: number; protocol: string }>;
  requests: ProviderKeyValueEndpoint[];
  limits: ProviderKeyValueEndpoint[];
}

export interface CoreWorkloadProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-workload";
  kind: string;
  owner: ProviderNamedReferenceEndpoint | null;
  replicas: ProviderReplicasEndpoint;
  unavailable: number | null;
  strategy_type: string | null;
  max_surge: string | null;
  max_unavailable: string | null;
  min_ready_seconds: number | null;
  revision_history_count: number | null;
  service_account_name: string | null;
  selector: ProviderKeyValueEndpoint[];
  init_containers: ProviderContainerProjectionEndpoint[];
  containers: ProviderContainerProjectionEndpoint[];
}

export interface CorePodProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-pod";
  phase: string | null;
  node_name: string | null;
  pod_ip: string | null;
  host_ip: string | null;
  service_account_name: string | null;
  owner: ProviderNamedReferenceEndpoint | null;
  init_containers: ProviderContainerProjectionEndpoint[];
  containers: ProviderContainerProjectionEndpoint[];
  ephemeral_container_names: string[];
}

export interface CoreServiceProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-service";
  service_type: string | null;
  cluster_ip: string | null;
  external_name: string | null;
  external_ips: string[];
  load_balancer_addresses: string[];
  external_traffic_policy: string | null;
  internal_traffic_policy: string | null;
  ip_families: string[];
  ports: string[];
  selector: ProviderKeyValueEndpoint[];
}

export interface CoreIngressProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-ingress";
  ingress_class_name: string | null;
  addresses: string[];
  routes: Array<{
    host: string | null;
    path: string;
    path_type: string | null;
    backend_service: string;
    backend_port: string | null;
  }>;
  tls: Array<{ secret_name: string | null; hosts: string[] }>;
}

export interface ArgoApplicationProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "argo-application";
  sync_status: string | null;
  health_status: string | null;
  operation_phase: string | null;
  repository_url: string | null;
  source_path: string | null;
  target_revision: string | null;
  chart: string | null;
  destination_server: string | null;
  destination_namespace: string | null;
  automated: boolean;
  self_heal: boolean;
  prune: boolean;
  retry_enabled: boolean;
  managed_resource_count: number;
  revision_history: string[];
}

export interface CoreCronJobProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-cron-job";
  schedule: string | null;
  schedule_description: string | null;
  timezone: string | null;
  suspended: boolean;
  last_schedule_time: string | null;
  last_successful_time: string | null;
  active_jobs: ProviderNamedReferenceEndpoint[];
  concurrency_policy: string | null;
  starting_deadline_seconds: number | null;
  successful_history_limit: number | null;
  failed_history_limit: number | null;
}

export interface CoreConfigMapProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-config-map";
  immutable: boolean;
  key_count: number;
  entries: Array<{
    key: string;
    size_bytes: number;
    preview: string | null;
    truncated: boolean;
    binary: boolean;
  }>;
}

export interface CoreHpaProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-hpa";
  target: ProviderNamedReferenceEndpoint | null;
  minimum_replicas: number | null;
  maximum_replicas: number | null;
  current_replicas: number | null;
  desired_replicas: number | null;
  last_scale_time: string | null;
  metrics: Array<{
    type: string;
    name: string;
    current: string | null;
    target: string | null;
    unavailable_reason: string | null;
  }>;
}

export interface CoreNodeProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-node";
  ready: boolean | null;
  unschedulable: boolean;
  provider_id: string | null;
  os_image: string | null;
  architecture: string | null;
  kernel_version: string | null;
  container_runtime_version: string | null;
  kubelet_version: string | null;
  capacity: ProviderKeyValueEndpoint[];
  allocatable: ProviderKeyValueEndpoint[];
  usage: ProviderKeyValueEndpoint[];
  addresses: ProviderAddressEndpoint[];
  zone: string | null;
  region: string | null;
  node_pool: string | null;
  taints: Array<{ key: string; value: string | null; effect: string | null }>;
  managed_pod_count: number | null;
  metrics_observed_at: string | null;
}

export interface CoreNamespaceProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-namespace";
  phase: string | null;
  manager: string | null;
  injection: string | null;
  quotas: Array<{
    name: string;
    hard: ProviderKeyValueEndpoint[];
    used: ProviderKeyValueEndpoint[];
  }>;
  service_account_count: number | null;
  role_binding_count: number | null;
  cluster_role_binding_count: number | null;
}

export interface CoreEventProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-event";
  event_type: string | null;
  reason: string | null;
  message: string | null;
  involved_object: ProviderReferenceEndpoint | null;
  count: number | null;
  first_observed_at: string | null;
  last_observed_at: string | null;
  duration_seconds: number | null;
  source_component: string | null;
  source_host: string | null;
  reporting_controller: string | null;
  reporting_instance: string | null;
  api_version: string | null;
  resource_version: string | null;
}

export interface CoreRbacProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "core-rbac";
  kind: string;
  automount_service_account_token: boolean | null;
  secret_names: string[];
  image_pull_secret_names: string[];
  role_ref: ProviderNamedReferenceEndpoint | null;
  subjects: Array<{ kind: string; namespace: string | null; name: string }>;
  rules: Array<{
    verbs: string[];
    api_groups: string[];
    resources: string[];
    resource_names: string[];
    non_resource_urls: string[];
    wildcard: boolean;
    escalation: boolean;
  }>;
  wildcard_warning: boolean;
  escalation_warning: boolean;
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

export interface CrossplaneManagedResourceProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "crossplane-managed-resource";
  api_group: string | null;
  kind: string;
  external_name: string | null;
  management_policies: string[];
  deletion_policy: string | null;
  paused: boolean;
  provider_config_ref: ProviderNamedReferenceEndpoint | null;
  composing_resource_ref: ProviderNamedReferenceEndpoint | null;
  observed_spec_fields: string[];
  observed_status_fields: string[];
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

export interface PersistentVolumeClaimProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "persistent-volume-claim";
  phase: string | null;
  capacity: string | null;
  requested: string | null;
  storage_class_name: string | null;
  access_modes: string[];
  volume_mode: string | null;
  volume_name: string | null;
  provisioner: string | null;
  selected_node: string | null;
  bind_completed: boolean | null;
}

export interface SealedSecretProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "sealed-secret";
  synced: boolean | null;
  target_secret_name: string | null;
  secret_type: string | null;
  scope: "strict" | "namespace-wide" | "cluster-wide";
  observed_generation: number | null;
  encrypted_keys: string[];
  template_labels: ProviderKeyValueEndpoint[];
  template_annotations: ProviderKeyValueEndpoint[];
}

export interface SecretProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "secret";
  secret_type: string | null;
  immutable: boolean | null;
  key_names: string[];
}

export interface SecretStoreProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "secret-store";
  cluster_scope: boolean;
  ready: boolean | null;
  provider_key: string | null;
  provider_type: string | null;
  provider_details: ProviderKeyValueEndpoint[];
  controller: string | null;
  max_retries: number | null;
  retry_interval: string | null;
}

export interface WorkflowExecutionNodeEndpoint {
  id: string;
  label: string;
  node_type: string;
  phase: string;
  depth: number;
  started_at: string | null;
  finished_at: string | null;
  message: string | null;
  template_ref: ProviderNamedReferenceEndpoint | null;
}

export interface WorkflowProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "workflow";
  phase: string;
  started_at: string | null;
  finished_at: string | null;
  progress: string | null;
  estimated_duration_seconds: number | null;
  workflow_template_ref: ProviderNamedReferenceEndpoint | null;
  argument_names: string[];
  resource_durations: ProviderKeyValueEndpoint[];
  execution_nodes: WorkflowExecutionNodeEndpoint[];
  observed_node_count: number;
  projected_node_count: number;
  truncated: boolean;
  problem_summaries: string[];
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

export interface KarpenterEc2NodeClassProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "karpenter-ec2-node-class";
  ready: boolean | null;
  role: string | null;
  instance_profile: string | null;
  ami_family: string | null;
  ami_selector_terms: KarpenterSelectorTermEndpoint[];
  block_devices: Array<{
    device_name: string | null;
    volume_type: string | null;
    volume_size: string | null;
    iops: number | null;
    throughput: number | null;
    encrypted: boolean | null;
    delete_on_termination: boolean | null;
  }>;
  subnet_selector_terms: KarpenterSelectorTermEndpoint[];
  security_group_selector_terms: KarpenterSelectorTermEndpoint[];
  metadata_options: {
    http_tokens: string | null;
    http_put_response_hop_limit: number | null;
    http_endpoint: string | null;
  } | null;
  resolved_amis: Array<{
    id: string;
    name: string | null;
    requirements: ProviderRequirementEndpoint[];
  }>;
  resolved_subnets: KarpenterResolvedNetworkEndpoint[];
  resolved_security_groups: KarpenterResolvedNetworkEndpoint[];
  tags: ProviderKeyValueEndpoint[];
}

export interface KarpenterNodeClaimProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "karpenter-node-claim";
  state: "ready" | "registered" | "launched" | "initialized" | "not-ready" | "pending" | "unknown";
  instance_type: string | null;
  capacity_type: string | null;
  node_name: string | null;
  zone: string | null;
  architecture: string | null;
  node_pool: string | null;
  node_class_ref: ProviderNamedReferenceEndpoint | null;
  image_id: string | null;
  expire_after: string | null;
  capacity: {
    cpu: string | null;
    memory: string | null;
    pods: string | null;
    ephemeral_storage: string | null;
  };
  requirements: ProviderRequirementEndpoint[];
}

export interface KarpenterNodePoolProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "karpenter-node-pool";
  ready: boolean | null;
  node_class_ref: ProviderNamedReferenceEndpoint | null;
  limit_cpu: string | null;
  limit_memory: string | null;
  weight: number | null;
  current_cpu: string | null;
  current_memory: string | null;
  consolidation_policy: string | null;
  consolidate_after: string | null;
  expire_after: string | null;
  disruption_budgets: Array<{
    nodes: string | null;
    schedule: string | null;
    duration: string | null;
  }>;
  template_labels: ProviderKeyValueEndpoint[];
  template_taints: ProviderTaintEndpoint[];
  startup_taints: ProviderTaintEndpoint[];
  requirements: ProviderRequirementEndpoint[];
}

export interface KedaScaledObjectProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "keda-scaled-object";
  state: "paused" | "fallback" | "not-ready" | "active" | "idle" | "ready" | "unknown";
  target_ref: ProviderNamedReferenceEndpoint | null;
  scaling: ProviderScalingEndpoint;
  idle_replicas: number | null;
  polling_interval_seconds: number | null;
  cooldown_period_seconds: number | null;
  hpa_name: string | null;
  last_active_time: string | null;
  fallback_failure_threshold: number | null;
  fallback_replicas: number | null;
  restore_original_replicas: boolean | null;
  scale_up_stabilization_seconds: number | null;
  scale_down_stabilization_seconds: number | null;
  scaling_policies: Array<{
    direction: "up" | "down";
    type: string | null;
    value: number | null;
    period_seconds: number | null;
  }>;
  triggers: KedaTriggerEndpoint[];
}

export interface KedaScaledJobProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "keda-scaled-job";
  state: "not-ready" | "active" | "idle" | "ready" | "unknown";
  job_target_name: string | null;
  strategy: string | null;
  polling_interval_seconds: number | null;
  successful_history_limit: number | null;
  failed_history_limit: number | null;
  minimum_replicas: number | null;
  maximum_replicas: number | null;
  triggers: KedaTriggerEndpoint[];
}

export interface SbomReportProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "sbom-report";
  container_name: string | null;
  image: string | null;
  bom_format: string | null;
  spec_version: string | null;
  component_count: number;
  dependency_count: number;
  observed_component_count: number;
  projected_component_count: number;
  truncated: boolean;
  scanner_name: string | null;
  scanner_version: string | null;
  scanned_at: string | null;
  components: SbomComponentEndpoint[];
}

export interface VulnerabilityReportProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "vulnerability-report";
  container_name: string | null;
  image: string | null;
  os_family: string | null;
  os_name: string | null;
  os_end_of_service_life: boolean | null;
  scanner_name: string | null;
  scanner_version: string | null;
  scanned_at: string | null;
  severity: SecuritySeveritySummaryEndpoint;
  observed_vulnerability_count: number;
  projected_vulnerability_count: number;
  truncated: boolean;
  vulnerabilities: VulnerabilityFindingEndpoint[];
}

export interface PrometheusRuleProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "prometheus-rule";
  group_count: number;
  total_rules: number;
  total_alerts: number;
  total_recordings: number;
  projected_rules: number;
  truncated: boolean;
  groups: PrometheusRuleGroupEndpoint[];
}

export interface TcpRouteProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "tcp-route";
  hostnames: string[];
  parent_refs: ProviderNamedReferenceEndpoint[];
  rules: GatewayRouteRuleEndpoint[];
  parent_statuses: GatewayRouteParentStatusEndpoint[];
}

export interface TlsRouteProviderDetailEndpoint extends ProviderDetailBaseEndpoint {
  type: "tls-route";
  hostnames: string[];
  parent_refs: ProviderNamedReferenceEndpoint[];
  rules: GatewayRouteRuleEndpoint[];
  parent_statuses: GatewayRouteParentStatusEndpoint[];
}

export type ProviderResourceDetailEndpoint =
  | CoreWorkloadProviderDetailEndpoint
  | CorePodProviderDetailEndpoint
  | CoreServiceProviderDetailEndpoint
  | CoreIngressProviderDetailEndpoint
  | ArgoApplicationProviderDetailEndpoint
  | CoreCronJobProviderDetailEndpoint
  | CoreConfigMapProviderDetailEndpoint
  | CoreHpaProviderDetailEndpoint
  | CoreNodeProviderDetailEndpoint
  | CoreNamespaceProviderDetailEndpoint
  | CoreEventProviderDetailEndpoint
  | CoreRbacProviderDetailEndpoint
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
  | CrossplaneManagedResourceProviderDetailEndpoint
  | CronWorkflowProviderDetailEndpoint
  | ExternalSecretProviderDetailEndpoint
  | PersistentVolumeClaimProviderDetailEndpoint
  | SealedSecretProviderDetailEndpoint
  | SecretProviderDetailEndpoint
  | SecretStoreProviderDetailEndpoint
  | WorkflowProviderDetailEndpoint
  | GatewayClassProviderDetailEndpoint
  | GcpMachineProviderDetailEndpoint
  | GcpManagedControlPlaneProviderDetailEndpoint
  | GcpManagedMachinePoolProviderDetailEndpoint
  | GrpcRouteProviderDetailEndpoint
  | HttpRouteProviderDetailEndpoint
  | JobProviderDetailEndpoint
  | KarpenterEc2NodeClassProviderDetailEndpoint
  | KarpenterNodeClaimProviderDetailEndpoint
  | KarpenterNodePoolProviderDetailEndpoint
  | KedaScaledObjectProviderDetailEndpoint
  | KedaScaledJobProviderDetailEndpoint
  | SbomReportProviderDetailEndpoint
  | VulnerabilityReportProviderDetailEndpoint
  | PrometheusRuleProviderDetailEndpoint
  | TcpRouteProviderDetailEndpoint
  | TlsRouteProviderDetailEndpoint;
