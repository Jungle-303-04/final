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
      label: "Restart",
      description: "Restart this deployment and stream the operation result.",
      execution: "command",
      confirmation_required: true,
      realtime: true,
      input_schema: [],
      method: "POST",
      path: "/clusters/cluster-a/namespaces/shop/deployments/checkout-api/restart",
      request_context: "simple",
      result_intent: "refresh-resource",
    },
    {
      capability_id: "deployment.scale",
      label: "Scale",
      description: "Change the desired replica count and stream the operation result.",
      execution: "command",
      confirmation_required: true,
      realtime: true,
      input_schema: [
        {
          key: "replicas",
          label: "Replicas",
          type: "integer",
          required: true,
          minimum: 0,
          maximum: 100,
          default: 1,
          prefill_result_key: null,
        },
        {
          key: "dry_run",
          label: "Dry run",
          type: "boolean",
          required: true,
          minimum: null,
          maximum: null,
          default: false,
          prefill_result_key: null,
        },
      ],
      method: "POST",
      path: "/clusters/cluster-a/namespaces/shop/deployments/checkout-api/scale",
      request_context: "simple",
      result_intent: "refresh-resource",
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

  it("rejects empty identities, malformed descriptors, duplicates, and unsorted actions", async () => {
    expect(() => getResourceCapabilities("  ")).toThrow(TypeError);
    for (const capabilities of [
      [{ ...RESPONSE.capabilities[0], path: "https://invalid.example/action" }],
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
