// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useClusterSummaries } from "./clusterSummaryFeed";

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
