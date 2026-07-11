import type { EntityKey, RelationKey } from "./brand"

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type EntityClass =
  | "platform"
  | "resource"
  | "embedded"
  | "projection"
  | "external"
  | "placeholder"

export type CanonicalGvk = Readonly<{
  group: string
  version: string
  kind: string
}>

export type CanonicalGroupKind = Readonly<{
  group: string
  kind: string
}>

export type KubernetesResourceIdentity = Readonly<{
  workspaceId: string
  clusterUid: string
  uid: string
  canonicalGroupKind: CanonicalGroupKind
  servedGvk: CanonicalGvk
  namespace?: string
  name: string
}>

export type PlatformIdentity = Readonly<{
  workspaceId: string
  platformKind: "cluster"
  uid: string
}>

export type EmbeddedIdentity = Readonly<{
  parentEntityKey: EntityKey
  embeddedKind: "container" | "endpoint" | "port" | "condition"
  stableKey: string
}>

export type EntityRef =
  | Readonly<{
      entityKey: EntityKey
      entityClass: "platform"
      identity: PlatformIdentity
    }>
  | Readonly<{
      entityKey: EntityKey
      entityClass: "resource"
      identity: KubernetesResourceIdentity
    }>
  | Readonly<{
      entityKey: EntityKey
      entityClass: "embedded"
      identity: EmbeddedIdentity
    }>
  | Readonly<{
      entityKey: EntityKey
      entityClass: "projection"
      projectionKey: string
    }>
  | Readonly<{
      entityKey: EntityKey
      entityClass: "external"
      externalKey: string
    }>
  | Readonly<{
      entityKey: EntityKey
      entityClass: "placeholder"
      placeholderReason:
        | "unresolved"
        | "restricted"
        | "deleted"
        | "not-collected"
      unresolvedCoordinate?: Readonly<{
        group?: string
        kind?: string
        namespace?: string
        name?: string
      }>
    }>

export const HEALTH_SEVERITY_ORDER = [
  "unhealthy",
  "degraded",
  "unknown",
  "neutral",
  "healthy",
] as const

export type HealthLevel = (typeof HEALTH_SEVERITY_ORDER)[number]

export type TopologyHealthVerdict = Readonly<{
  level: HealthLevel
  reason: string
  message?: string
  source: string
  observedAt: string
  freshness: "fresh" | "stale" | "unknown"
  completeness: "complete" | "partial" | "unknown"
  access: "allowed" | "forbidden"
  evidenceIds: readonly string[]
}>

export type AggregateHealth = Readonly<{
  effectiveLevel: HealthLevel
  counts: Readonly<Record<HealthLevel, number>>
  observedChildCount: number
  expectedAuthorizedChildCount: number
  policyId: string
}>

export type EntityMembershipRole =
  | "primary"
  | "ancestor-context"
  | "relation-context"
  | "filtered-remainder"
  | "structural-shelf"

export type EntityLifecycle =
  | "live"
  | "deleting"
  | "tombstone-exit"
  | "historical"

/** Provider-neutral canonical entity consumed by the headless engine. */
export type CanonicalEntity = Readonly<{
  ref: EntityRef
  displayName: string
  kindLabel: string
  membershipRole: EntityMembershipRole
  lifecycle: EntityLifecycle
  parentEntityKey?: EntityKey
  ownHealth?: TopologyHealthVerdict
  aggregateHealth?: AggregateHealth
  attributes: Readonly<Record<string, JsonValue>>
  observedAt: string
}>

export type RelationPlane =
  | "placement"
  | "ownership"
  | "network-configured"
  | "network-effective"
  | "network-observed"
  | "dependency"
  | "storage"
  | "scaling-policy"
  | "policy-security"
  | "policy-availability"
  | "policy-governance"
  | "gitops-provenance"

export type RelationAuthority = "authoritative" | "derived" | "heuristic"

export type RelationConditions = Readonly<{
  configuration:
    | "configured"
    | "not-configured"
    | "not-applicable"
    | "unknown"
  admission: "accepted" | "rejected" | "not-applicable" | "unknown"
  readiness: "ready" | "not-ready" | "not-applicable" | "unknown"
  activity: "active" | "inactive" | "not-applicable" | "unknown"
  resolution: "resolved" | "unresolved" | "unknown"
  access: "allowed" | "restricted"
  freshness: "fresh" | "stale" | "unknown"
}>

export type RelationClaim = Readonly<{
  claimId: string
  sourceId: string
  authority: RelationAuthority
  conditions: RelationConditions
  evidenceIds: readonly string[]
  observedAt: string
  attributes: Readonly<Record<string, JsonValue>>
}>

export type EffectiveRelationAssessment = Readonly<{
  authority: RelationAuthority
  conditions: RelationConditions
  resolverPolicyId: string
  conflictAxes: readonly (keyof RelationConditions)[]
}>

/** Canonical direction is retained even when a renderer lays the edge out in reverse. */
export type CanonicalRelation = Readonly<{
  relationKey: RelationKey
  plane: RelationPlane
  relationType: string
  source: EntityRef
  target: EntityRef
  portKey?: string
  protocol?: string
  relationQualifier?: string
  claims: readonly RelationClaim[]
  effective: EffectiveRelationAssessment
  evidenceIds: readonly string[]
  observedAt: string
  validFrom?: string
  validUntil?: string
  attributes: Readonly<Record<string, JsonValue>>
}>

/** Missing or forbidden health is deliberately grouped as unknown. */
export function effectiveHealthLevel(entity: CanonicalEntity): HealthLevel {
  if (entity.ownHealth !== undefined) {
    return entity.ownHealth.access === "allowed"
      ? entity.ownHealth.level
      : "unknown"
  }

  return entity.aggregateHealth?.effectiveLevel ?? "unknown"
}

export function isAllowedCanonicalRelation(
  relation: CanonicalRelation,
): boolean {
  return relation.effective.conditions.access === "allowed"
}
