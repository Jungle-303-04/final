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
    freshness: {
      state: "fresh",
      receivedAt: "2026-07-11T00:00:05Z",
      staleAfterMs: 15_000,
      observedAt: "2026-07-11T00:00:00Z",
      ageMs: 5_000,
      reason: null,
    },
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

  it("maps fresh snapshot evidence into every verdict and placement relation", () => {
    const projection = createHierarchyEngineProjection(snapshot(), { level: "fleet" });
    if (!projection.ok) throw projection.error;

    const freshnessEvidence = {
      state: "fresh",
      receivedAt: "2026-07-11T00:00:05Z",
      staleAfterMs: 15_000,
      observedAt: "2026-07-11T00:00:00Z",
      ageMs: 5_000,
      reason: null,
    };

    expect(
      projection.projection.state.canonical.entities.map((entity) => ({
        level: entity.ownHealth?.level,
        freshness: entity.ownHealth?.freshness,
        evidence: entity.attributes.freshness,
      })),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        level: "healthy",
        freshness: "fresh",
        evidence: freshnessEvidence,
      })),
    );
    expect(
      projection.projection.state.canonical.relations.map((relation) => ({
        claim: relation.claims[0]?.conditions.freshness,
        effective: relation.effective.conditions.freshness,
        claimEvidence: relation.claims[0]?.attributes.freshness,
        relationEvidence: relation.attributes.freshness,
      })),
    ).toEqual(
      Array.from({ length: 2 }, () => ({
        claim: "fresh",
        effective: "fresh",
        claimEvidence: freshnessEvidence,
        relationEvidence: freshnessEvidence,
      })),
    );
  });

  it("keeps health unchanged when the same topology snapshot is stale", () => {
    const source: TopologyHierarchySnapshot = {
      ...snapshot(),
      freshness: {
        state: "stale",
        receivedAt: "2026-07-11T00:00:20Z",
        staleAfterMs: 15_000,
        observedAt: "2026-07-11T00:00:00Z",
        ageMs: 20_000,
        reason: {
          code: "source_observation_stale",
          messageKey: "topology.freshness.source_stale",
          detail: "Source observation is older than the freshness policy.",
        },
      },
    };
    const projection = createHierarchyEngineProjection(source, { level: "fleet" });
    if (!projection.ok) throw projection.error;

    expect(
      projection.projection.state.canonical.entities.map(
        (entity) => entity.ownHealth?.level,
      ),
    ).toEqual(["healthy", "healthy", "healthy"]);
    expect(
      projection.projection.state.canonical.entities.map(
        (entity) => entity.ownHealth?.freshness,
      ),
    ).toEqual(["stale", "stale", "stale"]);
    expect(
      projection.projection.state.canonical.relations.map(
        (relation) => relation.effective.conditions.freshness,
      ),
    ).toEqual(["stale", "stale"]);
    expect(
      projection.projection.state.canonical.entities[0]?.attributes.freshness,
    ).toEqual(source.freshness);
    expect(
      projection.projection.state.canonical.relations[0]?.attributes.freshness,
    ).toEqual(source.freshness);
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
