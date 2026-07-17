import type { CommandOperationEventEndpoint } from "../../api/operation-events-schemas";

export interface ResourceFileCommandEndpointInput {
  capability_id: "image.filesystem" | "pod.filesystem";
  capability_revision: string;
  resource_id: string;
  snapshot_id: string;
  resource: {
    api_group: string;
    version: string;
    kind: string;
    namespace: string | null;
    name: string;
    uid: string;
  };
  operation: "image.metadata" | "image.list" | "image.read" | "pod.list" | "pod.read";
  container: string;
  artifact_id?: string | null;
  path?: string | null;
  cursor?: number | null;
  offset?: number | null;
  limit?: number | null;
  confirmation: true;
  idempotency_key: string;
}

export interface ResourceFileCommandReceiptEndpoint {
  accepted: true;
  event_id: string;
  audit_event_id: string;
  correlation_id: string;
  command_id: string;
  status: "queued" | "leased" | "running" | "cancel_requested" | "cancelling" | "completed" | "failed" | "cancelled";
}

export interface ResourceFilesEndpointDependencies {
  startResourceFileCommand(
    input: ResourceFileCommandEndpointInput,
    signal?: AbortSignal,
  ): Promise<ResourceFileCommandReceiptEndpoint>;
  subscribeCommandOperationEvents(
    commandId: string,
    subscription?: { signal?: AbortSignal },
  ): AsyncIterable<CommandOperationEventEndpoint>;
}
