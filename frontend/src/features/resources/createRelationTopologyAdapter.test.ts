import { describe, expect, it, vi } from "vitest";

import { createEmptyUnifiedFilterState } from "../filters/filterContract";
import { createRelationTopologyAdapter } from "./createRelationTopologyAdapter";

describe("relation topology adapter", () => {
  it("maps evidence-backed scope metadata and forwards canonical filters", async () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-1"];
    state.common.applications = ["checkout"];
    const getRelationTopology = vi.fn().mockResolvedValue(endpoint());

    const result = await createRelationTopologyAdapter({ getRelationTopology })
      .loadRelationTopology(state, { snapshotRevision: 9 });

    expect(result.clusterId).toBe("cluster-1");
    expect(result.nodes[0]?.kind).toBe("Pod");
    expect(result.nodes[0]?.identity).toEqual({
      resourceType: "pod",
      kind: "Pod",
      namespace: "shop",
      name: "one",
    });
    expect(result.relationCompleteness).toBe("exact");
    expect(getRelationTopology).toHaveBeenCalledWith(expect.objectContaining({
      clusters: ["cluster-1"],
      applications: ["checkout"],
      snapshotRevision: 9,
    }), undefined);
  });

  it("isolates invalid graph references as an invalid response", async () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-1"];
    const adapter = createRelationTopologyAdapter({
      getRelationTopology: vi.fn().mockResolvedValue({
        ...endpoint(),
        edges: [{ ...endpoint().edges[0], to_node_id: "pod:missing" }],
      }),
    });

    await expect(adapter.loadRelationTopology(state))
      .rejects.toMatchObject({ code: "invalid-response" });
  });
});

function endpoint() {
  return {
    view: "relations" as const,
    availability: "available" as const,
    refresh_after_seconds: 5,
    graph_revision: "graph-a",
    cluster_projection_revision: 9,
    cluster: { cluster_id: "cluster-1", name: "prod", provider: null },
    nodes: [{
      node_id: "pod:one",
      category: "pod" as const,
      identity: {
        version: "v1" as const,
        cluster_id: "cluster-1",
        resource_type: "pod",
        api_version: "v1",
        kind: "Pod",
        namespace: "shop",
        name: "one",
        uid: "uid-pod-one",
      },
      status: "Running",
      health: "healthy",
      observed_at: "2026-07-14T05:00:00Z",
      deleted_at: null,
      application_ids: ["checkout"],
      application_binding_completeness: "exact" as const,
    }, {
      node_id: "deployment:one",
      category: "workload" as const,
      identity: {
        version: "v1" as const,
        cluster_id: "cluster-1",
        resource_type: "workload",
        api_version: "apps/v1",
        kind: "Deployment",
        namespace: "shop",
        name: "one",
        uid: "uid-deployment-one",
      },
      status: "Ready",
      health: "healthy",
      observed_at: "2026-07-14T05:00:00Z",
      deleted_at: null,
      application_ids: ["checkout"],
      application_binding_completeness: "exact" as const,
    }],
    edges: [{
      edge_id: "edge-a",
      from_node_id: "deployment:one",
      to_node_id: "pod:one",
      kind: "owns" as const,
      plane: "ownership" as const,
      direction: "directed" as const,
      state: "active" as const,
      evidence: {
        type: "owner_reference" as const,
        authority: "authoritative" as const,
        observed_at: "2026-07-14T05:00:00Z",
      },
    }],
    root_node_ids: ["deployment:one"],
    counts: {
      filtered_count: 2,
      unfiltered_count: 2,
      filtered_count_completeness: "exact" as const,
      unfiltered_count_completeness: "exact" as const,
    },
    node_count: 2,
    edge_count: 1,
    omitted_node_count: 0,
    omitted_edge_count: 0,
    node_limit: 200,
    edge_limit: 1_000,
    truncated: false,
    relation_completeness: "exact" as const,
    partial_reason_codes: [],
    snapshot: {
      snapshot_revision: 9,
      authorization_revision: "auth-a",
      filter_fingerprint: "filter-a",
      observed_at: "2026-07-14T05:00:00Z",
      stale: false,
      partial_reason_codes: [],
    },
  };
}
