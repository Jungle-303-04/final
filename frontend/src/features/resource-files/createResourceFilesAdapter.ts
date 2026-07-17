import { resourceFileResultSchema } from "../../api/resource-files-schemas";
import type { ResourceFileResultEndpoint } from "../../api/resource-files-schemas";
import type {
  ResourceFileCommandInput,
  ResourceFileDirectoryResult,
  ResourceFileEntry,
  ResourceFileReadResult,
  ResourceFileResult,
  ResourceFilesPort,
  ResourceImageMetadataResult,
} from "./resourceFilesContract";
import type {
  ResourceFileCommandEndpointInput,
  ResourceFilesEndpointDependencies,
} from "./resourceFilesEndpointContract";

const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;
const DEFAULT_CHUNK_BYTES = 64 * 1024;

export function createResourceFilesAdapter(
  endpoints: ResourceFilesEndpointDependencies,
): ResourceFilesPort {
  async function run(
    input: ResourceFileCommandInput,
    signal?: AbortSignal,
  ): Promise<ResourceFileResult> {
    const receipt = await endpoints.startResourceFileCommand(toEndpointInput(input), signal);
    for await (const event of endpoints.subscribeCommandOperationEvents(receipt.command_id, { signal })) {
      if (event.kind === "completed") {
        const result = asRecord(asRecord(event.payload).result).resource_file;
        return mapResult(resourceFileResultSchema.parse(result));
      }
      if (event.kind === "failed" || event.kind === "cancelled") {
        throw new Error(operationFailureMessage(event.payload, event.kind));
      }
    }
    throw new Error("resource filesystem operation ended before a terminal event");
  }

  return {
    run,
    async download(input, signal) {
      if (input.operation !== "image.read" && input.operation !== "pod.read") {
        throw new TypeError("resource filesystem download requires a read operation");
      }
      const chunks: ArrayBuffer[] = [];
      let offset = input.offset ?? 0;
      let total = 0;
      let mediaType: string | undefined;
      while (true) {
        const result = await run({
          ...input,
          offset,
          limit: input.limit ?? DEFAULT_CHUNK_BYTES,
        }, signal);
        if (result.operation !== "image.read" && result.operation !== "pod.read") {
          throw new TypeError("resource filesystem read returned an incompatible result");
        }
        if (result.offset !== offset) throw new Error("resource filesystem chunk offset is not contiguous");
        const bytes = decodeBase64(result.dataBase64);
        await verifyDigest(bytes, result.sha256);
        total += bytes.byteLength;
        if (total > MAX_DOWNLOAD_BYTES) throw new Error("resource filesystem download exceeds the byte limit");
        chunks.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        mediaType ??= result.mediaType;
        if (result.eof) break;
        if (result.nextOffset <= offset) throw new Error("resource filesystem chunk made no progress");
        offset = result.nextOffset;
      }
      return new Blob(chunks, { type: mediaType ?? "application/octet-stream" });
    },
  };
}

function toEndpointInput(input: ResourceFileCommandInput): ResourceFileCommandEndpointInput {
  return {
    capability_id: input.capabilityId,
    capability_revision: input.capabilityRevision,
    resource_id: input.resourceId,
    snapshot_id: input.snapshotId,
    resource: {
      api_group: input.resource.apiGroup,
      version: input.resource.version,
      kind: input.resource.kind,
      namespace: input.resource.namespace,
      name: input.resource.name,
      uid: input.resource.uid,
    },
    operation: input.operation,
    container: input.container,
    artifact_id: input.artifactId,
    path: input.path,
    cursor: input.cursor,
    offset: input.offset,
    limit: input.limit,
    confirmation: true,
    idempotency_key: `resource-files-${secureId()}`,
  };
}

function secureId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const value = new Uint8Array(16);
  crypto.getRandomValues(value);
  return Array.from(value, (part) => part.toString(16).padStart(2, "0")).join("");
}

function mapResult(result: ResourceFileResultEndpoint): ResourceFileResult {
  if (result.operation === "image.metadata") {
    const mapped: ResourceImageMetadataResult = {
      operation: result.operation,
      image: result.image,
      digest: result.digest,
      platform: result.platform,
      totalSize: result.total_size,
      layerCount: result.layer_count,
      cached: result.cached,
      artifactId: result.artifact_id,
      authMethod: result.auth_method,
    };
    return mapped;
  }
  if ("entries" in result) {
    const mapped: ResourceFileDirectoryResult = {
      operation: result.operation,
      path: result.path,
      entries: result.entries.map(mapEntry),
      cursor: result.cursor,
      nextCursor: result.next_cursor,
      totalEntries: result.total_entries,
      truncated: result.truncated,
      artifactId: result.artifact_id,
    };
    return mapped;
  }
  if (!("data_base64" in result)) throw new TypeError("unsupported resource filesystem result");
  const mapped: ResourceFileReadResult = {
    operation: result.operation,
    path: result.path,
    dataBase64: result.data_base64,
    offset: result.offset,
    nextOffset: result.next_offset,
    eof: result.eof,
    totalSize: result.total_size,
    sha256: result.sha256,
    artifactId: result.artifact_id,
    mediaType: result.media_type,
    filename: result.filename,
  };
  return mapped;
}

function mapEntry(entry: {
  name: string;
  path: string;
  type: "directory" | "file" | "symlink";
  size: number;
  permissions: string;
  modified_at: string | null;
  link_target: string | null;
}): ResourceFileEntry {
  return {
    name: entry.name,
    path: entry.path,
    type: entry.type,
    size: entry.size,
    permissions: entry.permissions,
    modifiedAt: entry.modified_at,
    linkTarget: entry.link_target,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function operationFailureMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  for (const key of ["message", "detail", "error"]) {
    if (typeof record[key] === "string" && record[key] !== "") return record[key];
  }
  return `resource filesystem operation ${fallback}`;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyDigest(bytes: Uint8Array, expected: string): Promise<void> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const actual = Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
  if (actual !== expected) throw new Error("resource filesystem chunk checksum mismatch");
}
