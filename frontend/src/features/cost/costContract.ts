import type { BrowserRefreshPolicy } from "../../shared/data/browserRefreshPolicyRegistry";

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

export interface CostObservedObservation {
  availability: "available" | "partial";
  observedAt: string;
  currency: string;
  dataWindow: string;
  reasonCodes: readonly string[];
}

export type CostObservation = CostObservedObservation | CostUnavailableObservation;

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

export interface CostObservedSummary {
  availability: "available" | "partial";
  hourlyCost: number;
  monthlyProjection: number;
  storageCost: number | null;
  idleCost: number | null;
  efficiency: number | null;
  savingsRecommendations: null;
  reasonCodes: readonly string[];
}

export type CostSummary = CostObservedSummary | CostUnavailableSummary;

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

export interface CostCurrentAllocation {
  replicas: number;
  hourlyRateMicros: number;
  projectedDailyMicros: number;
  projectedMonthlyMicros: number;
  cpuRateMicros: number;
  memoryRateMicros: number;
  cpuAllocationUseBasisPoints: number | null;
  memoryAllocationUseBasisPoints: number | null;
  cpuUsageWindowSeconds: number | null;
  memoryUsageWindowSeconds: number | null;
}

export interface CostObservedWorkloadAllocation {
  availability: "available" | "partial";
  observedAt: string;
  currency: string;
  current: CostCurrentAllocation;
  trend: CostTrend;
  reasonCodes: readonly string[];
}

export interface CostUnavailableWorkloadAllocation {
  availability: "unavailable";
  reasonCodes: readonly string[];
}

export type CostWorkloadAllocation =
  | CostObservedWorkloadAllocation
  | CostUnavailableWorkloadAllocation;

export interface CostOverview {
  scopeCoverage: CostScopeCoverage;
  observation: CostObservation;
  summary: CostSummary;
  trend: CostTrend;
}

export type CostRefreshChannel = "summary" | "trend" | "nodes";
export type CostRefreshPolicyKey = "cost_summary" | "cost_trend" | "cost_nodes";

export interface CostOverviewRequest {
  clusterIds: readonly string[];
  namespaces: readonly string[];
  timeRange: CostTimeRange;
}

export interface CostNodeItem {
  resource: { version: string; kind: "Node"; name: string; uid: string };
  clusterId: string;
  clusterName: string;
  provider: string;
  providerId: string | null;
  instanceType: string | null;
  zone: string | null;
  capacityType: string | null;
  status: string;
  observedAt: string;
  capacity: { cpuMillicores: number | null; memoryMib: number | null; pods: number | null };
  usage: {
    availability: CostAvailability;
    observedAt: string | null;
    cpuMillicores: number | null;
    memoryMib: number | null;
    cpuUtilizationPercent: number | null;
    memoryUtilizationPercent: number | null;
    reasonCodes: readonly string[];
  };
  pricing: {
    availability: "unavailable";
    currency: null;
    hourlyRateMicros: null;
    reasonCodes: readonly string[];
  };
}

export interface CostNodePage {
  scopeCoverage: CostScopeCoverage;
  items: readonly CostNodeItem[];
  total: number;
  countCompleteness: "exact" | "partial" | "unavailable";
  hasMore: boolean;
  nextCursor: string | null;
  snapshotRevision: number;
  pricingCoverage: { availability: "unavailable"; reasonCodes: readonly string[] };
}

export interface CostNodesRequest {
  clusterIds: readonly string[];
  namespaces: readonly string[];
  cursor?: string;
  limit?: number;
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
  loadRefreshPolicy(
    channel: CostRefreshChannel,
    signal?: AbortSignal,
  ): Promise<BrowserRefreshPolicy>;
  getOverview(request: CostOverviewRequest, signal?: AbortSignal): Promise<CostOverview>;
  getNodes(request: CostNodesRequest, signal?: AbortSignal): Promise<CostNodePage>;
}
