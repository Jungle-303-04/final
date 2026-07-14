import { beforeEach, describe, expect, it, vi } from "vitest";

import { getResourceCapabilities } from "./resource-capabilities";

const RESPONSE = {
  subject: {
    resource_id: "resource-deployment-api",
    snapshot_id: "snapshot-42",
    cluster_id: "cluster-a",
    resource_type: "workload",
    kind: "Deployment",
    namespace: "shop",
    name: "checkout-api",
  },
  revision: "a".repeat(64),
  capabilities: [
    {
      capability_id: "deployment.restart",
      method: "POST",
      path: "/clusters/cluster-a/namespaces/shop/deployments/checkout-api/restart",
    },
    {
      capability_id: "deployment.scale",
      method: "POST",
      path: "/clusters/cluster-a/namespaces/shop/deployments/checkout-api/scale",
    },
  ],
} as const;

describe("resource capabilities API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requests one exact inventory resource and validates enabled actions", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(RESPONSE), { status: 200 }),
    );

    await expect(getResourceCapabilities("resource-deployment-api", controller.signal))
      .resolves.toEqual(RESPONSE);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/capabilities?resource=resource-deployment-api",
      expect.objectContaining({ credentials: "include", signal: controller.signal }),
    );
  });

  it("rejects empty identities, unknown actions, duplicates, and unsorted actions", async () => {
    expect(() => getResourceCapabilities("  ")).toThrow(TypeError);
    for (const capabilities of [
      [{ ...RESPONSE.capabilities[0], capability_id: "deployment.delete" }],
      [RESPONSE.capabilities[0], RESPONSE.capabilities[0]],
      [...RESPONSE.capabilities].reverse(),
    ]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ...RESPONSE, capabilities }), { status: 200 }),
      );
      await expect(getResourceCapabilities("resource-deployment-api"))
        .rejects.toMatchObject({ kind: "invalid-payload" });
    }
  });
});
