import {
  TrafficPortFailure,
  type TrafficEndpoint,
  type TrafficFailureCode,
  type TrafficObservation,
  type TrafficOverview,
  type TrafficPort,
  type TrafficRelationshipEdge,
  type TrafficRelationships,
  type TrafficSummary,
} from "./trafficContract";
import type { TrafficEndpointDependencies, TrafficOverviewEndpoint } from "./trafficEndpointContract";

type EndpointObservation = TrafficOverviewEndpoint["observation"];
type EndpointSummary = TrafficOverviewEndpoint["summary"];
type EndpointRelationships = TrafficOverviewEndpoint["relationships"];
type EndpointEdge = Extract<EndpointRelationships, { availability: "available" | "partial" }>["edges"][number];

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

function toOverview(value: TrafficOverviewEndpoint): TrafficOverview {
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
    observation: toObservation(value.observation),
    summary: toSummary(value.summary),
    relationships: toRelationships(value.relationships),
  };
}

function toObservation(observation: EndpointObservation): TrafficObservation {
  if (observation.availability === "unavailable") {
    return {
      availability: "unavailable",
      observedAt: observation.observed_at,
      reasonCodes: observation.reason_codes,
    };
  }
  return {
    availability: observation.availability,
    observedAt: observation.observed_at,
    since: observation.since,
    sourceKeys: observation.source_keys,
    reasonCodes: observation.reason_codes,
  };
}

function toSummary(summary: EndpointSummary): TrafficSummary {
  if (summary.availability === "unavailable") {
    return {
      availability: "unavailable",
      totalFlowCount: summary.total_flow_count,
      deniedFlowCount: summary.denied_flow_count,
      externalFlowCount: summary.external_flow_count,
      reasonCodes: summary.reason_codes,
    };
  }
  return {
    availability: summary.availability,
    totalFlowCount: summary.total_flow_count,
    deniedFlowCount: summary.denied_flow_count,
    externalFlowCount: summary.external_flow_count,
    reasonCodes: summary.reason_codes,
  };
}

function toRelationships(relationships: EndpointRelationships): TrafficRelationships {
  if (relationships.availability === "unavailable") {
    return {
      availability: "unavailable",
      edges: relationships.edges,
      reasonCodes: relationships.reason_codes,
    };
  }
  return {
    availability: relationships.availability,
    edges: relationships.edges.map(toEdge),
    totalCount: relationships.total_count,
    hasMore: relationships.has_more,
    nextCursor: relationships.next_cursor,
    facets: {
      protocols: relationships.facets.protocols.map((facet) => ({ value: facet.value, count: facet.count })),
      verdicts: relationships.facets.verdicts.map((facet) => ({ value: facet.value, count: facet.count })),
    },
    reasonCodes: relationships.reason_codes,
  };
}

function toEdge(edge: EndpointEdge): TrafficRelationshipEdge {
  return {
    flowId: edge.flow_id,
    sourceKey: edge.source_key,
    source: toEndpoint(edge.source),
    target: toEndpoint(edge.target),
    protocol: edge.protocol,
    port: edge.port,
    verdict: edge.verdict,
    connections: edge.connections,
    bytesSent: edge.bytes_sent,
    bytesReceived: edge.bytes_received,
    observedAt: edge.observed_at,
  };
}

function toEndpoint(endpoint: EndpointEdge["source"]): TrafficEndpoint {
  return {
    clusterId: endpoint.cluster_id,
    name: endpoint.name,
    namespace: endpoint.namespace,
    kind: endpoint.kind,
    workload: endpoint.workload,
    service: endpoint.service,
    ip: endpoint.ip,
    identityStability: endpoint.identity_stability,
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
