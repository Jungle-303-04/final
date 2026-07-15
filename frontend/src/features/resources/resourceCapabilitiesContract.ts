export type ResourceActionCapabilityId = string;

export interface ResourceCapabilityInput {
  key: string;
  label: string;
  type: "integer" | "string";
  required: boolean;
  minimum: number | null;
  maximum: number | null;
  default: number | string | null;
}

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
  label: string;
  description: string;
  execution: "command" | "terminal";
  confirmationRequired: boolean;
  realtime: boolean;
  inputSchema: ResourceCapabilityInput[];
  method: "POST" | "WEBSOCKET";
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
  commandId: string | null;
}

export interface ResourceActionsPort {
  execute(
    capability: ResourceActionCapability,
    values: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<ResourceActionReceipt>;
}
