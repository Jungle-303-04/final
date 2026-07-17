import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTrafficOverview, TRAFFIC_FLOWS_PATH } from "./traffic-overview";

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

    expect(TRAFFIC_FLOWS_PATH).toBe("/api/traffic/flows");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/traffic/flows?clusters=cluster-a%2Ccluster-b&namespaces=cluster-a%2Fstorefront",
    );
  });

  it("validates observed flow pages and serializes server filters with a cursor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(observedOverview()));

    await expect(getTrafficOverview({
      clusterIds: ["cluster-a"],
      since: "15m",
      protocols: ["tcp"],
      verdicts: ["forwarded"],
      sort: "source",
      order: "asc",
      cursor: "signed.cursor",
      limit: 25,
    })).resolves.toMatchObject({
      observation: { availability: "available", source_keys: ["caretta"] },
      relationships: { total_count: 1, edges: [{ connections: 42 }] },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/traffic/flows?clusters=cluster-a&since=15m&protocols=tcp" +
      "&verdicts=forwarded&sort=source&order=asc&cursor=signed.cursor&limit=25",
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
    refresh_after_seconds: 60,
  };
}

function observedOverview() {
  return {
    ...overview(),
    observation: {
      availability: "available",
      observed_at: "2026-07-18T01:00:00Z",
      since: "15m",
      source_keys: ["caretta"],
      reason_codes: [],
    },
    summary: {
      availability: "available",
      total_flow_count: 1,
      denied_flow_count: 0,
      external_flow_count: 0,
      reason_codes: [],
    },
    relationships: {
      availability: "available",
      edges: [{
        flow_id: "a".repeat(64),
        source_key: "caretta",
        source: endpoint("web", "storefront"),
        target: endpoint("api", "storefront"),
        protocol: "tcp",
        port: 8080,
        verdict: "forwarded",
        connections: 42,
        bytes_sent: null,
        bytes_received: null,
        observed_at: "2026-07-18T01:00:00Z",
      }],
      total_count: 1,
      has_more: false,
      next_cursor: null,
      facets: {
        protocols: [{ value: "tcp", count: 1 }],
        verdicts: [{ value: "forwarded", count: 1 }],
      },
      reason_codes: [],
    },
  };
}

function endpoint(name: string, namespace: string) {
  return {
    cluster_id: "cluster-a",
    name,
    namespace,
    kind: "Workload",
    workload: name,
    service: null,
    ip: null,
    identity_stability: "provider_observed",
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
