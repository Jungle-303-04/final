import type { ChangeTimelineEndpointDependencies } from "./changeTimelineEndpointContract";
import type { ChangeTimelinePort } from "./changeTimelineContract";
import { createChangeTimelineRequest } from "./resourcesFilterRequest";
import { ResourcesPortFailure } from "./resourcesContract";
import { isResourcesAbortError, toResourcesPortFailure } from "./createResourcesAdapter";

export function createChangeTimelineAdapter(
  endpoints: ChangeTimelineEndpointDependencies,
): ChangeTimelinePort {
  return {
    async loadChangeTimeline(state, options, signal) {
      try {
        const value = await endpoints.getChangeTimeline(
          createChangeTimelineRequest(state, options),
          signal,
        );
        return { ...options, ...value };
      } catch (error) {
        if (isResourcesAbortError(error) || error instanceof ResourcesPortFailure) throw error;
        if (error instanceof TypeError || error instanceof RangeError) {
          throw new ResourcesPortFailure("invalid-request");
        }
        throw toResourcesPortFailure(error);
      }
    },
  };
}
