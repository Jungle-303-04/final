import type { ProviderResourceDetailEndpoint } from "./providerResourceEndpointContract";
import type {
  ProviderCondition,
  ProviderKeyValue,
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

function optionalInteger(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value)) return invalidResponse();
  return value as number;
}
