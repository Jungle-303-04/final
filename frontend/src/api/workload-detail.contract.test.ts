import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkloadDetail } from "./workload-detail";

describe("Workload Detail API contract", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("owns the workload endpoint identifier and rejects an invalid wire response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json" }, status: 200 }));

    await expect(getWorkloadDetail({
      apiGroup: "apps",
      apiVersion: "v1",
      clusterId: "cluster-a",
      kind: "Deployment",
      name: "checkout",
      namespace: "shop",
    })).rejects.toMatchObject({ kind: "invalid-payload" });

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/workloads/Deployment/shop/checkout?cluster_id=cluster-a&apiGroup=apps&apiVersion=v1",
    ]);
  });
});
