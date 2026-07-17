import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type {
  InfraMapClusterSummary,
  InfraMapModel,
  InfraMapNode,
  InfraMapPod,
} from "./resourcesInfraMapModel";
import {
  infraMapPodProblemRank,
  orderInfraMapPodsForMetric,
} from "./resourcesInfraMapPodOrdering";
import {
  groupInfraMapPodsByReplica,
  type InfraMapPodReplicaGroupEvidence,
} from "./resourcesInfraMapPodGrouping";

export interface InfraMapTopologyModel {
  clusters: InfraMapTopologyCluster[];
}

export interface InfraMapTopologyCluster extends InfraMapClusterSummary {
  nodes: InfraMapTopologyNode[];
}

export interface InfraMapTopologyNode {
  clusterId: string;
  cpuRatio: number | null;
  groups: InfraMapTopologyPodGroup[];
  hiddenPodCount: number;
  id: string;
  memoryRatio: number | null;
  name: string;
  podCapacity: number | null;
  podCount: number;
  ready: boolean | null;
  unassigned: boolean;
}

export interface InfraMapTopologyPodGroup {
  evidence: InfraMapTopologyPodGroupEvidence;
  key: string;
  kind: string | null;
  label: string;
  pods: InfraMapPod[];
}

export type InfraMapTopologyPodGroupEvidence = InfraMapPodReplicaGroupEvidence;

export function buildInfraMapTopologyModel(
  model: InfraMapModel,
  metricMode: InfraMapMetricMode,
): InfraMapTopologyModel {
  const nodesByCluster = groupNodesByCluster(model.nodes);
  return {
    clusters: model.clusters.map((cluster) => ({
      ...cluster,
      nodes: (nodesByCluster.get(cluster.id) ?? []).map((node) =>
        topologyNodeFromInfraMapNode(node, metricMode)
      ),
    })),
  };
}

function topologyNodeFromInfraMapNode(
  node: InfraMapNode,
  metricMode: InfraMapMetricMode,
): InfraMapTopologyNode {
  const knownPods = orderInfraMapPodsForMetric(
    [...node.visiblePods, ...node.hiddenPods],
    metricMode,
  );
  return {
    clusterId: node.clusterId,
    cpuRatio: node.cpuRatio,
    groups: podGroups(knownPods),
    hiddenPodCount: Math.max(0, node.hiddenPodCount - node.hiddenPods.length),
    id: node.id,
    memoryRatio: node.memoryRatio,
    name: node.name,
    podCapacity: node.podCapacity,
    podCount: node.assignedPodCount,
    ready: node.ready,
    unassigned: node.unassigned,
  };
}

function podGroups(pods: readonly InfraMapPod[]): InfraMapTopologyPodGroup[] {
  return groupInfraMapPodsByReplica(pods)
    .map((group) => ({
      evidence: group.evidence,
      key: group.key,
      kind: group.kind,
      label: group.label,
      pods: group.pods,
    }))
    .sort(comparePodGroups);
}

function comparePodGroups(
  left: InfraMapTopologyPodGroup,
  right: InfraMapTopologyPodGroup,
): number {
  return groupProblemRank(left) - groupProblemRank(right) ||
    right.pods.length - left.pods.length ||
    left.label.localeCompare(right.label);
}

function groupProblemRank(group: InfraMapTopologyPodGroup): number {
  return Math.min(...group.pods.map((pod) => infraMapPodProblemRank(pod)));
}

function groupNodesByCluster(
  nodes: readonly InfraMapNode[],
): Map<string, InfraMapNode[]> {
  const groups = new Map<string, InfraMapNode[]>();
  for (const node of nodes) {
    const current = groups.get(node.clusterId);
    if (current) {
      current.push(node);
      continue;
    }
    groups.set(node.clusterId, [node]);
  }
  return groups;
}
