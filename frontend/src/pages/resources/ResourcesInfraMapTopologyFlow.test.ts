import { describe, expect, it, vi } from "vitest";

import { buildInfraTopologyFlowGraph } from "./resourcesInfraMapTopologyFlowGraph";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import type {
  InfraMapTopologyCluster,
  InfraMapTopologyNode,
} from "./resourcesInfraMapTopologyModel";
import {
  INFRA_MAP_TOPOLOGY_NODE_SIZE,
  INFRA_MAP_TOPOLOGY_POD_SIZE,
} from "./resourcesInfraMapTopologyLayout";

describe("ResourcesInfraMapTopologyFlow", () => {
  it("places servers around the cluster instead of on a tree row", () => {
    const graph = buildInfraTopologyFlowGraph(
      cluster({
        nodes: ["north", "east", "south", "west"].map((id) => topologyNode({ id })),
      }),
      "cpu",
      vi.fn(),
    );

    const serverNodes = graph.nodes.filter((node) => node.type === "infra-map-node");
    const xPositions = new Set(serverNodes.map((node) => Math.round(node.position.x)));
    const yPositions = new Set(serverNodes.map((node) => Math.round(node.position.y)));

    expect(serverNodes).toHaveLength(4);
    expect(xPositions.size).toBeGreaterThan(1);
    expect(yPositions.size).toBeGreaterThan(1);
    expect(graph.edges.every((edge) => edge.type === "straight")).toBe(true);
  });

  it("uses a horizontal node pair before falling back to polygon rings", () => {
    const graph = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({ id: "node-a" }),
          topologyNode({ id: "node-b" }),
        ],
      }),
      "cpu",
      vi.fn(),
    );

    const serverCenters = graph.nodes
      .filter((node) => node.type === "infra-map-node")
      .map((node) => nodeCenter(node));

    expect(serverCenters).toHaveLength(2);
    expect(Math.abs((serverCenters[0]?.y ?? 0) - (serverCenters[1]?.y ?? 0)))
      .toBeLessThanOrEqual(1);
    expect(Math.abs((serverCenters[0]?.x ?? 0) - (serverCenters[1]?.x ?? 0)))
      .toBeGreaterThan(100);
  });

  it("fans individual pods outward from their server and keeps replicas adjacent", () => {
    const graph = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({
            groups: [{
              evidence: "replicaGroup",
              key: "default/Deployment/api",
              kind: "Deployment",
              label: "Deployment / api",
              pods: [
                pod({ id: "pod:api-a", name: "api-a" }),
                pod({ id: "pod:api-b", name: "api-b" }),
              ],
            }],
            id: "node-a",
          }),
        ],
      }),
      "cpu",
      vi.fn(),
    );

    const serverNode = graph.nodes.find((node) => node.id === "node:node-a");
    const podNodes = graph.nodes.filter((node) => node.type === "infra-map-pod");
    const firstPodNode = graph.nodes.find((node) => node.id === "pod:pod:api-a");
    const secondPodNode = graph.nodes.find((node) => node.id === "pod:pod:api-b");
    const podEdges = graph.edges.filter((edge) =>
      edge.source === "node:node-a" && edge.target.startsWith("pod:")
    );

    expect(podNodes).toHaveLength(2);
    expect(graph.nodes.some((node) => String(node.type) === "infra-map-pod-group")).toBe(false);
    expect(firstPodNode?.position.x).toBeGreaterThan(serverNode?.position.x ?? 0);
    expect(secondPodNode?.position.x).toBeGreaterThan(serverNode?.position.x ?? 0);
    expect(Math.abs((firstPodNode?.position.y ?? 0) - (secondPodNode?.position.y ?? 0)))
      .toBeLessThanOrEqual(1);
    expect(podEdges).toHaveLength(2);
    expect(podEdges[0]).toMatchObject({
      sourceHandle: "source-right",
      targetHandle: "target-left",
      type: "straight",
    });
  });

  it("distributes pod groups around each server instead of one direction only", () => {
    const graph = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({
            groups: Array.from({ length: 6 }, (_, index) => ({
              evidence: "replicaGroup",
              key: `default/Deployment/app-${index}`,
              kind: "Deployment",
              label: `Deployment / app-${index}`,
              pods: [pod({ id: `pod:app-${index}`, name: `app-${index}` })],
            })),
            id: "node-a",
          }),
        ],
      }),
      "cpu",
      vi.fn(),
    );

    const serverNode = graph.nodes.find((node) => node.id === "node:node-a");
    expect(serverNode).toBeDefined();
    const serverCenter = {
      x: (serverNode?.position.x ?? 0) + 28,
      y: (serverNode?.position.y ?? 0) + 28,
    };
    const podCenters = graph.nodes
      .filter((node) => node.type === "infra-map-pod")
      .map((node) => {
        const size = Number(node.data.size);
        return {
          x: node.position.x + size / 2,
          y: node.position.y + size / 2,
        };
      });

    expect(podCenters.some((center) => center.x > serverCenter.x)).toBe(true);
    expect(podCenters.some((center) => center.x < serverCenter.x)).toBe(true);
    expect(podCenters.some((center) => center.y > serverCenter.y)).toBe(true);
    expect(podCenters.some((center) => center.y < serverCenter.y)).toBe(true);
  });

  it("keeps pod distance stable across health and pressure tones", () => {
    const graph = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({
            groups: [
              podGroup("healthy", [pod({
                cpu: { request: 100, ratio: 0.2, value: 20 },
                id: "healthy",
                name: "healthy",
              })]),
              podGroup("unknown", [pod({
                cpu: { request: null, ratio: null, value: null },
                id: "unknown",
                name: "unknown",
              })]),
              podGroup("warning-health", [pod({
                cpu: { request: null, ratio: null, value: null },
                health: "warning",
                id: "warning-health",
                name: "warning-health",
              })]),
              podGroup("warning", [pod({
                cpu: { request: 100, ratio: 0.85, value: 85 },
                id: "warning",
                name: "warning",
              })]),
              podGroup("danger", [pod({
                cpu: { request: 100, ratio: 1.1, value: 110 },
                id: "danger",
                name: "danger",
              })]),
              podGroup("critical", [pod({
                cpu: { request: null, ratio: null, value: null },
                health: "critical",
                id: "critical",
                name: "critical",
                phase: "CrashLoopBackOff",
              })]),
            ],
            id: "node-a",
          }),
        ],
      }),
      "cpu",
      vi.fn(),
    );

    const server = graph.nodes.find((node) => node.id === "node:node-a");
    expect(server).toBeDefined();
    const serverCenter = nodeCenter(server!);
    const distance = (podId: string) => {
      const podNode = graph.nodes.find((node) => node.id === `pod:${podId}`);
      expect(podNode).toBeDefined();
      return pointDistance(serverCenter, nodeCenter(podNode!));
    };

    const distances = [
      "healthy",
      "unknown",
      "warning-health",
      "warning",
      "danger",
      "critical",
    ].map((podId) => Math.round(distance(podId)));
    expect(new Set(distances).size).toBe(1);
  });

  it("uses dashed neutral edges when the selected metric cannot justify distance", () => {
    const graph = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({
            groups: [
              podGroup("known", [pod({
                cpu: { request: 100, ratio: 0.2, value: 20 },
                id: "known",
                name: "known",
              })]),
              podGroup("missing", [pod({
                cpu: { request: null, ratio: null, value: null },
                id: "missing",
                name: "missing",
              })]),
            ],
            id: "node-a",
          }),
        ],
      }),
      "cpu",
      vi.fn(),
    );

    const knownEdge = graph.edges.find((edge) => edge.target === "pod:known");
    const missingEdge = graph.edges.find((edge) => edge.target === "pod:missing");

    expect(knownEdge?.style?.strokeDasharray).toBeUndefined();
    expect(missingEdge?.style?.strokeDasharray).toBeTruthy();
    expect(String(missingEdge?.style?.stroke)).toContain("muted-foreground");
  });

  it("scales pod icons from observed requests for the selected metric", () => {
    const graph = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({
            groups: [ {
              evidence: "replicaGroup",
              key: "default/Deployment/api",
              kind: "Deployment",
              label: "Deployment / api",
              pods: [
                pod({
                  cpu: { request: 25, ratio: 0.2, value: 5 },
                  id: "pod:api-small",
                  memory: { request: 64, ratio: 0.2, value: 12.8 },
                  name: "api-small",
                }),
                pod({
                  cpu: { request: 400, ratio: 0.2, value: 80 },
                  id: "pod:api-large",
                  memory: { request: 64, ratio: 0.2, value: 12.8 },
                  name: "api-large",
                }),
              ],
            }],
            id: "node-a",
          }),
        ],
      }),
      "cpu",
      vi.fn(),
    );

    const smallPodNode = graph.nodes.find((node) => node.id === "pod:pod:api-small");
    const largePodNode = graph.nodes.find((node) => node.id === "pod:pod:api-large");

    expect(Number(largePodNode?.data.size)).toBeGreaterThan(Number(smallPodNode?.data.size));
  });

  it("keeps refit layout stable when only live metric values change", () => {
    const baseline = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({
            groups: [
              podGroup("api", [
                pod({
                  cpu: { request: 100, ratio: 0.2, value: 20 },
                  id: "pod:api",
                  name: "api",
                }),
              ]),
            ],
            id: "node-a",
          }),
        ],
      }),
      "cpu",
      vi.fn(),
    );
    const refreshed = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({
            groups: [
              podGroup("api", [
                pod({
                  cpu: { request: 100, ratio: 0.9, value: 90 },
                  health: "critical",
                  id: "pod:api",
                  name: "api",
                  phase: "CrashLoopBackOff",
                }),
              ]),
            ],
            id: "node-a",
          }),
        ],
      }),
      "cpu",
      vi.fn(),
    );

    expect(refreshed.layoutSignature).toBe(baseline.layoutSignature);
    expect(positionsById(refreshed)).toEqual(positionsById(baseline));
  });

  it("keeps refit layout stable when refresh only reorders groups or pods", () => {
    const baseline = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({
            groups: [
              podGroup("api", [
                pod({ id: "pod:api-a", name: "api-a" }),
                pod({ id: "pod:api-b", name: "api-b" }),
              ]),
              podGroup("worker", [
                pod({ id: "pod:worker-a", name: "worker-a" }),
              ]),
            ],
            id: "node-a",
          }),
          topologyNode({
            groups: [
              podGroup("gateway", [
                pod({ id: "pod:gateway-a", name: "gateway-a" }),
              ]),
            ],
            id: "node-b",
          }),
        ],
      }),
      "memory",
      vi.fn(),
    );
    const reordered = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({
            groups: [
              podGroup("gateway", [
                pod({ id: "pod:gateway-a", name: "gateway-a" }),
              ]),
            ],
            id: "node-b",
          }),
          topologyNode({
            groups: [
              podGroup("worker", [
                pod({ id: "pod:worker-a", name: "worker-a" }),
              ]),
              podGroup("api", [
                pod({ id: "pod:api-b", name: "api-b" }),
                pod({ id: "pod:api-a", name: "api-a" }),
              ]),
            ],
            id: "node-a",
          }),
        ],
      }),
      "memory",
      vi.fn(),
    );

    expect(reordered.layoutSignature).toBe(baseline.layoutSignature);
    expect(positionsById(reordered)).toEqual(positionsById(baseline));
  });

  it("does not invent pod icon scale when request data is missing", () => {
    const graph = buildInfraTopologyFlowGraph(
      cluster({
        nodes: [
          topologyNode({
            groups: [ {
              evidence: "replicaGroup",
              key: "default/Deployment/api",
              kind: "Deployment",
              label: "Deployment / api",
              pods: [
                pod({
                  cpu: { request: null, ratio: null, value: 5 },
                  id: "pod:api",
                  name: "api",
                }),
              ],
            }],
            id: "node-a",
          }),
        ],
      }),
      "cpu",
      vi.fn(),
    );

    const podNode = graph.nodes.find((node) => node.id === "pod:pod:api");

    expect(Number(podNode?.data.size)).toBe(INFRA_MAP_TOPOLOGY_POD_SIZE.base);
  });
});

