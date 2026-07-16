import { describe, expect, it } from "vitest";

import type { InfraMapModel, InfraMapPod } from "./resourcesInfraMapModel";
import { buildInfraMapTopologyModel } from "./resourcesInfraMapTopologyModel";

describe("resources infra map topology model", () => {
  it("groups pods only by explicit replica group evidence", () => {
    const model = infraMapModel([
      pod({
        id: "pod:api-a",
        name: "api-gateway-7dbf5b-a",
        replicaGroupKey: "default/Deployment/api-gateway",
        replicaGroupKind: "Deployment",
        replicaGroupName: "api-gateway",
      }),
      pod({
        id: "pod:api-b",
        name: "api-gateway-7dbf5b-b",
        replicaGroupKey: "default/Deployment/api-gateway",
        replicaGroupKind: "Deployment",
        replicaGroupName: "api-gateway",
      }),
      pod({
        id: "pod:api-c",
        name: "api-gateway-looks-related",
      }),
    ]);

    const topology = buildInfraMapTopologyModel(model, "cpu");
    const groups = topology.clusters[0]?.nodes[0]?.groups ?? [];

    expect(groups).toHaveLength(2);
    expect(groups[0]?.label).toBe("Deployment · api-gateway");
    expect(groups[0]?.pods.map((item) => item.id).sort()).toEqual([
      "pod:api-a",
      "pod:api-b",
    ]);
    expect(groups[1]).toMatchObject({
      key: "singleton:pod:api-c",
      label: "api-gateway-looks-related",
    });
  });

  it("keeps problem pods before high-usage healthy pods", () => {
    const model = infraMapModel([
      pod({
        cpu: { request: 100, ratio: 1.2, value: 120 },
        id: "pod:healthy-hot",
        name: "healthy-hot",
      }),
      pod({
        cpu: { request: 100, ratio: 0.1, value: 10 },
        health: "critical",
        id: "pod:failed",
        name: "failed",
        phase: "CrashLoopBackOff",
      }),
    ]);

    const topology = buildInfraMapTopologyModel(model, "cpu");
    expect(topology.clusters[0]?.nodes[0]?.groups.map((group) => group.label)).toEqual([
      "failed",
      "healthy-hot",
    ]);
  });
});

function infraMapModel(pods: InfraMapPod[]): InfraMapModel {
  return {
    clusters: [{
      criticalCount: pods.filter((podValue) => podValue.health === "critical").length,
      health: pods.some((podValue) => podValue.health === "critical")
        ? "critical"
        : "healthy",
      id: "cluster-a",
      name: "Production",
      nodeCount: 1,
      podCount: pods.length,
      provider: "eks",
      warningCount: 0,
    }],
    nodes: [{
      assignedPodCount: pods.length,
      clusterId: "cluster-a",
      cpuMillicores: null,
      cpuRatio: null,
      health: "healthy",
      hiddenPodCount: 0,
      hiddenPods: [],
      id: "node:worker-a",
      memoryMebibytes: null,
      memoryRatio: null,
      name: "worker-a",
      podCapacity: 110,
      ready: true,
      unassigned: false,
      visiblePods: pods,
    }],
    selection: {
      active: false,
      matchedPodCount: pods.length,
    },
  };
}

function pod(overrides: Partial<InfraMapPod>): InfraMapPod {
  return {
    clusterId: "cluster-a",
    cpu: { request: 100, ratio: 0.1, value: 10 },
    health: "healthy",
    id: "pod:default",
    memory: { request: 100, ratio: 0.1, value: 10 },
    name: "default",
    namespace: "default",
    ownerKind: null,
    ownerName: null,
    ownerReferencesComplete: null,
    ownerUid: null,
    phase: "Running",
    replicaGroupKey: null,
    replicaGroupKind: null,
    replicaGroupName: null,
    replicaGroupUid: null,
    restartCount: 0,
    selected: false,
    usagePercent: 10,
    workloadKey: null,
    ...overrides,
  };
}
