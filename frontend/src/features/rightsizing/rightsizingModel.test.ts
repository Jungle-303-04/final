import { describe, expect, it } from "vitest";

import {
  filterRightsizingRows,
  flattenRightsizingScans,
  groupRightsizingRows,
  rightsizingClassCounts,
} from "./rightsizingModel";
import type {
  RightsizingMetric,
  RightsizingObservedWorkload,
  RightsizingScan,
} from "./rightsizingContract";

const metric = (container: string, resource: "cpu" | "memory"): RightsizingMetric => ({
  container,
  resource,
  fit: "balanced",
  action: "in_range",
  confidence: "high",
  currentRequest: null,
  observedDemand: null,
  recommendedRequest: null,
  sampleCount: 10,
  expectedSamples: 10,
  coverageBasisPoints: 10_000,
  signals: [],
  reasonCodes: [],
});

describe("rightsizing view model", () => {
  it("groups server-classified rows without calculating impact or action", () => {
    const groups = groupRightsizingRows([
      metric("api", "cpu"),
      metric("sidecar", "cpu"),
      metric("api", "memory"),
    ]);

    expect(groups.map((group) => group.container)).toEqual(["api", "sidecar"]);
    expect(groups[0]?.rows.map((row) => row.resource)).toEqual(["cpu", "memory"]);
    expect(groups[0]?.rows[0]?.action).toBe("in_range");
  });

  it("flattens server classifications and filters without deriving actions", () => {
    const rows = flattenRightsizingScans([scan([
      workload("shop", "api", "increase"),
      workload("platform", "worker", "in_range"),
    ])]);

    expect(rightsizingClassCounts(rows)).toEqual({
      increase: 2,
      reduction: 0,
      review: 0,
      in_range: 2,
      need_data: 0,
    });
    expect(filterRightsizingRows(rows, {
      classification: "actions",
      kind: "",
      namespace: "shop",
      query: "api",
    }).map((row) => row.container)).toEqual(["api", "sidecar"]);
  });
});

function scan(workloads: readonly RightsizingObservedWorkload[]): RightsizingScan {
  return {
    scope: {
      workspaceId: "workspace-a",
      clusterId: "cluster-a",
      namespaces: [],
      freshness: "live",
    },
    namespaceScope: [],
    result: {
      availability: "available",
      observedAt: "2026-07-16T09:00:00Z",
      provenance: {
        collector: "collector",
        algorithmRevision: "algorithm",
        sourceRevision: "source",
        windowStartedAt: "2026-07-09T09:00:00Z",
        windowEndedAt: "2026-07-16T09:00:00Z",
        sampleIntervalSeconds: 60,
      },
      coverage: {
        workloadsDiscovered: workloads.length,
        workloadsEvaluated: workloads.length,
        workloadsWithData: workloads.length,
        truncated: false,
      },
      workloads,
      failures: [],
      reasonCodes: [],
    },
    refreshAfterSeconds: 600,
  };
}

function workload(
  namespace: string,
  name: string,
  classification: RightsizingObservedWorkload["classification"],
): RightsizingObservedWorkload {
  return {
    availability: "available",
    resource: {
      apiGroup: "apps",
      version: "v1",
      kind: "Deployment",
      namespace,
      name,
      uid: `uid-${name}`,
    },
    observedAt: "2026-07-16T09:00:00Z",
    freshness: "live",
    provenance: {
      collector: "collector",
      algorithmRevision: "algorithm",
      sourceRevision: "source",
      windowStartedAt: "2026-07-09T09:00:00Z",
      windowEndedAt: "2026-07-16T09:00:00Z",
      sampleIntervalSeconds: 60,
    },
    replicas: 2,
    scaledToZero: false,
    classification,
    impact: {
      replicas: 2,
      cpuMillicoresChange: 100,
      memoryBytesChange: 0,
    },
    rows: [metric("api", "cpu"), metric("sidecar", "memory")],
    reasonCodes: [],
  };
}
