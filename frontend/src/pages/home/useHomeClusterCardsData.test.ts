import { describe, expect, it } from "vitest";

import type {
  HomeClusterChoice,
  HomeFleetClusterSummary,
} from "../../features/home/homeContract";
import { projectHomeFleetClusters } from "./useHomeClusterCardsData";

describe("projectHomeFleetClusters", () => {
  it("keeps an observed zero distinct from an unavailable inventory", () => {
    const cluster = clusterChoice();
    expect(projectHomeFleetClusters([cluster], {
      [cluster.id]: fleetSummary("available"),
    })[0]).toMatchObject({ nodeCount: 0, podCount: 0 });

    expect(projectHomeFleetClusters([cluster], {
      [cluster.id]: fleetSummary("partial"),
    })[0]).toMatchObject({ nodeCount: 0, podCount: 0 });

    expect(projectHomeFleetClusters([cluster], {
      [cluster.id]: fleetSummary("unavailable"),
    })[0]).toMatchObject({ nodeCount: null, podCount: null });
  });
});

function clusterChoice(): HomeClusterChoice {
  return {
    id: "cluster-1",
    workspaceId: "workspace-1",
    name: "demo-server",
    environment: "development",
    provider: "eks",
    connectionStage: "ready",
    registrationState: "active",
    connectionState: "online",
    lastObservedAt: null,
    nodeCount: 9,
    podCount: 9,
    incidentCount: 0,
  };
}

function fleetSummary(
  inventoryAvailability: "available" | "partial" | "unavailable",
): HomeFleetClusterSummary {
  const complete = inventoryAvailability === "available";
  return {
    clusterId: "cluster-1",
    name: "demo-server",
    health: "healthy",
    podsRunning: 0,
    podsTotal: 0,
    nodesReady: 0,
    nodesTotal: 0,
    openIncidents: 0,
    restartCount: 0,
    cpuPercent: null,
    memoryPercent: null,
    observedAt: "2026-07-20T00:00:00Z",
    coverage: {
      inventory: {
        availability: inventoryAvailability,
        observedAt: inventoryAvailability === "unavailable" ? null : "2026-07-20T00:00:00Z",
        reasonCodes: complete ? [] : [`inventory_${inventoryAvailability}`],
      },
      cpu: {
        availability: "unavailable",
        observedAt: null,
        reasonCodes: ["cpu_unavailable"],
      },
      memory: {
        availability: "unavailable",
        observedAt: null,
        reasonCodes: ["memory_unavailable"],
      },
    },
  };
}
