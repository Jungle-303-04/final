import type {
  PhysicalTopologyPod,
  PhysicalTopologySnapshot,
} from "../../features/resources/physicalTopologyContract";
import { physicalServerPlacements } from "./physicalTopologyViewModel";
import { podHealthTone, type PodHealthTone } from "./podVisualState";

export const INFRA_MAP_DEFAULT_VISIBLE_PODS_PER_NODE = 4;

export interface InfraMapPodMetric {
  request: number | null;
  ratio: number | null;
  value: number | null;
}

export interface InfraMapPod {
  clusterId: string;
  cpu: InfraMapPodMetric;
  health: string;
  id: string;
  memory: InfraMapPodMetric;
  name: string;
  namespace: string | null;
  ownerKind: string | null;
  ownerName: string | null;
  ownerReferencesComplete: boolean | null;
  ownerUid: string | null;
  phase: string;
  replicaGroupKey: string | null;
  replicaGroupKind: string | null;
  replicaGroupName: string | null;
  replicaGroupUid: string | null;
  restartCount: number;
  selected: boolean;
  usagePercent: number | null;
  workloadKey: string | null;
}

export interface InfraMapNode {
  assignedPodCount: number;
  clusterId: string;
  cpuMillicores: number | null;
  cpuRatio: number | null;
  health: string;
  hiddenPods: InfraMapPod[];
  hiddenPodCount: number;
  id: string;
  memoryMebibytes: number | null;
  memoryRatio: number | null;
  name: string;
  podCapacity: number | null;
  ready: boolean | null;
  unassigned: boolean;
  visiblePods: InfraMapPod[];
}

export interface InfraMapModel {
  clusters: InfraMapClusterSummary[];
  nodes: InfraMapNode[];
  selection: {
    active: boolean;
    matchedPodCount: number;
  };
}

export type InfraMapClusterHealth = PodHealthTone;

export interface InfraMapClusterSummary {
  criticalCount: number;
  health: InfraMapClusterHealth;
  id: string;
  name: string;
  nodeCount: number;
  podCount: number;
  provider: string | null;
  warningCount: number;
}

export interface BuildInfraMapModelInput {
  maxPodsPerNode?: number;
  selectionActive: boolean;
  selectedPodIds?: ReadonlySet<string>;
  topology: PhysicalTopologySnapshot;
}

export function buildInfraMapModel({
  maxPodsPerNode = INFRA_MAP_DEFAULT_VISIBLE_PODS_PER_NODE,
  selectionActive,
  selectedPodIds,
  topology,
}: BuildInfraMapModelInput): InfraMapModel {
  const usesExplicitSelection = selectionActive && selectedPodIds !== undefined;
  const podFilter = (pod: PhysicalTopologyPod): boolean => {
    if (usesExplicitSelection && !selectedPodIds.has(pod.id)) return false;
    return !(selectionActive && !usesExplicitSelection && !pod.matchesFilter);
  };
  const placements = physicalServerPlacements(topology, {
    includeRemoteOmissions: !selectionActive,
    maxVisiblePodsPerServer: maxPodsPerNode,
    podComparator: comparePodsByInfraMapWeight,
    podFilter,
  });
  const nodes = placements.map((placement) => {
    const { server } = placement;
    const toPod = (pod: PhysicalTopologyPod) =>
      toInfraMapPod(pod, topology.clusterId, selectionActive);
    return {
      assignedPodCount: server.totalPodCount ?? placement.visibleTotalCount + placement.omittedCount,
      clusterId: topology.clusterId,
      cpuMillicores: server.cpuMillicores,
      cpuRatio: ratioFromPercentOrValues(
        server.cpuPercent,
        server.cpuMillicores,
        server.allocatableCpuMillicores,
      ),
      health: serverStatusToHealth(server.status),
      hiddenPodCount: placement.omittedCount,
      hiddenPods: placement.hiddenPods.map(toPod),
      id: server.id,
      memoryMebibytes: server.memoryMebibytes,
      memoryRatio: ratioFromPercentOrValues(
        server.memoryPercent,
        server.memoryMebibytes,
        server.allocatableMemoryMebibytes,
      ),
      name: server.name,
      podCapacity: server.podCapacity,
      ready: server.status.toLowerCase() === "ready"
        ? true
        : server.status.toLowerCase() === "notready"
        ? false
        : null,
      unassigned: placement.unassigned,
      visiblePods: placement.pods.map(toPod),
    } satisfies InfraMapNode;
  });

  return {
    clusters: [infraMapClusterSummary(topology, nodes)],
    nodes: nodes.sort(compareNodes),
    selection: {
      active: selectionActive,
      matchedPodCount: usesExplicitSelection
        ? topology.pods.filter((pod) => selectedPodIds.has(pod.id)).length
        : topology.pods.filter((pod) => pod.matchesFilter).length,
    },
  };
}

