import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRelationTopology } from "./relation-topology";

describe("relation topology API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses the fixed relations view with canonical filters and validates evidence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(
      topologyEndpoint(),
    ), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await getRelationTopology({
      clusters: ["cluster-a"],
      namespaces: ["cluster-a/shop"],
      applications: ["checkout"],
      resourceTypes: ["pod", "workload"],
      health: ["critical"],
      labels: ["team=checkout"],
      query: "checkout",
      includeDeleted: false,
      snapshotRevision: 42,
    });

    expect(result.edges[0]?.kind).toBe("owns");
    expect(result.edges[0]?.evidence.type).toBe("owner_reference");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/topology?view=relations&clusters=cluster-a&namespaces=cluster-a%2Fshop&applications=checkout&resources.types=pod%2Cworkload&resources.health=critical&labels=team%3Dcheckout&resources.q=checkout&resources.includeDeleted=false&snapshot_revision=42",
    );
  });

  it("rejects dangling edges, unsupported evidence, and unknown fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ...topologyEndpoint(),
      edges: [{
        ...topologyEndpoint().edges[0],
        to_node_id: "pod:missing",
      }],
      synthesized: true,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(getRelationTopology({ clusters: ["cluster-a"] }))
      .rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function topologyEndpoint() {
  return {
    view: "relations",
    availability: "available",
    refresh_after_seconds: 5,
    graph_revision: "graph-a",
    cluster_projection_revision: 42,
    cluster: { cluster_id: "cluster-a", name: "prod", provider: "eks" },
    nodes: [
      {
        node_id: "workload:shop/checkout",
        category: "workload",
        identity: {
          version: "v1",
          cluster_id: "cluster-a",
          resource_type: "workload",
          api_version: "apps/v1",
          kind: "Deployment",
          namespace: "shop",
          name: "checkout",
          uid: "deployment-uid",
        },
        status: "Ready",
        health: "healthy",
        observed_at: "2026-07-14T05:00:00Z",
        deleted_at: null,
        application_ids: ["checkout"],
        application_binding_completeness: "exact",
      },
      {
        node_id: "pod:shop/checkout-0",
        category: "pod",
        identity: {
          version: "v1",
          cluster_id: "cluster-a",
          resource_type: "pod",
          api_version: "v1",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-0",
          uid: "pod-uid",
        },
        status: "Running",
        health: "healthy",
        observed_at: "2026-07-14T05:00:00Z",
        deleted_at: null,
        application_ids: ["checkout"],
        application_binding_completeness: "exact",
      },
    ],
    edges: [{
      edge_id: "edge-a",
      from_node_id: "workload:shop/checkout",
      to_node_id: "pod:shop/checkout-0",
      kind: "owns",
      plane: "ownership",
      direction: "directed",
      state: "active",
      evidence: {
        type: "owner_reference",
        authority: "authoritative",
        observed_at: "2026-07-14T05:00:00Z",
      },
    }],
    root_node_ids: ["workload:shop/checkout"],
    counts: {
      filtered_count: 2,
      unfiltered_count: 2,
      filtered_count_completeness: "exact",
      unfiltered_count_completeness: "exact",
    },
    node_count: 2,
    edge_count: 1,
    omitted_node_count: 0,
    omitted_edge_count: 0,
    node_limit: 200,
    edge_limit: 1_000,
    truncated: false,
    relation_completeness: "exact",
    partial_reason_codes: [],
    snapshot: {
      snapshot_revision: 42,
      authorization_revision: "auth-a",
      filter_fingerprint: "filter-a",
      observed_at: "2026-07-14T05:00:00Z",
      stale: false,
      partial_reason_codes: [],
    },
  };
}
