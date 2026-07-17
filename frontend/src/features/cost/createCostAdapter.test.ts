import { describe, expect, it, vi } from "vitest";

import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import type { CostNodePageEndpoint } from "./costEndpointContract";
import { createCostAdapter } from "./createCostAdapter";

describe("createCostAdapter", () => {
  it("maps scoped unavailable Cost evidence without manufacturing monetary values", async () => {
    const port = createCostAdapter(
      {
        getCostOverview: vi.fn().mockResolvedValue(endpoint()),
        getCostNodes: vi.fn().mockResolvedValue(nodeEndpoint()),
      },
      refreshPolicies(),
    );

    const overview = await port.getOverview({ clusterIds: ["cluster-a"], namespaces: [], timeRange: "24h" });

    expect(overview).toMatchObject({
      observation: { availability: "unavailable", currency: null, dataWindow: null },
      summary: { hourlyCost: null, monthlyProjection: null, savingsRecommendations: null },
      trend: { availability: "unavailable", timeRange: "24h", series: [] },
    });
    expect(overview.scopeCoverage.scopes[0]).toMatchObject({ clusterId: "cluster-a", freshness: "live" });
  });

  it("loads every Cost channel from the injected server policy registry", async () => {
    const policies = refreshPolicies();
    const port = createCostAdapter(
      {
        getCostOverview: vi.fn().mockResolvedValue(endpoint()),
        getCostNodes: vi.fn().mockResolvedValue(nodeEndpoint()),
      },
      policies,
    );

    await expect(port.loadRefreshPolicy("summary")).resolves.toMatchObject({ refreshAfterSeconds: 60 });
    await expect(port.loadRefreshPolicy("trend")).resolves.toMatchObject({ refreshAfterSeconds: 120 });
    await expect(port.loadRefreshPolicy("nodes")).resolves.toMatchObject({ refreshAfterSeconds: 120 });
    expect(policies.getPolicy).toHaveBeenNthCalledWith(1, "cost_summary", undefined);
    expect(policies.getPolicy).toHaveBeenNthCalledWith(2, "cost_trend", undefined);
    expect(policies.getPolicy).toHaveBeenNthCalledWith(3, "cost_nodes", undefined);
  });

  it("maps observed node identity and usage while keeping pricing unavailable", async () => {
    const fixture = nodeEndpoint();
    fixture.items = [{
      resource: { api_group: "", version: "v1", kind: "Node", namespace: null, name: "node-a", uid: "uid-a" },
      cluster_id: "cluster-a",
      cluster_name: "prod",
      provider: "eks",
      provider_id: "aws:///zone/i-a",
      instance_type: "m6i.large",
      zone: "ap-northeast-2a",
      capacity_type: "spot",
      status: "Ready",
      observed_at: "2026-07-17T01:00:00Z",
      capacity: { cpu_mcores: 1900, memory_mib: 7168, pods: 58 },
      usage: {
        availability: "available",
        observed_at: "2026-07-17T01:00:00Z",
        cpu_mcores: 950,
        memory_mib: 3584,
        cpu_utilization_percent: 50,
        memory_utilization_percent: 50,
        reason_codes: [],
      },
      pricing: {
        availability: "unavailable",
        currency: null,
        hourly_rate_micros: null,
        reason_codes: ["node_pricing_observation_not_integrated"],
      },
    }];
    fixture.total = 1;
    const port = createCostAdapter({
      getCostOverview: vi.fn().mockResolvedValue(endpoint()),
      getCostNodes: vi.fn().mockResolvedValue(fixture),
    }, refreshPolicies());

    await expect(port.getNodes({ clusterIds: ["cluster-a"], namespaces: [] })).resolves.toMatchObject({
      items: [{
        providerId: "aws:///zone/i-a",
        capacity: { cpuMillicores: 1900, memoryMib: 7168 },
        usage: { availability: "available", cpuUtilizationPercent: 50 },
        pricing: { availability: "unavailable", hourlyRateMicros: null },
      }],
    });
  });
});

function refreshPolicies(): BrowserRefreshPolicyRegistry<"cost_summary" | "cost_trend" | "cost_nodes"> & {
  getPolicy: ReturnType<typeof vi.fn>;
} {
  return {
    getPolicy: vi.fn(async (key: string) => ({
      staleAfterSeconds: 30,
      refreshAfterSeconds: key === "cost_summary" ? 60 : 120,
      keepLastSuccess: true as const,
      pauseWhenHidden: true as const,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    })),
  };
}

function endpoint() {
  return {
    scope_coverage: {
      availability: "available" as const,
      scopes: [{ workspace_id: "workspace-a", cluster_id: "cluster-a", namespaces: [], freshness: "live" as const }],
      observed_at: "2026-07-16T09:00:00Z",
      reason_codes: [],
    },
    observation: unavailable(),
    summary: {
      availability: "unavailable" as const,
      hourly_cost: null,
      monthly_projection: null,
      storage_cost: null,
      idle_cost: null,
      efficiency: null,
      savings_recommendations: null,
      reason_codes: ["cost_observation_not_integrated"],
    },
    trend: {
      availability: "unavailable" as const,
      range: "24h" as const,
      currency: null,
      series: [],
      reason_codes: ["cost_observation_not_integrated"],
    },
    refresh_after_seconds: 60,
    trend_refresh_after_seconds: 120,
    nodes_refresh_after_seconds: 120,
  };
}

function unavailable() {
  return {
    availability: "unavailable" as const,
    observed_at: null,
    currency: null,
    data_window: null,
    reason_codes: ["cost_observation_not_integrated"],
  };
}

function nodeEndpoint(): CostNodePageEndpoint {
  return {
    scope_coverage: endpoint().scope_coverage,
    items: [],
    total: 0,
    count_completeness: "exact" as const,
    has_more: false,
    next_cursor: null,
    snapshot_revision: 1,
    pricing_coverage: {
      availability: "unavailable" as const,
      reason_codes: ["node_pricing_observation_not_integrated"],
    },
    refresh_after_seconds: 120,
  };
}
