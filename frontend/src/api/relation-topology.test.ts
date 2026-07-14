import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRelationTopology } from "./relation-topology";

describe("relation topology API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses the fixed relations view with canonical filters and validates endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      nodes: [
        { id: "workload:shop/checkout", kind: "Deployment", name: "checkout", status: "Ready" },
        { id: "pod:shop/checkout-0", kind: "Pod", name: "checkout-0", status: "Running" },
      ],
      edges: [{
        from: "workload:shop/checkout",
        to: "pod:shop/checkout-0",
        type: "owns",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

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

    expect(result.edges[0]?.type).toBe("owns");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/topology?view=relations&clusters=cluster-a&namespaces=cluster-a%2Fshop&applications=checkout&resources.types=pod%2Cworkload&resources.health=critical&labels=team%3Dcheckout&resources.q=checkout&resources.includeDeleted=false&snapshot_revision=42",
    );
  });

  it("rejects duplicate nodes, dangling edges, and unknown fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      nodes: [
        { id: "pod:one", kind: "Pod", name: "one", status: "Running" },
        { id: "pod:one", kind: "Pod", name: "one-copy", status: "Running" },
      ],
      edges: [{ from: "pod:one", to: "pod:missing", type: "owns" }],
      synthesized: true,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(getRelationTopology({ clusters: ["cluster-a"] }))
      .rejects.toMatchObject({ kind: "invalid-payload" });
  });
});
