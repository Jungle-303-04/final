import { describe, expect, it } from "vitest";

import type { ClusterSummaryView } from "./devpreview/clusterSummaryFeed";
import type { InvNode } from "./devpreview/inventoryTopologyFeed";
import { nodesWithSummaryMetrics } from "./devpreview-opsia";

const topologyNode: InvNode = {
  name: "worker-a",
  status: "ready",
  health: "healthy",
  cluster: "game-server-live",
  key: "server-uuid-a",
  cpuPercent: 99,
  memoryPercent: 98,
  matchedPodCount: 3,
  totalPodCount: 10,
};

function summary(nodes: ClusterSummaryView["nodes"]): ClusterSummaryView {
  return {
    status: "ready",
    health: null,
    cpuPct: 23,
    memPct: 31,
    podsRunning: 5,
    podsTotal: null,
    nodesReady: nodes.filter((node) => node.ready).length,
    nodesTotal: nodes.length,
    openIncidents: null,
    nodes,
  };
}

describe("nodesWithSummaryMetrics", () => {
  it("uses exact node-summary CPU/MEM while retaining topology identity", () => {
    const nodes = nodesWithSummaryMetrics([topologyNode], summary([{
      name: "worker-a",
      ready: true,
      health: "healthy",
      cpuPct: 19,
      memPct: 14.5,
      podsRunning: 4,
      podsCapacity: 29,
      restartsRecent: 0,
      conditions: [],
    }]), "game-server-live");

    expect(nodes).toEqual([expect.objectContaining({
      name: "worker-a",
      key: "server-uuid-a",
      cpuPercent: 19,
      memoryPercent: 14.5,
      matchedPodCount: 4,
      totalPodCount: 29,
    })]);
  });

  it("shows summary-only nodes once when physical topology is partial", () => {
    const observed = {
      name: "worker-b",
      ready: true,
      health: "healthy",
      cpuPct: 47.2,
      memPct: 30.5,
      podsRunning: 3,
      podsCapacity: 58,
      restartsRecent: 0,
      conditions: [],
    };
    const nodes = nodesWithSummaryMetrics([], summary([observed, observed]), "game-server-live");

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      name: "worker-b",
      cluster: "game-server-live",
      key: "worker-b",
      cpuPercent: 47.2,
      memoryPercent: 30.5,
      matchedPodCount: 3,
      totalPodCount: 58,
    });
  });

  it("retains observed topology percentages when node summary is unavailable", () => {
    const nodes = nodesWithSummaryMetrics([topologyNode], undefined, "game-server-live");

    expect(nodes[0]).toMatchObject({ cpuPercent: 99, memoryPercent: 98 });
  });

  it("fills only missing summary metrics from the same node's observed topology evidence", () => {
    const nodes = nodesWithSummaryMetrics([topologyNode], summary([{
      name: "worker-a",
      ready: true,
      health: "healthy",
      cpuPct: null,
      memPct: 22.5,
      podsRunning: 4,
      podsCapacity: 29,
      restartsRecent: 0,
      conditions: [],
    }]), "game-server-live");

    expect(nodes[0]).toMatchObject({ cpuPercent: 99, memoryPercent: 22.5 });
  });
});
