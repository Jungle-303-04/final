import { describe, expect, it } from "vitest";

import type { PhysicalTopologyPod } from "../../features/resources/physicalTopologyContract";
import { PHYSICAL_TOPOLOGY } from "./ResourcesPage.testSupport";
import {
  MAX_VISIBLE_PODS_PER_SERVER,
  PHYSICAL_SERVER_HEIGHT,
  PHYSICAL_SERVER_WIDTH,
  physicalServerPlacements,
  podAbnormalBadge,
  podShortLabel,
  podUsageTone,
  visiblePhysicalPods,
} from "./physicalTopologyViewModel";

describe("physical topology view model", () => {
  it("uses fixed geometry and usage-only fill thresholds", () => {
    expect(PHYSICAL_SERVER_WIDTH).toBe(264);
    expect(PHYSICAL_SERVER_HEIGHT).toBe(208);
    expect(MAX_VISIBLE_PODS_PER_SERVER).toBe(12);
    expect([null, 0, 59.99, 60, 79.99, 80, 140].map(podUsageTone)).toEqual([
      "unknown",
      "neutral",
      "neutral",
      "amber",
      "amber",
      "red",
      "red",
    ]);
  });

  it("keeps abnormal badges independent from fill and omits a normal badge", () => {
    expect(podAbnormalBadge(pod({ phase: "CrashLoopBackOff", usagePercent: 0 })))
      .toBe("crash-loop");
    expect(podAbnormalBadge(pod({ phase: "Pending", usagePercent: 99 })))
      .toBe("pending");
    expect(podAbnormalBadge(pod({ phase: "Running", restartCount: 1 })))
      .toBe("restarting");
    expect(podAbnormalBadge(pod({ phase: "Running", restartCount: 0 })))
      .toBeNull();
  });

  it("derives the visible pod mark only from the real name prefix", () => {
    expect(podShortLabel("checkout-api-0")).toBe("CH");
    expect(podShortLabel("a")).toBe("A");
    expect(podShortLabel("패스-수집기-0")).toBe("패스");
  });

  it("places matching and nonmatching pods together and preserves unassigned truth", () => {
    const unassigned = pod({ id: "pod:pending", serverId: null, matchesFilter: false });
    const placements = physicalServerPlacements({
      ...PHYSICAL_TOPOLOGY,
      pods: [...PHYSICAL_TOPOLOGY.pods, unassigned],
      unassignedTruncatedCount: 2,
    });

    expect(placements[0]?.pods.map((candidate) => candidate.matchesFilter))
      .toEqual([true, false]);
    expect(placements[placements.length - 1]).toMatchObject({
      unassigned: true,
      omittedCount: 2,
      pods: [{ id: "pod:pending", matchesFilter: false }],
      countCompleteness: "unavailable",
    });
  });

  it("puts problem pods first, renders at most twelve, and reports the local remainder", () => {
    const normalPods = Array.from({ length: 13 }, (_, index) => pod({
      id: `pod:normal-${index}`,
      name: `normal-${index}`,
    }));
    const pending = pod({ id: "pod:pending", name: "pending", phase: "Pending" });
    const sorted = visiblePhysicalPods([...normalPods, pending]);
    expect(sorted).toHaveLength(MAX_VISIBLE_PODS_PER_SERVER);
    expect(sorted[0]?.id).toBe("pod:pending");

    const placements = physicalServerPlacements({
      ...PHYSICAL_TOPOLOGY,
      pods: [...normalPods, pending],
      truncatedByServer: { "node:worker-a": 4 },
    });
    expect(placements[0]?.omittedCount).toBe(6);
    expect(placements[0]?.visibleTotalCount).toBe(MAX_VISIBLE_PODS_PER_SERVER);
    expect(placements[0]?.pods[0]?.id).toBe("pod:pending");
  });
});

function pod(overrides: Partial<PhysicalTopologyPod>): PhysicalTopologyPod {
  return {
    id: "pod:test",
    name: "test",
    namespace: "default",
    serverId: "node:worker-a",
    usagePercent: null,
    cpuMillicores: null,
    cpuRequestMillicores: null,
    memoryMebibytes: null,
    memoryRequestMebibytes: null,
    phase: "Running",
    health: "healthy",
    restartCount: 0,
    matchesFilter: true,
    ...overrides,
  };
}
