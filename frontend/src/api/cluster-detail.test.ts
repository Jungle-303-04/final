import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { getCluster } from "./cluster-detail";

const CLUSTER_DETAIL = {
  cluster: {
    workspace_id: "default",
    cluster_id: "cluster-1",
    name: "Development Cluster",
    environment: "development",
    status: "registered",
    settings: { role: "target", region: "ap-northeast-2" },
    connection_status: "online",
    last_agent_id: "agent-cluster-1",
    last_agent_seen_at: "2026-07-12T00:00:00Z",
    node_count: 2,
    pod_count: 20,
    namespace_count: 6,
    kubernetes_version: "v1.33.1",
    crd_discovery_status: "exact" as const,
    incident_count: 1,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-12T00:00:00Z",
  },
  agents: [
    {
      workspace_id: "default",
      cluster_id: "cluster-1",
      agent_id: "agent-cluster-1",
      status: "connected",
      capabilities: ["command_receiver", "inventory_snapshot"],
      details: { heartbeat_source: "agent_api" },
      last_seen_at: "2026-07-12T00:00:00Z",
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-12T00:00:00Z",
    },
  ],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("cluster detail API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the selected cluster and preserves agent details", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(CLUSTER_DETAIL),
    );

    await expect(getCluster("cluster/one")).resolves.toEqual(CLUSTER_DETAIL);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("passes the caller AbortSignal to the request", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    controller.abort();

    await expect(getCluster("cluster-1", controller.signal)).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("rejects an invalid agent field instead of inventing a fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        ...CLUSTER_DETAIL,
        agents: [{ ...CLUSTER_DETAIL.agents[0], capabilities: ["metrics", 1] }],
      }),
    );

    await expect(getCluster("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves a not-found response as a not-found API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Cluster not found" }, 404),
    );

    await expect(getCluster("missing-cluster")).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "Cluster not found",
    } satisfies Partial<ApiError>);
  });
});
