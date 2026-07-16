import { describe, expect, it } from "vitest";

import type { PhysicalTopologySnapshot } from "../../features/resources/physicalTopologyContract";
import { buildInfraMapModel } from "./resourcesInfraMapModel";

describe("resources infra map model", () => {
  it("hides node pods when a selected resource has no related pods", () => {
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
    expect(model.nodes[0]?.visiblePods).toEqual([]);
    expect(model.nodes[0]?.hiddenPods).toEqual([]);
    expect(model.nodes[0]?.hiddenPodCount).toBe(0);
  });

  it("shows only matched pods for a selected resource", () => {
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
    expect(model.nodes[0]?.visiblePods.map((pod) => pod.name)).toEqual(["pod-one"]);
    expect(model.nodes[0]?.visiblePods.map((pod) => pod.selected)).toEqual([true]);
  });

  it("uses explicit related pod ids when a concrete resource is selected", () => {
    const model = buildInfraMapModel({
      maxPodsPerNode: 5,
      selectedPodIds: new Set(["pod:two"]),
      selectionActive: true,
      topology: snapshot({
        pods: [
          pod({ id: "pod:one", name: "pod-one", matchesFilter: true }),
          pod({ id: "pod:two", name: "pod-two", matchesFilter: false }),
        ],
      }),
    });

    expect(model.selection).toEqual({ active: true, matchedPodCount: 1 });
    expect(model.nodes[0]?.visiblePods.map((pod) => pod.name)).toEqual(["pod-two"]);
    expect(model.nodes[0]?.visiblePods.map((pod) => pod.selected)).toEqual([true]);
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

    const visibleNames = model.nodes[0]?.visiblePods.map((pod) => pod.name) ?? [];
    const hiddenNames = model.nodes[0]?.hiddenPods.map((pod) => pod.name) ?? [];

    expect(visibleNames).toHaveLength(4);
    expect(hiddenNames).toHaveLength(1);
    expect([...visibleNames, ...hiddenNames].sort()).toEqual([
      "pod-five",
      "pod-four",
      "pod-one",
      "pod-three",
      "pod-two",
    ]);
    expect(model.nodes[0]?.hiddenPodCount).toBe(1);
  });

  it("uses pod requests when calculating pod capacity ratios", () => {
    const model = buildInfraMapModel({
      selectionActive: false,
      topology: snapshot({
        pods: [
          pod({
            cpuMillicores: 50,
            cpuRequestMillicores: 100,
            id: "pod:api",
            memoryMebibytes: 128,
            memoryRequestMebibytes: 256,
            name: "api-gateway",
          }),
        ],
      }),
    });

    const [apiPod] = model.nodes[0]?.visiblePods ?? [];

    expect(apiPod?.cpu.ratio).toBeCloseTo(0.5);
    expect(apiPod?.memory.ratio).toBeCloseTo(0.5);
  });

  it("keeps cluster and replica grouping evidence from the physical topology API", () => {
    const model = buildInfraMapModel({
      selectionActive: false,
      topology: snapshot({
        clusterName: "Production",
        clusterProvider: "eks",
        pods: [
          pod({
            id: "pod:shop/checkout-abc",
            name: "checkout-abc",
            ownerKind: "ReplicaSet",
            ownerName: "checkout-7dbf5b",
            ownerReferencesComplete: true,
            ownerUid: "rs-uid",
            replicaGroupKey: "shop/Deployment/checkout",
            replicaGroupKind: "Deployment",
            replicaGroupName: "checkout",
            replicaGroupUid: "deploy-uid",
            workloadKey: "shop/ReplicaSet/checkout-7dbf5b",
          }),
        ],
      }),
    });

    expect(model.clusters[0]).toMatchObject({
      id: "cluster-a",
      name: "Production",
      nodeCount: 1,
      podCount: 1,
      provider: "eks",
    });
    expect(model.nodes[0]?.visiblePods[0]).toMatchObject({
      clusterId: "cluster-a",
      ownerKind: "ReplicaSet",
      replicaGroupKey: "shop/Deployment/checkout",
      replicaGroupKind: "Deployment",
      replicaGroupName: "checkout",
      workloadKey: "shop/ReplicaSet/checkout-7dbf5b",
    });
  });

  it("prefers pods with calculable capacity ratios for the compact overview", () => {
    const model = buildInfraMapModel({
      maxPodsPerNode: 1,
      selectionActive: false,
      topology: snapshot({
        pods: [
          pod({
            cpuMillicores: 100,
            id: "pod:usage-only",
            memoryMebibytes: 256,
            name: "usage-only",
          }),
          pod({
            cpuMillicores: 10,
            cpuRequestMillicores: 1000,
            id: "pod:bounded",
            memoryMebibytes: 64,
            memoryRequestMebibytes: 512,
            name: "bounded",
          }),
        ],
      }),
    });

    expect(model.nodes[0]?.visiblePods.map((pod) => pod.name)).toEqual(["bounded"]);
    expect(model.nodes[0]?.hiddenPods.map((pod) => pod.name)).toEqual(["usage-only"]);
  });
});

function snapshot({
  clusterName,
  clusterProvider,
  pods,
}: {
  clusterName?: string | null;
  clusterProvider?: string | null;
  pods: PhysicalTopologySnapshot["pods"];
}): PhysicalTopologySnapshot {
  return {
    clusterId: "cluster-a",
    clusterName,
    clusterProvider,
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
    cpuMillicores: null,
    cpuRequestMillicores: null,
    health: "healthy",
    id: "pod:default",
    matchesFilter: true,
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
