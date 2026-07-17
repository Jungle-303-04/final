import { beforeEach, describe, expect, it, vi } from "vitest";

import { getKubernetesApiResources } from "./api-resource-discovery";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Kubernetes API resource discovery", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads the bounded cluster-scoped discovery contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "cluster-1",
      snapshot_id: "snapshot-1",
      discovery: {
        observed_at: "2026-07-16T12:00:00Z",
        completeness: "exact",
        reason_codes: [],
        resources: [{
          group: "stable.example.com",
          version: "v1",
          api_version: "stable.example.com/v1",
          name: "crontabs",
          singular_name: "crontab",
          kind: "CronTab",
          namespaced: true,
          is_crd: true,
          verbs: ["get", "list", "watch"],
        }],
      },
      unavailable_reason: null,
    }));

    await expect(getKubernetesApiResources("cluster/one")).resolves.toMatchObject({
      cluster_id: "cluster-1",
      discovery: { completeness: "exact" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/api-resources",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("rejects ambiguous unavailable payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "cluster-1",
      snapshot_id: null,
      discovery: null,
      unavailable_reason: null,
    }));

    await expect(getKubernetesApiResources("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
    });
  });
});
