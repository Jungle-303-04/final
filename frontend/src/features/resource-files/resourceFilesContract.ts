import type { ResourceRefContract } from "../resources/resourceCapabilitiesContract";

export type ResourceFileCapabilityId = "image.filesystem" | "pod.filesystem";
export type ResourceFileOperation =
  | "image.metadata"
  | "image.list"
  | "image.read"
  | "pod.list"
  | "pod.read";

export interface ResourceFileCommandInput {
  capabilityId: ResourceFileCapabilityId;
  capabilityRevision: string;
  resourceId: string;
  snapshotId: string;
  resource: ResourceRefContract;
  operation: ResourceFileOperation;
  container: string;
  artifactId?: string | null;
  path?: string | null;
  cursor?: number | null;
  offset?: number | null;
  limit?: number | null;
}

export interface ResourceFileEntry {
  name: string;
  path: string;
  type: "directory" | "file" | "symlink";
  size: number;
  permissions: string;
  modifiedAt: string | null;
  linkTarget: string | null;
}

export interface ResourceImageMetadataResult {
  operation: "image.metadata";
  image: string;
  digest: string;
  platform: string | null;
  totalSize: number;
  layerCount: number;
  cached: boolean;
  artifactId: string | null;
  authMethod: "anonymous" | "pull-secret" | "cached";
}

export interface ResourceFileDirectoryResult {
  operation: "image.list" | "pod.list";
  path: string;
  entries: ResourceFileEntry[];
  cursor: number;
  nextCursor: number | null;
  totalEntries: number;
  truncated: boolean;
  artifactId: string | null;
}

export interface ResourceFileReadResult {
  operation: "image.read" | "pod.read";
  path: string;
  dataBase64: string;
  offset: number;
  nextOffset: number;
  eof: boolean;
  totalSize: number | null;
  sha256: string;
  artifactId: string | null;
  mediaType: string;
  filename: string;
}

export type ResourceFileResult =
  | ResourceImageMetadataResult
  | ResourceFileDirectoryResult
  | ResourceFileReadResult;

export interface ResourceFilesPort {
  run(input: ResourceFileCommandInput, signal?: AbortSignal): Promise<ResourceFileResult>;
  download(input: ResourceFileCommandInput, signal?: AbortSignal): Promise<Blob>;
}
