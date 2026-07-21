import { describe, expect, it, vi } from "vitest";

import { createEmptyUnifiedFilterState } from "../filters/filterContract";
import { createResourceMetricsHistoryAdapter } from "./createResourceMetricsHistoryAdapter";
import type { ResourceMetricsHistoryEndpointResponse } from "./resourceMetricsHistoryEndpointContract";

function endpointResponse(
  overrides: Partial<ResourceMetricsHistoryEndpointResponse> = {},
): ResourceMetricsHistoryEndpointResponse {
  return {
    series: [{
      resource_id: "inventory-pod-1",
      cluster_id: "cluster-a",
      resource_type: "pod",
      namespace: "shop",
      name: "checkout-0",
      points: [
        { observed_at: "2026-07-14T00:00:00Z", cpu_mcores: 10, mem_mib: null },
        { observed_at: "2026-07-14T00:01:00Z", cpu_mcores: null, mem_mib: 64 },
      ],
      has_sparkline_points: true,
      completeness: "partial",
      partial_reason_codes: ["sample_gap"],
    }],
    completeness: "partial",
    partial_reason_codes: ["sample_gap"],
    snapshot: {
      snapshot_revision: 42,
      authorization_revision: "auth-1",
      filter_fingerprint: "filter-1",
      observed_at: "2026-07-14T00:01:00Z",
      stale: false,
      partial_reason_codes: [],
    },
    ...overrides,
  };
}

describe("Resource metrics history adapter", () => {
  it("loads one batch, preserves null samples, and forwards the signal", async () => {
    const getResourceMetricsHistory = vi.fn().mockResolvedValue(endpointResponse());
    const controller = new AbortController();
    const port = createResourceMetricsHistoryAdapter({ getResourceMetricsHistory });

    const result = await port.loadResourceMetricsHistory(
      createEmptyUnifiedFilterState(),
      ["inventory-pod-1"],
      { snapshotRevision: 42, range: "1h", limit: 60 },
      controller.signal,
    );

    expect(getResourceMetricsHistory).toHaveBeenCalledTimes(1);
    expect(getResourceMetricsHistory).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["inventory-pod-1"], snapshotRevision: 42 }),
      controller.signal,
    );
    expect(result.series[0]?.points).toEqual([
      { observedAt: "2026-07-14T00:00:00Z", cpuMillicores: 10, memoryMebibytes: null },
      { observedAt: "2026-07-14T00:01:00Z", cpuMillicores: null, memoryMebibytes: 64 },
    ]);
  });

  it.each([
    ["identity set", endpointResponse({ series: [] })],
    ["snapshot", endpointResponse({ snapshot: {
      ...endpointResponse().snapshot,
      snapshot_revision: 41,
    } })],
  ])("rejects a mismatched %s without a fallback", async (_label, response) => {
    const port = createResourceMetricsHistoryAdapter({
      getResourceMetricsHistory: vi.fn().mockResolvedValue(response),
    });
    await expect(port.loadResourceMetricsHistory(
      createEmptyUnifiedFilterState(),
      ["inventory-pod-1"],
      { snapshotRevision: 42 },
    )).rejects.toMatchObject({ code: "invalid-response" });
  });
});
