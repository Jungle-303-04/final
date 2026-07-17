export type ResourceActionCapabilityId = string;

export const RESOURCE_MAINTENANCE_CAPABILITY_IDS = [
  "node.drain",
  "node.debug",
  "node.debug.cleanup",
  "pod.debug",
] as const;

export function isResourceMaintenanceCapability(capabilityId: string): boolean {
  return (RESOURCE_MAINTENANCE_CAPABILITY_IDS as readonly string[]).includes(capabilityId);
}

export interface ResourceCapabilityInput {
  key: string;
  label: string;
  type: "boolean" | "integer" | "string";
  required: boolean;
  minimum: number | null;
  maximum: number | null;
  default: boolean | number | string | null;
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
  resource: ResourceRefContract;
  rollback?: {
    workloadResourceVersion: string;
    targetRevision: ResourceRefContract;
    targetResourceVersion: string;
    previewRevision: string;
  };
}

export interface ResourceRefContract {
  apiGroup: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
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
  previewDeletion(
    capability: ResourceActionCapability,
    signal?: AbortSignal,
  ): Promise<ResourceDeletionPreview>;
  previewRollback?(
    capability: ResourceActionCapability,
    signal?: AbortSignal,
  ): Promise<WorkloadRollbackPreview>;
  execute(
    capability: ResourceActionCapability,
    values: Readonly<Record<string, unknown>>,
    context?: ResourceActionExecutionContext,
    signal?: AbortSignal,
  ): Promise<ResourceActionReceipt>;
}

export interface WorkloadRollbackChange {
  path: string;
  before: string;
  after: string;
}

export interface WorkloadRollbackRevision {
  revision: string;
  resource: ResourceRefContract;
  resourceVersion: string;
  createdAt: string | null;
  templateSha256: string;
  previewRevision: string;
  changes: WorkloadRollbackChange[];
}

export interface WorkloadRollbackPreview {
  availability: "available" | "unavailable";
  completeness: "exact" | "partial";
  reason: string | null;
  snapshotId: string;
  current: {
    resource: ResourceRefContract;
    resourceVersion: string;
    templateSha256: string;
  };
  revisions: WorkloadRollbackRevision[];
  nextCursor: number | null;
}

export interface ResourceDeletionRef {
  apiGroup: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
  resourceVersion: string;
}

export interface ResourceDeletionPreview {
  root: ResourceDeletionRef;
  dependents: ResourceDeletionRef[];
  revision: string;
  truncated: false;
  maxDependents: number;
}
