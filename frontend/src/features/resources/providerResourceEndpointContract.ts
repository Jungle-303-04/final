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

export interface ProviderReplicasEndpoint {
  desired: number | null;
  ready: number | null;
  available: number | null;
  up_to_date: number | null;
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
  | CapiMachineSetProviderDetailEndpoint;
