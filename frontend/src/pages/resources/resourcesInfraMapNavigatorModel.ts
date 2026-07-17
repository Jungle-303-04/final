import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type {
  InfraMapClusterSummary,
  InfraMapModel,
  InfraMapNode,
  InfraMapPod,
} from "./resourcesInfraMapModel";
import {
  infraMapPodMetricRatio,
  orderInfraMapPodsForMetric,
} from "./resourcesInfraMapPodOrdering";
import {
  podHealthTone,
  podResourcePressureTone,
  podUsageColorFromRatio,
  type PodHealthTone,
  type PodResourcePressureTone,
} from "./podVisualState";

export interface NavigatorPoint {
  x: number;
  y: number;
}

export interface InfraMapNavigatorPod {
  healthTone: PodHealthTone;
  pod: InfraMapPod;
  position: NavigatorPoint;
  pressureTone: PodResourcePressureTone;
  radius: number;
  ratio: number | null;
}

export interface InfraMapNavigatorNode {
  angle: number;
  node: InfraMapNode;
  pods: InfraMapNavigatorPod[];
  position: NavigatorPoint;
}

export interface InfraMapNavigatorCluster {
  cluster: InfraMapClusterSummary;
  nodes: InfraMapNavigatorNode[];
  position: NavigatorPoint;
}

export interface InfraMapNavigatorModel {
  clusters: InfraMapNavigatorCluster[];
  height: number;
  podCount: number;
  width: number;
}

export interface InfraMapNavigatorPodVisual {
  fill: string;
  stroke: string;
  strokeDasharray?: string;
}

const NAVIGATOR_VIEWBOX = {
  height: 560,
  width: 980,
} as const;

const NAVIGATOR_CLUSTER_RING_RADIUS = 150;
const NAVIGATOR_NODE_RING_RADIUS = 190;
const NAVIGATOR_NODE_RING_RADIUS_MULTI_CLUSTER = 116;
const NAVIGATOR_POD_CLUSTER_OFFSET = 54;
const NAVIGATOR_POD_GAP = 17;
const NAVIGATOR_POD_RADIUS_MIN = 4.5;
const NAVIGATOR_POD_RADIUS_MAX = 9.5;
const NAVIGATOR_NODE_START_ANGLE = -Math.PI / 2;
const NAVIGATOR_REQUEST_RANGE_FALLBACK = 1;

export function buildInfraMapNavigatorModel(
  model: InfraMapModel,
  metricMode: InfraMapMetricMode,
): InfraMapNavigatorModel {
  const clusters = model.clusters.map((cluster, clusterIndex) => {
    const clusterPosition = navigatorClusterPosition(clusterIndex, model.clusters.length);
    const clusterNodes = model.nodes.filter((node) => node.clusterId === cluster.id);
    const requestRange = navigatorPodRequestRange(clusterNodes, metricMode);
    const nodeRadius = model.clusters.length > 1
      ? NAVIGATOR_NODE_RING_RADIUS_MULTI_CLUSTER
      : NAVIGATOR_NODE_RING_RADIUS;
    return {
      cluster,
      nodes: clusterNodes.map((node, nodeIndex) =>
        navigatorNode(node, nodeIndex, clusterNodes.length, clusterPosition, nodeRadius, metricMode, requestRange)
      ),
      position: clusterPosition,
    } satisfies InfraMapNavigatorCluster;
  });

  return {
    clusters,
    height: NAVIGATOR_VIEWBOX.height,
    podCount: clusters.reduce((total, cluster) =>
      total + cluster.nodes.reduce((nodeTotal, node) => nodeTotal + node.pods.length, 0),
      0,
    ),
    width: NAVIGATOR_VIEWBOX.width,
  };
}

export function infraMapNavigatorPodVisual(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
): InfraMapNavigatorPodVisual {
  const ratio = infraMapPodMetricRatio(pod, metricMode);
  const healthTone = podHealthTone(pod);
  const pressureTone = podResourcePressureTone(ratio);
  const fill = navigatorPodFill({ healthTone, pressureTone, ratio });
  const critical = healthTone === "critical";
  return {
    fill,
    stroke: critical
      ? "var(--destructive)"
      : pressureTone === "unknown"
      ? navigatorUnknownPodStroke(healthTone)
      : fill,
    strokeDasharray: pressureTone === "unknown" ? "3 3" : undefined,
  };
}

