import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getResourceMetricsHistory as publicGetResourceMetricsHistory,
  RESOURCE_METRICS_HISTORY_PATH as publicPath,
} from "./index";
import {
  getResourceMetricsHistory,
  RESOURCE_METRICS_HISTORY_PATH,
} from "./resource-metrics-history";

const SNAPSHOT = {
  snapshot_revision: 42,
  authorization_revision: "auth-1",
  filter_fingerprint: "filter-1",
  observed_at: "2026-07-14T01:00:00Z",
  stale: false,
  partial_reason_codes: [],
};

function response(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("resource metrics history API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("exports and requests one bounded batch with the canonical filter scope", async () => {
    const payload = {
      series: [{
        resource_id: "pod:shop/api-0",
        cluster_id: "cluster-1",
        resource_type: "pod",
        namespace: "shop",
        name: "api-0",
        points: [
          { observed_at: "2026-07-14T00:00:00Z", cpu_mcores: 12, mem_mib: null },
          { observed_at: "2026-07-14T00:01:00Z", cpu_mcores: null, mem_mib: 64 },
        ],
        has_sparkline_points: true,
        completeness: "partial",
        partial_reason_codes: ["sample_gap"],
      }],
      completeness: "partial",
      partial_reason_codes: ["sample_gap"],
      snapshot: SNAPSHOT,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(payload));

    await expect(getResourceMetricsHistory({
      ids: ["pod:shop/api-0"],
      clusters: ["cluster-1"],
      resourceTypes: ["pod"],
      snapshotRevision: 42,
      range: "1h",
      limit: 60,
    })).resolves.toEqual(payload);

    expect(RESOURCE_METRICS_HISTORY_PATH).toBe("/api/metrics/history");
    expect(publicPath).toBe(RESOURCE_METRICS_HISTORY_PATH);
    expect(publicGetResourceMetricsHistory).toBe(getResourceMetricsHistory);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/metrics/history?ids=pod%3Ashop%2Fapi-0&clusters=cluster-1&resources.types=pod&resources.includeDeleted=false&snapshot_revision=42&range=1h&limit=60",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("rejects invalid batches before transport and impossible histories after transport", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(() => getResourceMetricsHistory({ ids: [], snapshotRevision: 42 })).toThrow(RangeError);
    expect(() => getResourceMetricsHistory({ ids: ["pod-1", "pod-1"], snapshotRevision: 42 }))
      .toThrow(TypeError);
    expect(() => getResourceMetricsHistory({ ids: ["pod-1"], snapshotRevision: 0 }))
      .toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(response({
      series: [{
        resource_id: "pod-1",
        cluster_id: "cluster-1",
        resource_type: "pod",
        namespace: "shop",
        name: "api-0",
        points: [{ observed_at: "2026-07-14T00:00:00Z", cpu_mcores: null, mem_mib: null }],
        has_sparkline_points: true,
        completeness: "partial",
        partial_reason_codes: ["sample_gap"],
      }],
      completeness: "partial",
      partial_reason_codes: ["sample_gap"],
      snapshot: SNAPSHOT,
    }));
    await expect(getResourceMetricsHistory({ ids: ["pod-1"], snapshotRevision: 42 }))
      .rejects.toThrow();
  });
});
