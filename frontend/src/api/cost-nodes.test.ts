import { beforeEach, describe, expect, it, vi } from "vitest";

import { COST_NODES_PATH, getCostNodes } from "./cost-nodes";

describe("Cost nodes API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes canonical scope and accepts observed node evidence with unavailable pricing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(nodes()));

    const result = await getCostNodes({
      clusterIds: ["cluster-b", "cluster-a", "cluster-a"],
      namespaces: ["cluster-a/shop"],
      limit: 50,
    });

    expect(COST_NODES_PATH).toBe("/api/cost/nodes");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/cost/nodes?clusters=cluster-a%2Ccluster-b&namespaces=cluster-a%2Fshop&limit=50",
    );
    expect(result.items[0]).toMatchObject({
      provider_id: "aws:///zone/i-123",
      capacity: { cpu_mcores: 1900, memory_mib: 7168 },
      usage: { availability: "available", cpu_utilization_percent: 50 },
      pricing: { availability: "unavailable", currency: null, hourly_rate_micros: null },
    });
  });

  it("fails closed if unavailable node pricing carries a zero amount", async () => {
    const payload = nodes();
    payload.items[0]!.pricing.hourly_rate_micros = 0 as never;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getCostNodes()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function nodes() {
  return {
    scope_coverage: {
      availability: "available",
      scopes: [{
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: ["shop"],
        freshness: "live",
      }],
      observed_at: "2026-07-17T01:00:00Z",
      reason_codes: [],
    },
    items: [{
      resource: {
        api_group: "",
        version: "v1",
        kind: "Node",
        namespace: null,
        name: "node-a",
        uid: "uid-node-a",
      },
      cluster_id: "cluster-a",
      cluster_name: "prod",
      provider: "eks",
      provider_id: "aws:///zone/i-123",
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
    }],
    total: 1,
    count_completeness: "exact",
    has_more: false,
    next_cursor: null,
    snapshot_revision: 41,
    pricing_coverage: {
      availability: "unavailable",
      reason_codes: ["namespace_allocation_not_observed", "node_pricing_observation_not_integrated"],
    },
    refresh_after_seconds: 120,
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
