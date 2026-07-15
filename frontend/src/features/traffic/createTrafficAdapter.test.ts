import { describe, expect, it, vi } from "vitest";

import { createTrafficAdapter } from "./createTrafficAdapter";

describe("createTrafficAdapter", () => {
  it("maps unavailable observation evidence without substituting an empty graph", async () => {
    const port = createTrafficAdapter({ getTrafficOverview: vi.fn().mockResolvedValue(endpoint()) });

    const overview = await port.getOverview({ clusterIds: ["cluster-a"], namespaces: [] });

    expect(overview).toMatchObject({
      observation: { availability: "unavailable", observedAt: null },
      summary: { totalFlowCount: null, deniedFlowCount: null },
      relationships: { edges: null },
    });
    expect(overview.scopeCoverage.scopes[0]).toMatchObject({
      clusterId: "cluster-a",
      freshness: "live",
    });
  });
});

function endpoint() {
  return {
    scope_coverage: {
      availability: "available" as const,
      scopes: [{
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: [],
        freshness: "live" as const,
      }],
      observed_at: "2026-07-16T09:00:00Z",
      reason_codes: [],
    },
    observation: unavailable(),
    summary: { ...unavailable(), total_flow_count: null, denied_flow_count: null, external_flow_count: null },
    relationships: { ...unavailable(), edges: null },
  };
}

function unavailable() {
  return {
    availability: "unavailable" as const,
    observed_at: null,
    reason_codes: ["traffic_observation_not_integrated"],
  };
}
