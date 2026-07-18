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

export interface ProviderNamedReference {
  apiVersion: string | null;
  kind: string | null;
  namespace: string | null;
  name: string;
}

export interface ProviderReplicas {
  desired: number | null;
  ready: number | null;
  available: number | null;
  upToDate: number | null;
}

export interface GatewayRouteMatch {
  method: string | null;
  pathType: string | null;
  pathValue: string | null;
  grpcType: string | null;
  grpcService: string | null;
  grpcMethod: string | null;
  headers: ProviderKeyValue[];
  queryParams: ProviderKeyValue[];
}

export interface GatewayRouteBackend {
  reference: ProviderNamedReference;
  port: number | null;
  weight: number | null;
}

export interface GatewayRouteFilter {
  type: string;
  summary: string | null;
}

export interface GatewayRouteRule {
  matches: GatewayRouteMatch[];
  backends: GatewayRouteBackend[];
  filters: GatewayRouteFilter[];
}

export interface GatewayRouteParentStatus {
  reference: ProviderNamedReference | null;
  sectionName: string | null;
  accepted: boolean | null;
  resolvedRefs: boolean | null;
  conditions: ProviderCondition[];
}

export interface ProviderRequirement {
  key: string;
  operator: string | null;
  values: string[];
  minValues: number | null;
}

export interface ProviderTaint {
  key: string;
  value: string | null;
  effect: string | null;
}

export interface KarpenterSelectorTerm {
  id: string | null;
  name: string | null;
  alias: string | null;
  owner: string | null;
  tags: ProviderKeyValue[];
}

export interface KarpenterResolvedNetwork {
  id: string;
  name: string | null;
  zone: string | null;
}

export interface KedaTrigger {
  type: string;
  name: string | null;
  authenticationRef: ProviderNamedReference | null;
  metadataKeys: string[];
  redactedMetadataCount: number;
}

export interface PrometheusRuleEntry {
  type: "alert" | "recording";
  name: string;
  expression: string;
  duration: string | null;
  severity: string | null;
  summary: string | null;
  description: string | null;
  labels: ProviderKeyValue[];
}

export interface PrometheusRuleGroup {
  name: string;
  interval: string | null;
  ruleCount: number;
  alertCount: number;
  recordingCount: number;
  rules: PrometheusRuleEntry[];
}

export interface SecuritySeveritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export interface SbomComponent {
  name: string;
  version: string | null;
  type: string | null;
  packageUrl: string | null;
  packageUrlQualifiersRedacted: boolean;
  license: string | null;
}

export interface VulnerabilityFinding {
  vulnerabilityId: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  score: number | null;
  package: string | null;
  installedVersion: string | null;
  fixedVersion: string | null;
  primaryLink: string | null;
}

interface ProviderDetailBase {
  conditions: ProviderCondition[];
}

export interface ProviderContainerProjection {
  name: string;
  image: string | null;
  state: string | null;
  stateReason: string | null;
  ready: boolean | null;
  restartCount: number;
  ports: Array<{ name: string | null; containerPort: number; protocol: string }>;
  requests: ProviderKeyValue[];
  limits: ProviderKeyValue[];
}

