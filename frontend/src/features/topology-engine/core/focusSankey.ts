import {
  compareOpaque,
  connectorKey,
  type ConnectorKey,
  type DecimalString,
  type EntityKey,
  type RelationKey,
  type Revision,
} from "./brand"
import {
  effectiveHealthLevel,
  HEALTH_SEVERITY_ORDER,
  isAllowedCanonicalRelation,
  type CanonicalEntity,
  type CanonicalRelation,
  type HealthLevel,
} from "./model"
import { equalLayoutRevision, type LayoutRevision } from "./revision"

export type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]]

export type FocusSankeyMember =
  | Readonly<{
      kind: "related"
      entityKey: EntityKey
      relationKeys: NonEmptyReadonlyArray<RelationKey>
      healthLevel: HealthLevel
    }>
  | Readonly<{
      kind: "unrelated"
      entityKey: EntityKey
      relationKeys: readonly []
      healthLevel: HealthLevel
    }>

export type FocusSankeyConnector = Readonly<{
  connectorKey: ConnectorKey
  healthLevel: HealthLevel
  memberEntityKeys: NonEmptyReadonlyArray<EntityKey>
  canonicalRelationKeys: NonEmptyReadonlyArray<RelationKey>
  sourceFaceStartRatio: DecimalString
  sourceFaceEndRatio: DecimalString
}>

export type FocusSankeyLayout = Readonly<{
  layoutRevision: LayoutRevision
  universeRevision: Revision<"universe">
  sourceEntityKey: EntityKey
  mapUniverseEntityKeys: readonly EntityKey[]
  members: readonly FocusSankeyMember[]
  relatedEntityKeys: readonly EntityKey[]
  unrelatedEntityKeys: readonly EntityKey[]
  orderedRightEntityKeys: readonly EntityKey[]
  connectors: readonly FocusSankeyConnector[]
  faceIntervalScale: number
}>

export type FocusSankeyInput = Readonly<{
  layoutRevision: LayoutRevision
  universeRevision: Revision<"universe">
  sourceEntityKey: EntityKey
  /** Ordered committed map universe; this is the deterministic projection order. */
  mapUniverseEntityKeys: readonly EntityKey[]
  entities: readonly CanonicalEntity[]
  relations: readonly CanonicalRelation[]
  faceIntervalScale?: number
}>

export type FocusSankeyErrorCode =
  | "INVALID_FACE_INTERVAL_SCALE"
  | "DUPLICATE_UNIVERSE_ENTITY"
  | "DUPLICATE_ENTITY"
  | "MISSING_ENTITY"
  | "SOURCE_NOT_IN_UNIVERSE"
  | "DUPLICATE_RELATION"
  | "FACE_INTERVAL_UNREPRESENTABLE"
  | "INVARIANT_VIOLATION"

export type FocusSankeyError = Readonly<{
  code: FocusSankeyErrorCode
  message: string
  entityKey?: EntityKey
  relationKey?: RelationKey
  violations?: readonly FocusSankeyInvariantViolation[]
}>

export type FocusSankeyResult =
  | Readonly<{ ok: true; layout: FocusSankeyLayout }>
  | Readonly<{ ok: false; error: FocusSankeyError }>

export type FocusSankeyInvariantViolation = Readonly<{
  code: string
  message: string
}>

export class FocusSankeyInvariantError extends Error {
  readonly code = "FOCUS_SANKEY_INVARIANT_VIOLATION"

  constructor(readonly violations: readonly FocusSankeyInvariantViolation[]) {
    super(violations.map((violation) => violation.message).join("; "))
    this.name = "FocusSankeyInvariantError"
  }
}

export const DEFAULT_FACE_INTERVAL_SCALE = 9
export const MAX_FACE_INTERVAL_SCALE = 18

const HEALTH_ORDER_INDEX: Readonly<Record<HealthLevel, number>> = {
  unhealthy: 0,
  degraded: 1,
  unknown: 2,
  neutral: 3,
  healthy: 4,
}

function duplicateValue<Value extends string>(values: readonly Value[]): Value | null {
  const seen = new Set<Value>()
  for (const value of values) {
    if (seen.has(value)) return value
    seen.add(value)
  }
  return null
}

