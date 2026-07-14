import { describe, expect, it, vi } from "vitest";

import { createEmptyUnifiedFilterState } from "../filters/filterContract";
import { createRelationTopologyAdapter } from "./createRelationTopologyAdapter";

describe("relation topology adapter", () => {
  it("maps the strict response and forwards canonical filters", async () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-1"];
    state.common.applications = ["checkout"];
    const getRelationTopology = vi.fn().mockResolvedValue({
      nodes: [{ id: "pod:one", kind: "Pod", name: "one", status: "Running" }],
      edges: [],
    });

    const result = await createRelationTopologyAdapter({ getRelationTopology })
      .loadRelationTopology(state, { snapshotRevision: 9 });

    expect(result.nodes[0]?.kind).toBe("Pod");
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
        nodes: [{ id: "pod:one", kind: "Pod", name: "one", status: "Running" }],
        edges: [{ from: "pod:one", to: "pod:missing", type: "owns" }],
      }),
    });

    await expect(adapter.loadRelationTopology(state))
      .rejects.toMatchObject({ code: "invalid-response" });
  });
});
