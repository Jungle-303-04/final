import {
  ResourcesPortFailure,
  type ResourcesFailureCode,
  type ResourcesPort,
} from "./resourcesContract";
import {
  toResourceCatalog,
  toResourceDetail,
  toResourceList,
} from "./resourcesCanonical";
import {
  canonicalClusterRequest,
  canonicalDetailRequest,
  canonicalListRequest,
  RESOURCE_EVENT_LIMIT,
  RESOURCE_RELATED_LIMIT,
} from "./resourcesRequests";
import type { ResourcesEndpointDependencies } from "./resourcesEndpointContract";
import {
  ResourcesCanonicalError,
  ResourcesRequestError,
} from "./resourcesValidation";

export type {
  ResourcesEndpointDependencies,
  ResourcesEndpointDetailOptions,
  ResourcesEndpointInventorySummary,
  ResourcesEndpointJsonMap,
  ResourcesEndpointListQuery,
  ResourcesEndpointResource,
  ResourcesEndpointResourceDetail,
  ResourcesEndpointResourceIdentity,
  ResourcesEndpointResourceList,
} from "./resourcesEndpointContract";

export function createResourcesAdapter(
  endpoints: ResourcesEndpointDependencies,
): ResourcesPort {
  return {
    async loadCatalog(clusterId, signal) {
      return withCanonicalFailure(async () => {
        const canonicalClusterId = canonicalClusterRequest(clusterId);
        return toResourceCatalog(
          canonicalClusterId,
          await endpoints.getInventorySummary(canonicalClusterId, signal),
        );
      });
    },

    async listResources(clusterId, query, signal) {
      return withCanonicalFailure(async () => {
        const request = canonicalListRequest(clusterId, query);
        return toResourceList(
          request,
          await endpoints.listInventoryResourcesByType(
            request.clusterId,
            {
              resourceType: request.resourceType,
              namespace: request.namespace,
              includeDeleted: request.includeDeleted,
              limit: request.limit,
            },
            signal,
          ),
        );
      });
    },

    async loadResourceDetail(clusterId, identity, signal) {
      return withCanonicalFailure(async () => {
        const request = canonicalDetailRequest(clusterId, identity);
        return toResourceDetail(
          request.clusterId,
          request.identity,
          await endpoints.getInventoryResourceDetail(
            request.clusterId,
            request.identity,
            {
              relatedLimit: RESOURCE_RELATED_LIMIT,
              eventLimit: RESOURCE_EVENT_LIMIT,
            },
            signal,
          ),
        );
      });
    },
  };
}

async function withCanonicalFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isResourcesAbortError(error) || error instanceof ResourcesPortFailure) throw error;
    if (error instanceof ResourcesRequestError) {
      throw new ResourcesPortFailure("invalid-request");
    }
    if (error instanceof ResourcesCanonicalError) {
      throw new ResourcesPortFailure("invalid-response");
    }
    throw toResourcesPortFailure(error);
  }
}

export function toResourcesPortFailure(error: unknown): ResourcesPortFailure {
  const kind = transportString(error, "kind");
  const status = transportNumber(error, "status");
  const codeByTransportKind: Record<string, ResourcesFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "not-found": "not-found",
    "invalid-request": "invalid-request",
    "rate-limited": "rate-limited",
    network: "offline",
    "invalid-payload": "invalid-response",
  };
  const codeByStatus: Record<number, ResourcesFailureCode> = {
    401: "unauthorized",
    403: "forbidden",
    404: "not-found",
    422: "invalid-request",
    429: "rate-limited",
    503: "unavailable",
  };
  const code = status === 503
    ? "unavailable"
    : codeByTransportKind[kind ?? ""] ?? codeByStatus[status ?? -1] ?? "error";
  return new ResourcesPortFailure(code, transportRetryAfter(error));
}

function transportString(error: unknown, key: string): string | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function transportNumber(error: unknown, key: string): number | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function transportRetryAfter(error: unknown): number | null {
  const value = transportNumber(error, "retryAfter");
  return value !== null && value >= 0 ? value : null;
}

export function isResourcesAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