function exactArrayEqual<Value extends string>(
  left: readonly Value[],
  right: readonly Value[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function exactSetEqual<Value extends string>(
  left: readonly Value[],
  right: readonly Value[],
): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

function toNonEmpty<Value>(
  values: readonly Value[],
): NonEmptyReadonlyArray<Value> | null {
  const first = values[0]
  if (first === undefined) return null
  return [first, ...values.slice(1)]
}

function focusConnectorKey(
  sourceEntityKey: EntityKey,
  healthLevel: HealthLevel,
): ConnectorKey {
  const source = String(sourceEntityKey)
  return connectorKey(
    `focus-face:${source.length}:${source}:${healthLevel.length}:${healthLevel}`,
  )
}

function formatQuanta(
  value: bigint,
  scale: number,
  totalQuanta: bigint,
): DecimalString {
  if (value === 0n) return "0" as DecimalString
  if (value === totalQuanta) return "1" as DecimalString

  const padded = value.toString().padStart(scale + 1, "0")
  const integer = padded.slice(0, -scale)
  const fraction = padded.slice(-scale).replace(/0+$/u, "")
  return `${integer}.${fraction}` as DecimalString
}

function decimalToQuanta(value: DecimalString, scale: number): bigint | null {
  const text = String(value)
  if (text === "0") return 0n
  if (text === "1") return 10n ** BigInt(scale)
  if (!/^0\.[0-9]+$/u.test(text)) return null

  const fraction = text.slice(2)
  if (fraction.length > scale) return null
  return BigInt(fraction.padEnd(scale, "0"))
}

type GroupDraft = Readonly<{
  connectorKey: ConnectorKey
  healthLevel: HealthLevel
  members: NonEmptyReadonlyArray<Extract<FocusSankeyMember, { kind: "related" }>>
}>

type FaceInterval = Readonly<{
  start: DecimalString
  end: DecimalString
}>

function allocateFaceIntervals(
  groups: readonly GroupDraft[],
  scale: number,
): readonly FaceInterval[] | null {
  if (groups.length === 0) return []

  const totalMembers = groups.reduce(
    (sum, group) => sum + BigInt(group.members.length),
    0n,
  )
  const totalQuanta = 10n ** BigInt(scale)
  const allocations = groups.map((group, index) => {
    const numerator = BigInt(group.members.length) * totalQuanta
    const floor = numerator / totalMembers
    const remainder = numerator % totalMembers
    const twiceRemainder = remainder * 2n
    const roundUp =
      twiceRemainder > totalMembers ||
      (twiceRemainder === totalMembers && floor % 2n !== 0n)
    return {
      index,
      connectorKey: group.connectorKey,
      quanta: floor + (roundUp ? 1n : 0n),
      remainder,
    }
  })

  const allocated = allocations.reduce((sum, item) => sum + item.quanta, 0n)
  const residual = totalQuanta - allocated
  const residualOrder = [...allocations].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1
    }
    return compareOpaque(left.connectorKey, right.connectorKey)
  })

  if (residual !== 0n) {
    const residualTarget = residualOrder[0]
    if (residualTarget === undefined) return null
    residualTarget.quanta += residual
  }

  if (allocations.some((allocation) => allocation.quanta <= 0n)) return null

  let cursor = 0n
  return allocations.map((allocation) => {
    const start = cursor
    cursor += allocation.quanta
    return {
      start: formatQuanta(start, scale, totalQuanta),
      end: formatQuanta(cursor, scale, totalQuanta),
    }
  })
}

function error(
  code: FocusSankeyErrorCode,
  message: string,
  context: Pick<FocusSankeyError, "entityKey" | "relationKey" | "violations"> = {},
): FocusSankeyResult {
  return { ok: false, error: { code, message, ...context } }
}

/**
 * Computes U/A/N/G without sampling:
 * U is the ordered map universe, A is the related set, N is the unrelated set,
 * and G is A partitioned once by canonical health severity.
 */
