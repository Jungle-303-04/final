import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canonicalNamespaces,
  getRightsizingScan,
  RIGHTSIZING_SCAN_PATH,
} from "./rightsizing";

describe("Rightsizing API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("normalizes scope and performs only an explicit bounded scan request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      scope: {
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: ["shop", "staging"],
        freshness: "live",
      },
      namespace_scope: ["shop", "staging"],
      result: {
        availability: "unavailable",
        reason_codes: ["rightsizing_observation_not_integrated"],
      },
      refresh_after_seconds: 300,
    }), { headers: { "content-type": "application/json" }, status: 200 }));

    await getRightsizingScan({
      clusterId: "cluster-a",
      namespaces: ["staging", "shop", "shop"],
      limit: 50,
    });

    expect(RIGHTSIZING_SCAN_PATH).toBe("/api/rightsizing/workloads");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/rightsizing/workloads?cluster_id=cluster-a&namespaces=shop%2Cstaging&limit=50",
    );
    expect(canonicalNamespaces(["shop", "staging"])).toEqual(["shop", "staging"]);
  });

  it("rejects excessive namespace and workload limits before transport", () => {
    expect(() => canonicalNamespaces(Array.from({ length: 101 }, (_, index) => `ns-${index}`)))
      .toThrow(RangeError);
    expect(() => getRightsizingScan({
      clusterId: "cluster-a",
      namespaces: [],
      limit: 201,
    })).toThrow(RangeError);
  });
});