export type ProviderResourceDetail =
  | (ProviderDetailBase & {
      type: "core-workload";
      kind: string;
      owner: ProviderNamedReference | null;
      replicas: ProviderReplicas;
      unavailable: number | null;
      strategyType: string | null;
      maxSurge: string | null;
      maxUnavailable: string | null;
      minReadySeconds: number | null;
      revisionHistoryCount: number | null;
      serviceAccountName: string | null;
      selector: ProviderKeyValue[];
      initContainers: ProviderContainerProjection[];
      containers: ProviderContainerProjection[];
    })
  | (ProviderDetailBase & {
      type: "core-pod";
      phase: string | null;
      nodeName: string | null;
      podIp: string | null;
      hostIp: string | null;
      serviceAccountName: string | null;
      owner: ProviderNamedReference | null;
      initContainers: ProviderContainerProjection[];
      containers: ProviderContainerProjection[];
      ephemeralContainerNames: string[];
    })
  | (ProviderDetailBase & {
      type: "core-service";
      serviceType: string | null;
      clusterIp: string | null;
      externalName: string | null;
      externalIps: string[];
      loadBalancerAddresses: string[];
      externalTrafficPolicy: string | null;
      internalTrafficPolicy: string | null;
      ipFamilies: string[];
      ports: string[];
      selector: ProviderKeyValue[];
    })
  | (ProviderDetailBase & {
      type: "core-ingress";
      ingressClassName: string | null;
      addresses: string[];
      routes: Array<{
        host: string | null;
        path: string;
        pathType: string | null;
        backendService: string;
        backendPort: string | null;
      }>;
      tls: Array<{ secretName: string | null; hosts: string[] }>;
    })
  | (ProviderDetailBase & {
      type: "argo-application";
      syncStatus: string | null;
      healthStatus: string | null;
      operationPhase: string | null;
      repositoryUrl: string | null;
      sourcePath: string | null;
      targetRevision: string | null;
      chart: string | null;
      destinationServer: string | null;
      destinationNamespace: string | null;
      automated: boolean;
      selfHeal: boolean;
      prune: boolean;
      retryEnabled: boolean;
      managedResourceCount: number;
      revisionHistory: string[];
    })
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
    })
  | (ProviderDetailBase & {
      type: "certificate";
      ready: boolean | null;
      secretName: string | null;
      revision: number | null;
      isCa: boolean | null;
      duration: string | null;
      renewBefore: string | null;
      notBefore: string | null;
      notAfter: string | null;
      renewalTime: string | null;
      failedIssuanceAttempts: number | null;
      lastFailureTime: string | null;
      privateKey: {
        algorithm: string | null;
        size: number | null;
        encoding: string | null;
        rotationPolicy: string | null;
      } | null;
      dnsNames: string[];
      issuerRef: ProviderNamedReference | null;
      usages: string[];
    })
  | (ProviderDetailBase & {
      type: "certificate-request";
      ready: boolean | null;
      approved: boolean | null;
      denied: boolean | null;
      issuerRef: ProviderNamedReference | null;
      ownerCertificate: ProviderNamedReference | null;
      duration: string | null;
      usages: string[];
      certificateIssued: boolean | null;
    })
  | (ProviderDetailBase & {
      type: "cluster-compliance-report";
      frameworkId: string | null;
      frameworkTitle: string | null;
      frameworkDescription: string | null;
      frameworkVersion: string | null;
      platform: string | null;
      updatedAt: string | null;
      passCount: number | null;
      failCount: number | null;
      controls: Array<{
        id: string;
        name: string | null;
        description: string | null;
        severity: string | null;
        totalPass: number | null;
        totalFail: number | null;
        checkIds: string[];
      }>;
    })
  | (ProviderDetailBase & {
      type: "crossplane-composite";
      claim: boolean;
      paused: boolean;
      compositionRef: ProviderNamedReference | null;
      compositionRevisionRef: ProviderNamedReference | null;
      compositionUpdatePolicy: string | null;
      boundResourceRef: ProviderNamedReference | null;
      composedResourceRefs: ProviderNamedReference[];
    })
  | (ProviderDetailBase & {
      type: "crossplane-managed-resource";
      apiGroup: string | null;
      kind: string;
      externalName: string | null;
      managementPolicies: string[];
      deletionPolicy: string | null;
      paused: boolean;
      providerConfigRef: ProviderNamedReference | null;
      composingResourceRef: ProviderNamedReference | null;
      observedSpecFields: string[];
      observedStatusFields: string[];
    })
  | (ProviderDetailBase & {
      type: "cron-workflow";
      schedules: string[];
      timezone: string | null;
      suspended: boolean | null;
      concurrencyPolicy: string | null;
      lastScheduledTime: string | null;
      activeWorkflows: ProviderNamedReference[];
      workflowTemplateRef: ProviderNamedReference | null;
      workflowTemplateClusterScope: boolean | null;
      entrypoint: string | null;
      argumentCount: number | null;
      templateCount: number | null;
      successfulHistoryLimit: number | null;
      failedHistoryLimit: number | null;
      startingDeadlineSeconds: number | null;
    })
  | (ProviderDetailBase & {
      type: "external-secret";
      ready: boolean | null;
      lastSyncTime: string | null;
      refreshInterval: string | null;
      targetName: string | null;
      syncedResourceVersion: string | null;
      bindingName: string | null;
      storeName: string | null;
      storeKind: string | null;
      mappings: Array<{
        secretKey: string | null;
        remoteKey: string | null;
        remoteProperty: string | null;
        remoteVersion: string | null;
      }>;
      dataSources: Array<{
        type: "extract" | "find" | "source-ref" | "unknown";
        detail: string | null;
      }>;
      targetCreationPolicy: string | null;
      targetDeletionPolicy: string | null;
      templateType: string | null;
      templateEngineVersion: string | null;
      templateLabels: ProviderKeyValue[];
      templateAnnotations: ProviderKeyValue[];
    })
  | (ProviderDetailBase & {
      type: "persistent-volume-claim";
      phase: string | null;
      capacity: string | null;
      requested: string | null;
      storageClassName: string | null;
      accessModes: string[];
      volumeMode: string | null;
      volumeName: string | null;
      provisioner: string | null;
      selectedNode: string | null;
      bindCompleted: boolean | null;
    })
  | (ProviderDetailBase & {
      type: "sealed-secret";
      synced: boolean | null;
      targetSecretName: string | null;
      secretType: string | null;
      scope: "strict" | "namespace-wide" | "cluster-wide";
      observedGeneration: number | null;
      encryptedKeys: string[];
      templateLabels: ProviderKeyValue[];
      templateAnnotations: ProviderKeyValue[];
    })
  | (ProviderDetailBase & {
      type: "secret";
      secretType: string | null;
      immutable: boolean | null;
      keyNames: string[];
    })
  | (ProviderDetailBase & {
      type: "secret-store";
      clusterScope: boolean;
      ready: boolean | null;
      providerKey: string | null;
      providerType: string | null;
      providerDetails: ProviderKeyValue[];
      controller: string | null;
      maxRetries: number | null;
      retryInterval: string | null;
    })
  | (ProviderDetailBase & {
      type: "workflow";
      phase: string;
      startedAt: string | null;
      finishedAt: string | null;
      progress: string | null;
      estimatedDurationSeconds: number | null;
      workflowTemplateRef: ProviderNamedReference | null;
      argumentNames: string[];
      resourceDurations: ProviderKeyValue[];
      executionNodes: Array<{
        id: string;
        label: string;
        nodeType: string;
        phase: string;
        depth: number;
        startedAt: string | null;
        finishedAt: string | null;
        message: string | null;
        templateRef: ProviderNamedReference | null;
      }>;
      observedNodeCount: number;
      projectedNodeCount: number;
      truncated: boolean;
      problemSummaries: string[];
    })
  | (ProviderDetailBase & {
      type: "gateway-class";
      controllerName: string | null;
      description: string | null;
      accepted: boolean | null;
      parametersRef: ProviderNamedReference | null;
    })
  | (ProviderDetailBase & {
      type: "gcp-machine";
      ready: boolean | null;
      instanceType: string | null;
      zone: string | null;
      instanceId: string | null;
      image: string | null;
      additionalDisks: Array<{
        deviceType: string | null;
        sizeGb: number | null;
      }>;
    })
  | (ProviderDetailBase & {
      type: "gcp-managed-control-plane";
      ready: boolean | null;
      clusterName: string | null;
      project: string | null;
      location: string | null;
      version: string | null;
      releaseChannel: string | null;
      autopilot: boolean | null;
      endpoint: string | null;
      podCidr: string | null;
      serviceCidr: string | null;
      ipAliases: boolean | null;
      loggingService: string | null;
      monitoringService: string | null;
      authorizedNetworks: Array<{ name: string | null; cidr: string }>;
    })
  | (ProviderDetailBase & {
      type: "gcp-managed-machine-pool";
      ready: boolean | null;
      nodePoolName: string | null;
      machineType: string | null;
      diskType: string | null;
      diskSizeGb: number | null;
      imageType: string | null;
      maxPodsPerNode: number | null;
      autoscalingEnabled: boolean | null;
      scaling: ProviderScaling;
      autoRepair: boolean | null;
      autoUpgrade: boolean | null;
      nodeLocations: string[];
      labels: ProviderKeyValue[];
      taints: Array<{ key: string; value: string | null; effect: string | null }>;
    })
  | (ProviderDetailBase & {
      type: "grpc-route";
      hostnames: string[];
      parentRefs: ProviderNamedReference[];
      rules: GatewayRouteRule[];
      parentStatuses: GatewayRouteParentStatus[];
    })
  | (ProviderDetailBase & {
      type: "http-route";
      hostnames: string[];
      parentRefs: ProviderNamedReference[];
      rules: GatewayRouteRule[];
      parentStatuses: GatewayRouteParentStatus[];
    })
  | (ProviderDetailBase & {
      type: "job";
      state: "completed" | "failed" | "suspended" | "running" | "pending";
      succeeded: number | null;
      failed: number | null;
      active: number | null;
      completions: number | null;
      parallelism: number | null;
      backoffLimit: number | null;
      activeDeadlineSeconds: number | null;
      ttlSecondsAfterFinished: number | null;
      suspended: boolean | null;
      startTime: string | null;
      completionTime: string | null;
      terminalReason: string | null;
      terminalMessage: string | null;
    })
  | (ProviderDetailBase & {
      type: "karpenter-ec2-node-class";
      ready: boolean | null;
      role: string | null;
      instanceProfile: string | null;
      amiFamily: string | null;
      amiSelectorTerms: KarpenterSelectorTerm[];
      blockDevices: Array<{
        deviceName: string | null;
        volumeType: string | null;
        volumeSize: string | null;
        iops: number | null;
        throughput: number | null;
        encrypted: boolean | null;
        deleteOnTermination: boolean | null;
      }>;
      subnetSelectorTerms: KarpenterSelectorTerm[];
      securityGroupSelectorTerms: KarpenterSelectorTerm[];
      metadataOptions: {
        httpTokens: string | null;
        httpPutResponseHopLimit: number | null;
        httpEndpoint: string | null;
      } | null;
      resolvedAmis: Array<{
        id: string;
        name: string | null;
        requirements: ProviderRequirement[];
      }>;
      resolvedSubnets: KarpenterResolvedNetwork[];
      resolvedSecurityGroups: KarpenterResolvedNetwork[];
      tags: ProviderKeyValue[];
    })
  | (ProviderDetailBase & {
      type: "karpenter-node-claim";
      state: "ready" | "registered" | "launched" | "initialized" | "not-ready" | "pending" | "unknown";
      instanceType: string | null;
      capacityType: string | null;
      nodeName: string | null;
      zone: string | null;
      architecture: string | null;
      nodePool: string | null;
      nodeClassRef: ProviderNamedReference | null;
      imageId: string | null;
      expireAfter: string | null;
      capacity: {
        cpu: string | null;
        memory: string | null;
        pods: string | null;
        ephemeralStorage: string | null;
      };
      requirements: ProviderRequirement[];
    })
  | (ProviderDetailBase & {
      type: "karpenter-node-pool";
      ready: boolean | null;
      nodeClassRef: ProviderNamedReference | null;
      limitCpu: string | null;
      limitMemory: string | null;
      weight: number | null;
      currentCpu: string | null;
      currentMemory: string | null;
      consolidationPolicy: string | null;
      consolidateAfter: string | null;
      expireAfter: string | null;
      disruptionBudgets: Array<{
        nodes: string | null;
        schedule: string | null;
        duration: string | null;
      }>;
      templateLabels: ProviderKeyValue[];
      templateTaints: ProviderTaint[];
      startupTaints: ProviderTaint[];
      requirements: ProviderRequirement[];
    })
  | (ProviderDetailBase & {
      type: "keda-scaled-object";
      state: "paused" | "fallback" | "not-ready" | "active" | "idle" | "ready" | "unknown";
      targetRef: ProviderNamedReference | null;
      scaling: ProviderScaling;
      idleReplicas: number | null;
      pollingIntervalSeconds: number | null;
      cooldownPeriodSeconds: number | null;
      hpaName: string | null;
      lastActiveTime: string | null;
      fallbackFailureThreshold: number | null;
      fallbackReplicas: number | null;
      restoreOriginalReplicas: boolean | null;
      scaleUpStabilizationSeconds: number | null;
      scaleDownStabilizationSeconds: number | null;
      scalingPolicies: Array<{
        direction: "up" | "down";
        type: string | null;
        value: number | null;
        periodSeconds: number | null;
      }>;
      triggers: KedaTrigger[];
    })
  | (ProviderDetailBase & {
      type: "keda-scaled-job";
      state: "not-ready" | "active" | "idle" | "ready" | "unknown";
      jobTargetName: string | null;
      strategy: string | null;
      pollingIntervalSeconds: number | null;
      successfulHistoryLimit: number | null;
      failedHistoryLimit: number | null;
      minimumReplicas: number | null;
      maximumReplicas: number | null;
      triggers: KedaTrigger[];
    })
  | (ProviderDetailBase & {
      type: "sbom-report";
      containerName: string | null;
      image: string | null;
      bomFormat: string | null;
      specVersion: string | null;
      componentCount: number;
      dependencyCount: number;
      observedComponentCount: number;
      projectedComponentCount: number;
      truncated: boolean;
      scannerName: string | null;
      scannerVersion: string | null;
      scannedAt: string | null;
      components: SbomComponent[];
    })
  | (ProviderDetailBase & {
      type: "vulnerability-report";
      containerName: string | null;
      image: string | null;
      osFamily: string | null;
      osName: string | null;
      osEndOfServiceLife: boolean | null;
      scannerName: string | null;
      scannerVersion: string | null;
      scannedAt: string | null;
      severity: SecuritySeveritySummary;
      observedVulnerabilityCount: number;
      projectedVulnerabilityCount: number;
      truncated: boolean;
      vulnerabilities: VulnerabilityFinding[];
    })
  | (ProviderDetailBase & {
      type: "prometheus-rule";
      groupCount: number;
      totalRules: number;
      totalAlerts: number;
      totalRecordings: number;
      projectedRules: number;
      truncated: boolean;
      groups: PrometheusRuleGroup[];
    })
  | (ProviderDetailBase & {
      type: "tcp-route";
      hostnames: string[];
      parentRefs: ProviderNamedReference[];
      rules: GatewayRouteRule[];
      parentStatuses: GatewayRouteParentStatus[];
    })
  | (ProviderDetailBase & {
      type: "tls-route";
      hostnames: string[];
      parentRefs: ProviderNamedReference[];
      rules: GatewayRouteRule[];
      parentStatuses: GatewayRouteParentStatus[];
    });
