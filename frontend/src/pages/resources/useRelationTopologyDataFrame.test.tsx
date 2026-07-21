// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createEmptyUnifiedFilterState } from "../../features/filters/filterContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";
import { useRelationTopologyDataFrame } from "./useRelationTopologyDataFrame";

describe("relation topology data frame", () => {
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
