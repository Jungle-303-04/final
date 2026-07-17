import type {
  PhysicalTopologyPod,
  PhysicalTopologyServer,
  PhysicalTopologySnapshot,
} from "../../features/resources/physicalTopologyContract";
import {
  podAbnormalBadge,
  podResourcePressureToneFromPercent,
  podShortLabel,
  podUsageLabel,
  type PodResourcePressureTone,
} from "./podVisualState";

export {
  podAbnormalBadge,
  podShortLabel,
  podUsageLabel,
};
export type { PodAbnormalBadge } from "./podVisualState";

export const PHYSICAL_SERVER_WIDTH = 264;
export const PHYSICAL_SERVER_HEIGHT = 208;
export const MAX_VISIBLE_PODS_PER_SERVER = 12;

export type PodUsageTone = PodResourcePressureTone;
export type PodUsageEvidence =
  | { kind: "cpu"; actual: number; request: number }
  | { kind: "memory"; actual: number; request: number };

export interface PhysicalServerPlacement {
  unassigned: boolean;
  server: PhysicalTopologyServer;
  hiddenPods: PhysicalTopologyPod[];
  pods: PhysicalTopologyPod[];
  omittedCount: number;
  visibleMatchedCount: number;
  visibleTotalCount: number;
  matchedCount: number | null;
  totalCount: number | null;
  countCompleteness: "exact" | "partial" | "unavailable";
}

export interface PhysicalServerPlacementOptions {
  includeRemoteOmissions?: boolean;
  maxVisiblePodsPerServer?: number;
  podComparator?: (left: PhysicalTopologyPod, right: PhysicalTopologyPod) => number;
  podFilter?: (pod: PhysicalTopologyPod) => boolean;
}

export function physicalServerPlacements(
  topology: PhysicalTopologySnapshot,
  options: PhysicalServerPlacementOptions = {},
): PhysicalServerPlacement[] {
  const {
    includeRemoteOmissions = true,
    maxVisiblePodsPerServer = MAX_VISIBLE_PODS_PER_SERVER,
    podComparator = comparePhysicalPods,
    podFilter = () => true,
  } = options;
  const placements: PhysicalServerPlacement[] = topology.servers.map((server) => {
    const allPods = topology.pods.filter((pod) =>
      pod.serverId === server.id && podFilter(pod)
    );
    const orderedPods = orderedPhysicalPods(allPods, podComparator);
    const pods = orderedPods.slice(0, maxVisiblePodsPerServer);
    const hiddenPods = orderedPods.slice(maxVisiblePodsPerServer);
    const remoteOmitted = includeRemoteOmissions
      ? topology.truncatedByServer[server.id] ?? 0
      : 0;
    return {
      unassigned: false,
      server,
      hiddenPods,
      pods,
      omittedCount: remoteOmitted + hiddenPods.length,
      visibleMatchedCount: pods.filter((pod) => pod.matchesFilter).length,
      visibleTotalCount: pods.length,
      matchedCount: server.matchedPodCount,
      totalCount: server.totalPodCount,
      countCompleteness:
        server.matchedPodCountCompleteness === "unavailable" ||
        server.totalPodCountCompleteness === "unavailable"
          ? "unavailable"
          : server.matchedPodCountCompleteness === "partial" ||
              server.totalPodCountCompleteness === "partial"
            ? "partial"
            : "exact",
    };
  });
  const allUnassignedPods = topology.pods.filter((pod) =>
    pod.serverId === null && podFilter(pod)
  );
  const serverOmittedCount = includeRemoteOmissions
    ? topology.unassignedTruncatedCount
    : 0;
  if (allUnassignedPods.length > 0 || serverOmittedCount > 0) {
    const orderedPods = orderedPhysicalPods(allUnassignedPods, podComparator);
    const pods = orderedPods.slice(0, maxVisiblePodsPerServer);
    const hiddenPods = orderedPods.slice(maxVisiblePodsPerServer);
    const omittedCount = serverOmittedCount + hiddenPods.length;
    placements.push({
      unassigned: true,
      server: {
        id: "__unassigned__",
        name: "Unassigned",
        cpuPercent: null,
        memoryPercent: null,
        cpuMillicores: null,
        memoryMebibytes: null,
        allocatableCpuMillicores: null,
        allocatableMemoryMebibytes: null,
        podCapacity: null,
        status: "Pending",
        matchedPodCount: serverOmittedCount === 0
          ? allUnassignedPods.filter((pod) => pod.matchesFilter).length
          : null,
        totalPodCount: allUnassignedPods.length + serverOmittedCount,
        matchedPodCountCompleteness: serverOmittedCount === 0 ? "exact" : "unavailable",
        totalPodCountCompleteness: serverOmittedCount === 0 ? "exact" : "partial",
      },
      hiddenPods,
      pods,
      omittedCount,
      visibleMatchedCount: pods.filter((pod) => pod.matchesFilter).length,
      visibleTotalCount: pods.length,
      matchedCount: serverOmittedCount === 0
        ? allUnassignedPods.filter((pod) => pod.matchesFilter).length
        : null,
      totalCount: allUnassignedPods.length + serverOmittedCount,
      countCompleteness: serverOmittedCount === 0 ? "exact" : "unavailable",
    });
  }
  return placements;
}