function navigatorNode(
  node: InfraMapNode,
  nodeIndex: number,
  nodeCount: number,
  clusterPosition: NavigatorPoint,
  nodeRadius: number,
  metricMode: InfraMapMetricMode,
  requestRange: NavigatorRequestRange,
): InfraMapNavigatorNode {
  const angle = navigatorNodeAngle(nodeIndex, nodeCount);
  const position = polarPoint(clusterPosition, angle, nodeRadius);
  const pods = orderInfraMapPodsForMetric([...node.visiblePods, ...node.hiddenPods], metricMode)
    .map((pod, podIndex, orderedPods) => {
      const ratio = infraMapPodMetricRatio(pod, metricMode);
      return {
        healthTone: podHealthTone(pod),
        pod,
        position: navigatorPodPosition(position, angle, podIndex, orderedPods.length),
        pressureTone: podResourcePressureTone(ratio),
        radius: navigatorPodRadius(pod, metricMode, requestRange),
        ratio,
      } satisfies InfraMapNavigatorPod;
    });

  return {
    angle,
    node,
    pods,
    position,
  };
}

function navigatorClusterPosition(index: number, count: number): NavigatorPoint {
  const center = {
    x: NAVIGATOR_VIEWBOX.width / 2,
    y: NAVIGATOR_VIEWBOX.height / 2,
  };
  if (count <= 1) return center;
  return polarPoint(center, navigatorNodeAngle(index, count), NAVIGATOR_CLUSTER_RING_RADIUS);
}

function navigatorNodeAngle(index: number, count: number): number {
  if (count <= 1) return 0;
  return NAVIGATOR_NODE_START_ANGLE + (Math.PI * 2 * index) / count;
}

function navigatorPodPosition(
  nodePosition: NavigatorPoint,
  nodeAngle: number,
  podIndex: number,
  podCount: number,
): NavigatorPoint {
  const columns = Math.max(1, Math.ceil(Math.sqrt(podCount)));
  const rows = Math.max(1, Math.ceil(podCount / columns));
  const row = Math.floor(podIndex / columns);
  const column = podIndex % columns;
  const radialDistance = NAVIGATOR_POD_CLUSTER_OFFSET + row * NAVIGATOR_POD_GAP;
  const tangentOffset = (column - (columns - 1) / 2) * NAVIGATOR_POD_GAP;
  const radial = {
    x: Math.cos(nodeAngle),
    y: Math.sin(nodeAngle),
  };
  const tangent = {
    x: -Math.sin(nodeAngle),
    y: Math.cos(nodeAngle),
  };
  const rowBalance = (row - (rows - 1) / 2) * NAVIGATOR_POD_GAP * 0.2;
  return {
    x: nodePosition.x + radial.x * radialDistance + tangent.x * tangentOffset,
    y: nodePosition.y + radial.y * radialDistance + tangent.y * (tangentOffset + rowBalance),
  };
}

function polarPoint(origin: NavigatorPoint, angle: number, radius: number): NavigatorPoint {
  return {
    x: origin.x + Math.cos(angle) * radius,
    y: origin.y + Math.sin(angle) * radius,
  };
}

interface NavigatorRequestRange {
  max: number;
  min: number;
}

function navigatorPodRequestRange(
  nodes: readonly InfraMapNode[],
  metricMode: InfraMapMetricMode,
): NavigatorRequestRange {
  const requests = nodes
    .flatMap((node) => [...node.visiblePods, ...node.hiddenPods])
    .map((pod) => metricMode === "cpu" ? pod.cpu.request : pod.memory.request)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  if (requests.length === 0) {
    return { max: NAVIGATOR_REQUEST_RANGE_FALLBACK, min: NAVIGATOR_REQUEST_RANGE_FALLBACK };
  }
  return {
    max: Math.max(...requests),
    min: Math.min(...requests),
  };
}

function navigatorPodRadius(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
  range: NavigatorRequestRange,
): number {
  const request = metricMode === "cpu" ? pod.cpu.request : pod.memory.request;
  if (request === null || !Number.isFinite(request) || request <= 0) {
    return NAVIGATOR_POD_RADIUS_MIN;
  }
  const spread = Math.max(NAVIGATOR_REQUEST_RANGE_FALLBACK, range.max - range.min);
  const weight = Math.max(0, Math.min(1, (request - range.min) / spread));
  return NAVIGATOR_POD_RADIUS_MIN +
    (NAVIGATOR_POD_RADIUS_MAX - NAVIGATOR_POD_RADIUS_MIN) * weight;
}

function navigatorPodFill({
  healthTone,
  pressureTone,
  ratio,
}: {
  healthTone: PodHealthTone;
  pressureTone: PodResourcePressureTone;
  ratio: number | null;
}): string {
  if (healthTone === "critical") return "var(--destructive)";
  if (pressureTone === "unknown") {
    if (healthTone === "healthy") return "var(--color-emerald-500)";
    if (healthTone === "warning") return "var(--status-warning)";
    return "var(--muted-foreground)";
  }
  return podUsageColorFromRatio(ratio);
}

function navigatorUnknownPodStroke(healthTone: PodHealthTone): string {
  if (healthTone === "healthy") return "var(--color-emerald-500)";
  if (healthTone === "warning") return "var(--status-warning)";
  if (healthTone === "critical") return "var(--destructive)";
  return "var(--muted-foreground)";
}
