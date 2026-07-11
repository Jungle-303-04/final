import {
  entityKey,
  frameId,
  relationKey,
  revision,
  transitionId,
  type EntityKey,
  type RelationKey,
} from "../brand"
import type {
  CanonicalEntity,
  CanonicalRelation,
  HealthLevel,
  RelationConditions,
  TopologyHealthVerdict,
} from "../model"
import type { LayoutRevision } from "../revision"

export const key = (value: string): EntityKey => entityKey(value)
export const edgeKey = (value: string): RelationKey => relationKey(value)

export function health(level: HealthLevel): TopologyHealthVerdict {
  return {
    level,
    reason: `test-${level}`,
    source: "contract-test",
    observedAt: "2026-07-11T00:00:00Z",
    freshness: "fresh",
    completeness: "complete",
    access: "allowed",
    evidenceIds: [],
  }
}

export function entity(
  value: string,
  level: HealthLevel = "healthy",
): CanonicalEntity {
  const entityKeyValue = key(value)
  return {
    ref: {
      entityKey: entityKeyValue,
      entityClass: "projection",
      projectionKey: `projection:${value}`,
    },
    displayName: value,
    kindLabel: "Test resource",
    membershipRole: "primary",
    lifecycle: "live",
    ownHealth: health(level),
    attributes: {},
    observedAt: "2026-07-11T00:00:00Z",
  }
}

const ALLOWED_CONDITIONS: RelationConditions = {
  configuration: "configured",
  admission: "accepted",
  readiness: "ready",
  activity: "active",
  resolution: "resolved",
  access: "allowed",
  freshness: "fresh",
}

export function relation(
  value: string,
  source: CanonicalEntity,
  target: CanonicalEntity,
  access: "allowed" | "restricted" = "allowed",
): CanonicalRelation {
  return {
    relationKey: edgeKey(value),
    plane: "network-configured",
    relationType: "test-connects",
    source: source.ref,
    target: target.ref,
    claims: [],
    effective: {
      authority: "authoritative",
      conditions: { ...ALLOWED_CONDITIONS, access },
      resolverPolicyId: "contract-test/v1",
      conflictAxes: [],
    },
    evidenceIds: [],
    observedAt: "2026-07-11T00:00:00Z",
    attributes: {},
  }
}

export function layoutRevision(seed = "1"): LayoutRevision {
  return {
    structureRevision: revision(`structure-${seed}`, "structure"),
    logicalMetricRevision: revision(`logical-${seed}`, "logical-metric"),
    geometryMetricRevision: revision(`geometry-${seed}`, "geometry-metric"),
    presentationGroupingRevision: revision(
      `grouping-${seed}`,
      "presentation-grouping",
    ),
    dataQueryHash: revision(`query-${seed}`, "data-query-hash"),
    projectionHash: revision(`projection-${seed}`, "projection-hash"),
    presentationHash: revision(`presentation-${seed}`, "presentation-hash"),
    viewportRevision: revision(`viewport-${seed}`, "viewport"),
    policyRevision: revision(`policy-${seed}`, "layout-policy"),
  }
}

export const ids = {
  frame: (value: string) => frameId(value),
  canonical: (value: string) => revision(value, "canonical"),
  universe: (value: string) => revision(value, "universe"),
  stream: (value: string) => revision(value, "stream"),
  presentation: (value: string) => revision(value, "presentation"),
  transition: (value: string) => transitionId(value),
} as const
