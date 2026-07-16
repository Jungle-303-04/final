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

export interface InfraMapTopologyModel {
  clusters: InfraMapTopologyCluster[];
}

export interface InfraMapTopologyCluster extends InfraMapClusterSummary {
  nodes: InfraMapTopologyNode[];
}

export interface InfraMapTopologyNode {
  clusterId: string;
  groups: InfraMapTopologyPodGroup[];
  hiddenPodCount: number;
  id: string;
  name: string;
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

export type InfraMapTopologyPodGroupEvidence =
  | "owner"
  | "replicaGroup"
  | "singleton"
  | "workload";

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
    groups: podGroups(knownPods),
    hiddenPodCount: Math.max(0, node.hiddenPodCount - node.hiddenPods.length),
    id: node.id,
    name: node.name,
    podCount: node.assignedPodCount,
    ready: node.ready,
    unassigned: node.unassigned,
  };
}

function podGroups(pods: readonly InfraMapPod[]): InfraMapTopologyPodGroup[] {
  const groups = new Map<string, InfraMapTopologyPodGroup>();
  for (const pod of pods) {
    const group = podReplicaGroup(pod);
    const current = groups.get(group.key);
    if (current) {
      current.pods.push(pod);
      continue;
    }
    groups.set(group.key, {
      evidence: group.evidence,
      key: group.key,
      kind: group.kind,
      label: group.label,
      pods: [pod],
    });
  }
  return [...groups.values()].sort(comparePodGroups);
}

function podReplicaGroup(pod: InfraMapPod): {
  evidence: InfraMapTopologyPodGroupEvidence;
  key: string;
  kind: string | null;
  label: string;
} {
  if (pod.replicaGroupKey) {
    return {
      evidence: "replicaGroup",
      key: pod.replicaGroupKey,
      kind: pod.replicaGroupKind,
      label: groupLabel(pod.replicaGroupKind, pod.replicaGroupName, pod.replicaGroupKey),
    };
  }
  if (pod.workloadKey) {
    return {
      evidence: "workload",
      key: pod.workloadKey,
      kind: pod.ownerKind,
      label: groupLabel(pod.ownerKind, pod.ownerName, pod.workloadKey),
    };
  }
  if (pod.ownerUid) {
    return {
      evidence: "owner",
      key: `owner:${pod.ownerUid}`,
      kind: pod.ownerKind,
      label: groupLabel(pod.ownerKind, pod.ownerName, pod.ownerUid),
    };
  }
  return {
    evidence: "singleton",
    key: `singleton:${pod.id}`,
    kind: null,
    label: pod.name,
  };
}

function groupLabel(
  kind: string | null,
  name: string | null,
  fallback: string,
): string {
  if (kind && name) return `${kind} · ${name}`;
  if (name) return name;
  return fallback;
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
