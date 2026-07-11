import type {
  ConnectorKey,
  EntityKey,
  FlowKey,
  FrameId,
  RelationKey,
  Revision,
  SceneRelationKey,
} from "./brand"
import type { NonEmptyReadonlyArray } from "./focusSankey"
import type {
  EntityLifecycle,
  EntityMembershipRole,
  HealthLevel,
  RelationPlane,
} from "./model"
import type { TopologyPresentation } from "./presentation"
import type { LayoutRevision } from "./revision"

export type TileDensity = "marker" | "name" | "name-value" | "summary"

export type SceneRect = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

export type ScenePoint = Readonly<{ x: number; y: number }>

export type SceneEntityGeometry = Readonly<{
  entityKey: EntityKey
  rect: SceneRect
  zLayer: number
  density: TileDensity
  interactive: boolean
}>

export type CanonicalRelationGeometry = Readonly<{
  kind: "canonical-relation"
  sceneRelationKey: SceneRelationKey
  relationKey: RelationKey
  plane: RelationPlane
  points: readonly [ScenePoint, ScenePoint, ...ScenePoint[]]
}>

export type ObservedFlowGeometry = Readonly<{
  kind: "observed-flow"
  sceneRelationKey: SceneRelationKey
  relationKey: RelationKey
  flowKey: FlowKey
  points: readonly [ScenePoint, ScenePoint, ...ScenePoint[]]
}>

/** Presentation-only geometry; it is never promoted to a canonical relation. */
export type FocusFaceConnectorGeometry = Readonly<{
  kind: "focus-face-connector"
  sceneRelationKey: SceneRelationKey
  connectorKey: ConnectorKey
  healthLevel: HealthLevel
  memberEntityKeys: NonEmptyReadonlyArray<EntityKey>
  sourceFace: readonly [ScenePoint, ScenePoint]
  targetFace: readonly [ScenePoint, ScenePoint]
}>

export type SceneRelationGeometry =
  | CanonicalRelationGeometry
  | ObservedFlowGeometry
  | FocusFaceConnectorGeometry

export type RenderGeometry = Readonly<{
  bounds: SceneRect
  entities: readonly SceneEntityGeometry[]
  relations: readonly SceneRelationGeometry[]
}>

export type RenderSceneEntity = SceneEntityGeometry &
  Readonly<{
    label: string
    kindLabel: string
    healthLevel: HealthLevel
    metricText: string | null
    membershipRole: EntityMembershipRole
    lifecycle: EntityLifecycle
    statusTokens: readonly string[]
    accessibilityName: string
  }>

export type SourceCompleteness = Readonly<{
  sourceId: string
  freshness: "fresh" | "stale" | "unknown"
  completeness: "complete" | "partial" | "unknown"
  access: "allowed" | "forbidden"
  observedAt: string | null
}>

export type CompletenessSummary = Readonly<{
  completeness: "complete" | "partial" | "unknown"
  access: "allowed" | "limited" | "forbidden"
  sources: readonly SourceCompleteness[]
}>

export type StructuredWarning = Readonly<{
  warningKey: string
  code: string
  severity: "info" | "warning" | "error"
  message: string
  entityKeys?: readonly EntityKey[]
  sourceIds?: readonly string[]
}>

export type RenderScene = Readonly<{
  schemaVersion: "topology-render-scene/v1"
  frameId: FrameId
  sceneRevision: Revision<"render-scene">
  layoutRevision: LayoutRevision
  presentation: TopologyPresentation
  mapUniverseEntityKeys: readonly EntityKey[]
  geometry: RenderGeometry
  entities: readonly RenderSceneEntity[]
  focusedEntityKey: EntityKey | null
  selectedEntityKeys: readonly EntityKey[]
  completeness: CompletenessSummary
  warnings: readonly StructuredWarning[]
}>

export type RenderSceneViolation = Readonly<{
  code: string
  message: string
}>

export class RenderSceneInvariantError extends Error {
  readonly code = "RENDER_SCENE_INVARIANT_VIOLATION"

  constructor(readonly violations: readonly RenderSceneViolation[]) {
    super(violations.map((violation) => violation.message).join("; "))
    this.name = "RenderSceneInvariantError"
  }
}

function isFinitePoint(point: ScenePoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function validRect(rect: SceneRect): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width >= 0 &&
    rect.height >= 0
  )
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

