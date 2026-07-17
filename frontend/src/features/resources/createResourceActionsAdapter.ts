import {
  isResourcesAbortError,
  toResourcesPortFailure,
} from "./createResourcesAdapter";
import type { ResourceActionsPort } from "./resourceCapabilitiesContract";
import type { ResourceActionsEndpointDependencies } from "./resourceCapabilitiesEndpointContract";
import { toResourceActionReceipt } from "./resourceCapabilitiesCanonical";
import { ResourcesPortFailure } from "./resourcesContract";

export function createResourceActionsAdapter(
  endpoints: ResourceActionsEndpointDependencies,
): ResourceActionsPort {
  return {
    async previewDeletion(capability, signal) {
      if (
        capability.capabilityId !== "resource.delete" ||
        capability.execution !== "command" ||
        capability.method !== "POST"
      ) {
        throw new ResourcesPortFailure("invalid-request");
      }
      return withActionFailure(async () => {
        const value = await endpoints.getResourceDeletionPreview(capability.path, signal);
        const mapRef = (item: typeof value.root) => ({
          apiGroup: item.api_group,
          version: item.version,
          kind: item.kind,
          namespace: item.namespace,
          name: item.name,
          uid: item.uid,
          resourceVersion: item.resource_version,
        });
        return {
          root: mapRef(value.root),
          dependents: value.dependents.map(mapRef),
          revision: value.revision,
          truncated: value.truncated,
          maxDependents: value.max_dependents,
        };
      });
    },
    async previewRollback(capability, signal) {
      if (
        capability.capabilityId !== "workload.rollback" ||
        capability.execution !== "command" ||
        capability.method !== "POST" ||
        endpoints.getWorkloadRollbackPreview === undefined
      ) {
        throw new ResourcesPortFailure("invalid-request");
      }
      return withActionFailure(async () => {
        const value = await endpoints.getWorkloadRollbackPreview?.(capability.path, signal);
        if (value === undefined) throw new ResourcesPortFailure("invalid-response");
        const mapRef = (item: typeof value.current.resource) => ({
          apiGroup: item.api_group,
          version: item.version,
          kind: item.kind,
          namespace: item.namespace,
          name: item.name,
          uid: item.uid,
        });
        return {
          availability: value.availability,
          completeness: value.completeness,
          reason: value.reason,
          snapshotId: value.snapshot_id,
          current: {
            resource: mapRef(value.current.resource),
            resourceVersion: value.current.resource_version,
            templateSha256: value.current.template_sha256,
          },
          revisions: value.revisions.map((item) => ({
            revision: item.revision,
            resource: mapRef(item.resource),
            resourceVersion: item.resource_version,
            createdAt: item.created_at,
            templateSha256: item.template_sha256,
            previewRevision: item.preview_revision,
            changes: item.changes,
          })),
          nextCursor: value.next_cursor,
        };
      });
    },
    async execute(capability, values, context, signal) {
      if (capability.execution !== "command" || capability.method !== "POST") {
        throw new ResourcesPortFailure("invalid-request");
      }
      return withActionFailure(async () => toResourceActionReceipt(
        await endpoints.executeResourceCapability(capability, values, context, signal),
      ));
    },
  };
}

async function withActionFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isResourcesAbortError(error) || error instanceof ResourcesPortFailure) throw error;
    if (error instanceof TypeError || error instanceof RangeError) {
      throw new ResourcesPortFailure("invalid-request");
    }
    throw toResourcesPortFailure(error);
  }
}
