import { describe, expect, it } from "vitest";

import type { ResourceMetricsHistoryBatch } from "../../features/resources/resourceMetricsHistoryContract";
import { mergeLiveResourceMetricSeries } from "./resourceMetricLiveSeries";

const BATCH: ResourceMetricsHistoryBatch = {
  refreshPolicyKey: "metrics_kubernetes",
  completeness: "partial",
  partialReasonCodes: ["inventory_projection_partial"],
  series: [{
    clusterId: "cluster-1",
    completeness: "partial",
    hasSparklinePoints: true,
    name: "api-0",
    namespace: "shop",
    partialReasonCodes: ["inventory_projection_partial"],
    points: [{
      observedAt: "2026-07-15T05:00:00.000Z",
      cpuMillicores: 100,
      memoryMebibytes: 128,
    }],
    resourceId: "pod-a",
    resourceType: "pod",
  }],
  snapshot: {
    snapshotRevision: 42,
    authorizationRevision: "auth",
    filterFingerprint: "filter",
    observedAt: "2026-07-15T05:00:00.000Z",
    stale: false,
    partialReasonCodes: [],
  },
};

describe("live resource metric series", () => {
  it("appends only measured stream samples in timestamp order without changing raw numbers", () => {
    const result = mergeLiveResourceMetricSeries(BATCH, [{
      resourceId: "pod-a",
      points: [
        {
          observedAt: "2026-07-15T05:00:02.000Z",
          cpuMillicores: 212.75,
          memoryMebibytes: 130.25,
        },
        {
          observedAt: "2026-07-15T05:00:01.000Z",
          cpuMillicores: 180.5,
          memoryMebibytes: 129.5,
        },
      ],
    }]);

    expect(result.series[0]?.points).toEqual([
      BATCH.series[0]!.points[0],
      {
        observedAt: "2026-07-15T05:00:01.000Z",
        cpuMillicores: 180.5,
        memoryMebibytes: 129.5,
      },
      {
        observedAt: "2026-07-15T05:00:02.000Z",
        cpuMillicores: 212.75,
        memoryMebibytes: 130.25,
      },
    ]);
    expect(BATCH.series[0]?.points).toHaveLength(1);
  });

  it("does not manufacture a series for a resource outside the verified response", () => {
    const result = mergeLiveResourceMetricSeries(BATCH, [{
      resourceId: "pod-other",
      points: [{
        observedAt: "2026-07-15T05:00:01.000Z",
        cpuMillicores: 999,
        memoryMebibytes: 999,
      }],
    }]);

    expect(result).toEqual(BATCH);
  });
});
