import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  getClusterNodesSummary,
  getClusterSummary,
  getNodePodsSummary,
} from "./cluster-summary";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("cluster summary API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads cluster-level workload, incident, and usage summary", async () => {
    const payload = {
      cluster_id: "cluster-1",
      name: "Production Seoul",
      health: "healthy",
      workloads: {
        healthy: [
          {
            name: "api",
            kind: "Deployment",
            namespace: "default",
            health: "healthy",
            ready: "3/3",
            restarts: 0,
          },
        ],
      },
      warning_events: [],
      open_incidents: [],
      usage: {
        sampled_at: "2026-07-12T00:00:00Z",
        pods_running: 42,
        pods_total: 45,
        nodes_ready: 3,
        nodes_total: 3,
        restart_total: 2,
        cpu_pct: 41.5,
        mem_pct: 68.2,
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getClusterSummary("cluster/one")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/summary",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("loads node summaries and preserves unavailable metrics as null", async () => {
    const payload = {
      cluster_id: "cluster-1",
      nodes: [
        {
          name: "worker-1",
          ready: true,
          health: "healthy",
          pods_running: 12,
          pods_capacity: 30,
          cpu_pct: null,
          mem_pct: null,
          restarts_recent: 0,
          conditions: [],
        },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getClusterNodesSummary("cluster-1")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/nodes/summary",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("loads pods for an encoded node name", async () => {
    const payload = {
      cluster_id: "cluster-1",
      node_name: "worker/node-1",
      pods: [
        {
          name: "api-abc",
          namespace: "default",
          phase: "Running",
          health: "healthy",
          ready: "1/1",
          restarts: 0,
          owner_kind: "Deployment",
          owner_name: "api",
          cpu_mcores: 120,
          mem_mib: 256,
          incident_correlation_id: null,
        },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getNodePodsSummary("cluster-1", "worker/node-1")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/nodes/worker%2Fnode-1/pods/summary",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects an invalid node summary payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ cluster_id: "cluster-1", nodes: [{ name: "worker-1", ready: "yes" }] }),
    );

    await expect(getClusterNodesSummary("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves a missing node response as a not-found API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "node not found" }, 404),
    );

    await expect(getNodePodsSummary("cluster-1", "missing-node")).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "node not found",
    } satisfies Partial<ApiError>);
  });
});
