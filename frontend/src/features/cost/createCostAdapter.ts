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
        namespaces: request.namespaces,
        timeRange: request.timeRange,
      }, signal)));
    },
    async getNodes(request, signal) {
      return withPortFailure(async () => toNodePage(await endpoints.getCostNodes({
        clusterIds: request.clusterIds,
        namespaces: request.namespaces,
        cursor: request.cursor,
        limit: request.limit,
      }, signal)));
    },
  };
}

function toNodePage(value: Awaited<ReturnType<CostEndpointDependencies["getCostNodes"]>>) {
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
    items: value.items.map((item) => ({
      resource: {
        version: item.resource.version,
        kind: item.resource.kind,
        name: item.resource.name,
        uid: item.resource.uid,
      },
      clusterId: item.cluster_id,
      clusterName: item.cluster_name,
      provider: item.provider,
      providerId: item.provider_id,
      instanceType: item.instance_type,
      zone: item.zone,
      capacityType: item.capacity_type,
      status: item.status,
      observedAt: item.observed_at,
      capacity: {
        cpuMillicores: item.capacity.cpu_mcores,
        memoryMib: item.capacity.memory_mib,
        pods: item.capacity.pods,
      },
      usage: {
        availability: item.usage.availability,
        observedAt: item.usage.observed_at,
        cpuMillicores: item.usage.cpu_mcores,
        memoryMib: item.usage.memory_mib,
        cpuUtilizationPercent: item.usage.cpu_utilization_percent,
        memoryUtilizationPercent: item.usage.memory_utilization_percent,
        reasonCodes: item.usage.reason_codes,
      },
      pricing: {
        availability: item.pricing.availability,
        currency: item.pricing.currency,
        hourlyRateMicros: item.pricing.hourly_rate_micros,
        reasonCodes: item.pricing.reason_codes,
      },
    })),
    total: value.total,
    countCompleteness: value.count_completeness,
    hasMore: value.has_more,
    nextCursor: value.next_cursor,
    snapshotRevision: value.snapshot_revision,
    pricingCoverage: {
      availability: value.pricing_coverage.availability,
      reasonCodes: value.pricing_coverage.reason_codes,
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
