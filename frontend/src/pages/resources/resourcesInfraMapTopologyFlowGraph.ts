import {
  Position,
  type Edge,
  type Node,
} from "@xyflow/react";

import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import { infraMapPodMetricRatio } from "./resourcesInfraMapPodOrdering";
import {
  infraMapPodRequestRange,
  infraMapPodSizeFromRequest,
  type InfraMapPodRequestRange,
} from "./resourcesInfraMapPodSizing";
import {
  INFRA_MAP_TOPOLOGY_HONEYCOMB_LAYOUT,
  INFRA_MAP_TOPOLOGY_NODE_SIZE,
  INFRA_MAP_TOPOLOGY_POD_SIZE,
  INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT,
  type TopologyPoint,
  type TopologySize,
  honeycombOffsets,
  polarPoint,
  positionFromCenter,
  topologyNodeAngles,
  topologyNodeRingRadius,
} from "./resourcesInfraMapTopologyLayout";
import {
  type InfraMapTopologyCluster,
  type InfraMapTopologyNode,
  type InfraMapTopologyPodGroup,
} from "./resourcesInfraMapTopologyModel";

export type InfraTopologyNode =
  | Node<ClusterNodeData, "infra-map-cluster">
  | Node<NodeNodeData, "infra-map-node">
  | Node<PodNodeData, "infra-map-pod">;

export interface ClusterNodeData extends Record<string, unknown> {
  cluster: InfraMapTopologyCluster;
}

export interface NodeNodeData extends Record<string, unknown> {
  node: InfraMapTopologyNode;
}

export interface PodNodeData extends Record<string, unknown> {
  group: InfraMapTopologyPodGroup;
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
  pod: InfraMapPod;
  size: number;
}

export interface TopologyBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export const HANDLE_POSITIONS = [
  Position.Top,
  Position.Right,
  Position.Bottom,
  Position.Left,
] as const;

const TOPOLOGY_EDGE_STROKE = "color-mix(in oklch, var(--muted-foreground) 58%, transparent)";
const TOPOLOGY_EDGE_STROKE_WEAK = "color-mix(in oklch, var(--muted-foreground) 38%, transparent)";
const TOPOLOGY_METRIC_INFERRED_EDGE_DASH = "5 7";
const TOPOLOGY_POD_GROUP_DISTANCE = INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.podDistanceHealthy;

export function buildInfraTopologyFlowGraph(
  cluster: InfraMapTopologyCluster,
  metricMode: InfraMapMetricMode,
  onOpenPod: (pod: InfraMapPod) => void,
): {
  bounds: TopologyBounds;
  edges: Edge[];
  layoutSignature: string;
  nodes: InfraTopologyNode[];
} {
  const nodes: InfraTopologyNode[] = [];
  const edges: Edge[] = [];
  const clusterId = `cluster:${cluster.id}`;
  const clusterCenter = { x: 0, y: 0 };
  const stableNodes = stableTopologyNodes(cluster.nodes);
  const stableCluster = { ...cluster, nodes: stableNodes };
  const nodeAngles = topologyNodeAngles(stableNodes.length);
  const nodePlans = stableNodes.map((node) => topologyNodeLayoutPlan(node, 0));
  const nodeRingRadius = topologyNodeRingRadius(
    stableNodes.length,
    nodePlans.map((plan) => plan.localRadius),
  );

  nodes.push({
    id: clusterId,
    position: positionFromCenter(clusterCenter, INFRA_MAP_TOPOLOGY_NODE_SIZE.cluster),
    type: "infra-map-cluster",
    data: { cluster: stableCluster },
  });

  stableNodes.forEach((node, nodeIndex) => {
    const nodeId = `node:${node.id}`;
    const nodeAngle = nodeAngles[nodeIndex]!;
    const nodePlan = topologyNodeLayoutPlan(node, nodeAngle);
    const nodeCenter = polarPoint(clusterCenter, nodeAngle, nodeRingRadius);
    nodes.push({
      id: nodeId,
      position: positionFromCenter(nodeCenter, INFRA_MAP_TOPOLOGY_NODE_SIZE.server),
      type: "infra-map-node",
      data: { node },
    });
    edges.push(topologyEdge({
      id: `edge:${clusterId}:${nodeId}`,
      source: clusterId,
      sourceAngle: nodeAngle,
      target: nodeId,
      targetAngle: nodeAngle + Math.PI,
    }));

    const requestRange = infraMapPodRequestRange(
      node.groups.flatMap((group) => group.pods),
      metricMode,
    );
    node.groups.forEach((group, groupIndex) => {
      const groupPlacement = nodePlan.groupPlacements[groupIndex] ?? {
        angle: nodeAngle,
        center: polarPoint(
          { x: 0, y: 0 },
          nodeAngle,
          TOPOLOGY_POD_GROUP_DISTANCE,
        ),
      };
      const podOffsets = honeycombOffsets(group.pods.length, {
        ...INFRA_MAP_TOPOLOGY_HONEYCOMB_LAYOUT,
      });
      group.pods.forEach((pod, podIndex) => {
        const podOffset = podOffsets[podIndex] ?? { x: 0, y: 0 };
        const podSize = topologyPodVisualSize(pod, metricMode, requestRange);
        const podNodeSize = { height: podSize, width: podSize };
        const podCenter = {
          x: nodeCenter.x + groupPlacement.center.x + podOffset.x,
          y: nodeCenter.y + groupPlacement.center.y + podOffset.y,
        };
        const podId = `pod:${pod.id}`;
        nodes.push({
          id: podId,
          position: positionFromCenter(podCenter, podNodeSize),
          type: "infra-map-pod",
          data: { group, metricMode, onOpenPod, pod, size: podSize },
        });
        edges.push(topologyEdge({
          dashed: !hasMetricDistanceEvidence(pod, metricMode),
          id: `edge:${nodeId}:${podId}`,
          source: nodeId,
          sourceAngle: groupPlacement.angle,
          target: podId,
          targetAngle: groupPlacement.angle + Math.PI,
        }));
      });
    });
  });

  return {
    bounds: topologyBounds(nodes),
    edges,
    layoutSignature: topologyLayoutSignature(stableCluster, metricMode),
    nodes,
  };
}

