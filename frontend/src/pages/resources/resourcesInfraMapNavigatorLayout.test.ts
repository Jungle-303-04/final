import { describe, expect, it } from "vitest";

import {
  buildNavigatorHexLayout,
  NAVIGATOR_CANVAS_WIDTH,
} from "./resourcesInfraMapNavigatorLayout";
import type {
  InfraMapNavigatorCluster,
  InfraMapNavigatorModel,
  InfraMapNavigatorNode,
  InfraMapNavigatorPod,
} from "./resourcesInfraMapNavigatorModel";
import type { InfraMapClusterSummary, InfraMapNode, InfraMapPod } from "./resourcesInfraMapModel";

describe("resourcesInfraMapNavigatorLayout", () => {
  it("creates one hex for each navigator pod without synthetic markers", () => {
    const navigator = navigatorModel({ podCount: 9 });

    const layout = buildNavigatorHexLayout(navigator);
    const hexes = layout.clusters.flatMap((cluster) =>
      cluster.nodes.flatMap((node) => node.hexes)
    );

    expect(layout.width).toBe(NAVIGATOR_CANVAS_WIDTH);
    expect(hexes).toHaveLength(9);
    expect(new Set(hexes.map((hex) => hex.pod.pod.id)).size).toBe(9);
  });

  it("keeps dense pod groups clustered across rows instead of one long row", () => {
    const navigator = navigatorModel({ podCount: 25 });

    const nodeLayout = buildNavigatorHexLayout(navigator).clusters[0]?.nodes[0];
    const yPositions = new Set(nodeLayout?.hexes.map((hex) => hex.center.y));

    expect(yPositions.size).toBeGreaterThan(1);
  });

  it("uses one row height for sibling node racks in the same cluster", () => {
    const densePods = Array.from({ length: 40 }, (_, index) => navigatorPod(index));
    const sparsePods = Array.from({ length: 6 }, (_, index) => navigatorPod(index + 100));
    const navigator: InfraMapNavigatorModel = {
      clusters: [{
        cluster: infraMapCluster({ podCount: densePods.length + sparsePods.length }),
        nodes: [
          { node: infraMapNode({ id: "node:dense", pods: densePods }), pods: densePods },
          { node: infraMapNode({ id: "node:sparse", pods: sparsePods }), pods: sparsePods },
        ],
      }],
      podCount: densePods.length + sparsePods.length,
    };

    const nodeLayouts = buildNavigatorHexLayout(navigator).clusters[0]?.nodes;

    expect(nodeLayouts).toHaveLength(2);
    expect(nodeLayouts?.[0]?.rowHeight).toBe(nodeLayouts?.[1]?.rowHeight);
  });
});

function navigatorModel({ podCount }: { podCount: number }): InfraMapNavigatorModel {
  const pods = Array.from({ length: podCount }, (_, index) => navigatorPod(index));
  const node: InfraMapNavigatorNode = {
    node: infraMapNode({ pods }),
    pods,
  };
  const cluster: InfraMapNavigatorCluster = {
    cluster: infraMapCluster({ podCount }),
    nodes: [node],
  };
  return {
    clusters: [cluster],
    podCount,
  };
}

function navigatorPod(index: number): InfraMapNavigatorPod {
  return {
    healthTone: "healthy",
    pod: infraMapPod(index),
    pressureTone: "healthy",
    radius: 5 + index,
    ratio: 0.1,
  };
}

function infraMapPod(index: number): InfraMapPod {
  return {
    clusterId: "cluster:test",
    cpu: { request: 100, ratio: 0.1, value: 10 },
    health: "healthy",
    id: `pod:${index}`,
    memory: { request: 100, ratio: 0.1, value: 10 },
    name: `pod-${index}`,
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
  };
}

function infraMapNode({
  id = "node:test",
  pods,
}: {
  id?: string;
  pods: InfraMapNavigatorPod[];
}): InfraMapNode {
  return {
    assignedPodCount: pods.length,
    clusterId: "cluster:test",
    cpuMillicores: null,
    cpuRatio: null,
    health: "healthy",
    hiddenPodCount: 0,
    hiddenPods: [],
    id,
    memoryMebibytes: null,
    memoryRatio: null,
    name: id,
    podCapacity: null,
    ready: true,
    unassigned: false,
    visiblePods: pods.map((pod) => pod.pod),
  };
}

function infraMapCluster({ podCount }: { podCount: number }): InfraMapClusterSummary {
  return {
    criticalCount: 0,
    health: "healthy",
    id: "cluster:test",
    name: "Test Cluster",
    nodeCount: 1,
    podCount,
    provider: null,
    warningCount: 0,
  };
}
