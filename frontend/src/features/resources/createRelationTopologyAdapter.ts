import type { RelationTopologyEndpointDependencies } from "./relationTopologyEndpointContract";
import type { RelationTopologyPort } from "./relationTopologyContract";
import { toRelationTopology } from "./relationTopologyCanonical";
import { createPhysicalTopologyRequest } from "./resourcesFilterRequest";
import { ResourcesPortFailure } from "./resourcesContract";
import {
  isResourcesAbortError,
  toResourcesPortFailure,
} from "./createResourcesAdapter";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function createRelationTopologyAdapter(
  endpoints: RelationTopologyEndpointDependencies,
): RelationTopologyPort {
  return {
    async loadRelationTopology(state, options = {}, signal) {
      try {
        const query = createPhysicalTopologyRequest(state, options);
        if (!query.clusters?.[0]) throw new TypeError("relation topology cluster is required");
        return toRelationTopology(await endpoints.getRelationTopology(query, signal));
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
    },
  };
}
