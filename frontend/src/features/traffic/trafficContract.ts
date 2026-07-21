export type TrafficAvailability = "available" | "partial" | "unavailable";
export type TrafficFreshness = "live" | "stale" | "partial" | "disconnected";
export type TrafficSince = "1m" | "5m" | "15m" | "1h";
export type TrafficProtocol = "tcp" | "udp" | "http" | "grpc" | "dns" | "unknown";
export type TrafficVerdict = "forwarded" | "dropped" | "error" | "unknown";

export interface TrafficClusterScope {
  workspaceId: string;
  clusterId: string;
  namespaces: readonly string[];
  freshness: TrafficFreshness;
}

export interface TrafficScopeCoverage {
  availability: TrafficAvailability;
  scopes: readonly TrafficClusterScope[];
  observedAt: string | null;
  reasonCodes: readonly string[];
}

export interface TrafficObservedObservation {
  availability: "available" | "partial";
  observedAt: string;
  since: TrafficSince;
  sourceKeys: readonly string[];
  reasonCodes: readonly string[];
}

export interface TrafficUnavailableObservation {
  availability: "unavailable";
  observedAt: null;
  reasonCodes: readonly string[];
}

export type TrafficObservation = TrafficObservedObservation | TrafficUnavailableObservation;

export interface TrafficObservedSummary {
  availability: "available" | "partial";
  totalFlowCount: number;
  deniedFlowCount: number;
  externalFlowCount: number;
  reasonCodes: readonly string[];
}

export interface TrafficUnavailableSummary {
  availability: "unavailable";
  totalFlowCount: null;
  deniedFlowCount: null;
  externalFlowCount: null;
  reasonCodes: readonly string[];
}

export type TrafficSummary = TrafficObservedSummary | TrafficUnavailableSummary;

export interface TrafficEndpoint {
  clusterId: string;
  name: string;
  namespace: string | null;
  kind: string;
  workload: string | null;
  service: string | null;
  ip: string | null;
  identityStability: "provider_observed";
}

export interface TrafficRelationshipEdge {
  flowId: string;
  sourceKey: string;
  source: TrafficEndpoint;
  target: TrafficEndpoint;
  protocol: TrafficProtocol;
  port: number | null;
  verdict: TrafficVerdict;
  connections: number;
  bytesSent: number | null;
  bytesReceived: number | null;
  observedAt: string;
}

export interface TrafficProtocolFacet {
  value: TrafficProtocol;
  count: number;
}

export interface TrafficVerdictFacet {
  value: TrafficVerdict;
  count: number;
}

export interface TrafficFlowFacets {
  protocols: readonly TrafficProtocolFacet[];
  verdicts: readonly TrafficVerdictFacet[];
}

export interface TrafficObservedRelationships {
  availability: "available" | "partial";
  edges: readonly TrafficRelationshipEdge[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: string | null;
  facets: TrafficFlowFacets;
  reasonCodes: readonly string[];
}

export interface TrafficUnavailableRelationships {
  availability: "unavailable";
  edges: null;
  reasonCodes: readonly string[];
}

export type TrafficRelationships = TrafficObservedRelationships | TrafficUnavailableRelationships;

export interface TrafficOverview {
  scopeCoverage: TrafficScopeCoverage;
  observation: TrafficObservation;
  summary: TrafficSummary;
  relationships: TrafficRelationships;
}

export interface TrafficOverviewRequest {
  clusterIds: readonly string[];
  namespaces: readonly string[];
}

export type TrafficFailureCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-request"
  | "invalid-response"
  | "not-found"
  | "offline"
  | "rate-limited"
  | "error";

export class TrafficPortFailure extends Error {
  readonly code: TrafficFailureCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: TrafficFailureCode, retryAfterSeconds: number | null = null) {
    super(`Traffic port failed: ${code}`);
    this.name = "TrafficPortFailure";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface TrafficPort {
  getOverview(request: TrafficOverviewRequest, signal?: AbortSignal): Promise<TrafficOverview>;
}
