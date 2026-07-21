// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useInventoryResourcesAcrossClusters } from "./inventoryResourcesFeed";

describe("useInventoryResourcesAcrossClusters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fans out the real cluster route and merges rows for the all-cluster scope", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (request) => {
      const url = String(request);
      const cluster = url.includes("cluster-a") ? "cluster-a" : "cluster-b";
      return new Response(JSON.stringify({
        cluster_id: cluster,
        resource_type: "pod",
        resources: [resource(cluster, `${cluster}-pod`)],
      }), { status: 200 });
    });

    const rendered = renderHook(() => useInventoryResourcesAcrossClusters(["cluster-a", "cluster-b"], "pod"));
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));

    expect(rendered.result.current.rows.map((row) => row.name)).toEqual(["cluster-a-pod", "cluster-b-pod"]);
    expect(fetchMock.mock.calls.map(([request]) => String(request))).toEqual(expect.arrayContaining([
      expect.stringContaining("/api/clusters/cluster-a/inventory/resources?"),
      expect.stringContaining("/api/clusters/cluster-b/inventory/resources?"),
    ]));
  });

  it("does not request a malformed cluster route while the Resources surface is inactive", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const rendered = renderHook(() => useInventoryResourcesAcrossClusters([], "deployment"));
    expect(rendered.result.current).toEqual({ status: "ready", rows: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function resource(cluster: string, name: string) {
  return {
    inventory_key: `pod:${cluster}/default/${name}`,
    snapshot_id: `snapshot-${cluster}`,
    workspace_id: "workspace-1",
    cluster_id: cluster,
    resource_type: "pod",
    api_version: "v1",
    kind: "Pod",
    namespace: "default",
    name,
    uid: `${name}-uid`,
    resource_version: "1",
    status: "Running",
    health: "healthy",
    labels: {},
    annotations: {},
    summary: {},
    observed_at: "2026-07-21T00:00:00Z",
    first_seen_at: "2026-07-21T00:00:00Z",
    last_seen_at: "2026-07-21T00:00:00Z",
    deleted_at: null,
    created_at: "2026-07-21T00:00:00Z",
    updated_at: "2026-07-21T00:00:00Z",
  };
}