export function computeFocusSankeyLayout(
  input: FocusSankeyInput,
): FocusSankeyResult {
  const scale = input.faceIntervalScale ?? DEFAULT_FACE_INTERVAL_SCALE
  if (
    !Number.isSafeInteger(scale) ||
    scale < 1 ||
    scale > MAX_FACE_INTERVAL_SCALE
  ) {
    return error(
      "INVALID_FACE_INTERVAL_SCALE",
      `faceIntervalScale must be a safe integer between 1 and ${MAX_FACE_INTERVAL_SCALE}`,
    )
  }

  const duplicateUniverseKey = duplicateValue(input.mapUniverseEntityKeys)
  if (duplicateUniverseKey !== null) {
    return error(
      "DUPLICATE_UNIVERSE_ENTITY",
      `map universe contains duplicate entity ${duplicateUniverseKey}`,
      { entityKey: duplicateUniverseKey },
    )
  }

  if (!input.mapUniverseEntityKeys.includes(input.sourceEntityKey)) {
    return error(
      "SOURCE_NOT_IN_UNIVERSE",
      `focus source ${input.sourceEntityKey} is not in the committed map universe`,
      { entityKey: input.sourceEntityKey },
    )
  }

  const entitiesByKey = new Map<EntityKey, CanonicalEntity>()
  for (const entity of input.entities) {
    const key = entity.ref.entityKey
    if (entitiesByKey.has(key)) {
      return error("DUPLICATE_ENTITY", `canonical entity ${key} is duplicated`, {
        entityKey: key,
      })
    }
    entitiesByKey.set(key, entity)
  }

  for (const key of input.mapUniverseEntityKeys) {
    if (!entitiesByKey.has(key)) {
      return error(
        "MISSING_ENTITY",
        `map universe entity ${key} is missing from the canonical entity store`,
        { entityKey: key },
      )
    }
  }

  const relationKeys = new Set<RelationKey>()
  for (const relation of input.relations) {
    if (relationKeys.has(relation.relationKey)) {
      return error(
        "DUPLICATE_RELATION",
        `canonical relation ${relation.relationKey} is duplicated`,
        { relationKey: relation.relationKey },
      )
    }
    relationKeys.add(relation.relationKey)
  }

  const universeSet = new Set(input.mapUniverseEntityKeys)
  const relationKeysByMember = new Map<EntityKey, Set<RelationKey>>()
  for (const relation of input.relations) {
    if (!isAllowedCanonicalRelation(relation)) continue

    const sourceKey = relation.source.entityKey
    const targetKey = relation.target.entityKey
    let memberKey: EntityKey | null = null
    if (
      sourceKey === input.sourceEntityKey &&
      targetKey !== input.sourceEntityKey &&
      universeSet.has(targetKey)
    ) {
      memberKey = targetKey
    } else if (
      targetKey === input.sourceEntityKey &&
      sourceKey !== input.sourceEntityKey &&
      universeSet.has(sourceKey)
    ) {
      memberKey = sourceKey
    }

    if (memberKey === null) continue
    const keys = relationKeysByMember.get(memberKey) ?? new Set<RelationKey>()
    keys.add(relation.relationKey)
    relationKeysByMember.set(memberKey, keys)
  }

  const membersByKey = new Map<EntityKey, FocusSankeyMember>()
  const relatedByHealth = new Map<
    HealthLevel,
    Extract<FocusSankeyMember, { kind: "related" }>[]
  >()
  const unrelatedMembers: Extract<
    FocusSankeyMember,
    { kind: "unrelated" }
  >[] = []

  for (const key of input.mapUniverseEntityKeys) {
    if (key === input.sourceEntityKey) continue
    const entity = entitiesByKey.get(key)
    if (entity === undefined) {
      return error("MISSING_ENTITY", `canonical entity ${key} is missing`, {
        entityKey: key,
      })
    }
    const healthLevel = effectiveHealthLevel(entity)
    const relatedKeys = [
      ...(relationKeysByMember.get(key) ?? new Set<RelationKey>()),
    ].sort(compareOpaque)
    const nonEmptyRelationKeys = toNonEmpty(relatedKeys)

    if (nonEmptyRelationKeys === null) {
      const member = {
        kind: "unrelated",
        entityKey: key,
        relationKeys: [],
        healthLevel,
      } as const
      unrelatedMembers.push(member)
      membersByKey.set(key, member)
      continue
    }

    const member = {
      kind: "related",
      entityKey: key,
      relationKeys: nonEmptyRelationKeys,
      healthLevel,
    } as const
    const healthMembers = relatedByHealth.get(healthLevel) ?? []
    healthMembers.push(member)
    relatedByHealth.set(healthLevel, healthMembers)
    membersByKey.set(key, member)
  }

  const groupDrafts: GroupDraft[] = []
  for (const healthLevel of HEALTH_SEVERITY_ORDER) {
    const healthMembers = relatedByHealth.get(healthLevel) ?? []
    const nonEmptyMembers = toNonEmpty(healthMembers)
    if (nonEmptyMembers === null) continue
    groupDrafts.push({
      connectorKey: focusConnectorKey(input.sourceEntityKey, healthLevel),
      healthLevel,
      members: nonEmptyMembers,
    })
  }

  const intervals = allocateFaceIntervals(groupDrafts, scale)
  if (intervals === null) {
    return error(
      "FACE_INTERVAL_UNREPRESENTABLE",
      `related health groups cannot be represented at decimal scale ${scale}`,
    )
  }

  const connectors: FocusSankeyConnector[] = []
  for (let index = 0; index < groupDrafts.length; index += 1) {
    const group = groupDrafts[index]
    const interval = intervals[index]
    if (group === undefined || interval === undefined) {
      return error(
        "INVARIANT_VIOLATION",
        "face interval allocation did not produce a one-to-one group mapping",
      )
    }

    const canonicalRelationKeys = [
      ...new Set(group.members.flatMap((member) => member.relationKeys)),
    ].sort(compareOpaque)
    const nonEmptyCanonicalRelationKeys = toNonEmpty(canonicalRelationKeys)
    if (nonEmptyCanonicalRelationKeys === null) {
      return error(
        "INVARIANT_VIOLATION",
        `related group ${group.connectorKey} has no canonical relation`,
      )
    }

    const memberEntityKeys = toNonEmpty(
      group.members.map((member) => member.entityKey),
    )
    if (memberEntityKeys === null) {
      return error(
        "INVARIANT_VIOLATION",
        `related group ${group.connectorKey} has no member entity`,
      )
    }

    connectors.push({
      connectorKey: group.connectorKey,
      healthLevel: group.healthLevel,
      memberEntityKeys,
      canonicalRelationKeys: nonEmptyCanonicalRelationKeys,
      sourceFaceStartRatio: interval.start,
      sourceFaceEndRatio: interval.end,
    })
  }

  const relatedEntityKeys = connectors.flatMap(
    (connector) => connector.memberEntityKeys,
  )
  const unrelatedEntityKeys = unrelatedMembers.map((member) => member.entityKey)
  const orderedRightEntityKeys = [...relatedEntityKeys, ...unrelatedEntityKeys]
  const members: FocusSankeyMember[] = []
  for (const key of orderedRightEntityKeys) {
    const member = membersByKey.get(key)
    if (member === undefined) {
      return error(
        "INVARIANT_VIOLATION",
        `computed layout member ${key} is missing`,
      )
    }
    members.push(member)
  }

  const layout: FocusSankeyLayout = {
    layoutRevision: input.layoutRevision,
    universeRevision: input.universeRevision,
    sourceEntityKey: input.sourceEntityKey,
    mapUniverseEntityKeys: [...input.mapUniverseEntityKeys],
    members,
    relatedEntityKeys,
    unrelatedEntityKeys,
    orderedRightEntityKeys,
    connectors,
    faceIntervalScale: scale,
  }

  const violations = validateFocusSankeyLayout(input, layout)
  if (violations.length > 0) {
    return error(
      "INVARIANT_VIOLATION",
      "computed focus-Sankey layout failed its completeness proof",
      { violations },
    )
  }

  return { ok: true, layout }
}

