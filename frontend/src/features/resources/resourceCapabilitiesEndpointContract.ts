import type {
  ResourceActionCapability,
  ResourceActionStatus,
} from "./resourceCapabilitiesContract";

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
    execution: "command" | "terminal";
    confirmation_required: boolean;
    realtime: boolean;
    input_schema: Array<{
      key: string;
      label: string;
      type: "integer" | "string";
      required: boolean;
      minimum: number | null;
      maximum: number | null;
      default: number | string | null;
    }>;
    method: "POST" | "WEBSOCKET";
    path: string;
  }>;
}

export interface ResourceCapabilitiesEndpointDependencies {
  getResourceCapabilities(
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<ResourceCapabilitiesEndpointResponse>;
}

export interface ResourceActionsEndpointDependencies {
  executeResourceCapability(
    capability: ResourceActionCapability,
    values: Readonly<Record<string, unknown>>,
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
