import type {
  ServiceAccessCapabilitiesEndpoint,
} from "./serviceAccessSchemas";
import type { ResourceActionStatus } from "../resources/resourceCapabilitiesContract";

export interface StartServiceRequestEndpointInput {
  scope: {
    workspace_id: string;
    cluster_id: string;
    namespaces: string[];
    freshness: "live" | "stale" | "partial" | "disconnected";
  };
  resource: {
    api_group: string;
    version: "v1";
    kind: string;
    namespace: string;
    name: string;
    uid: string;
  };
  port: number;
  scheme: "http" | "https";
  path: string;
  confirmation: true;
  reason: string;
}

export interface ServiceAccessEndpointDependencies {
  resolveServiceAccess(
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<ServiceAccessCapabilitiesEndpoint>;
  startServiceRequest(
    input: StartServiceRequestEndpointInput,
    signal?: AbortSignal,
  ): Promise<{
    accepted: true;
    event_id: string;
    audit_event_id: string;
    correlation_id: string;
    command_id: string;
    status: ResourceActionStatus;
  }>;
  cancelCommand(
    input: {
      commandId: string;
      idempotencyKey: string;
      reason: string;
    },
    signal?: AbortSignal,
  ): Promise<unknown>;
  idempotencyKey?: () => string;
}
