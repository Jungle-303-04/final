// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createEmptyUnifiedFilterState } from "../../features/filters/filterContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";
import { useRelationTopologyDataFrame } from "./useRelationTopologyDataFrame";

describe("relation topology data frame", () => {
  it("shares the initial read across the StrictMode setup cycle without aborting it", async () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-1"];
    const signals: AbortSignal[] = [];
    let resolveRead!: (value: ReturnType<typeof snapshot>) => void;
    const pendingRead = new Promise<ReturnType<typeof snapshot>>((resolve) => {
      resolveRead = resolve;
    });
    const port: RelationTopologyPort = {
      loadRelationTopology: vi.fn((_filter, _options, signal) => {
        signals.push(signal);
        return pendingRead;
      }),
    };
    const reportUnauthorized = vi.fn();

    const rendered = renderHook(() => useRelationTopologyDataFrame({
      active: true,
      filterState: state,
      port,
      reportUnauthorized,
      revision: 0,
    }), { wrapper: StrictMode });

    await waitFor(() => expect(port.loadRelationTopology).toHaveBeenCalledOnce());
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);

    resolveRead(snapshot());
    await waitFor(() => expect(rendered.result.current.phase).toBe("ready"));
    expect(port.loadRelationTopology).toHaveBeenCalledOnce();
    expect(signals[0]?.aborted).toBe(false);
    rendered.unmount();
  });

  it("starts a new read when the revision or serialized filter scope changes", async () => {
    const firstState = createEmptyUnifiedFilterState();
    firstState.common.clusters = ["cluster-1"];
    const secondState = createEmptyUnifiedFilterState();
    secondState.common.clusters = ["cluster-2"];
    const port: RelationTopologyPort = {
      loadRelationTopology: vi.fn().mockResolvedValue(snapshot()),
    };
    const reportUnauthorized = vi.fn();
    const rendered = renderHook(
      ({ filterState, revision }) => useRelationTopologyDataFrame({
        active: true,
        filterState,
        port,
        reportUnauthorized,
        revision,
      }),
      { initialProps: { filterState: firstState, revision: 0 } },
    );

    await waitFor(() => expect(port.loadRelationTopology).toHaveBeenCalledTimes(1));

    rendered.rerender({ filterState: firstState, revision: 1 });
    await waitFor(() => expect(port.loadRelationTopology).toHaveBeenCalledTimes(2));

    rendered.rerender({ filterState: secondState, revision: 1 });
    await waitFor(() => expect(port.loadRelationTopology).toHaveBeenCalledTimes(3));
    rendered.unmount();
  });

  it("uses the server refresh policy while retaining the verified graph during refresh", async () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-1"];
    const port: RelationTopologyPort = {
      loadRelationTopology: vi.fn().mockResolvedValue(snapshot()),
    };
    const reportUnauthorized = vi.fn();
    const rendered = renderHook(() => useRelationTopologyDataFrame({
      active: true,
      filterState: state,
      port,
      reportUnauthorized,
      revision: 0,
    }));

    await waitFor(() => {
      expect(port.loadRelationTopology).toHaveBeenCalledOnce();
      expect(rendered.result.current.phase).toBe("ready");
    });

    await waitFor(
      () => expect(port.loadRelationTopology).toHaveBeenCalledTimes(2),
      { timeout: 2_000 },
    );
    expect(rendered.result.current).toMatchObject({
      phase: "ready",
      data: { graphRevision: "graph-frame" },
    });
    rendered.unmount();
  });
});

function snapshot() {
  return {
    availability: "available" as const,
    clusterId: "cluster-1",
    clusterProjectionRevision: 1,
    graphRevision: "graph-frame",
    refreshAfterSeconds: 1,
    nodes: [],
    edges: [],
    counts: {
      filteredCount: 0,
      unfilteredCount: 0,
      filteredCountCompleteness: "exact" as const,
      unfilteredCountCompleteness: "exact" as const,
    },
    relationCompleteness: "exact" as const,
    partialReasonCodes: [],
    truncated: false,
    omittedNodeCount: 0,
    omittedEdgeCount: 0,
    snapshot: {
      snapshotRevision: 1,
      authorizationRevision: "auth-frame",
      filterFingerprint: "filter-frame",
      observedAt: "2026-07-14T05:00:00Z",
      stale: false,
      partialReasonCodes: [],
    },
  };
}
