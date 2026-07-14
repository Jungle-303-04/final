import {
  isResourcesAbortError,
  toResourcesPortFailure,
} from "./createResourcesAdapter";
import type { ResourceCapabilitiesPort } from "./resourceCapabilitiesContract";
import type { ResourceCapabilitiesEndpointDependencies } from "./resourceCapabilitiesEndpointContract";
import { toResourceCapabilities } from "./resourceCapabilitiesCanonical";
import { ResourcesPortFailure } from "./resourcesContract";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function createResourceCapabilitiesAdapter(
  endpoints: ResourceCapabilitiesEndpointDependencies,
): ResourceCapabilitiesPort {
  return {
    async loadResourceCapabilities(resourceId, signal) {
      try {
        const canonicalId = resourceId.trim();
        if (!canonicalId) throw new TypeError("resource id must not be empty");
        return toResourceCapabilities(
          canonicalId,
          await endpoints.getResourceCapabilities(canonicalId, signal),
        );
      } catch (error) {
        if (isResourcesAbortError(error) || error instanceof ResourcesPortFailure) throw error;
        if (error instanceof TypeError) throw new ResourcesPortFailure("invalid-request");
        if (error instanceof ResourcesCanonicalError) {
          throw new ResourcesPortFailure("invalid-response");
        }
        throw toResourcesPortFailure(error);
      }
    },
  };
}
