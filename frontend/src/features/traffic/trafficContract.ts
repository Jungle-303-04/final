export type TrafficAvailability = "available" | "partial" | "unavailable";
export type TrafficFreshness = "live" | "stale" | "partial" | "disconnected";

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

export interface TrafficUnavailableObservation {
  availability: "unavailable";
  observedAt: null;
  reasonCodes: readonly string[];
}

export interface TrafficUnavailableSummary {
  availability: "unavailable";
  totalFlowCount: null;
  deniedFlowCount: null;
  externalFlowCount: null;
  reasonCodes: readonly string[];
}

export interface TrafficUnavailableRelationships {
  availability: "unavailable";
  edges: null;
  reasonCodes: readonly string[];
}

export interface TrafficOverview {
  scopeCoverage: TrafficScopeCoverage;
  observation: TrafficUnavailableObservation;
  summary: TrafficUnavailableSummary;
  relationships: TrafficUnavailableRelationships;
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
