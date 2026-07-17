import type { ChangeTimelineEndpointDependencies } from "./changeTimelineEndpointContract";
import type { ChangeTimelinePort } from "./changeTimelineContract";
import { createChangeTimelineRequest } from "./resourcesFilterRequest";
import { ResourcesPortFailure } from "./resourcesContract";
import { isResourcesAbortError, toResourcesPortFailure } from "./createResourcesAdapter";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";

export function createChangeTimelineAdapter(
  endpoints: ChangeTimelineEndpointDependencies & {
    refreshPolicies: BrowserRefreshPolicyRegistry<"changes">;
  },
): ChangeTimelinePort {
  return {
    async loadChangeTimeline(state, options, signal) {
      try {
        const [value, freshnessPolicy] = await Promise.all([
          endpoints.getChangeTimeline(
            createChangeTimelineRequest(state, options),
            signal,
          ),
          endpoints.refreshPolicies.getPolicy("changes", signal),
        ]);
        return { ...options, ...value, freshnessPolicy };
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
