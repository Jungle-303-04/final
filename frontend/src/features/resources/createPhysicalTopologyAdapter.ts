import type { PhysicalTopologyEndpointDependencies } from "./physicalTopologyEndpointContract";
import type { PhysicalTopologyPort } from "./physicalTopologyContract";
import { toPhysicalTopology } from "./physicalTopologyCanonical";
import { createPhysicalTopologyRequest } from "./resourcesFilterRequest";
import { ResourcesPortFailure } from "./resourcesContract";
import {
  isResourcesAbortError,
  toResourcesPortFailure,
} from "./createResourcesAdapter";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function createPhysicalTopologyAdapter(
  endpoints: PhysicalTopologyEndpointDependencies,
): PhysicalTopologyPort {
  return {
    async loadPhysicalTopology(state, options = {}, signal) {
      return withTopologyFailure(async () => {
        const query = createPhysicalTopologyRequest(state, options);
        const clusterId = query.clusters?.[0];
        if (!clusterId) throw new TypeError("physical topology cluster is required");
        return toPhysicalTopology(
          clusterId,
          await endpoints.getPhysicalTopology(query, signal),
        );
      });
    },
  };
}

async function withTopologyFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isResourcesAbortError(error) || error instanceof ResourcesPortFailure) throw error;
    if (error instanceof TypeError || error instanceof RangeError) {
      throw new ResourcesPortFailure("invalid-request");
    }
    if (error instanceof ResourcesCanonicalError) {
      throw new ResourcesPortFailure("invalid-response");
    }
    throw toResourcesPortFailure(error);
  }
}
