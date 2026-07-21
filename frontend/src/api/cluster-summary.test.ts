import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHomeAdapter } from "../features/home/createHomeAdapter";
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

function clusterSummaryWithoutPodsTotal() {
  return {
    cluster_id: "cluster-1",
    name: "Production Seoul",
    health: "critical",
    workloads: {
      degraded: [
        {
          name: "checkout-api",
          kind: "Deployment",
          namespace: "shop",
          health: "degraded",
          ready: "1/2",
          restarts: 3,
        },
      ],
    },
    warning_events: [
      {
        namespace: "shop",
        name: "checkout-warning",
        reason: "BackOff",
        message: "Container is restarting",
        involved_kind: "Pod",
        involved_name: "checkout-api-0",
        count: 2,
        last_seen_at: "2026-07-12T09:59:00Z",
      },
    ],
    open_incidents: [
      {
        incident_id: "incident-1",
        correlation_id: "correlation-1",
        symptom: "Restart loop",
        root_cause: null,
        namespace: "shop",
        resource_kind: "Pod",
        resource_name: "checkout-api-0",
        status: "open",
        created_at: "2026-07-12T09:58:00Z",
      },
    ],
    usage: {
      sampled_at: "2026-07-12T10:00:00Z",
      pods_running: 5,
      nodes_ready: 2,
      nodes_total: 2,
      restart_total: 3,
      cpu_pct: 42.5,
      mem_pct: 61.25,
    },
  };
}

function clusterSummaryWithPodsTotal() {
  const base = clusterSummaryWithoutPodsTotal();
  return { ...base, usage: { ...base.usage, pods_total: 6 } };
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

  it("flows a required pods_total through getClusterSummary into the Home usage snapshot", async () => {
    const payload = clusterSummaryWithPodsTotal();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    const adapter = createHomeAdapter({
      listClusters: async () => ({ clusters: [] }),
      getClusterSummary,
      getClusterNodesSummary,
      getNodePodsSummary,
    });

    await expect(adapter.loadClusterOverview("cluster-1")).resolves.toMatchObject({
      health: "critical",
      usage: {
        podsRunning: 5,
        podsTotal: 6,
        nodesReady: 2,
        nodesTotal: 2,
      },
      workloads: [{ name: "checkout-api" }],
      warnings: [{ name: "checkout-warning" }],
      incidents: [{ incidentId: "incident-1" }],
      dataQualityWarnings: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/summary",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it.each([
    {
      section: "workloads",
      payload: (() => {
        const payload = clusterSummaryWithoutPodsTotal();
        return {
          ...payload,
          workloads: {
            degraded: [{ ...payload.workloads.degraded[0], unexpected: true }],
          },
        };
      })(),
    },
    {
      section: "warning_events",
      payload: (() => {
        const payload = clusterSummaryWithoutPodsTotal();
        return {
          ...payload,
          warning_events: [{ ...payload.warning_events[0], unexpected: true }],
        };
      })(),
    },
    {
      section: "open_incidents",
      payload: (() => {
        const payload = clusterSummaryWithoutPodsTotal();
        return {
          ...payload,
          open_incidents: [{ ...payload.open_incidents[0], unexpected: true }],
        };
      })(),
    },
  ])("keeps $section strict while usage is partial", async ({ payload }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getClusterSummary("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("loads node summaries and preserves unavailable metrics as null", async () => {
    const payload = {
      cluster_id: "cluster-1",
      nodes: [
        {
          name: "worker-1",
          ready: true,
          health: "healthy",
          kubernetes_version: null,
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
