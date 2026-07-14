import type {
  PhysicalTopologyPod,
  PhysicalTopologyServer,
  PhysicalTopologySnapshot,
} from "../../features/resources/physicalTopologyContract";

const DEFAULT_MAX_PODS_PER_NODE = 5;
const UNASSIGNED_NODE_ID = "__infra-map-unassigned__";

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
  topology: PhysicalTopologySnapshot;
}

export function buildInfraMapModel({
  maxPodsPerNode = DEFAULT_MAX_PODS_PER_NODE,
  selectionActive,
  topology,
}: BuildInfraMapModelInput): InfraMapModel {
  const podsByServer = new Map<string, PhysicalTopologyPod[]>();
  for (const pod of topology.pods) {
    const serverId = pod.serverId ?? UNASSIGNED_NODE_ID;
    const group = podsByServer.get(serverId) ?? [];
    group.push(pod);
    podsByServer.set(serverId, group);
  }

  const servers = [...topology.servers];
  if (podsByServer.has(UNASSIGNED_NODE_ID)) {
    servers.push(unassignedServer());
  }

  const nodes = servers.map((server) => {
    const allPods = podsByServer.get(server.id) ?? [];
    const sortedPods = [...allPods].sort((left, right) =>
      comparePodsForDisplay(left, right, selectionActive)
    );
    return {
      assignedPodCount: server.totalPodCount ?? allPods.length,
      cpuMillicores: server.cpuMillicores,
      cpuRatio: ratioFromPercentOrValues(
        server.cpuPercent,
        server.cpuMillicores,
        server.allocatableCpuMillicores,
      ),
      health: serverStatusToHealth(server.status),
      hiddenPodCount: Math.max(0, sortedPods.length - maxPodsPerNode),
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
      unassigned: server.id === UNASSIGNED_NODE_ID,
      visiblePods: sortedPods.slice(0, maxPodsPerNode).map(toInfraMapPod),
    } satisfies InfraMapNode;
  });

  return {
    nodes: nodes.sort(compareNodes),
    selection: {
      active: selectionActive,
      matchedPodCount: topology.pods.filter((pod) => pod.matchesFilter).length,
    },
  };
}

function toInfraMapPod(pod: PhysicalTopologyPod): InfraMapPod {
  return {
    cpu: {
      ratio: ratioFromValues(
        pod.cpuMillicores,
        pod.cpuRequestMillicores ?? pod.cpuLimitMillicores,
      ),
      value: pod.cpuMillicores,
    },
    health: pod.health,
    id: pod.id,
    memory: {
      ratio: ratioFromValues(
        pod.memoryMebibytes,
        pod.memoryRequestMebibytes ?? pod.memoryLimitMebibytes,
      ),
      value: pod.memoryMebibytes,
    },
    name: pod.name,
    namespace: pod.namespace,
    phase: pod.phase,
    selected: pod.matchesFilter,
  };
}

function compareNodes(left: InfraMapNode, right: InfraMapNode): number {
  if (left.unassigned !== right.unassigned) return left.unassigned ? 1 : -1;
  return left.name.localeCompare(right.name);
}

function comparePodsByWeight(
  left: PhysicalTopologyPod,
  right: PhysicalTopologyPod,
): number {
  return podWeight(right) - podWeight(left) || left.name.localeCompare(right.name);
}

function comparePodsForDisplay(
  left: PhysicalTopologyPod,
  right: PhysicalTopologyPod,
  selectionActive: boolean,
): number {
  if (selectionActive && left.matchesFilter !== right.matchesFilter) {
    return left.matchesFilter ? -1 : 1;
  }
  return comparePodsByWeight(left, right);
}

function podWeight(pod: PhysicalTopologyPod): number {
  return Math.max(
    pod.usagePercent ?? 0,
    pod.cpuMillicores ?? 0,
    pod.memoryMebibytes ?? 0,
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

function unassignedServer(): PhysicalTopologyServer {
  return {
    allocatableCpuMillicores: null,
    allocatableMemoryMebibytes: null,
    cpuMillicores: null,
    cpuPercent: null,
    id: UNASSIGNED_NODE_ID,
    matchedPodCount: null,
    matchedPodCountCompleteness: "unavailable",
    memoryMebibytes: null,
    memoryPercent: null,
    name: "unassigned",
    podCapacity: null,
    status: "unknown",
    totalPodCount: null,
    totalPodCountCompleteness: "unavailable",
  };
}
