import { describe, expect, it, vi } from "vitest";

import { createResourceCapabilitiesAdapter } from "./createResourceCapabilitiesAdapter";

const RESPONSE = {
  subject: {
    resource_id: "deployment:shop/checkout-api",
    snapshot_id: "snapshot-42",
    cluster_id: "cluster-1",
    resource_type: "workload",
    kind: "Deployment",
    namespace: "shop",
    name: "checkout-api",
  },
  revision: "a".repeat(64),
  capabilities: [{
    capability_id: "deployment.restart" as const,
    method: "POST" as const,
    path: "/clusters/cluster-1/namespaces/shop/deployments/checkout-api/restart",
  }],
};

describe("resource capabilities adapter", () => {
  it("maps the exact capability decision without adding disabled actions", async () => {
    const getResourceCapabilities = vi.fn().mockResolvedValue(RESPONSE);
    const port = createResourceCapabilitiesAdapter({ getResourceCapabilities });

    await expect(port.loadResourceCapabilities("deployment:shop/checkout-api"))
      .resolves.toEqual({
        subject: {
          resourceId: "deployment:shop/checkout-api",
          snapshotId: "snapshot-42",
          clusterId: "cluster-1",
          resourceType: "workload",
          kind: "Deployment",
          namespace: "shop",
          name: "checkout-api",
        },
        revision: "a".repeat(64),
        capabilities: [{
          capabilityId: "deployment.restart",
          method: "POST",
          path: RESPONSE.capabilities[0].path,
        }],
      });
  });

  it("rejects a response for a different inventory identity", async () => {
    const port = createResourceCapabilitiesAdapter({
      getResourceCapabilities: vi.fn().mockResolvedValue({
        ...RESPONSE,
        subject: { ...RESPONSE.subject, resource_id: "other" },
      }),
    });

    await expect(port.loadResourceCapabilities("deployment:shop/checkout-api"))
      .rejects.toMatchObject({ code: "invalid-response" });
  });
});
