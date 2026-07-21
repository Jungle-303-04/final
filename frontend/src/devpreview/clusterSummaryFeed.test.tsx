// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyLiveClusterSummaries, useClusterSummaries } from "./clusterSummaryFeed";
import type { LiveStreamViewState } from "./liveStreamFeed";

describe("useClusterSummaries", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads every visible card from its canonical node summary in parallel", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const clusterId = String(input).includes("cluster-b") ? "cluster-b" : "cluster-a";
      return jsonResponse(nodeSummary(clusterId));
    });

    const rendered = renderHook(() => useClusterSummaries(["cluster-b", "cluster-a"]));
    await waitFor(() => expect(rendered.result.current["cluster-a"]?.status).toBe("ready"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(expect.arrayContaining([
      "/api/clusters/cluster-a/nodes/summary",
      "/api/clusters/cluster-b/nodes/summary",
    ]));
    expect(rendered.result.current["cluster-b"]).toMatchObject({
      status: "ready",
      cpuPct: 30,
      memPct: 40,
      podsRunning: 9,
      podsTotal: null,
      openIncidents: null,
      nodesReady: 1,
      nodesTotal: 2,
      nodes: [
        expect.objectContaining({ name: "worker-a", cpuPct: 20, memPct: null, restartsRecent: 0, conditions: ["Ready"] }),
        expect.objectContaining({ name: "worker-b", cpuPct: 40, memPct: 40, restartsRecent: 1, conditions: ["MemoryPressure"] }),
      ],
    });
  });

  it("keeps a successful cluster when a peer node summary is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => (
      String(input).includes("not-authorized")
        ? new Response("forbidden", { status: 403 })
        : jsonResponse(nodeSummary("cluster-a"))
    ));

    const rendered = renderHook(() => useClusterSummaries(["cluster-a", "not-authorized"]));
    await waitFor(() => expect(rendered.result.current["not-authorized"]?.status).toBe("unavailable"));
    expect(rendered.result.current["cluster-a"]?.status).toBe("ready");
    expect(rendered.result.current["not-authorized"]?.podsTotal).toBeNull();
  });

  it("does not issue an unscoped request", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const rendered = renderHook(() => useClusterSummaries([]));
    expect(rendered.result.current).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("projects resource.delta and live.summary facts without inventing node usage", () => {
    const baseline = {
      "cluster-a": {
        status: "ready" as const,
        health: null,
        cpuPct: 30,
        memPct: 40,
        podsRunning: 9,
        podsTotal: null,
        nodesReady: 1,
        nodesTotal: 2,
        openIncidents: null,
        nodes: [
          { name: "worker-a", ready: true, health: "healthy", cpuPct: 20, memPct: null, podsRunning: 5, podsCapacity: 20, restartsRecent: 0, conditions: [] },
          { name: "worker-b", ready: false, health: "warning", cpuPct: 40, memPct: 40, podsRunning: 4, podsCapacity: 20, restartsRecent: 1, conditions: [] },
        ],
      },
    };
    const live: LiveStreamViewState = {
      status: "connected",
      observed: true,
      stale: false,
      updatedAt: 1,
      resources: {
        "cluster-a/shop/pod/checkout-0": {
          phase: "Running",
          node: "worker-a",
          // Pod request ratios must not become node/dashboard utilization.
          cpu_request_pct: 99,
          mem_request_pct: 88,
        },
        "cluster-a/shop/pod/checkout-1": { phase: "Pending", node: "worker-a" },
      },
      summaries: {
        "cluster-a": {
          cluster_id: "cluster-a",
          window_ms: 1_000,
          pods_ready: 1,
          pods_total: 2,
          restart_delta: 3,
          rollout_phase: "progressing",
          hot_pods: [],
        },
      },
    };

    const result = applyLiveClusterSummaries(baseline, ["cluster-a"], live)["cluster-a"]!;

    expect(result).toMatchObject({
      cpuPct: 30,
      memPct: 40,
      podsRunning: 1,
      podsTotal: 2,
      restartDelta: 3,
      stale: false,
    });
    expect(result.nodes).toEqual([
      expect.objectContaining({ name: "worker-a", cpuPct: 20, memPct: null, podsRunning: 1 }),
      expect.objectContaining({ name: "worker-b", cpuPct: 40, memPct: 40, podsRunning: 0 }),
    ]);

    const disconnected = applyLiveClusterSummaries(baseline, ["cluster-a"], {
      ...live,
      status: "disconnected",
      stale: true,
    })["cluster-a"]!;
    expect(disconnected).toMatchObject({ podsRunning: 1, podsTotal: 2, stale: true });
  });

  it("does not let an incomplete zero live summary erase the REST node occupancy", () => {
    const baseline = {
      "management-server": {
        status: "ready" as const,
        health: null,
        cpuPct: null,
        memPct: null,
        podsRunning: 52,
        podsTotal: null,
        nodesReady: 2,
        nodesTotal: 2,
        openIncidents: null,
        nodes: [
          { name: "worker-a", ready: true, health: "healthy", cpuPct: null, memPct: null, podsRunning: 22, podsCapacity: 58, restartsRecent: 0, conditions: [] },
          { name: "worker-b", ready: true, health: "healthy", cpuPct: null, memPct: null, podsRunning: 30, podsCapacity: 58, restartsRecent: 0, conditions: [] },
        ],
      },
    };
    const live: LiveStreamViewState = {
      status: "connected",
      observed: true,
      stale: false,
      updatedAt: 1,
      resources: {},
      summaries: {
        "management-server": {
          cluster_id: "management-server",
          window_ms: 1_000,
          pods_ready: 0,
          pods_total: 0,
          restart_delta: 0,
          rollout_phase: "idle",
          hot_pods: [],
        },
      },
    };

    const result = applyLiveClusterSummaries(baseline, ["management-server"], live)["management-server"]!;

    expect(result.podsRunning).toBe(52);
    expect(result.podsTotal).toBeNull();
    expect(result.nodes.map((node) => node.podsRunning)).toEqual([22, 30]);
  });

  it("retains REST occupancy when resource deltas do not cover the live pod total", () => {
    const baseline = {
      "cluster-a": {
        status: "ready" as const,
        health: null,
        cpuPct: 20,
        memPct: 30,
        podsRunning: 9,
        podsTotal: null,
        nodesReady: 1,
        nodesTotal: 1,
        openIncidents: null,
        nodes: [
          { name: "worker-a", ready: true, health: "healthy", cpuPct: 20, memPct: 30, podsRunning: 9, podsCapacity: 20, restartsRecent: 0, conditions: [] },
        ],
      },
    };
    const live: LiveStreamViewState = {
      status: "connected",
      observed: true,
      stale: false,
      updatedAt: 1,
      resources: {
        "cluster-a/shop/pod/checkout-0": { phase: "Running", node: "worker-a" },
      },
      summaries: {
        "cluster-a": {
          cluster_id: "cluster-a",
          window_ms: 1_000,
          pods_ready: 9,
          pods_total: 10,
          restart_delta: 0,
          rollout_phase: "idle",
          hot_pods: [],
        },
      },
    };

    const result = applyLiveClusterSummaries(baseline, ["cluster-a"], live)["cluster-a"]!;

    expect(result.podsRunning).toBe(9);
    expect(result.nodes[0]?.podsRunning).toBe(9);
    expect(result.podsTotal).toBe(10);
  });
});

function nodeSummary(clusterId: string) {
  return {
    cluster_id: clusterId,
    nodes: [
      {
        name: "worker-a",
        ready: true,
        health: "healthy",
        kubernetes_version: "v1.32.0-eks",
        pods_running: 5,
        pods_capacity: 20,
        cpu_pct: 20,
        mem_pct: null,
        restarts_recent: 0,
        conditions: ["Ready"],
      },
      {
        name: "worker-b",
        ready: false,
        health: "warning",
        kubernetes_version: "v1.32.0-eks",
        pods_running: 4,
        pods_capacity: 20,
        cpu_pct: 40,
        mem_pct: 40,
        restarts_recent: 1,
        conditions: ["MemoryPressure"],
      },
    ],
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
