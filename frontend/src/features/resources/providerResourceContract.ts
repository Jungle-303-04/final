export interface ProviderCondition {
  type: string;
  status: "True" | "False" | "Unknown";
  reason: string | null;
  message: string | null;
  lastTransitionTime: string | null;
}

export interface ProviderKeyValue {
  key: string;
  value: string;
}

export interface ProviderScaling {
  minimum: number | null;
  maximum: number | null;
  current: number | null;
}

interface ProviderDetailBase {
  conditions: ProviderCondition[];
}

export type ProviderResourceDetail =
  | (ProviderDetailBase & {
      type: "aws-machine";
      instanceType: string | null;
      instanceId: string | null;
      instanceState: string | null;
      providerId: string | null;
      iamInstanceProfile: string | null;
      sshKeyName: string | null;
      subnetId: string | null;
      secretsBackend: string | null;
      addresses: Array<{ type: string; address: string }>;
    })
  | (ProviderDetailBase & {
      type: "aws-managed-cluster";
      endpoint: string | null;
      failureDomains: string[];
    })
  | (ProviderDetailBase & {
      type: "aws-managed-control-plane";
      clusterName: string | null;
      region: string | null;
      version: string | null;
      endpointAccess: "public" | "private" | "public-and-private" | null;
      roleName: string | null;
      identity: string | null;
      vpcId: string | null;
      vpcCidrBlock: string | null;
      subnets: Array<{
        id: string | null;
        availabilityZone: string | null;
        public: boolean | null;
        cidrBlock: string | null;
      }>;
      securityGroups: Array<{ role: string; id: string | null; name: string | null }>;
      natGatewayIps: string[];
      failureDomains: string[];
      addons: Array<{
        name: string;
        requestedVersion: string | null;
        currentVersion: string | null;
        status: string | null;
      }>;
    })
  | (ProviderDetailBase & {
      type: "aws-managed-machine-pool";
      nodeGroupName: string | null;
      instanceType: string | null;
      amiType: string | null;
      capacityType: string | null;
      roleName: string | null;
      scaling: ProviderScaling;
      maxUnavailable: number | null;
      subnetIds: string[];
      labels: ProviderKeyValue[];
    })
  | (ProviderDetailBase & {
      type: "azure-machine";
      vmSize: string | null;
      availabilityZone: string | null;
      osType: string | null;
      osDiskSizeGb: number | null;
      providerId: string | null;
      subnetName: string | null;
    })
  | (ProviderDetailBase & {
      type: "azure-managed-control-plane";
      location: string | null;
      resourceGroupName: string | null;
      version: string | null;
      skuTier: string | null;
      dnsPrefix: string | null;
      subscriptionId: string | null;
      networkPlugin: string | null;
      networkPolicy: string | null;
      privateCluster: boolean | null;
      dnsServiceIp: string | null;
      loadBalancerSku: string | null;
      upgradeChannel: string | null;
      authorizedIpRanges: string[];
    })
  | (ProviderDetailBase & {
      type: "azure-managed-machine-pool";
      poolName: string | null;
      vmSize: string | null;
      mode: string | null;
      osType: string | null;
      osDiskType: string | null;
      osDiskSizeGb: number | null;
      priority: string | null;
      maxPods: number | null;
      scaling: ProviderScaling;
      scaleDownMode: string | null;
      availabilityZones: string[];
      labels: ProviderKeyValue[];
      taints: Array<{ key: string; value: string | null; effect: string | null }>;
    });