function toInfraMapPod(
  pod: PhysicalTopologyPod,
  clusterId: string,
  selected: boolean,
): InfraMapPod {
  return {
    clusterId,
    cpu: {
      request: pod.cpuRequestMillicores,
      ratio: ratioFromValues(
        pod.cpuMillicores,
        pod.cpuRequestMillicores,
      ),
      value: pod.cpuMillicores,
    },
    health: pod.health,
    id: pod.id,
    memory: {
      request: pod.memoryRequestMebibytes,
      ratio: ratioFromValues(
        pod.memoryMebibytes,
        pod.memoryRequestMebibytes,
      ),
      value: pod.memoryMebibytes,
    },
    name: pod.name,
    namespace: pod.namespace,
    ownerKind: pod.ownerKind ?? null,
    ownerName: pod.ownerName ?? null,
    ownerReferencesComplete: pod.ownerReferencesComplete ?? null,
    ownerUid: pod.ownerUid ?? null,
    phase: pod.phase,
    replicaGroupKey: pod.replicaGroupKey ?? null,
    replicaGroupKind: pod.replicaGroupKind ?? null,
    replicaGroupName: pod.replicaGroupName ?? null,
    replicaGroupUid: pod.replicaGroupUid ?? null,
    restartCount: pod.restartCount,
    selected,
    usagePercent: pod.usagePercent,
    workloadKey: pod.workloadKey ?? null,
  };
}

function infraMapClusterSummary(
  topology: PhysicalTopologySnapshot,
  nodes: readonly InfraMapNode[],
): InfraMapClusterSummary {
  const podCountsFromServers = topology.servers.map((server) => server.totalPodCount);
  const serverPodCount = podCountsFromServers.every((value) => value !== null)
    ? podCountsFromServers.reduce((total, value) => total + (value ?? 0), 0)
    : null;
  const observedPodCount = topology.pods.length +
    Object.values(topology.truncatedByServer).reduce((total, count) => total + count, 0) +
    topology.unassignedTruncatedCount;
  const podCount = serverPodCount ?? observedPodCount;
  const podHealthCounts = topology.pods.reduce(
    (counts, pod) => {
      const tone = podHealthTone(pod);
      if (tone === "critical") counts.critical += 1;
      if (tone === "warning") counts.warning += 1;
      return counts;
    },
    { critical: 0, warning: 0 },
  );
  const nodeHealthCounts = nodes.reduce(
    (counts, node) => {
      if (node.health === "critical") counts.critical += 1;
      if (node.health === "warning") counts.warning += 1;
      return counts;
    },
    { critical: 0, warning: 0 },
  );
  const criticalCount = podHealthCounts.critical + nodeHealthCounts.critical;
  const warningCount = podHealthCounts.warning + nodeHealthCounts.warning;
  return {
    criticalCount,
    health: criticalCount > 0
      ? "critical"
      : warningCount > 0
      ? "warning"
      : topology.servers.length === 0 && topology.pods.length === 0
      ? "unknown"
      : "healthy",
    id: topology.clusterId,
    name: topology.clusterName ?? topology.clusterId,
    nodeCount: topology.servers.length,
    podCount,
    provider: topology.clusterProvider ?? null,
    warningCount,
  };
}

function compareNodes(left: InfraMapNode, right: InfraMapNode): number {
  if (left.unassigned !== right.unassigned) return left.unassigned ? 1 : -1;
  return left.name.localeCompare(right.name);
}

function comparePodsByInfraMapWeight(
  left: PhysicalTopologyPod,
  right: PhysicalTopologyPod,
): number {
  return podMetricAvailability(right) - podMetricAvailability(left) ||
    podWeight(right) - podWeight(left) ||
    left.name.localeCompare(right.name);
}

function podWeight(pod: PhysicalTopologyPod): number {
  return Math.max(
    pod.usagePercent ?? 0,
    pod.cpuMillicores ?? 0,
    pod.memoryMebibytes ?? 0,
  );
}

function podMetricAvailability(pod: PhysicalTopologyPod): number {
  return (
    (ratioFromValues(pod.cpuMillicores, pod.cpuRequestMillicores) === null
      ? 0
      : 1) +
    (ratioFromValues(pod.memoryMebibytes, pod.memoryRequestMebibytes) ===
      null
      ? 0
      : 1)
  );
}

function ratioFromPercentOrValues(
  percent: number | null,
  value: number | null,
  total: number | null,
): number | null {
  return percentToRatio(percent) ?? ratioFromValues(value, total);
}

function percentToRatio(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value)) / 100;
}

function ratioFromValues(value: number | null, total: number | null): number | null {
  if (value === null || total === null || total <= 0) return null;
  return Math.max(0, value / total);
}

function serverStatusToHealth(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "ready") return "healthy";
  if (normalized === "notready") return "critical";
  if (normalized === "unknown") return "unknown";
  return "warning";
}
