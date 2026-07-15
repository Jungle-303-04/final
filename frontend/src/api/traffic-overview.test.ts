import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTrafficOverview, TRAFFIC_OVERVIEW_PATH } from "./traffic-overview";

describe("Traffic overview API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes the current scope and preserves unavailable traffic as null", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(overview()));

    await expect(getTrafficOverview({
      clusterIds: ["cluster-b", "cluster-a", "cluster-a"],
      namespaces: ["cluster-a/storefront"],
    })).resolves.toMatchObject({
      summary: { total_flow_count: null },
      relationships: { edges: null },
    });

    expect(TRAFFIC_OVERVIEW_PATH).toBe("/api/traffic/overview");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/traffic/overview?clusters=cluster-a%2Ccluster-b&namespaces=cluster-a%2Fstorefront",
    );
  });

  it("fails closed if unavailable traffic is represented as zero", async () => {
    const fixture = overview();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture,
      summary: { ...fixture.summary, total_flow_count: 0 },
    }));

    await expect(getTrafficOverview()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function overview() {
  return {
    scope_coverage: {
      availability: "available",
      scopes: [{
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: ["storefront"],
        freshness: "live",
      }],
      observed_at: "2026-07-16T09:00:00Z",
      reason_codes: [],
    },
    observation: {
      availability: "unavailable",
      observed_at: null,
      reason_codes: ["traffic_observation_not_integrated"],
    },
    summary: {
      availability: "unavailable",
      total_flow_count: null,
      denied_flow_count: null,
      external_flow_count: null,
      reason_codes: ["traffic_observation_not_integrated"],
    },
    relationships: {
      availability: "unavailable",
      edges: null,
      reason_codes: ["traffic_observation_not_integrated"],
    },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
