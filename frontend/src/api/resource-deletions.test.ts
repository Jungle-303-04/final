import { beforeEach, describe, expect, it, vi } from "vitest";

import { getResourceDeletionPreview } from "./resource-deletions";

describe("resource deletion preview API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads only the cascade paired with the server-projected action path", async () => {
    const response = {
      dependents: [{
        api_group: "apps",
        kind: "ReplicaSet",
        name: "checkout-77f",
        namespace: "shop",
        resource_version: "17",
        uid: "replicaset-uid-1",
        version: "v1",
      }],
      max_dependents: 200,
      revision: `sha256:${"a".repeat(64)}`,
      root: {
        api_group: "apps",
        kind: "Deployment",
        name: "checkout",
        namespace: "shop",
        resource_version: "42",
        uid: "uid-1",
        version: "v1",
      },
      truncated: false,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(response),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    await expect(getResourceDeletionPreview("/resource-deletions/inventory-1"))
      .resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/resource-deletions/inventory-1/cascade-preview",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects a non-local capability path before a request", () => {
    expect(() => getResourceDeletionPreview("https://invalid.example/delete"))
      .toThrow(TypeError);
  });
});
