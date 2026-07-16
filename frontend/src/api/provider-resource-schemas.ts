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

export const providerResourceDetailSchema = z.discriminatedUnion("type", [
  awsMachine,
  awsManagedCluster,
  awsManagedControlPlane,
  awsManagedMachinePool,
  azureMachine,
  azureManagedControlPlane,
  azureManagedMachinePool,
]);