export function visiblePhysicalPods(pods: PhysicalTopologyPod[]): PhysicalTopologyPod[] {
  return orderedPhysicalPods(pods, comparePhysicalPods).slice(0, MAX_VISIBLE_PODS_PER_SERVER);
}

function orderedPhysicalPods(
  pods: PhysicalTopologyPod[],
  podComparator: (left: PhysicalTopologyPod, right: PhysicalTopologyPod) => number,
): PhysicalTopologyPod[] {
  return pods
    .map((pod, index) => ({ index, pod }))
    .sort((left, right) => podComparator(left.pod, right.pod) || left.index - right.index)
    .map(({ pod }) => pod);
}

function comparePhysicalPods(left: PhysicalTopologyPod, right: PhysicalTopologyPod): number {
  return podProblemPriority(left) - podProblemPriority(right);
}

function podProblemPriority(pod: PhysicalTopologyPod): number {
  const badge = podAbnormalBadge(pod);
  if (badge === "crash-loop") return 0;
  if (badge === "pending") return 1;
  if (!["healthy", "ready", "ok"].includes(pod.health.toLocaleLowerCase())) return 3;
  return 4;
}

export function podUsageTone(usagePercent: number | null): PodUsageTone {
  return podResourcePressureToneFromPercent(usagePercent);
}

export function podUsageEvidence(pod: PhysicalTopologyPod): PodUsageEvidence | null {
  const {
    cpuMillicores,
    cpuRequestMillicores,
    memoryMebibytes,
    memoryRequestMebibytes,
  } = pod;
  const cpuRatio = requestRatio(cpuMillicores, cpuRequestMillicores);
  const memoryRatio = requestRatio(
    memoryMebibytes,
    memoryRequestMebibytes,
  );
  if (
    pod.usagePercent === null ||
    cpuRequestMillicores === null ||
    memoryRequestMebibytes === null ||
    (cpuRatio === null && memoryRatio === null)
  ) return null;
  if (memoryRatio === null || (cpuRatio !== null && cpuRatio >= memoryRatio)) {
    if (cpuMillicores === null) return null;
    return {
      kind: "cpu",
      actual: cpuMillicores,
      request: cpuRequestMillicores,
    };
  }
  if (memoryMebibytes === null) return null;
  return {
    kind: "memory",
    actual: memoryMebibytes,
    request: memoryRequestMebibytes,
  };
}

function requestRatio(actual: number | null, request: number | null): number | null {
  if (actual === null || request === null || request <= 0) return null;
  return actual / request;
}
