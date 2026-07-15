import {
  TrafficPortFailure,
  type TrafficFailureCode,
  type TrafficOverview,
  type TrafficPort,
} from "./trafficContract";
import type { TrafficEndpointDependencies } from "./trafficEndpointContract";

export function createTrafficAdapter(endpoints: TrafficEndpointDependencies): TrafficPort {
  return {
    async getOverview(request, signal) {
      return withPortFailure(async () => toOverview(await endpoints.getTrafficOverview({
        clusterIds: request.clusterIds,
        namespaces: request.namespaces,
      }, signal)));
    },
  };
}

function toOverview(value: Awaited<ReturnType<TrafficEndpointDependencies["getTrafficOverview"]>>): TrafficOverview {
  return {
    scopeCoverage: {
      availability: value.scope_coverage.availability,
      scopes: value.scope_coverage.scopes.map((scope) => ({
        workspaceId: scope.workspace_id,
        clusterId: scope.cluster_id,
        namespaces: scope.namespaces,
        freshness: scope.freshness,
      })),
      observedAt: value.scope_coverage.observed_at,
      reasonCodes: value.scope_coverage.reason_codes,
    },
    observation: {
      availability: value.observation.availability,
      observedAt: value.observation.observed_at,
      reasonCodes: value.observation.reason_codes,
    },
    summary: {
      availability: value.summary.availability,
      totalFlowCount: value.summary.total_flow_count,
      deniedFlowCount: value.summary.denied_flow_count,
      externalFlowCount: value.summary.external_flow_count,
      reasonCodes: value.summary.reason_codes,
    },
    relationships: {
      availability: value.relationships.availability,
      edges: value.relationships.edges,
      reasonCodes: value.relationships.reason_codes,
    },
  };
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof TrafficPortFailure) throw error;
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): TrafficPortFailure {
  const kinds: Record<string, TrafficFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "invalid-request": "invalid-request",
    "invalid-payload": "invalid-response",
    "not-found": "not-found",
    network: "offline",
    "rate-limited": "rate-limited",
  };
  const record = typeof error === "object" && error !== null && !Array.isArray(error)
    ? error as Record<string, unknown>
    : null;
  const kind = typeof record?.kind === "string" ? record.kind : "";
  const retryAfter = typeof record?.retryAfter === "number" ? record.retryAfter : null;
  return new TrafficPortFailure(kinds[kind] ?? "error", retryAfter);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
