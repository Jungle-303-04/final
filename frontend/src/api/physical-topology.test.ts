import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPhysicalTopology,
  PHYSICAL_TOPOLOGY_PATH,
} from "./physical-topology";
import { PHYSICAL_TOPOLOGY_ENDPOINT } from "./physical-topology.testSupport";

describe("physical topology API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes the canonical physical view and validates its bounded response", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(
      PHYSICAL_TOPOLOGY_ENDPOINT,
    ));

    await expect(getPhysicalTopology({
      clusters: ["cluster-a"],
      namespaces: ["cluster-a/shop"],
      applications: ["checkout"],
      resourceTypes: ["pod"],
      health: ["critical"],
      labels: ["team=checkout"],
      query: "checkout",
      includeDeleted: false,
      snapshotRevision: 42,
    }, controller.signal)).resolves.toEqual(PHYSICAL_TOPOLOGY_ENDPOINT);
    expect(PHYSICAL_TOPOLOGY_PATH).toBe("/api/topology");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/topology?view=physical&clusters=cluster-a&namespaces=cluster-a%2Fshop&applications=checkout&resources.types=pod&resources.health=critical&labels=team%3Dcheckout&resources.q=checkout&resources.includeDeleted=false&snapshot_revision=42",
      expect.objectContaining({ credentials: "include", signal: controller.signal }),
    );
  });

  it("rejects pods that reference an omitted server", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...PHYSICAL_TOPOLOGY_ENDPOINT,
      pods: [{ ...PHYSICAL_TOPOLOGY_ENDPOINT.pods[0], server_id: "node:not-returned" }],
    }));

    await expect(getPhysicalTopology({ clusters: ["cluster-a"] }))
      .rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("accepts over-request usage with evidence and rejects it without a denominator", async () => {
    const measuredPod = {
      ...PHYSICAL_TOPOLOGY_ENDPOINT.pods[0],
      usage_pct: 106.2,
      cpu_mcores: 531,
      cpu_request_mcores: 500,
      mem_mib: 64,
      mem_request_mib: 128,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      ...PHYSICAL_TOPOLOGY_ENDPOINT,
      pods: [measuredPod],
    }));
    await expect(getPhysicalTopology({ clusters: ["cluster-a"] }))
      .resolves.toMatchObject({ pods: [{ usage_pct: 106.2 }] });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      ...PHYSICAL_TOPOLOGY_ENDPOINT,
      pods: [{ ...measuredPod, cpu_request_mcores: null }],
    }));
    await expect(getPhysicalTopology({ clusters: ["cluster-a"] }))
      .rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
