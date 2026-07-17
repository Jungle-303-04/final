import { describe, expect, it } from "vitest";

import {
  buildInfraMapNavigatorModel,
  infraMapNavigatorPodVisual,
} from "./resourcesInfraMapNavigatorModel";
import type { InfraMapModel, InfraMapPod } from "./resourcesInfraMapModel";

describe("resourcesInfraMapNavigatorModel", () => {
  it("uses the pods from the Infra Map model without adding synthetic dots", () => {
    const model = infraMapModel({
      hiddenPods: [
        pod({ id: "pod:hidden-a", name: "hidden-a" }),
        pod({ id: "pod:hidden-b", name: "hidden-b" }),
      ],
      visiblePods: [
        pod({ id: "pod:visible-a", name: "visible-a" }),
      ],
    });

    const navigator = buildInfraMapNavigatorModel(model, "cpu");
    const podIds = navigator.clusters
      .flatMap((cluster) => cluster.nodes)
      .flatMap((node) => node.pods)
      .map((navigatorPod) => navigatorPod.pod.id);

    expect(podIds).toHaveLength(3);
    expect(new Set(podIds)).toEqual(new Set(["pod:visible-a", "pod:hidden-a", "pod:hidden-b"]));
    expect(navigator.podCount).toBe(3);
  });

  it("scales pod dots from observed requests for the selected metric", () => {
    const model = infraMapModel({
      visiblePods: [
        pod({
          cpu: { request: 10, ratio: 0.2, value: 2 },
          id: "pod:small",
          memory: { request: 512, ratio: 0.2, value: 102.4 },
          name: "small",
        }),
        pod({
          cpu: { request: 500, ratio: 0.2, value: 100 },
          id: "pod:large",
          memory: { request: 512, ratio: 0.2, value: 102.4 },
          name: "large",
        }),
      ],
    });

    const navigator = buildInfraMapNavigatorModel(model, "cpu");
    const pods = navigator.clusters[0]?.nodes[0]?.pods ?? [];
    const small = pods.find((navigatorPod) => navigatorPod.pod.id === "pod:small");
    const large = pods.find((navigatorPod) => navigatorPod.pod.id === "pod:large");

    expect(small).toBeDefined();
    expect(large).toBeDefined();
    expect(large!.radius).toBeGreaterThan(small!.radius);
  });

  it("keeps healthy pods green when metric ratio is unavailable", () => {
    const visual = infraMapNavigatorPodVisual(
      pod({
        cpu: { request: null, ratio: null, value: 10 },
        health: "healthy",
        phase: "Running",
      }),
      "cpu",
    );

    expect(visual.fill).toContain("emerald");
    expect(visual.strokeDasharray).toBe("3 3");
  });
});

function infraMapModel({
  hiddenPods = [],
  visiblePods = [],
}: {
  hiddenPods?: InfraMapPod[];
  visiblePods?: InfraMapPod[];
}): InfraMapModel {
  return {
    clusters: [{
      criticalCount: 0,
      health: "healthy",
      id: "cluster-a",
      name: "Production",
      nodeCount: 1,
      podCount: visiblePods.length + hiddenPods.length,
      provider: "eks",
      warningCount: 0,
    }],
    nodes: [{
      assignedPodCount: visiblePods.length + hiddenPods.length,
      clusterId: "cluster-a",
      cpuMillicores: null,
      cpuRatio: null,
      health: "healthy",
      hiddenPodCount: hiddenPods.length,
      hiddenPods,
      id: "node:worker-a",
      memoryMebibytes: null,
      memoryRatio: null,
      name: "worker-a",
      podCapacity: 110,
      ready: true,
      unassigned: false,
      visiblePods,
    }],
    selection: {
      active: false,
      matchedPodCount: visiblePods.length + hiddenPods.length,
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
