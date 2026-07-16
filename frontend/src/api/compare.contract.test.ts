import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCompareCandidates,
  getCompareResourcePair,
} from "./compare";

describe("Compare API contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("owns both compare endpoint identifiers and rejects an invalid wire response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockImplementation(async () => invalidResponse());

    await expect(getCompareCandidates({
      apiGroup: "apps",
      apiVersion: "v1",
      clusterId: "cluster-a",
      kind: "deployments",
    })).rejects.toMatchObject({ kind: "invalid-payload" });
    await expect(getCompareResourcePair({
      a: "shop/api-a",
      apiGroup: "apps",
      apiVersion: "v1",
      b: "shop/api-b",
      clusterId: "cluster-a",
      kind: "deployments",
    })).rejects.toMatchObject({ kind: "invalid-payload" });

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/compare/candidates?cluster_id=cluster-a&kind=deployments&apiGroup=apps&apiVersion=v1",
      "/api/compare/resources?cluster_id=cluster-a&kind=deployments&apiGroup=apps&apiVersion=v1&a=shop%2Fapi-a&b=shop%2Fapi-b",
    ]);
  });
});

function invalidResponse(): Response {
  return new Response("{}", { headers: { "content-type": "application/json" }, status: 200 });
}
