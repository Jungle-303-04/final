export type ResourceActionCapabilityId =
  | "deployment.restart"
  | "deployment.scale";

export interface ResourceCapabilitySubject {
  resourceId: string;
  snapshotId: string;
  clusterId: string;
  resourceType: string;
  kind: string;
  namespace: string | null;
  name: string;
}

export interface ResourceActionCapability {
  capabilityId: ResourceActionCapabilityId;
  method: "POST";
  path: string;
}

export interface ResourceCapabilities {
  subject: ResourceCapabilitySubject;
  revision: string;
  capabilities: ResourceActionCapability[];
}

export interface ResourceCapabilitiesPort {
  loadResourceCapabilities(
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<ResourceCapabilities>;
}

export interface ResourceActionReceipt {
  accepted: boolean;
  eventId: string;
  correlationId: string;
}

export interface ResourceActionsPort {
  restartDeployment(
    clusterId: string,
    namespace: string,
    deployment: string,
    signal?: AbortSignal,
  ): Promise<ResourceActionReceipt>;
  scaleDeployment(
    clusterId: string,
    namespace: string,
    deployment: string,
    replicas: number,
    signal?: AbortSignal,
  ): Promise<ResourceActionReceipt>;
}
