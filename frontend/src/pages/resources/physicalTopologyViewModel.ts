import type {
  PhysicalTopologyPod,
  PhysicalTopologyServer,
  PhysicalTopologySnapshot,
} from "../../features/resources/physicalTopologyContract";

export const PHYSICAL_SERVER_WIDTH = 264;
export const PHYSICAL_SERVER_HEIGHT = 208;
export const MAX_VISIBLE_PODS_PER_SERVER = 12;

export type PodUsageTone = "neutral" | "amber" | "red" | "unknown";
export type PodAbnormalBadge = "crash-loop" | "pending" | "restarting" | null;

export interface PhysicalServerPlacement {
  unassigned: boolean;
  server: PhysicalTopologyServer;
  pods: PhysicalTopologyPod[];
  omittedCount: number;
  visibleMatchedCount: number;
  visibleTotalCount: number;
  matchedCount: number | null;
  totalCount: number | null;
  countCompleteness: "exact" | "partial" | "unavailable";
}

export function physicalServerPlacements(
  topology: PhysicalTopologySnapshot,
): PhysicalServerPlacement[] {
  const placements: PhysicalServerPlacement[] = topology.servers.map((server) => {
    const allPods = topology.pods.filter((pod) => pod.serverId === server.id);
    const pods = visiblePhysicalPods(allPods);
    const locallyOmitted = allPods.length - pods.length;
    return {
      unassigned: false,
      server,
      pods,
      omittedCount: (topology.truncatedByServer[server.id] ?? 0) + locallyOmitted,
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
  const allUnassignedPods = topology.pods.filter((pod) => pod.serverId === null);
  if (allUnassignedPods.length > 0 || topology.unassignedTruncatedCount > 0) {
    const pods = visiblePhysicalPods(allUnassignedPods);
    const serverOmittedCount = topology.unassignedTruncatedCount;
    const omittedCount = serverOmittedCount + allUnassignedPods.length - pods.length;
    placements.push({
      unassigned: true,
      server: {
        id: "__unassigned__",
        name: "Unassigned",
        cpuPercent: null,
        memoryPercent: null,
        status: "Pending",
        matchedPodCount: serverOmittedCount === 0
          ? allUnassignedPods.filter((pod) => pod.matchesFilter).length
          : null,
        totalPodCount: allUnassignedPods.length + serverOmittedCount,
        matchedPodCountCompleteness: serverOmittedCount === 0 ? "exact" : "unavailable",
        totalPodCountCompleteness: serverOmittedCount === 0 ? "exact" : "partial",
      },
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
  return pods
    .map((pod, index) => ({ index, pod, priority: podProblemPriority(pod) }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .slice(0, MAX_VISIBLE_PODS_PER_SERVER)
    .map(({ pod }) => pod);
}

function podProblemPriority(pod: PhysicalTopologyPod): number {
  const badge = podAbnormalBadge(pod);
  if (badge === "crash-loop") return 0;
  if (badge === "pending") return 1;
  if (badge === "restarting") return 2;
  if (!["healthy", "ready", "ok"].includes(pod.health.toLocaleLowerCase())) return 3;
  if ((pod.usagePercent ?? 0) >= 80) return 4;
  if ((pod.usagePercent ?? 0) >= 60) return 5;
  return 6;
}

export function podUsageTone(usagePercent: number | null): PodUsageTone {
  if (usagePercent === null) return "unknown";
  if (usagePercent >= 80) return "red";
  if (usagePercent >= 60) return "amber";
  return "neutral";
}

export function podAbnormalBadge(pod: PhysicalTopologyPod): PodAbnormalBadge {
  const phase = pod.phase.toLocaleLowerCase();
  if (phase.includes("crashloop") || phase.includes("backoff")) return "crash-loop";
  if (phase === "pending") return "pending";
  if (pod.restartCount > 0) return "restarting";
  return null;
}

export function podUsageLabel(usagePercent: number | null): string {
  return usagePercent === null ? "—" : `${Math.round(usagePercent)}%`;
}
