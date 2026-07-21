import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCostOverview, COST_OVERVIEW_PATH } from "./cost-overview";

describe("Cost overview API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes scope and preserves unavailable cost evidence as null", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(overview()));

    await expect(getCostOverview({ clusterIds: ["cluster-b", "cluster-a", "cluster-a"] })).resolves.toMatchObject({
      observation: { currency: null, data_window: null },
      summary: { hourly_cost: null, monthly_projection: null, savings_recommendations: null },
      refresh_after_seconds: 60,
    });

    expect(COST_OVERVIEW_PATH).toBe("/api/cost/overview");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/cost/overview?clusters=cluster-a%2Ccluster-b");
  });

  it("fails closed if unavailable cost has a numeric amount, currency, or recommendation", async () => {
    const fixture = overview();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture,
      observation: { ...fixture.observation, currency: "USD" },
    }));
    await expect(getCostOverview()).rejects.toMatchObject({ kind: "invalid-payload" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture,
      summary: { ...fixture.summary, hourly_cost: 0 },
    }));
    await expect(getCostOverview()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function overview() {
  return {
    scope_coverage: {
      availability: "available",
      scopes: [{
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: [],
        freshness: "live",
      }],
      observed_at: "2026-07-16T09:00:00Z",
      reason_codes: [],
    },
    observation: {
      availability: "unavailable",
      observed_at: null,
      currency: null,
      data_window: null,
      reason_codes: ["cost_observation_not_integrated"],
    },
    summary: {
      availability: "unavailable",
      hourly_cost: null,
      monthly_projection: null,
      storage_cost: null,
      idle_cost: null,
      efficiency: null,
      savings_recommendations: null,
      reason_codes: ["cost_observation_not_integrated"],
    },
    trend: {
      availability: "unavailable",
      range: "24h",
      currency: null,
      series: [],
      reason_codes: ["cost_observation_not_integrated"],
    },
    refresh_after_seconds: 60,
    trend_refresh_after_seconds: 120,
    nodes_refresh_after_seconds: 120,
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
