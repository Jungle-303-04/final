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
