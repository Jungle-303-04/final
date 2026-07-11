import { describe, expect, it } from "vitest";

import type { TopologyHierarchySnapshot } from "./contracts";
import { createHierarchyEngineProjection } from "./engineProjection";

const metric = {
  state: "value",
  valueDecimal: "1",
  unitId: "core",
} as const;

function snapshot(): TopologyHierarchySnapshot {
  return {
    schemaVersion: "topology-hierarchy/v1",
    workspaceId: "workspace:test",
    snapshotRevision: "snapshot:test:1",
    observedAt: "2026-07-11T00:00:00Z",
    dataOrigin: { kind: "live", adapterId: "test" },
    areaMetrics: [
      {
        metricId: "cpu.usage.cores",
        label: "CPU 사용 코어",
        unitId: "core",
        additive: true,
        order: 10,
      },
    ],
    defaultAreaMetricId: "cpu.usage.cores",
    completeness: { state: "complete" },
    clusters: [
      {
        kind: "cluster",
        entityKey: "cluster:test",
        clusterUid: "cluster-uid",
        displayName: "test-cluster",
        environmentLabel: "Test",
        health: "healthy",
        healthReason: "Ready",
        metrics: { "cpu.usage.cores": metric },
        nodes: [
          {
            kind: "node",
            entityKey: "node:test",
            resourceUid: "node-uid",
            displayName: "test-node",
            health: "healthy",
            healthReason: "Ready",
            metrics: { "cpu.usage.cores": metric },
            pods: [
              {
                kind: "pod",
                entityKey: "pod:test",
                resourceUid: "pod-uid",
                displayName: "test-pod",
                namespace: "default",
                phase: "Running",
                health: "healthy",
                healthReason: "Ready",
                metrics: { "cpu.usage.cores": metric },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("createHierarchyEngineProjection", () => {
  it("projects fleet, cluster, and node scopes into validated map universes", () => {
    const source = snapshot();
    const fleet = createHierarchyEngineProjection(source, { level: "fleet" });
    const cluster = createHierarchyEngineProjection(source, {
      level: "cluster",
      clusterKey: "cluster:test",
    });
    const node = createHierarchyEngineProjection(source, {
      level: "node",
      clusterKey: "cluster:test",
      nodeKey: "node:test",
    });

    expect(fleet.ok && [...fleet.projection.visibleEntityKeys]).toEqual(["cluster:test"]);
    expect(cluster.ok && [...cluster.projection.visibleEntityKeys]).toEqual(["node:test"]);
    expect(node.ok && [...node.projection.visibleEntityKeys]).toEqual(["pod:test"]);
    expect(fleet.ok && fleet.projection.state.canonical.entities).toHaveLength(3);
    expect(fleet.ok && fleet.projection.state.canonical.relations).toHaveLength(2);
  });

  it("rejects duplicate canonical identities instead of rendering ambiguous tiles", () => {
    const source = snapshot();
    const cluster = source.clusters[0];
    const node = cluster?.nodes[0];
    const pod = node?.pods[0];
    if (cluster === undefined || node === undefined || pod === undefined) {
      throw new Error("test fixture is incomplete");
    }

    const invalid: TopologyHierarchySnapshot = {
      ...source,
      clusters: [
        {
          ...cluster,
          nodes: [
            {
              ...node,
              pods: [{ ...pod, entityKey: node.entityKey }],
            },
          ],
        },
      ],
    };

    expect(createHierarchyEngineProjection(invalid, { level: "fleet" }).ok).toBe(false);
  });
});
