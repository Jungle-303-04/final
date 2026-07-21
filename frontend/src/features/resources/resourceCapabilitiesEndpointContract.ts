import type {
  ResourceActionCapability,
  ResourceActionStatus,
} from "./resourceCapabilitiesContract";

/**
 * Raw wire shape returned by `GET /api/capabilities`. Hand-written and decoupled
 * from the api/zod layer (the architecture boundary forbids importing from
 * `../../api` here), but kept STRUCTURALLY IDENTICAL to the inferred output of
 * the gateway's `resourceCapabilitiesSchema`. Mirror any schema change here:
 * the `resource-files` execution variant, boolean inputs with boolean defaults,
 * `prefill_result_key`, and the `request_context` / `result_intent` intents.
 */
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
    result_intent:
      | "refresh-resource"
      | "resource-summary"
      | "terminal-session"
      | "resource-files";
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
