import {
  createTopologyCoreState,
  entityKey,
  frameId,
  relationKey,
  revision,
  type CanonicalEntity,
  type CanonicalGraphState,
  type CanonicalRelation,
  type EntityRef,
  type HealthLevel as EngineHealthLevel,
  type TopologyCoreState,
} from "../topology-engine/core";
import type {
  ClusterTopologyEntity,
  HealthLevel,
  NodeTopologyEntity,
  PodTopologyEntity,
  TopologyHierarchySnapshot,
} from "./contracts";
import type { HierarchyScope } from "./hierarchy/HierarchyTreemap";

export type HierarchyEngineProjection = {
  readonly state: TopologyCoreState;
  readonly visibleEntityKeys: ReadonlySet<string>;
};

export type HierarchyEngineProjectionResult =
  | { readonly ok: true; readonly projection: HierarchyEngineProjection }
  | { readonly ok: false; readonly error: Error };

function engineHealth(level: HealthLevel): EngineHealthLevel {
  return level;
}

function healthVerdict(
  level: HealthLevel,
  reason: string,
  observedAt: string,
  complete: boolean,
) {
  return {
    level: engineHealth(level),
    reason,
    source: "topology-hierarchy-gateway",
    observedAt,
    freshness: "unknown",
    completeness: complete ? "complete" : "partial",
    access: "allowed",
    evidenceIds: [],
  } as const;
}

function clusterRef(
  snapshot: TopologyHierarchySnapshot,
  cluster: ClusterTopologyEntity,
): EntityRef {
  return {
    entityKey: entityKey(cluster.entityKey),
    entityClass: "platform",
    identity: {
      workspaceId: snapshot.workspaceId,
      platformKind: "cluster",
      uid: cluster.clusterUid,
    },
  };
}

function nodeRef(
  snapshot: TopologyHierarchySnapshot,
  cluster: ClusterTopologyEntity,
  node: NodeTopologyEntity,
): EntityRef {
  return {
    entityKey: entityKey(node.entityKey),
    entityClass: "resource",
    identity: {
      workspaceId: snapshot.workspaceId,
      clusterUid: cluster.clusterUid,
      uid: node.resourceUid,
      canonicalGroupKind: { group: "", kind: "Node" },
      servedGvk: { group: "", version: "v1", kind: "Node" },
      name: node.displayName,
    },
  };
}

function podRef(
  snapshot: TopologyHierarchySnapshot,
  cluster: ClusterTopologyEntity,
  pod: PodTopologyEntity,
): EntityRef {
  return {
    entityKey: entityKey(pod.entityKey),
    entityClass: "resource",
    identity: {
      workspaceId: snapshot.workspaceId,
      clusterUid: cluster.clusterUid,
      uid: pod.resourceUid,
      canonicalGroupKind: { group: "", kind: "Pod" },
      servedGvk: { group: "", version: "v1", kind: "Pod" },
      namespace: pod.namespace,
      name: pod.displayName,
    },
  };
}

function canonicalEntity(
  ref: EntityRef,
  entity: ClusterTopologyEntity | NodeTopologyEntity | PodTopologyEntity,
  observedAt: string,
  complete: boolean,
  parentEntityKey?: string,
): CanonicalEntity {
  return {
    ref,
    displayName: entity.displayName,
    kindLabel: entity.kind === "cluster" ? "Cluster" : entity.kind === "node" ? "Node" : "Pod",
    membershipRole: "primary",
    lifecycle: "live",
    ...(parentEntityKey === undefined
      ? {}
      : { parentEntityKey: entityKey(parentEntityKey) }),
    ownHealth: healthVerdict(entity.health, entity.healthReason, observedAt, complete),
    attributes: {
      hierarchyKind: entity.kind,
    },
    observedAt,
  };
}

