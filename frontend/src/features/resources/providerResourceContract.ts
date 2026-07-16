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

export interface ProviderReference {
  apiVersion: string | null;
  kind: string;
  namespace: string | null;
  name: string;
}

export interface ProviderReplicas {
  desired: number | null;
  ready: number | null;
  available: number | null;
  upToDate: number | null;
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
    })
  | (ProviderDetailBase & {
      type: "capi-cluster";
      phase: string | null;
      version: string | null;
      clusterClass: string | null;
      endpoint: string | null;
      provider: string | null;
      paused: boolean;
      controlPlane: ProviderReplicas;
      workers: ProviderReplicas;
      controlPlaneRef: ProviderReference | null;
      infrastructureRef: ProviderReference | null;
    })
  | (ProviderDetailBase & {
      type: "capi-kubeadm-control-plane";
      clusterName: string | null;
      version: string | null;
      initialized: boolean | null;
      updateStrategy: string | null;
      replicas: ProviderReplicas;
      infrastructureRef: ProviderReference | null;
      nodeDrainTimeout: string | null;
      nodeVolumeDetachTimeout: string | null;
      nodeDeletionTimeout: string | null;
      certificateSans: string[];
      remediationMachine: string | null;
      remediationRetryCount: number | null;
      remediationTimestamp: string | null;
    })
  | (ProviderDetailBase & {
      type: "capi-machine-deployment";
      phase: string | null;
      clusterName: string | null;
      version: string | null;
      paused: boolean;
      replicas: ProviderReplicas;
      strategyType: string | null;
      maxSurge: string | null;
      maxUnavailable: string | null;
      infrastructureRef: ProviderReference | null;
      bootstrapRef: ProviderReference | null;
    })
  | (ProviderDetailBase & {
      type: "capi-machine-health-check";
      clusterName: string | null;
      expectedMachines: number | null;
      currentHealthy: number | null;
      remediationsAllowed: number | null;
      nodeStartupTimeout: string | null;
      maxUnhealthy: string | null;
      unhealthyRange: string | null;
      selector: ProviderKeyValue[];
      unhealthyConditions: Array<{ type: string; status: string | null; timeout: string | null }>;
      remediationTemplate: ProviderReference | null;
    })
  | (ProviderDetailBase & {
      type: "capi-machine-pool";
      phase: string | null;
      clusterName: string | null;
      minReadySeconds: number | null;
      replicas: ProviderReplicas;
      infrastructureRef: ProviderReference | null;
      bootstrapRef: ProviderReference | null;
    })
  | (ProviderDetailBase & {
      type: "capi-machine";
      phase: string | null;
      role: "control-plane" | "worker";
      clusterName: string | null;
      version: string | null;
      failureDomain: string | null;
      provider: string | null;
      providerId: string | null;
      providerRegion: string | null;
      providerInstanceId: string | null;
      nodeName: string | null;
      nodeUid: string | null;
      bootstrapRef: ProviderReference | null;
      infrastructureRef: ProviderReference | null;
      addresses: Array<{ type: string; address: string }>;
      osImage: string | null;
      architecture: string | null;
      kernelVersion: string | null;
      containerRuntimeVersion: string | null;
      kubeletVersion: string | null;
    })
  | (ProviderDetailBase & {
      type: "capi-machine-set";
      clusterName: string | null;
      deletePolicy: string | null;
      minReadySeconds: number | null;
      replicas: ProviderReplicas;
      infrastructureRef: ProviderReference | null;
      bootstrapRef: ProviderReference | null;
    });
