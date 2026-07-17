import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type {
  InfraMapClusterSummary,
  InfraMapModel,
  InfraMapNode,
  InfraMapPod,
} from "./resourcesInfraMapModel";
import { orderInfraMapPodsForMetric } from "./resourcesInfraMapPodOrdering";
import {
  infraMapPodRequestRange,
  infraMapPodSizeFromRequest,
  type InfraMapPodRequestRange,
} from "./resourcesInfraMapPodSizing";
import {
  infraMapPodSvgVisual,
  infraMapPodToneState,
  type InfraMapPodSvgVisual,
} from "./resourcesInfraMapPodVisual";
import type {
  PodHealthTone,
  PodResourcePressureTone,
} from "./podVisualState";

export interface InfraMapNavigatorPod {
  healthTone: PodHealthTone;
  pod: InfraMapPod;
  pressureTone: PodResourcePressureTone;
  radius: number;
  ratio: number | null;
}

export interface InfraMapNavigatorNode {
  node: InfraMapNode;
  pods: InfraMapNavigatorPod[];
}

export interface InfraMapNavigatorCluster {
  cluster: InfraMapClusterSummary;
  nodes: InfraMapNavigatorNode[];
}

export interface InfraMapNavigatorModel {
  clusters: InfraMapNavigatorCluster[];
  podCount: number;
}

const NAVIGATOR_POD_RADIUS_MIN = 4.5;
const NAVIGATOR_POD_RADIUS_MAX = 9.5;
const NAVIGATOR_POD_RADIUS_FALLBACK = NAVIGATOR_POD_RADIUS_MIN;
const NAVIGATOR_POD_RADIUS_RANGE = {
  fallback: NAVIGATOR_POD_RADIUS_FALLBACK,
  max: NAVIGATOR_POD_RADIUS_MAX,
  min: NAVIGATOR_POD_RADIUS_MIN,
} as const;

export function buildInfraMapNavigatorModel(
  model: InfraMapModel,
  metricMode: InfraMapMetricMode,
): InfraMapNavigatorModel {
  const clusters = model.clusters.map((cluster) => {
    const clusterNodes = model.nodes.filter((node) => node.clusterId === cluster.id);
    const requestRange = infraMapPodRequestRange(
      clusterNodes.flatMap((node) => [...node.visiblePods, ...node.hiddenPods]),
      metricMode,
    );
    return {
      cluster,
      nodes: clusterNodes.map((node) =>
        navigatorNode(node, metricMode, requestRange)
      ),
    } satisfies InfraMapNavigatorCluster;
  });

  return {
    clusters,
    podCount: clusters.reduce((total, cluster) =>
      total + cluster.nodes.reduce((nodeTotal, node) => nodeTotal + node.pods.length, 0),
      0,
    ),
  };
}

export function infraMapNavigatorPodVisual(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
): InfraMapPodSvgVisual {
  return infraMapPodSvgVisual(pod, metricMode);
}

function navigatorNode(
  node: InfraMapNode,
  metricMode: InfraMapMetricMode,
  requestRange: InfraMapPodRequestRange | null,
): InfraMapNavigatorNode {
  const pods = orderInfraMapPodsForMetric([...node.visiblePods, ...node.hiddenPods], metricMode)
    .map((pod) => {
      const { healthTone, pressureTone, ratio } = infraMapPodToneState(pod, metricMode);
      return {
        healthTone,
        pod,
        pressureTone,
        radius: navigatorPodRadius(pod, metricMode, requestRange),
        ratio,
      } satisfies InfraMapNavigatorPod;
    });

  return {
    node,
    pods,
  };
}

function navigatorPodRadius(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
  range: InfraMapPodRequestRange | null,
): number {
  return infraMapPodSizeFromRequest(pod, metricMode, range, NAVIGATOR_POD_RADIUS_RANGE);
}