function cluster(overrides: Partial<InfraMapTopologyCluster> = {}): InfraMapTopologyCluster {
  const nodes = overrides.nodes ?? [topologyNode()];
  return {
    criticalCount: 0,
    health: "healthy",
    id: "cluster-a",
    name: "Production",
    nodeCount: nodes.length,
    nodes,
    podCount: nodes.reduce((total, node) => total + node.podCount, 0),
    provider: "eks",
    warningCount: 0,
    ...overrides,
  };
}

function topologyNode(overrides: Partial<InfraMapTopologyNode> = {}): InfraMapTopologyNode {
  const groups = overrides.groups ?? [];
  return {
    clusterId: "cluster-a",
    cpuRatio: 0.1,
    groups,
    hiddenPodCount: 0,
    id: "node-a",
    memoryRatio: 0.2,
    name: "worker-a",
    podCapacity: 110,
    podCount: groups.reduce((total, group) => total + group.pods.length, 0),
    ready: true,
    unassigned: false,
    ...overrides,
  };
}

function podGroup(
  key: string,
  pods: InfraMapPod[],
): InfraMapTopologyNode["groups"][number] {
  return {
    evidence: "replicaGroup",
    key,
    kind: "Deployment",
    label: key,
    pods,
  };
}

function pod(overrides: Partial<InfraMapPod> = {}): InfraMapPod {
  return {
    clusterId: "cluster-a",
    cpu: { request: 100, ratio: 0.2, value: 20 },
    health: "healthy",
    id: "pod:default",
    memory: { request: 100, ratio: 0.2, value: 20 },
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
    usagePercent: 20,
    workloadKey: null,
    ...overrides,
  };
}

function nodeCenter(
  node: ReturnType<typeof buildInfraTopologyFlowGraph>["nodes"][number],
): { x: number; y: number } {
  if (node.type === "infra-map-cluster") {
    return {
      x: node.position.x + INFRA_MAP_TOPOLOGY_NODE_SIZE.cluster.width / 2,
      y: node.position.y + INFRA_MAP_TOPOLOGY_NODE_SIZE.cluster.height / 2,
    };
  }
  if (node.type === "infra-map-node") {
    return {
      x: node.position.x + INFRA_MAP_TOPOLOGY_NODE_SIZE.server.width / 2,
      y: node.position.y + INFRA_MAP_TOPOLOGY_NODE_SIZE.server.height / 2,
    };
  }
  const size = Number(node.data.size);
  return {
    x: node.position.x + size / 2,
    y: node.position.y + size / 2,
  };
}

function positionsById(
  graph: ReturnType<typeof buildInfraTopologyFlowGraph>,
): Record<string, { x: number; y: number }> {
  return Object.fromEntries(
    graph.nodes.map((node) => [
      node.id,
      {
        x: Math.round(node.position.x * 1000) / 1000,
        y: Math.round(node.position.y * 1000) / 1000,
      },
    ]),
  );
}

function pointDistance(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
