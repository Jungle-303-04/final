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
    async execute(capability, values, signal) {
      if (capability.execution !== "command" || capability.method !== "POST") {
        throw new ResourcesPortFailure("invalid-request");
      }
      return withActionFailure(async () => toResourceActionReceipt(
        await endpoints.executeResourceCapability(capability, values, signal),
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
