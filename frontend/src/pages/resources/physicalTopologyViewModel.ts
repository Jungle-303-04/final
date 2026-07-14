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
    const pods = topology.pods.filter((pod) => pod.serverId === server.id);
    return {
      unassigned: false,
      server,
      pods,
      omittedCount: topology.truncatedByServer[server.id] ?? 0,
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
  const unassignedPods = topology.pods.filter((pod) => pod.serverId === null);
  if (unassignedPods.length > 0 || topology.unassignedTruncatedCount > 0) {
    const omittedCount = topology.unassignedTruncatedCount;
    placements.push({
      unassigned: true,
      server: {
        id: "__unassigned__",
        name: "Unassigned",
        cpuPercent: null,
        memoryPercent: null,
        status: "Pending",
        matchedPodCount: omittedCount === 0
          ? unassignedPods.filter((pod) => pod.matchesFilter).length
          : null,
        totalPodCount: unassignedPods.length + omittedCount,
        matchedPodCountCompleteness: omittedCount === 0 ? "exact" : "unavailable",
        totalPodCountCompleteness: omittedCount === 0 ? "exact" : "partial",
      },
      pods: unassignedPods,
      omittedCount,
      visibleMatchedCount: unassignedPods.filter((pod) => pod.matchesFilter).length,
      visibleTotalCount: unassignedPods.length,
      matchedCount: omittedCount === 0
        ? unassignedPods.filter((pod) => pod.matchesFilter).length
        : null,
      totalCount: unassignedPods.length + omittedCount,
      countCompleteness: omittedCount === 0 ? "exact" : "unavailable",
    });
  }
  return placements;
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
  if (pod.restartCount >= 3) return "restarting";
  return null;
}

export function podUsageLabel(usagePercent: number | null): string {
  return usagePercent === null ? "—" : `${Math.round(usagePercent)}%`;
}
