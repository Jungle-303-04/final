import { describe, expect, it } from "vitest";

import type { DevpreviewCluster } from "./contracts";
import { reconcilePendingClusters, removePendingClusterReferences } from "./pendingClusterState";

const cluster = (overrides: Partial<DevpreviewCluster> = {}): DevpreviewCluster => ({
  id: "cluster-123",
  workspaceId: "workspace-1",
  name: "battlegrounds-prod",
  displayName: "배틀그라운드 서버",
  provider: "eks",
  environment: "production",
  observationMode: "agent",
  lastObservedAt: "2026-07-22T00:00:00Z",
  kubernetesVersion: "1.34",
  nodeCount: 2,
  podCount: 5,
  namespaceCount: 1,
  incidentCount: 0,
  connectionStatus: "connected",
  connectionStage: "ready",
  role: "target",
  readOnly: false,
  ...overrides,
});

describe("pending cluster state", () => {
  it("removes a bootstrap placeholder once any canonical cluster identity is observed", () => {
    const actual = cluster();
    expect(reconcilePendingClusters([actual.id], [actual])).toEqual([]);
    expect(reconcilePendingClusters([actual.name], [actual])).toEqual([]);
    expect(reconcilePendingClusters([actual.displayName!], [actual])).toEqual([]);
  });

  it("keeps a placeholder while the server has not observed the cluster", () => {
    expect(reconcilePendingClusters(["new-game-server"], [cluster()])).toEqual(["new-game-server"]);
  });

  it("removes every known alias after disconnect succeeds", () => {
    const actual = cluster();
    expect(removePendingClusterReferences(
      [actual.id, actual.name, actual.displayName!, "another-cluster"],
      [actual.id, actual.name, actual.displayName],
    )).toEqual(["another-cluster"]);
  });
});
