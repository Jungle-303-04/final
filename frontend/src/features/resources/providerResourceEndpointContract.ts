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

export type ProviderResourceDetailEndpoint =
  | AwsMachineProviderDetailEndpoint
  | AwsManagedClusterProviderDetailEndpoint
  | AwsManagedControlPlaneProviderDetailEndpoint
  | AwsManagedMachinePoolProviderDetailEndpoint
  | AzureMachineProviderDetailEndpoint
  | AzureManagedControlPlaneProviderDetailEndpoint
  | AzureManagedMachinePoolProviderDetailEndpoint;