function stableTopologyNodes(
  nodes: readonly InfraMapTopologyNode[],
): InfraMapTopologyNode[] {
  return nodes
    .map((node) => ({
      ...node,
      groups: stableTopologyPodGroups(node.groups),
    }))
    .sort(compareTopologyNodes);
}

function stableTopologyPodGroups(
  groups: readonly InfraMapTopologyPodGroup[],
): InfraMapTopologyPodGroup[] {
  return groups
    .map((group) => ({
      ...group,
      pods: stableTopologyPods(group.pods),
    }))
    .sort(compareTopologyPodGroups);
}

function stableTopologyPods(pods: readonly InfraMapPod[]): InfraMapPod[] {
  return [...pods].sort(compareTopologyPods);
}

function compareTopologyNodes(
  left: InfraMapTopologyNode,
  right: InfraMapTopologyNode,
): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function compareTopologyPodGroups(
  left: InfraMapTopologyPodGroup,
  right: InfraMapTopologyPodGroup,
): number {
  return left.label.localeCompare(right.label) || left.key.localeCompare(right.key);
}

function compareTopologyPods(left: InfraMapPod, right: InfraMapPod): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

interface TopologyNodeLayoutPlan {
  groupPlacements: TopologyPodGroupPlacement[];
  localRadius: number;
}

interface TopologyPodGroupPlacement {
  angle: number;
  center: TopologyPoint;
  localRadius: number;
}

function topologyNodeLayoutPlan(
  node: InfraMapTopologyNode,
  nodeAngle: number,
): TopologyNodeLayoutPlan {
  const groupPlacements: TopologyPodGroupPlacement[] = [];
  let localRadius = INFRA_MAP_TOPOLOGY_NODE_SIZE.server.width / 2;
  let placedCount = 0;
  for (
    let ringIndex = 0;
    placedCount < node.groups.length;
    ringIndex += 1
  ) {
    const countInRing = Math.min(
      INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.podGroupsPerRing + ringIndex * 2,
      node.groups.length - placedCount,
    );
    const ringAngleOffset = countInRing === 1
      ? nodeAngle
      : nodeAngle + (ringIndex % 2 === 1 ? Math.PI / countInRing : 0);
    for (let indexInRing = 0; indexInRing < countInRing; indexInRing += 1) {
      const group = node.groups[placedCount + indexInRing];
      if (!group) continue;
      const angle = ringAngleOffset + (Math.PI * 2 * indexInRing) / countInRing;
      const groupRadius = TOPOLOGY_POD_GROUP_DISTANCE +
        ringIndex * INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.podGroupRadiusGap;
      const footprintRadius = topologyPodGroupFootprintRadius(group);
      const groupLocalRadius = groupRadius + footprintRadius;
      groupPlacements.push({
        angle,
        center: polarPoint({ x: 0, y: 0 }, angle, groupRadius),
        localRadius: groupLocalRadius,
      });
      localRadius = Math.max(localRadius, groupLocalRadius);
    }
    placedCount += countInRing;
  }
  return { groupPlacements, localRadius };
}

