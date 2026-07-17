import type {
  ResourceActionCapability,
  ResourceActionExecutionContext,
  ResourceActionStatus,
} from "./resourceCapabilitiesContract";

export interface ResourceDeletionPreviewEndpoint {
  root: ResourceDeletionRefEndpoint;
  dependents: ResourceDeletionRefEndpoint[];
  revision: string;
  truncated: false;
  max_dependents: number;
}

export interface ResourceDeletionRefEndpoint {
  api_group: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
  resource_version: string;
}

export interface ResourceCapabilitiesEndpointResponse {
  subject: {
    resource_id: string;
    snapshot_id: string;
    cluster_id: string;
    resource_type: string;
    kind: string;
    namespace: string | null;
    name: string;
  };
  revision: string;
  capabilities: Array<{
    capability_id: string;
    label: string;
    description: string;
    execution: "command" | "terminal" | "resource-files";
    confirmation_required: boolean;
    realtime: boolean;
    input_schema: Array<{
      key: string;
      label: string;
      type: "boolean" | "integer" | "string";
      required: boolean;
      minimum: number | null;
      maximum: number | null;
      default: boolean | number | string | null;
      prefill_result_key: string | null;
    }>;
    method: "POST" | "WEBSOCKET";
    path: string;
    request_context: "simple" | "exact-resource" | "rollback";
    result_intent: "refresh-resource" | "resource-summary" | "terminal-session" | "resource-files";
  }>;
}

export interface ResourceCapabilitiesEndpointDependencies {
  getResourceCapabilities(
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<ResourceCapabilitiesEndpointResponse>;
}

export interface ResourceActionsEndpointDependencies {
  getResourceDeletionPreview(
    actionPath: string,
    signal?: AbortSignal,
  ): Promise<ResourceDeletionPreviewEndpoint>;
  getWorkloadRollbackPreview?(
    actionPath: string,
    signal?: AbortSignal,
  ): Promise<WorkloadRollbackPreviewEndpoint>;
  executeResourceCapability(
    capability: ResourceActionCapability,
    values: Readonly<Record<string, unknown>>,
    context?: ResourceActionExecutionContext,
    signal?: AbortSignal,
  ): Promise<{
    accepted: true;
    event_id: string;
    audit_event_id: string;
    correlation_id: string;
    command_id: string;
    status: ResourceActionStatus;
  }>;
}

export interface WorkloadRollbackPreviewEndpoint {
  availability: "available" | "unavailable";
  completeness: "exact" | "partial";
  reason: string | null;
  snapshot_id: string;
  current: {
    resource: ResourceRollbackRefEndpoint;
    resource_version: string;
    template_sha256: string;
  };
  revisions: Array<{
    revision: string;
    resource: ResourceRollbackRefEndpoint;
    resource_version: string;
    created_at: string | null;
    template_sha256: string;
    preview_revision: string;
    changes: Array<{ path: string; before: string; after: string }>;
  }>;
  next_cursor: number | null;
}

export interface ResourceRollbackRefEndpoint {
  api_group: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}
