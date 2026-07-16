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

export interface ResourceActionExecutionContext {
  capabilityId: ResourceActionCapabilityId;
  idempotencyKey: string;
  resourceId: string;
  snapshotId: string;
  revision: string;
  resource: {
    apiGroup: string;
    version: string;
    kind: string;
    namespace: string | null;
    name: string;
    uid: string;
  };
}

/**
 * Lifecycle states shared by resource-action receipts and the operation stream.
 * Keep the in-progress cancellation states explicit so consumers never coerce a
 * cancel request into a terminal result before the agent acknowledges it.
 */
export type ResourceActionStatus =
  | "queued"
  | "leased"
  | "running"
  | "cancel_requested"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export interface ResourceCapabilitiesPort {
  loadResourceCapabilities(
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<ResourceCapabilities>;
}

export interface ResourceActionReceipt {
  accepted: true;
  eventId: string;
  auditEventId: string;
  correlationId: string;
  commandId: string;
  status: ResourceActionStatus;
}

export interface ResourceActionsPort {
  execute(
    capability: ResourceActionCapability,
    values: Readonly<Record<string, unknown>>,
    context?: ResourceActionExecutionContext,
    signal?: AbortSignal,
  ): Promise<ResourceActionReceipt>;
}