function topologyPodGroupFootprintRadius(group: InfraMapTopologyPodGroup): number {
  const offsets = honeycombOffsets(group.pods.length, {
    ...INFRA_MAP_TOPOLOGY_HONEYCOMB_LAYOUT,
  });
  if (offsets.length === 0) return 0;
  return Math.max(
    ...offsets.map((offset) => Math.hypot(offset.x, offset.y)),
  ) + INFRA_MAP_TOPOLOGY_POD_SIZE.max / 2;
}

function topologyBounds(nodes: readonly InfraTopologyNode[]): TopologyBounds {
  if (nodes.length === 0) return { height: 1, width: 1, x: 0, y: 0 };
  const bounds = nodes.reduce(
    (current, node) => {
      const size = topologyNodeSize(node);
      return {
        maxX: Math.max(current.maxX, node.position.x + size.width),
        maxY: Math.max(current.maxY, node.position.y + size.height),
        minX: Math.min(current.minX, node.position.x),
        minY: Math.min(current.minY, node.position.y),
      };
    },
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
    },
  );
  return {
    height: Math.max(1, bounds.maxY - bounds.minY),
    width: Math.max(1, bounds.maxX - bounds.minX),
    x: bounds.minX,
    y: bounds.minY,
  };
}

export function topologyNodeSize(node: InfraTopologyNode): TopologySize {
  if (node.type === "infra-map-cluster") return INFRA_MAP_TOPOLOGY_NODE_SIZE.cluster;
  if (node.type === "infra-map-node") return INFRA_MAP_TOPOLOGY_NODE_SIZE.server;
  return { height: node.data.size, width: node.data.size };
}

function topologyPodVisualSize(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
  requestRange: InfraMapPodRequestRange | null,
): number {
  return infraMapPodSizeFromRequest(pod, metricMode, requestRange, INFRA_MAP_TOPOLOGY_POD_SIZE);
}

export function topologyNodeCenter(node: InfraTopologyNode): TopologyPoint {
  const size = topologyNodeSize(node);
  return {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  };
}

export function hexagonPoints(center: TopologyPoint, radius: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI / 3);
    return `${center.x + Math.cos(angle) * radius},${center.y + Math.sin(angle) * radius}`;
  }).join(" ");
}

function hasMetricDistanceEvidence(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
): boolean {
  return infraMapPodMetricRatio(pod, metricMode) !== null;
}

function topologyEdge({
  dashed = false,
  id,
  source,
  sourceAngle,
  target,
  targetAngle,
}: {
  dashed?: boolean;
  id: string;
  source: string;
  sourceAngle: number;
  target: string;
  targetAngle: number;
}): Edge {
  return {
    id,
    source,
    sourceHandle: handleId("source", positionForAngle(sourceAngle)),
    style: {
      stroke: dashed ? TOPOLOGY_EDGE_STROKE_WEAK : TOPOLOGY_EDGE_STROKE,
      strokeDasharray: dashed ? TOPOLOGY_METRIC_INFERRED_EDGE_DASH : undefined,
      strokeWidth: dashed ? 1.2 : 1.6,
    },
    target,
    targetHandle: handleId("target", positionForAngle(targetAngle)),
    type: "straight",
  };
}

function positionForAngle(angle: number): typeof HANDLE_POSITIONS[number] {
  const normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (normalized >= -Math.PI / 4 && normalized < Math.PI / 4) return Position.Right;
  if (normalized >= Math.PI / 4 && normalized < (Math.PI * 3) / 4) return Position.Bottom;
  if (normalized < -Math.PI / 4 && normalized >= (-Math.PI * 3) / 4) return Position.Top;
  return Position.Left;
}

export function handleId(
  type: "source" | "target",
  position: typeof HANDLE_POSITIONS[number],
): string {
  return `${type}-${position}`;
}

function topologyLayoutSignature(
  cluster: InfraMapTopologyCluster,
  metricMode: InfraMapMetricMode,
): string {
  return [
    cluster.id,
    metricMode,
    stableTopologyNodeSignature(cluster.nodes),
  ].join(":");
}

function stableTopologyNodeSignature(nodes: readonly InfraMapTopologyNode[]): string {
  return nodes
    .map((node) =>
      `${node.id}:${node.groups
        .map((group) => `${group.key}[${group.pods.map((pod) => pod.id).sort().join(",")}]`)
        .sort()
        .join(",")}`
    )
    .sort()
    .join("|");
}
