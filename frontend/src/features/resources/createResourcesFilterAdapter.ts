import { ResourcesPortFailure } from "./resourcesContract";
import type { ResourcesFilterPort } from "./resourcesFilterContract";
import {
  toResourcesFacetPage,
  toResourcesLabelFacetPage,
  toResourcesResourcePage,
} from "./resourcesFilterCanonical";
import type { ResourcesFilterEndpointDependencies } from "./resourcesFilterEndpointContract";
import {
  createFilteredResourcesRequest,
  createResourceFacetRequest,
  createResourceLabelFacetRequest,
} from "./resourcesFilterRequest";
import {
  isResourcesAbortError,
  toResourcesPortFailure,
} from "./createResourcesAdapter";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function createResourcesFilterAdapter<
  TDependencies extends ResourcesFilterEndpointDependencies,
>(
  endpoints: TDependencies,
): ResourcesFilterPort {
  return {
    async listFacetPage(state, options, signal) {
      return withFilterFailure(async () => toResourcesFacetPage(
        await endpoints.listResourceFilterFacets(
          createResourceFacetRequest(state, options),
          signal,
        ),
      ));
    },

    async listResourcePage(state, options, signal) {
      return withFilterFailure(async () => toResourcesResourcePage(
        await endpoints.listFilteredResources(
          createFilteredResourcesRequest(state, options),
          signal,
        ),
      ));
    },

    async listLabelFacetPage(state, options, signal) {
      return withFilterFailure(async () => toResourcesLabelFacetPage(
        await endpoints.listResourceLabelFacets(
          createResourceLabelFacetRequest(state, options),
          signal,
        ),
      ));
    },
  };
}

async function withFilterFailure<T>(operation: () => Promise<T>): Promise<T> {
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
