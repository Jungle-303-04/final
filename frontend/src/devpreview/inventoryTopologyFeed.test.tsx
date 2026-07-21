// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  podsForNode,
  resetClusterTopologyCacheForTests,
  toClusterTopologyView,
  useClusterTopologies,
  useClusterTopology,
} from "./inventoryTopologyFeed";
import { PHYSICAL_TOPOLOGY_ENDPOINT } from "./inventoryTopologyFeed.testSupport";

describe("useClusterTopology", () => {
  afterEach(() => {
    resetClusterTopologyCacheForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("derives card and drill totals from the same canonical response and reports partial evidence", () => {
    const view = toClusterTopologyView(PHYSICAL_TOPOLOGY_ENDPOINT);

    expect(view).toMatchObject({
      status: "ready",
      nodesReady: 1,
      nodesTotal: 1,
      podsTotal: 1,
      returnedPodCount: 1,
      truncatedPodCount: 13,
      nodeCompleteness: "partial",
      podCompleteness: "partial",
      partial: true,
      stale: false,
    });
    expect(view.partialReasonCodes).toContain("source_resources_truncated");
  });

  it("uses the canonical physical topology contract and preserves server to pod identity", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(PHYSICAL_TOPOLOGY_ENDPOINT), { status: 200 }),
    );
    const rendered = renderHook(() => useClusterTopology("cluster-a"));

    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/topology?view=physical&clusters=cluster-a&resources.includeDeleted=false");
    expect(rendered.result.current.nodes[0]).toMatchObject({
      key: "node:worker-a",
      name: "worker-a",
      cpuPercent: 68,
    });
    expect(rendered.result.current.pods[0]).toMatchObject({
      key: "pod:shop/checkout-0",
      serverId: "node:worker-a",
      restartCount: 7,
    });
    expect(podsForNode(rendered.result.current.pods, rendered.result.current.nodes[0].key))
      .toHaveLength(1);
    expect(podsForNode(rendered.result.current.pods, "node:other")).toEqual([]);
  });

  it("loads every cluster in parallel and deduplicates a simultaneous drill subscription", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const clusterId = url.includes("cluster-b") ? "cluster-b" : "cluster-a";
      return new Response(JSON.stringify({
        ...PHYSICAL_TOPOLOGY_ENDPOINT,
        cluster: { ...PHYSICAL_TOPOLOGY_ENDPOINT.cluster, cluster_id: clusterId },
      }), { status: 200 });
    });

    const rendered = renderHook(() => ({
      cards: useClusterTopologies(["cluster-b", "cluster-a"]),
      drill: useClusterTopology("cluster-a"),
    }));

    await waitFor(() => {
      expect(rendered.result.current.cards["cluster-a"]?.status).toBe("ready");
      expect(rendered.result.current.cards["cluster-b"]?.status).toBe("ready");
      expect(rendered.result.current.drill.status).toBe("ready");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(expect.arrayContaining([
      "/api/topology?view=physical&clusters=cluster-a&resources.includeDeleted=false",
      "/api/topology?view=physical&clusters=cluster-b&resources.includeDeleted=false",
    ]));
  });

  it("owns one partial-refresh timer per cluster across card and drill subscribers", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(PHYSICAL_TOPOLOGY_ENDPOINT), { status: 200 }),
    );
    renderHook(() => ({
      cards: useClusterTopologies(["cluster-a"]),
      drill: useClusterTopology("cluster-a"),
    }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves a recent topology from cache without issuing another request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(PHYSICAL_TOPOLOGY_ENDPOINT), { status: 200 }),
    );
    const first = renderHook(() => useClusterTopology("cluster-a"));
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    first.unmount();

    const second = renderHook(() => useClusterTopology("cluster-a"));
    await waitFor(() => expect(second.result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts an obsolete cluster request when its final subscriber changes scope", async () => {
    let obsoleteSignal: AbortSignal | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).includes("cluster-a")) {
        obsoleteSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          obsoleteSignal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }
      return Promise.resolve(new Response(JSON.stringify({
        ...PHYSICAL_TOPOLOGY_ENDPOINT,
        cluster: { ...PHYSICAL_TOPOLOGY_ENDPOINT.cluster, cluster_id: "cluster-b" },
      }), { status: 200 }));
    });
    const rendered = renderHook(
      ({ clusterId }) => useClusterTopology(clusterId),
      { initialProps: { clusterId: "cluster-a" } },
    );

    await waitFor(() => expect(obsoleteSignal).toBeDefined());
    rendered.rerender({ clusterId: "cluster-b" });
    await waitFor(() => expect(obsoleteSignal?.aborted).toBe(true));
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exposes an unavailable state for a failed topology response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status: 503 }));
    const rendered = renderHook(() => useClusterTopology("cluster-a"));
    await waitFor(() => expect(rendered.result.current.status).toBe("unavailable"));
    expect(rendered.result.current.nodes).toEqual([]);
  });
});
