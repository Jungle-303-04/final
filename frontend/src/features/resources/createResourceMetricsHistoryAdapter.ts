import {
  isResourcesAbortError,
  toResourcesPortFailure,
} from "./createResourcesAdapter";
import type { ResourceMetricsHistoryEndpointDependencies } from "./resourceMetricsHistoryEndpointContract";
import type { ResourceMetricsHistoryPort } from "./resourceMetricsHistoryContract";
import { toResourceMetricsHistory } from "./resourceMetricsHistoryCanonical";
import { createResourceMetricsHistoryRequest } from "./resourcesFilterRequest";
import { ResourcesPortFailure } from "./resourcesContract";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function createResourceMetricsHistoryAdapter(
  endpoints: ResourceMetricsHistoryEndpointDependencies,
): ResourceMetricsHistoryPort {
  return {
    async loadResourceMetricsHistory(state, resourceIds, options, signal) {
      return withMetricsFailure(async () => {
        const query = createResourceMetricsHistoryRequest(state, resourceIds, options);
        return toResourceMetricsHistory(
          resourceIds,
          options.snapshotRevision,
          await endpoints.getResourceMetricsHistory(query, signal),
        );
      });
    },
  };
}

async function withMetricsFailure<T>(operation: () => Promise<T>): Promise<T> {
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
