import { apiRequest, type ApiPath } from "./client";
import {
  serviceAccessCapabilitiesSchema,
  type ServiceAccessCapabilitiesEndpoint,
} from "./service-access-schemas";
import type {
  StartServiceRequestEndpointInput,
} from "../features/service-access/serviceAccessEndpointContract";
import {
  resourceActionAcceptedSchema,
  type ResourceActionAccepted,
} from "./resource-capability-actions-schemas";
import { withQuery } from "./url";

export const SERVICE_ACCESS_CAPABILITIES_PATH: ApiPath = "/api/service-access/capabilities";
export const SERVICE_REQUESTS_PATH: ApiPath = "/api/service-access/requests";

export function resolveServiceAccess(
  resourceId: string,
  signal?: AbortSignal,
): Promise<ServiceAccessCapabilitiesEndpoint> {
  const resource = resourceId.trim();
  if (!resource) throw new TypeError("service access resource id is required");
  return apiRequest(
    withQuery(SERVICE_ACCESS_CAPABILITIES_PATH, [["resource", resource]]),
    serviceAccessCapabilitiesSchema,
    { signal },
  );
}

export function startServiceRequest(
  input: StartServiceRequestEndpointInput,
  signal?: AbortSignal,
): Promise<ResourceActionAccepted> {
  return apiRequest(SERVICE_REQUESTS_PATH, resourceActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
}