function placementRelation(
  source: EntityRef,
  target: EntityRef,
  relationType: "contains-node" | "schedules-pod",
  observedAt: string,
): CanonicalRelation {
  const key = `${relationType}:${String(source.entityKey)}:${String(target.entityKey)}`;
  const conditions = {
    configuration: "configured",
    admission: "not-applicable",
    readiness: "unknown",
    activity: "active",
    resolution: "resolved",
    access: "allowed",
    freshness: "unknown",
  } as const;

  return {
    relationKey: relationKey(key),
    plane: "placement",
    relationType,
    source,
    target,
    claims: [
      {
        claimId: key,
        sourceId: "topology-hierarchy-gateway",
        authority: "authoritative",
        conditions,
        evidenceIds: [],
        observedAt,
        attributes: {},
      },
    ],
    effective: {
      authority: "authoritative",
      conditions,
      resolverPolicyId: "placement-authoritative/v1",
      conflictAxes: [],
    },
    evidenceIds: [],
    observedAt,
    attributes: {},
  };
}

function visibleKeys(
  snapshot: TopologyHierarchySnapshot,
  scope: HierarchyScope,
): readonly string[] {
  if (scope.level === "fleet") {
    return snapshot.clusters.map((cluster) => cluster.entityKey);
  }

  const cluster = snapshot.clusters.find((item) => item.entityKey === scope.clusterKey);
  if (cluster === undefined) return [];
  if (scope.level === "cluster") return cluster.nodes.map((node) => node.entityKey);

  const node = cluster.nodes.find((item) => item.entityKey === scope.nodeKey);
  return node?.pods.map((pod) => pod.entityKey) ?? [];
}

function scopeRevision(scope: HierarchyScope): string {
  if (scope.level === "fleet") return "fleet";
  if (scope.level === "cluster") return `cluster:${scope.clusterKey}`;
  return `node:${scope.clusterKey}:${scope.nodeKey}`;
}

function canonicalGraph(
  snapshot: TopologyHierarchySnapshot,
  scope: HierarchyScope,
): CanonicalGraphState {
  const entities: CanonicalEntity[] = [];
  const relations: CanonicalRelation[] = [];
  const complete = snapshot.completeness.state === "complete";

  for (const cluster of snapshot.clusters) {
    const clusterIdentity = clusterRef(snapshot, cluster);
    entities.push(
      canonicalEntity(clusterIdentity, cluster, snapshot.observedAt, complete),
    );

    for (const node of cluster.nodes) {
      const nodeIdentity = nodeRef(snapshot, cluster, node);
      entities.push(
        canonicalEntity(
          nodeIdentity,
          node,
          snapshot.observedAt,
          complete,
          cluster.entityKey,
        ),
      );
      relations.push(
        placementRelation(
          clusterIdentity,
          nodeIdentity,
          "contains-node",
          snapshot.observedAt,
        ),
      );

      for (const pod of node.pods) {
        const podIdentity = podRef(snapshot, cluster, pod);
        entities.push(
          canonicalEntity(
            podIdentity,
            pod,
            snapshot.observedAt,
            complete,
            node.entityKey,
          ),
        );
        relations.push(
          placementRelation(
            nodeIdentity,
            podIdentity,
            "schedules-pod",
            snapshot.observedAt,
          ),
        );
      }
    }
  }

  const scopeKey = scopeRevision(scope);
  return {
    canonicalRevision: revision(snapshot.snapshotRevision, "canonical"),
    universeRevision: revision(
      `${snapshot.snapshotRevision}:${scopeKey}`,
      "universe",
    ),
    frameId: frameId(snapshot.snapshotRevision),
    streamId: revision(`snapshot:${snapshot.snapshotRevision}`, "stream"),
    streamSequence: 0,
    entities,
    relations,
    mapUniverseEntityKeys: visibleKeys(snapshot, scope).map(entityKey),
  };
}

/**
 * Converts the gateway DTO into the headless engine's canonical graph. The UI
 * never renders an unvalidated resource universe.
 */
export function createHierarchyEngineProjection(
  snapshot: TopologyHierarchySnapshot,
  scope: HierarchyScope,
): HierarchyEngineProjectionResult {
  try {
    const state = createTopologyCoreState({
      canonical: canonicalGraph(snapshot, scope),
      presentationRevision: revision(
        `${snapshot.snapshotRevision}:${scopeRevision(scope)}:map`,
        "presentation",
      ),
    });

    return {
      ok: true,
      projection: {
        state,
        visibleEntityKeys: new Set(
          state.canonical.mapUniverseEntityKeys.map(String),
        ),
      },
    };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause : new Error("Unknown topology engine error"),
    };
  }
}