function incidentRelationKeys(
  input: FocusSankeyInput,
  entityKey: EntityKey,
): readonly RelationKey[] {
  const keys = new Set<RelationKey>()
  for (const relation of input.relations) {
    if (!isAllowedCanonicalRelation(relation)) continue
    const sourceKey = relation.source.entityKey
    const targetKey = relation.target.entityKey
    const connectsSourceAndEntity =
      (sourceKey === input.sourceEntityKey && targetKey === entityKey) ||
      (targetKey === input.sourceEntityKey && sourceKey === entityKey)
    if (connectsSourceAndEntity) keys.add(relation.relationKey)
  }
  return [...keys].sort(compareOpaque)
}

/** Independently re-checks the U/A/N/G proof before a worker result is committed. */
export function validateFocusSankeyLayout(
  input: FocusSankeyInput,
  layout: FocusSankeyLayout,
): readonly FocusSankeyInvariantViolation[] {
  const violations: FocusSankeyInvariantViolation[] = []
  const report = (code: string, message: string): void => {
    violations.push({ code, message })
  }

  if (layout.sourceEntityKey !== input.sourceEntityKey) {
    report("SOURCE_MISMATCH", "layout source does not match the requested source")
  }
  if (!exactArrayEqual(layout.mapUniverseEntityKeys, input.mapUniverseEntityKeys)) {
    report("UNIVERSE_MISMATCH", "layout universe does not preserve map order")
  }
  if (duplicateValue(layout.mapUniverseEntityKeys) !== null) {
    report("UNIVERSE_DUPLICATE", "layout universe contains duplicate entities")
  }
  if (!equalLayoutRevision(layout.layoutRevision, input.layoutRevision)) {
    report("LAYOUT_REVISION_MISMATCH", "layout revision was not echoed exactly")
  }
  if (layout.universeRevision !== input.universeRevision) {
    report("UNIVERSE_REVISION_MISMATCH", "universe revision was not echoed exactly")
  }

  const expectedRight = input.mapUniverseEntityKeys.filter(
    (key) => key !== input.sourceEntityKey,
  )
  if (layout.orderedRightEntityKeys.length + 1 !== input.mapUniverseEntityKeys.length) {
    report(
      "RIGHT_CARDINALITY",
      "right column cardinality plus source must equal map universe cardinality",
    )
  }
  if (duplicateValue(layout.orderedRightEntityKeys) !== null) {
    report("RIGHT_DUPLICATE", "right column contains a duplicate entity")
  }
  if (layout.orderedRightEntityKeys.includes(input.sourceEntityKey)) {
    report("SOURCE_IN_RIGHT", "source is duplicated in the right column")
  }
  if (!exactSetEqual(layout.orderedRightEntityKeys, expectedRight)) {
    report("RIGHT_NOT_EXHAUSTIVE", "right column is not an exact U minus source set")
  }

  const relatedFromConnectors = layout.connectors.flatMap(
    (connector) => connector.memberEntityKeys,
  )
  if (!exactArrayEqual(relatedFromConnectors, layout.relatedEntityKeys)) {
    report("RELATED_ORDER", "related order must equal connector member order")
  }
  if (duplicateValue(relatedFromConnectors) !== null) {
    report("RELATED_DUPLICATE", "a related entity belongs to more than one group")
  }
  if (duplicateValue(layout.unrelatedEntityKeys) !== null) {
    report("UNRELATED_DUPLICATE", "unrelated tail contains a duplicate entity")
  }
  if (
    layout.relatedEntityKeys.some((key) => layout.unrelatedEntityKeys.includes(key))
  ) {
    report("A_N_OVERLAP", "related and unrelated sets are not disjoint")
  }
  if (
    !exactArrayEqual(
      layout.orderedRightEntityKeys,
      [...layout.relatedEntityKeys, ...layout.unrelatedEntityKeys],
    )
  ) {
    report("UNRELATED_NOT_TAIL", "unrelated entities must remain at the column tail")
  }

  const entityByKey = new Map(
    input.entities.map((entity) => [entity.ref.entityKey, entity] as const),
  )
  const expectedUnrelated = expectedRight.filter(
    (key) => incidentRelationKeys(input, key).length === 0,
  )
  const expectedRelated = HEALTH_SEVERITY_ORDER.flatMap((healthLevel) =>
    expectedRight.filter((key) => {
      const entity = entityByKey.get(key)
      return (
        entity !== undefined &&
        effectiveHealthLevel(entity) === healthLevel &&
        incidentRelationKeys(input, key).length > 0
      )
    }),
  )
  if (!exactArrayEqual(layout.relatedEntityKeys, expectedRelated)) {
    report(
      "RELATED_DETERMINISTIC_ORDER",
      "related entities must follow severity then committed projection order",
    )
  }
  if (!exactArrayEqual(layout.unrelatedEntityKeys, expectedUnrelated)) {
    report(
      "UNRELATED_DETERMINISTIC_ORDER",
      "unrelated tail must preserve committed projection order",
    )
  }
  const memberByKey = new Map(
    layout.members.map((member) => [member.entityKey, member] as const),
  )
  if (
    !exactArrayEqual(
      layout.members.map((member) => member.entityKey),
      layout.orderedRightEntityKeys,
    )
  ) {
    report("MEMBER_ORDER", "member records must follow right column order exactly")
  }

  for (const key of expectedRight) {
    const member = memberByKey.get(key)
    const entity = entityByKey.get(key)
    if (member === undefined || entity === undefined) {
      report("MEMBER_MISSING", `entity ${key} has no complete member record`)
      continue
    }

    if (member.healthLevel !== effectiveHealthLevel(entity)) {
      report("MEMBER_HEALTH", `entity ${key} is assigned to the wrong health bucket`)
    }
    const expectedRelations = incidentRelationKeys(input, key)
    if (expectedRelations.length === 0) {
      if (member.kind !== "unrelated" || !layout.unrelatedEntityKeys.includes(key)) {
        report("UNRELATED_CLASSIFICATION", `entity ${key} must be unrelated`)
      }
    } else if (
      member.kind !== "related" ||
      !exactArrayEqual(member.relationKeys, expectedRelations) ||
      !layout.relatedEntityKeys.includes(key)
    ) {
      report(
        "RELATED_CLASSIFICATION",
        `entity ${key} must occur once with all canonical relation keys`,
      )
    }
  }

  let previousHealthOrder = -1
  const connectorKeys = new Set<ConnectorKey>()
  const connectorHealth = new Set<HealthLevel>()
  const expectedFaceScale =
    input.faceIntervalScale ?? DEFAULT_FACE_INTERVAL_SCALE
  const validFaceScale =
    Number.isSafeInteger(layout.faceIntervalScale) &&
    layout.faceIntervalScale >= 1 &&
    layout.faceIntervalScale <= MAX_FACE_INTERVAL_SCALE
  if (!validFaceScale || layout.faceIntervalScale !== expectedFaceScale) {
    report(
      "FACE_SCALE",
      "face interval scale must match the validated request decimal policy",
    )
  }
  const totalQuanta = validFaceScale
    ? 10n ** BigInt(layout.faceIntervalScale)
    : 0n
  let expectedStart = 0n

  for (const connector of layout.connectors) {
    if (connectorKeys.has(connector.connectorKey)) {
      report("CONNECTOR_DUPLICATE", "connector keys must be unique")
    }
    connectorKeys.add(connector.connectorKey)
    if (connectorHealth.has(connector.healthLevel)) {
      report("HEALTH_GROUP_DUPLICATE", "a health bucket has more than one connector")
    }
    connectorHealth.add(connector.healthLevel)

    const healthOrder = HEALTH_ORDER_INDEX[connector.healthLevel]
    if (healthOrder <= previousHealthOrder) {
      report("HEALTH_ORDER", "connector health groups are not in severity order")
    }
    previousHealthOrder = healthOrder

    const expectedConnectorKey = focusConnectorKey(
      input.sourceEntityKey,
      connector.healthLevel,
    )
    if (connector.connectorKey !== expectedConnectorKey) {
      report("CONNECTOR_KEY", "connector key is not canonical for source and health")
    }
    for (const memberKey of connector.memberEntityKeys) {
      const member = memberByKey.get(memberKey)
      if (member?.kind !== "related" || member.healthLevel !== connector.healthLevel) {
        report(
          "CONNECTOR_MEMBER_HEALTH",
          `connector member ${memberKey} does not match its health group`,
        )
      }
    }

    const expectedRelationKeys = [
      ...new Set(
        connector.memberEntityKeys.flatMap((memberKey) => {
          const member = memberByKey.get(memberKey)
          return member?.kind === "related" ? member.relationKeys : []
        }),
      ),
    ].sort(compareOpaque)
    if (!exactArrayEqual(connector.canonicalRelationKeys, expectedRelationKeys)) {
      report(
        "CONNECTOR_RELATIONS",
        "connector relation evidence is not the exact member relation union",
      )
    }

    const start = validFaceScale
      ? decimalToQuanta(
          connector.sourceFaceStartRatio,
          layout.faceIntervalScale,
        )
      : null
    const end = validFaceScale
      ? decimalToQuanta(
          connector.sourceFaceEndRatio,
          layout.faceIntervalScale,
        )
      : null
    if (start === null || end === null) {
      report("FACE_DECIMAL", "face interval is not a canonical decimal ratio")
      continue
    }
    if (start !== expectedStart) {
      report("FACE_GAP", "face intervals must be contiguous and begin at zero")
    }
    if (end <= start || end > totalQuanta) {
      report("FACE_RANGE", "every connector must have a positive face interval")
    }
    expectedStart = end
  }

  if (layout.connectors.length === 0) {
    if (layout.relatedEntityKeys.length !== 0) {
      report("MISSING_CONNECTOR", "related entities require a connector")
    }
  } else if (expectedStart !== totalQuanta) {
    report("FACE_TOTAL", "source face partitions must sum exactly to one")
  }

  return violations
}

export function assertFocusSankeyLayout(
  input: FocusSankeyInput,
  layout: FocusSankeyLayout,
): asserts layout is FocusSankeyLayout {
  const violations = validateFocusSankeyLayout(input, layout)
  if (violations.length > 0) throw new FocusSankeyInvariantError(violations)
}
