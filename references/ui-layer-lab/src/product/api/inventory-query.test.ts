import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { listInventoryResourcesByType } from "./inventory-query";

const RESOURCE_LIST = {
  cluster_id: "cluster-1",
  resource_type: "deployment",
  resources: [],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("inventory resource type query API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("queries one resource type with namespace and include-deleted filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(RESOURCE_LIST),
    );

    await expect(
      listInventoryResourcesByType("cluster/one", {
        resourceType: " deployment ",
        namespace: "backend",
        includeDeleted: true,
        limit: 50,
      }),
    ).resolves.toEqual(RESOURCE_LIST);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/inventory/resources?resource_type=deployment&namespace=backend&include_deleted=true&limit=50",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("uses the resource-query default limit of 200", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(RESOURCE_LIST),
    );

    await listInventoryResourcesByType("cluster-1", { resourceType: "pod" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/inventory/resources?resource_type=pod&include_deleted=false&limit=200",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws on an empty type and out-of-range limits before requesting", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() => listInventoryResourcesByType("cluster-1", { resourceType: "  " })).toThrow(
      "resourceType must not be empty",
    );
    expect(() =>
      listInventoryResourcesByType("cluster-1", { resourceType: "pod", limit: 1001 }),
    ).toThrow("resource query limit must be an integer from 1 to 1000");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid resource-list response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ cluster_id: "cluster-1", resource_type: "pod", resources: "not-array" }),
    );

    await expect(
      listInventoryResourcesByType("cluster-1", { resourceType: "pod" }),
    ).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});
