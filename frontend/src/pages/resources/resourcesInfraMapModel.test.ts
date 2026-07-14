import { describe, expect, it } from "vitest";

import type { PhysicalTopologySnapshot } from "../../features/resources/physicalTopologyContract";
import { buildInfraMapModel } from "./resourcesInfraMapModel";

describe("resources infra map model", () => {
  it("falls back to node pods when a selected non-Pod resource has no matched pods", () => {
    const model = buildInfraMapModel({
      maxPodsPerNode: 5,
      selectionActive: true,
      topology: snapshot({
        pods: [
          pod({ id: "pod:one", name: "pod-one", matchesFilter: false }),
          pod({ id: "pod:two", name: "pod-two", matchesFilter: false }),
        ],
      }),
    });

    expect(model.selection).toEqual({ active: true, matchedPodCount: 0 });
    expect(model.nodes[0]?.visiblePods.map((pod) => pod.name)).toEqual([
      "pod-one",
      "pod-two",
    ]);
  });

  it("prioritizes matched pods without hiding the rest of the node", () => {
    const model = buildInfraMapModel({
      maxPodsPerNode: 5,
      selectionActive: true,
      topology: snapshot({
        pods: [
          pod({ id: "pod:one", name: "pod-one", matchesFilter: true }),
          pod({ id: "pod:two", name: "pod-two", matchesFilter: false }),
        ],
      }),
    });

    expect(model.selection).toEqual({ active: true, matchedPodCount: 1 });
    expect(model.nodes[0]?.visiblePods.map((pod) => pod.name)).toEqual([
      "pod-one",
      "pod-two",
    ]);
    expect(model.nodes[0]?.visiblePods.map((pod) => pod.selected)).toEqual([
      true,
      false,
    ]);
  });

  it("summarizes pods after the first four by default", () => {
    const model = buildInfraMapModel({
      selectionActive: false,
      topology: snapshot({
        pods: [
          pod({ id: "pod:one", name: "pod-one" }),
          pod({ id: "pod:two", name: "pod-two" }),
          pod({ id: "pod:three", name: "pod-three" }),
          pod({ id: "pod:four", name: "pod-four" }),
          pod({ id: "pod:five", name: "pod-five" }),
        ],
      }),
    });

    expect(model.nodes[0]?.visiblePods.map((pod) => pod.name)).toHaveLength(4);
    expect(model.nodes[0]?.hiddenPodCount).toBe(1);
  });

  it("uses pod limits before requests when calculating pod capacity ratios", () => {
    const model = buildInfraMapModel({
      selectionActive: false,
      topology: snapshot({
        pods: [
          pod({
            cpuLimitMillicores: 1000,
            cpuMillicores: 50,
            cpuRequestMillicores: 100,
            id: "pod:api",
            memoryLimitMebibytes: 512,
            memoryMebibytes: 128,
            memoryRequestMebibytes: 64,
            name: "api-gateway",
          }),
        ],
      }),
    });

    const [apiPod] = model.nodes[0]?.visiblePods ?? [];

    expect(apiPod?.cpu.ratio).toBeCloseTo(0.05);
    expect(apiPod?.memory.ratio).toBeCloseTo(0.25);
  });
});

function snapshot({
  pods,
}: {
  pods: PhysicalTopologySnapshot["pods"];
}): PhysicalTopologySnapshot {
  return {
    clusterId: "cluster-a",
    clusterProjectionRevision: 1,
    counts: {
      filteredCount: pods.filter((pod) => pod.matchesFilter).length,
      filteredCountCompleteness: "exact",
      unfilteredCount: pods.length,
      unfilteredCountCompleteness: "exact",
    },
    metricsCompleteness: "partial",
    metricsObservedAt: null,
    partialReasonCodes: [],
    pods,
    projectionCompleteness: "exact",
    servers: [{
      allocatableCpuMillicores: null,
      allocatableMemoryMebibytes: null,
      cpuMillicores: null,
      cpuPercent: null,
      id: "node:worker-a",
      matchedPodCount: pods.filter((pod) => pod.matchesFilter).length,
      matchedPodCountCompleteness: "exact",
      memoryMebibytes: null,
      memoryPercent: null,
      name: "worker-a",
      podCapacity: 110,
      status: "Ready",
      totalPodCount: pods.length,
      totalPodCountCompleteness: "exact",
    }],
    snapshot: {
      authorizationRevision: "auth-1",
      filterFingerprint: "filter-1",
      observedAt: "2026-07-14T00:00:00Z",
      partialReasonCodes: [],
      snapshotRevision: 1,
      stale: false,
    },
    truncatedByServer: {},
    unassignedTruncatedCount: 0,
  };
}

function pod(
  overrides: Partial<PhysicalTopologySnapshot["pods"][number]>,
): PhysicalTopologySnapshot["pods"][number] {
  return {
    cpuLimitMillicores: null,
    cpuMillicores: null,
    cpuRequestMillicores: null,
    health: "healthy",
    id: "pod:default",
    matchesFilter: true,
    memoryLimitMebibytes: null,
    memoryMebibytes: null,
    memoryRequestMebibytes: null,
    name: "pod",
    namespace: "default",
    phase: "Running",
    restartCount: 0,
    serverId: "node:worker-a",
    usagePercent: null,
    ...overrides,
  };
}
