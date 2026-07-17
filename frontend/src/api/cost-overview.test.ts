import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCostOverview, COST_OVERVIEW_PATH } from "./cost-overview";

describe("Cost overview API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes scope and preserves unavailable cost evidence as null", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(overview()));

    await expect(getCostOverview({
      clusterIds: ["cluster-b", "cluster-a", "cluster-a"],
      namespaces: ["cluster-a/shop"],
      timeRange: "7d",
    })).resolves.toMatchObject({
      observation: { currency: null, data_window: null },
      summary: { hourly_cost: null, monthly_projection: null, savings_recommendations: null },
      trend: { availability: "unavailable", range: "7d", series: [] },
      refresh_after_seconds: 60,
      trend_refresh_after_seconds: 120,
      nodes_refresh_after_seconds: 120,
    });

    expect(COST_OVERVIEW_PATH).toBe("/api/cost/overview");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/cost/overview?clusters=cluster-a%2Ccluster-b&namespaces=cluster-a%2Fshop&range=7d");
  });

  it("accepts bounded observed trend series and rejects oversized responses", async () => {
    const fixture = overview();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture,
      trend: {
        availability: "available",
        range: "24h",
        currency: "KRW",
        reason_codes: [],
        series: [{
          key: "namespace/shop",
          label: "shop",
          points: [
            { timestamp: 1_721_100_000, rate_micros: 1_000_000 },
            { timestamp: 1_721_100_300, rate_micros: 2_000_000 },
          ],
        }],
      },
    }));

    await expect(getCostOverview()).resolves.toMatchObject({
      trend: { availability: "available", currency: "KRW" },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture,
      trend: {
        availability: "available",
        range: "24h",
        currency: "KRW",
        reason_codes: [],
        series: [{
          key: "namespace/shop",
          label: "shop",
          points: Array.from({ length: 481 }, (_, index) => ({
            timestamp: 1_721_100_000 + index,
            rate_micros: index,
          })),
        }],
      },
    }));
    await expect(getCostOverview()).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("accepts observed allocation summaries and rejects partial values without reasons", async () => {
    const fixture = overview();
    const observed = {
      ...fixture,
      observation: {
        availability: "available",
        observed_at: "2026-07-17T09:00:00Z",
        currency: "USD",
        data_window: "1h",
        reason_codes: [],
      },
      summary: {
        availability: "available",
        hourly_cost: 2_000_000,
        monthly_projection: 1_460_000_000,
        storage_cost: 500_000,
        idle_cost: null,
        efficiency: null,
        savings_recommendations: null,
        reason_codes: [],
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(observed));
    await expect(getCostOverview()).resolves.toMatchObject({
      observation: { availability: "available", currency: "USD" },
      summary: { availability: "available", hourly_cost: 2_000_000 },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...observed,
      observation: { ...observed.observation, availability: "partial" },
    }));
    await expect(getCostOverview()).rejects.toMatchObject({ kind: "invalid-payload" });
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
      reason_codes: ["cost_observation_unavailable"],
    },
    summary: {
      availability: "unavailable",
      hourly_cost: null,
      monthly_projection: null,
      storage_cost: null,
      idle_cost: null,
      efficiency: null,
      savings_recommendations: null,
      reason_codes: ["cost_observation_unavailable"],
    },
    trend: {
      availability: "unavailable",
      range: "7d",
      currency: null,
      series: [],
      reason_codes: ["cost_observation_unavailable"],
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
