import type { OperationEventsEndpointEvent } from "../operations/operationEventsEndpointContract";

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

export interface ResourceFileEntryEndpoint {
  name: string;
  path: string;
  type: "directory" | "file" | "symlink";
  size: number;
  permissions: string;
  modified_at: string | null;
  link_target: string | null;
}

export interface ResourceImageMetadataEndpoint {
  operation: "image.metadata";
  image: string;
  digest: string;
  platform: string | null;
  total_size: number;
  layer_count: number;
  cached: boolean;
  artifact_id: string | null;
  auth_method: "anonymous" | "pull-secret" | "cached";
}

export interface ResourceFileDirectoryEndpoint {
  operation: "image.list" | "pod.list";
  path: string;
  entries: ResourceFileEntryEndpoint[];
  cursor: number;
  next_cursor: number | null;
  total_entries: number;
  truncated: boolean;
  artifact_id: string | null;
}

export interface ResourceFileReadEndpoint {
  operation: "image.read" | "pod.read";
  path: string;
  data_base64: string;
  offset: number;
  next_offset: number;
  eof: boolean;
  total_size: number | null;
  sha256: string;
  artifact_id: string | null;
  media_type: string;
  filename: string;
}

export type ResourceFileResultEndpoint =
  | ResourceImageMetadataEndpoint
  | ResourceFileDirectoryEndpoint
  | ResourceFileReadEndpoint;

export interface ResourceFilesEndpointDependencies {
  startResourceFileCommand(
    input: ResourceFileCommandEndpointInput,
    signal?: AbortSignal,
  ): Promise<ResourceFileCommandReceiptEndpoint>;
  subscribeCommandOperationEvents(
    commandId: string,
    subscription?: { signal?: AbortSignal },
  ): AsyncIterable<OperationEventsEndpointEvent>;
  parseResourceFileResult(value: unknown): ResourceFileResultEndpoint;
}
