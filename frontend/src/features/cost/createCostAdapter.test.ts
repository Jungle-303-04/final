import { describe, expect, it, vi } from "vitest";

import { createCostAdapter } from "./createCostAdapter";

describe("createCostAdapter", () => {
  it("maps scoped unavailable Cost evidence without manufacturing monetary values", async () => {
    const port = createCostAdapter({ getCostOverview: vi.fn().mockResolvedValue(endpoint()) });

    const overview = await port.getOverview({ clusterIds: ["cluster-a"], timeRange: "24h" });

    expect(overview).toMatchObject({
      observation: { availability: "unavailable", currency: null, dataWindow: null },
      summary: { hourlyCost: null, monthlyProjection: null, savingsRecommendations: null },
      trend: { availability: "unavailable", timeRange: "24h", series: [] },
      refreshAfterSeconds: 60,
    });
    expect(overview.scopeCoverage.scopes[0]).toMatchObject({ clusterId: "cluster-a", freshness: "live" });
  });
});

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
