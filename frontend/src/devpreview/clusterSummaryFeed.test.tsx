// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useClusterSummaries } from "./clusterSummaryFeed";

describe("useClusterSummaries", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads every visible card through one bounded fleet request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      clusters: [cluster("cluster-a"), cluster("cluster-b", { cpu_pct: null, open_incidents: 2 })],
      totals: totals(),
    }));

    const rendered = renderHook(() => useClusterSummaries(["cluster-b", "cluster-a"]));
    await waitFor(() => expect(rendered.result.current["cluster-a"]?.status).toBe("ready"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/fleet/summary");
    expect(rendered.result.current["cluster-b"]).toMatchObject({
      status: "ready",
      cpuPct: null,
      memPct: 40,
      openIncidents: 2,
      nodesReady: 2,
      nodesTotal: 2,
    });
  });

  it("marks a cluster omitted by the authorized fleet response unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      clusters: [cluster("cluster-a")],
      totals: totals(),
    }));

    const rendered = renderHook(() => useClusterSummaries(["cluster-a", "not-authorized"]));
    await waitFor(() => expect(rendered.result.current["not-authorized"]?.status).toBe("unavailable"));
    expect(rendered.result.current["not-authorized"]?.podsTotal).toBeNull();
  });

  it("does not issue an unscoped request", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const rendered = renderHook(() => useClusterSummaries([]));
    expect(rendered.result.current).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function cluster(clusterId: string, overrides: Record<string, unknown> = {}) {
  return {
    cluster_id: clusterId,
    name: clusterId,
    health: "healthy",
    pods_running: 9,
    pods_total: 10,
    nodes_ready: 2,
    nodes_total: 2,
    open_incidents: 0,
    restarts_recent: 0,
    cpu_pct: 25,
    mem_pct: 40,
    last_seen_at: "2026-07-21T08:20:00Z",
    ...overrides,
  };
}

function totals() {
  return {
    clusters: 2,
    healthy: 2,
    warning: 0,
    critical: 0,
    stale: 0,
    unknown: 0,
    open_incidents: 0,
    pending_approvals: 0,
    running_workflows: 0,
    dead_letters: 0,
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
