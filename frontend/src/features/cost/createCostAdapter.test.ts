import { describe, expect, it, vi } from "vitest";

import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import { createCostAdapter } from "./createCostAdapter";

describe("createCostAdapter", () => {
  it("maps scoped unavailable Cost evidence without manufacturing monetary values", async () => {
    const port = createCostAdapter(
      { getCostOverview: vi.fn().mockResolvedValue(endpoint()) },
      refreshPolicies(),
    );

    const overview = await port.getOverview({ clusterIds: ["cluster-a"], timeRange: "24h" });

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
      { getCostOverview: vi.fn().mockResolvedValue(endpoint()) },
      policies,
    );

    await expect(port.loadRefreshPolicy("summary")).resolves.toMatchObject({ refreshAfterSeconds: 60 });
    await expect(port.loadRefreshPolicy("trend")).resolves.toMatchObject({ refreshAfterSeconds: 120 });
    await expect(port.loadRefreshPolicy("nodes")).resolves.toMatchObject({ refreshAfterSeconds: 120 });
    expect(policies.getPolicy).toHaveBeenNthCalledWith(1, "cost_summary", undefined);
    expect(policies.getPolicy).toHaveBeenNthCalledWith(2, "cost_trend", undefined);
    expect(policies.getPolicy).toHaveBeenNthCalledWith(3, "cost_nodes", undefined);
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
