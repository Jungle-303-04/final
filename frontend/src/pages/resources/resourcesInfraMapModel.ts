import type {
  PhysicalTopologyPod,
  PhysicalTopologySnapshot,
} from "../../features/resources/physicalTopologyContract";
import { physicalServerPlacements } from "./physicalTopologyViewModel";

const DEFAULT_MAX_PODS_PER_NODE = 4;

export interface InfraMapPodMetric {
  ratio: number | null;
  value: number | null;
}

export interface InfraMapPod {
  cpu: InfraMapPodMetric;
  health: string;
  id: string;
  memory: InfraMapPodMetric;
  name: string;
  namespace: string | null;
  phase: string;
  selected: boolean;
}

export interface InfraMapNode {
  assignedPodCount: number;
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
  nodes: InfraMapNode[];
  selection: {
    active: boolean;
    matchedPodCount: number;
  };
}

export interface BuildInfraMapModelInput {
  maxPodsPerNode?: number;
  selectionActive: boolean;
  selectedPodIds?: ReadonlySet<string>;
  topology: PhysicalTopologySnapshot;
}

export function buildInfraMapModel({
  maxPodsPerNode = DEFAULT_MAX_PODS_PER_NODE,
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
    const toPod = (pod: PhysicalTopologyPod) => toInfraMapPod(pod, selectionActive);
    return {
      assignedPodCount: server.totalPodCount ?? placement.visibleTotalCount + placement.omittedCount,
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
    nodes: nodes.sort(compareNodes),
    selection: {
      active: selectionActive,
      matchedPodCount: usesExplicitSelection
        ? topology.pods.filter((pod) => selectedPodIds.has(pod.id)).length
        : topology.pods.filter((pod) => pod.matchesFilter).length,
    },
  };
}

function toInfraMapPod(pod: PhysicalTopologyPod, selected: boolean): InfraMapPod {
  return {
    cpu: {
      ratio: ratioFromValues(
        pod.cpuMillicores,
        pod.cpuRequestMillicores,
      ),
      value: pod.cpuMillicores,
    },
    health: pod.health,
    id: pod.id,
    memory: {
      ratio: ratioFromValues(
        pod.memoryMebibytes,
        pod.memoryRequestMebibytes,
      ),
      value: pod.memoryMebibytes,
    },
    name: pod.name,
    namespace: pod.namespace,
    phase: pod.phase,
    selected,
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
