export type CostAvailability = "available" | "partial" | "unavailable";
export type CostFreshness = "live" | "stale" | "partial" | "disconnected";

export interface CostClusterScope {
  workspaceId: string;
  clusterId: string;
  namespaces: readonly string[];
  freshness: CostFreshness;
}

export interface CostScopeCoverage {
  availability: CostAvailability;
  scopes: readonly CostClusterScope[];
  observedAt: string | null;
  reasonCodes: readonly string[];
}

export interface CostUnavailableObservation {
  availability: "unavailable";
  observedAt: null;
  currency: null;
  dataWindow: null;
  reasonCodes: readonly string[];
}

export interface CostUnavailableSummary {
  availability: "unavailable";
  hourlyCost: null;
  monthlyProjection: null;
  storageCost: null;
  idleCost: null;
  efficiency: null;
  savingsRecommendations: null;
  reasonCodes: readonly string[];
}

export interface CostOverview {
  scopeCoverage: CostScopeCoverage;
  observation: CostUnavailableObservation;
  summary: CostUnavailableSummary;
  refreshAfterSeconds: number;
}

export interface CostOverviewRequest {
  clusterIds: readonly string[];
}

export type CostFailureCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-request"
  | "invalid-response"
  | "not-found"
  | "offline"
  | "rate-limited"
  | "error";

export class CostPortFailure extends Error {
  readonly code: CostFailureCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: CostFailureCode, retryAfterSeconds: number | null = null) {
    super(`Cost port failed: ${code}`);
    this.name = "CostPortFailure";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface CostPort {
  getOverview(request: CostOverviewRequest, signal?: AbortSignal): Promise<CostOverview>;
}
