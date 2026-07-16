import {
  CostPortFailure,
  type CostFailureCode,
  type CostOverview,
  type CostPort,
  type CostRefreshChannel,
  type CostRefreshPolicyKey,
} from "./costContract";
import type { CostEndpointDependencies } from "./costEndpointContract";
import {
  loadInjectedBrowserRefreshPolicy,
  type BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";

export function createCostAdapter(
  endpoints: CostEndpointDependencies,
  refreshPolicies?: BrowserRefreshPolicyRegistry<CostRefreshPolicyKey>,
): CostPort {
  return {
    loadRefreshPolicy(channel, signal) {
      return loadInjectedBrowserRefreshPolicy(refreshPolicies, refreshPolicyKey(channel), signal);
    },
    async getOverview(request, signal) {
      return withPortFailure(async () => toOverview(await endpoints.getCostOverview({
        clusterIds: request.clusterIds,
        timeRange: request.timeRange,
      }, signal)));
    },
  };
}

function toOverview(value: Awaited<ReturnType<CostEndpointDependencies["getCostOverview"]>>): CostOverview {
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
      currency: value.observation.currency,
      dataWindow: value.observation.data_window,
      reasonCodes: value.observation.reason_codes,
    },
    summary: {
      availability: value.summary.availability,
      hourlyCost: value.summary.hourly_cost,
      monthlyProjection: value.summary.monthly_projection,
      storageCost: value.summary.storage_cost,
      idleCost: value.summary.idle_cost,
      efficiency: value.summary.efficiency,
      savingsRecommendations: value.summary.savings_recommendations,
      reasonCodes: value.summary.reason_codes,
    },
    trend: value.trend.availability === "unavailable" ? {
      availability: "unavailable",
      timeRange: value.trend.range,
      currency: null,
      series: [],
      reasonCodes: value.trend.reason_codes,
    } : {
      availability: value.trend.availability,
      timeRange: value.trend.range,
      currency: value.trend.currency,
      series: value.trend.series.map((series) => ({
        key: series.key,
        label: series.label,
        points: series.points.map((point) => ({
          timestamp: point.timestamp,
          rateMicros: point.rate_micros,
        })),
      })),
      reasonCodes: value.trend.reason_codes,
    },
  };
}

function refreshPolicyKey(channel: CostRefreshChannel): CostRefreshPolicyKey {
  if (channel === "trend") return "cost_trend";
  if (channel === "nodes") return "cost_nodes";
  return "cost_summary";
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof CostPortFailure) throw error;
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): CostPortFailure {
  const kinds: Record<string, CostFailureCode> = {
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
  return new CostPortFailure(kinds[kind] ?? "error", retryAfter);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
