export type CostAvailability = "available" | "partial" | "unavailable";
export type CostFreshness = "live" | "stale" | "partial" | "disconnected";
export type CostTimeRange = "6h" | "24h" | "7d";

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

export interface CostTrendPoint {
  timestamp: number;
  rateMicros: number;
}

export interface CostTrendSeries {
  key: string;
  label: string;
  points: readonly CostTrendPoint[];
}

export interface CostObservedTrend {
  availability: "available" | "partial";
  timeRange: CostTimeRange;
  currency: string;
  series: readonly CostTrendSeries[];
  reasonCodes: readonly string[];
}

export interface CostUnavailableTrend {
  availability: "unavailable";
  timeRange: CostTimeRange;
  currency: null;
  series: readonly [];
  reasonCodes: readonly string[];
}

export type CostTrend = CostObservedTrend | CostUnavailableTrend;

export interface CostOverview {
  scopeCoverage: CostScopeCoverage;
  observation: CostUnavailableObservation;
  summary: CostUnavailableSummary;
  trend: CostTrend;
  refreshAfterSeconds: number;
}

export interface CostOverviewRequest {
  clusterIds: readonly string[];
  timeRange: CostTimeRange;
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