/** Renderer-boundary validation; no renderer may reinterpret raw API payloads. */
export function validateRenderScene(
  scene: RenderScene,
): readonly RenderSceneViolation[] {
  const violations: RenderSceneViolation[] = []
  const report = (code: string, message: string): void => {
    violations.push({ code, message })
  }

  if (!validRect(scene.geometry.bounds)) {
    report("INVALID_BOUNDS", "render bounds must contain finite non-negative dimensions")
  }

  const geometryKeys = scene.geometry.entities.map((entity) => entity.entityKey)
  const sceneEntityKeys = scene.entities.map((entity) => entity.entityKey)
  if (hasDuplicate(geometryKeys) || hasDuplicate(sceneEntityKeys)) {
    report("DUPLICATE_ENTITY", "render entity keys must be unique")
  }

  if (hasDuplicate(scene.mapUniverseEntityKeys)) {
    report("DUPLICATE_MAP_UNIVERSE", "map universe entity keys must be unique")
  }
  if (
    geometryKeys.length !== sceneEntityKeys.length ||
    geometryKeys.some((key) => !sceneEntityKeys.includes(key))
  ) {
    report(
      "ENTITY_SET_MISMATCH",
      "semantic render entities and geometry entities must have the same key set",
    )
  }

  for (const entity of scene.geometry.entities) {
    if (!validRect(entity.rect) || !Number.isFinite(entity.zLayer)) {
      report("INVALID_ENTITY_GEOMETRY", `entity ${entity.entityKey} has invalid geometry`)
    }
  }

  const sceneRelationKeys = scene.geometry.relations.map(
    (relation) => relation.sceneRelationKey,
  )
  if (hasDuplicate(sceneRelationKeys)) {
    report("DUPLICATE_SCENE_RELATION", "scene relation keys must be unique")
  }

  const mapUniverse = new Set(scene.mapUniverseEntityKeys)
  const focusMembers = new Set<EntityKey>()
  const focusConnectorKeys = new Set<ConnectorKey>()
  const focusHealthLevels = new Set<HealthLevel>()
  for (const relation of scene.geometry.relations) {
    if (relation.kind === "focus-face-connector") {
      if (scene.presentation.mode !== "focus-sankey") {
        report(
          "FOCUS_CONNECTOR_OUTSIDE_FOCUS",
          "focus face connectors are only valid in focus-Sankey presentation",
        )
      }
      if (hasDuplicate(relation.memberEntityKeys)) {
        report("FOCUS_MEMBER_DUPLICATE", "focus connector members must be unique")
      }
      if (focusConnectorKeys.has(relation.connectorKey)) {
        report("FOCUS_CONNECTOR_DUPLICATE", "focus connector keys must be unique")
      }
      focusConnectorKeys.add(relation.connectorKey)
      if (focusHealthLevels.has(relation.healthLevel)) {
        report("FOCUS_HEALTH_DUPLICATE", "each health bucket may have one connector")
      }
      focusHealthLevels.add(relation.healthLevel)
      for (const memberEntityKey of relation.memberEntityKeys) {
        if (focusMembers.has(memberEntityKey)) {
          report(
            "FOCUS_MEMBER_CROSS_GROUP_DUPLICATE",
            `focus member ${memberEntityKey} belongs to more than one connector`,
          )
        }
        focusMembers.add(memberEntityKey)
      }
      if (relation.memberEntityKeys.some((key) => !mapUniverse.has(key))) {
        report(
          "FOCUS_MEMBER_OUTSIDE_UNIVERSE",
          "focus connector member is outside the map universe",
        )
      }
      if (
        scene.presentation.mode === "focus-sankey" &&
        relation.memberEntityKeys.includes(scene.presentation.focusEntityKey)
      ) {
        report("FOCUS_SOURCE_AS_MEMBER", "focus source cannot be a connector member")
      }
      if (
        !relation.sourceFace.every(isFinitePoint) ||
        !relation.targetFace.every(isFinitePoint)
      ) {
        report("INVALID_FOCUS_FACE", "focus connector faces must contain finite points")
      }
      continue
    }

    if (relation.points.length < 2 || !relation.points.every(isFinitePoint)) {
      report("INVALID_RELATION_PATH", "relation paths require at least two finite points")
    }
  }

  return violations
}

export function assertRenderScene(scene: RenderScene): asserts scene is RenderScene {
  const violations = validateRenderScene(scene)
  if (violations.length > 0) {
    throw new RenderSceneInvariantError(violations)
  }
}
