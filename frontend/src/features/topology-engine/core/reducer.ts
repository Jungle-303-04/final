import type {
  EntityKey,
  FrameId,
  RelationKey,
  Revision,
  TransitionId,
} from "./brand"
import type {
  CanonicalEntity,
  CanonicalRelation,
  EntityRef,
} from "./model"
import type { NonEmptyReadonlyArray } from "./focusSankey"
import {
  MAP_PRESENTATION,
  type FocusSankeyPresentation,
  type MapPresentation,
  type TopologyPresentation,
} from "./presentation"

export type CanonicalGraphState = Readonly<{
  canonicalRevision: Revision<"canonical">
  universeRevision: Revision<"universe">
  frameId: FrameId
  streamId: Revision<"stream">
  streamSequence: number
  entities: readonly CanonicalEntity[]
  relations: readonly CanonicalRelation[]
  mapUniverseEntityKeys: readonly EntityKey[]
}>

export type FrozenPresentationUniverse = Readonly<{
  universeRevision: Revision<"universe">
  frameId: FrameId
  canonicalRevisionAtCapture: Revision<"canonical">
  mapUniverseEntityKeys: readonly EntityKey[]
}>

export type FocusSankeyRuntimeState =
  | Readonly<{ kind: "inactive" }>
  | Readonly<{
      kind: "transitioning"
      transitionKind: "enter" | "retarget" | "exit"
      transitionId: TransitionId
      sourceEntityKey: EntityKey | null
      previousSourceEntityKey: EntityKey | null
      frozenUniverse: FrozenPresentationUniverse
      pendingCanonicalRevision: Revision<"canonical"> | null
    }>
  | Readonly<{
      kind: "settled"
      sourceEntityKey: EntityKey
      frozenUniverse: FrozenPresentationUniverse
      pendingCanonicalRevision: Revision<"canonical"> | null
    }>

export type PresentationState = Readonly<{
  revision: Revision<"presentation">
  settled: TopologyPresentation
  target: TopologyPresentation
  focusSankey: FocusSankeyRuntimeState
}>

export type TopologyCoreState = Readonly<{
  schemaVersion: "topology-core-state/v1"
  canonical: CanonicalGraphState
  presentation: PresentationState
}>

export type FocusEntryMethod = "pointer" | "keyboard" | "explicit-control"
export type FocusExitMethod = "back" | "escape" | "explicit-control"

type FocusMessageBase = Readonly<{
  channel: "presentation-intent"
  transitionId: TransitionId
  expectedFrameId: FrameId
  expectedPresentationRevision: Revision<"presentation">
  nextPresentationRevision: Revision<"presentation">
}>

export type FocusSankeyEnterMessage = FocusMessageBase &
  Readonly<{
    type: "focusSankey.entered"
    sourceEntityKey: EntityKey
    method: FocusEntryMethod
  }>

export type FocusSankeyRetargetMessage = FocusMessageBase &
  Readonly<{
    type: "focusSankey.retargeted"
    sourceEntityKey: EntityKey
    method: FocusEntryMethod
  }>

export type FocusSankeyExitMessage = FocusMessageBase &
  Readonly<{
    type: "focusSankey.exited"
    method: FocusExitMethod
  }>

export type FocusSankeySettledMessage = Readonly<{
  channel: "presentation-effect"
  type: "focusSankey.transitionSettled"
  transitionId: TransitionId
  expectedPresentationRevision: Revision<"presentation">
  nextPresentationRevision: Revision<"presentation">
}>

export type FocusPresentationMessage =
  | FocusSankeyEnterMessage
  | FocusSankeyRetargetMessage
  | FocusSankeyExitMessage
  | FocusSankeySettledMessage

export type CanonicalDelta =
  | Readonly<{ type: "entity.upserted"; entity: CanonicalEntity }>
  | Readonly<{ type: "entity.deleted"; entityKey: EntityKey }>
  | Readonly<{ type: "relation.upserted"; relation: CanonicalRelation }>
  | Readonly<{ type: "relation.deleted"; relationKey: RelationKey }>
  | Readonly<{
      type: "mapUniverse.replaced"
      entityKeys: readonly EntityKey[]
    }>

export type CanonicalDeltaBatch = Readonly<{
  streamId: Revision<"stream">
  sequence: number
  baseCanonicalRevision: Revision<"canonical">
  nextCanonicalRevision: Revision<"canonical">
  baseFrameId: FrameId
  nextFrameId: FrameId
  nextUniverseRevision: Revision<"universe">
  deltas: NonEmptyReadonlyArray<CanonicalDelta>
}>

/** Canonical updates are a distinct channel and are never queued behind motion. */
export type CanonicalStreamMessage = Readonly<{
  channel: "canonical-stream"
  type: "canonical.deltaBatch"
  batch: CanonicalDeltaBatch
}>

export type TopologyCoreMessage = FocusPresentationMessage | CanonicalStreamMessage

export type TopologyCoreError = Readonly<{
  code: string
  message: string
  recoverable: boolean
}>

export type TopologyCoreTransition =
  | Readonly<{ kind: "committed"; state: TopologyCoreState }>
  | Readonly<{
      kind: "no-op"
      state: TopologyCoreState
      reason:
        | "stale-presentation"
        | "same-source"
        | "focus-inactive"
        | "old-stream-sequence"
        | "stale-settle"
    }>
  | Readonly<{
      kind: "rejected"
      state: TopologyCoreState
      error: TopologyCoreError
    }>
  | Readonly<{
      kind: "resync-required"
      state: TopologyCoreState
      reasonCode:
        | "STREAM_CHANGED"
        | "STREAM_GAP"
        | "BASE_REVISION_MISMATCH"
        | "BASE_FRAME_MISMATCH"
    }>

export type CreateTopologyCoreStateInput = Readonly<{
  canonical: CanonicalGraphState
  presentationRevision: Revision<"presentation">
  presentation?: TopologyPresentation
}>

export class TopologyCoreInvariantError extends Error {
  readonly code = "TOPOLOGY_CORE_INVARIANT_VIOLATION"

  constructor(readonly violations: readonly TopologyCoreError[]) {
    super(violations.map((violation) => violation.message).join("; "))
    this.name = "TopologyCoreInvariantError"
  }
}

function error(code: string, message: string, recoverable = true): TopologyCoreError {
  return { code, message, recoverable }
}

function duplicateKey(values: readonly string[]): string | null {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) return value
    seen.add(value)
  }
  return null
}

export function validateCanonicalGraphState(
  graph: CanonicalGraphState,
): readonly TopologyCoreError[] {
  const violations: TopologyCoreError[] = []
  if (!Number.isSafeInteger(graph.streamSequence) || graph.streamSequence < 0) {
    violations.push(
      error("INVALID_STREAM_SEQUENCE", "stream sequence must be a non-negative safe integer"),
    )
  }

  const entityKeys = graph.entities.map((entity) => entity.ref.entityKey)
  const duplicateEntity = duplicateKey(entityKeys)
  if (duplicateEntity !== null) {
    violations.push(error("DUPLICATE_ENTITY", `entity ${duplicateEntity} is duplicated`))
  }

  const relationKeys = graph.relations.map((relation) => relation.relationKey)
  const duplicateRelation = duplicateKey(relationKeys)
  if (duplicateRelation !== null) {
    violations.push(
      error("DUPLICATE_RELATION", `relation ${duplicateRelation} is duplicated`),
    )
  }

  const duplicateUniverse = duplicateKey(graph.mapUniverseEntityKeys)
  if (duplicateUniverse !== null) {
    violations.push(
      error("DUPLICATE_UNIVERSE_ENTITY", `map entity ${duplicateUniverse} is duplicated`),
    )
  }

  const entitySet = new Set<EntityKey>(entityKeys)
  for (const key of graph.mapUniverseEntityKeys) {
    if (!entitySet.has(key)) {
      violations.push(
        error("UNIVERSE_ENTITY_MISSING", `map entity ${key} is absent from canonical state`),
      )
    }
  }
  for (const relation of graph.relations) {
    if (
      !entitySet.has(relation.source.entityKey) ||
      !entitySet.has(relation.target.entityKey)
    ) {
      violations.push(
        error(
          "RELATION_ENDPOINT_MISSING",
          `relation ${relation.relationKey} has an absent endpoint`,
        ),
      )
    }
  }

  return violations
}

export function createTopologyCoreState(
  input: CreateTopologyCoreStateInput,
): TopologyCoreState {
  const graphViolations = validateCanonicalGraphState(input.canonical)
  if (graphViolations.length > 0) {
    throw new TopologyCoreInvariantError(graphViolations)
  }

  const presentation = input.presentation ?? MAP_PRESENTATION
  const focusSankey: FocusSankeyRuntimeState =
    presentation.mode === "focus-sankey"
      ? {
          kind: "settled",
          sourceEntityKey: presentation.focusEntityKey,
          frozenUniverse: captureUniverse(input.canonical),
          pendingCanonicalRevision: null,
        }
      : { kind: "inactive" }

  if (
    presentation.mode === "focus-sankey" &&
    !input.canonical.mapUniverseEntityKeys.includes(presentation.focusEntityKey)
  ) {
    throw new TopologyCoreInvariantError([
      error(
        "SOURCE_NOT_IN_UNIVERSE",
        `initial focus source ${presentation.focusEntityKey} is not in the map universe`,
      ),
    ])
  }

  return {
    schemaVersion: "topology-core-state/v1",
    canonical: input.canonical,
    presentation: {
      revision: input.presentationRevision,
      settled: presentation,
      target: presentation,
      focusSankey,
    },
  }
}

function captureUniverse(graph: CanonicalGraphState): FrozenPresentationUniverse {
  return {
    universeRevision: graph.universeRevision,
    frameId: graph.frameId,
    canonicalRevisionAtCapture: graph.canonicalRevision,
    mapUniverseEntityKeys: [...graph.mapUniverseEntityKeys],
  }
}

function staleFocusMessage(
  state: TopologyCoreState,
  message: FocusMessageBase,
): boolean {
  return (
    message.expectedFrameId !== state.canonical.frameId ||
    message.expectedPresentationRevision !== state.presentation.revision
  )
}

function nextRevisionIsValid(
  state: TopologyCoreState,
  nextRevision: Revision<"presentation">,
): boolean {
  return nextRevision !== state.presentation.revision
}

function focusPresentation(sourceEntityKey: EntityKey): FocusSankeyPresentation {
  return {
    mode: "focus-sankey",
    lens: { kind: "placement" },
    focusEntityKey: sourceEntityKey,
  }
}

function reduceFocusEnter(
  state: TopologyCoreState,
  message: FocusSankeyEnterMessage,
): TopologyCoreTransition {
  if (staleFocusMessage(state, message)) {
    return { kind: "no-op", state, reason: "stale-presentation" }
  }
  if (!nextRevisionIsValid(state, message.nextPresentationRevision)) {
    return {
      kind: "rejected",
      state,
      error: error("REVISION_NOT_ADVANCED", "focus intent must advance presentation revision"),
    }
  }
  if (state.presentation.target.mode === "focus-sankey") {
    return {
      kind: "rejected",
      state,
      error: error("FOCUS_ALREADY_ACTIVE", "active focus must use the retarget intent"),
    }
  }
  if (!state.canonical.mapUniverseEntityKeys.includes(message.sourceEntityKey)) {
    return {
      kind: "rejected",
      state,
      error: error("SOURCE_NOT_IN_UNIVERSE", "focus source is outside the current map universe"),
    }
  }

  const frozenUniverse = captureUniverse(state.canonical)
  return {
    kind: "committed",
    state: {
      ...state,
      presentation: {
        revision: message.nextPresentationRevision,
        settled: state.presentation.settled,
        target: focusPresentation(message.sourceEntityKey),
        focusSankey: {
          kind: "transitioning",
          transitionKind: "enter",
          transitionId: message.transitionId,
          sourceEntityKey: message.sourceEntityKey,
          previousSourceEntityKey: null,
          frozenUniverse,
          pendingCanonicalRevision: null,
        },
      },
    },
  }
}

function activeFrozenUniverse(
  state: TopologyCoreState,
): FrozenPresentationUniverse | null {
  return state.presentation.focusSankey.kind === "inactive"
    ? null
    : state.presentation.focusSankey.frozenUniverse
}

function currentFocusSource(state: TopologyCoreState): EntityKey | null {
  if (state.presentation.target.mode === "focus-sankey") {
    return state.presentation.target.focusEntityKey
  }
  const runtime = state.presentation.focusSankey
  if (runtime.kind === "settled") return runtime.sourceEntityKey
  return runtime.kind === "transitioning" ? runtime.previousSourceEntityKey : null
}

function reduceFocusRetarget(
  state: TopologyCoreState,
  message: FocusSankeyRetargetMessage,
): TopologyCoreTransition {
  if (staleFocusMessage(state, message)) {
    return { kind: "no-op", state, reason: "stale-presentation" }
  }
  if (!nextRevisionIsValid(state, message.nextPresentationRevision)) {
    return {
      kind: "rejected",
      state,
      error: error("REVISION_NOT_ADVANCED", "retarget must advance presentation revision"),
    }
  }
  const frozenUniverse = activeFrozenUniverse(state)
  const previousSource = currentFocusSource(state)
  if (frozenUniverse === null || previousSource === null) {
    return {
      kind: "rejected",
      state,
      error: error("FOCUS_INACTIVE", "retarget requires an active focus presentation"),
    }
  }
  if (previousSource === message.sourceEntityKey) {
    return { kind: "no-op", state, reason: "same-source" }
  }
  if (!frozenUniverse.mapUniverseEntityKeys.includes(message.sourceEntityKey)) {
    return {
      kind: "rejected",
      state,
      error: error("SOURCE_NOT_VISIBLE", "retarget source is outside the captured visible column"),
    }
  }

  const pendingCanonicalRevision =
    state.presentation.focusSankey.kind === "inactive"
      ? null
      : state.presentation.focusSankey.pendingCanonicalRevision
  return {
    kind: "committed",
    state: {
      ...state,
      presentation: {
        revision: message.nextPresentationRevision,
        settled: state.presentation.settled,
        target: focusPresentation(message.sourceEntityKey),
        focusSankey: {
          kind: "transitioning",
          transitionKind: "retarget",
          transitionId: message.transitionId,
          sourceEntityKey: message.sourceEntityKey,
          previousSourceEntityKey: previousSource,
          frozenUniverse,
          pendingCanonicalRevision,
        },
      },
    },
  }
}

function reduceFocusExit(
  state: TopologyCoreState,
  message: FocusSankeyExitMessage,
): TopologyCoreTransition {
  if (staleFocusMessage(state, message)) {
    return { kind: "no-op", state, reason: "stale-presentation" }
  }
  if (!nextRevisionIsValid(state, message.nextPresentationRevision)) {
    return {
      kind: "rejected",
      state,
      error: error("REVISION_NOT_ADVANCED", "focus exit must advance presentation revision"),
    }
  }
  const frozenUniverse = activeFrozenUniverse(state)
  const previousSource = currentFocusSource(state)
  if (frozenUniverse === null || previousSource === null) {
    return { kind: "no-op", state, reason: "focus-inactive" }
  }

  const pendingCanonicalRevision =
    state.presentation.focusSankey.kind === "inactive"
      ? null
      : state.presentation.focusSankey.pendingCanonicalRevision
  return {
    kind: "committed",
    state: {
      ...state,
      presentation: {
        revision: message.nextPresentationRevision,
        settled: state.presentation.settled,
        target: MAP_PRESENTATION,
        focusSankey: {
          kind: "transitioning",
          transitionKind: "exit",
          transitionId: message.transitionId,
          sourceEntityKey: null,
          previousSourceEntityKey: previousSource,
          frozenUniverse,
          pendingCanonicalRevision,
        },
      },
    },
  }
}

function reduceFocusSettled(
  state: TopologyCoreState,
  message: FocusSankeySettledMessage,
): TopologyCoreTransition {
  const runtime = state.presentation.focusSankey
  if (
    runtime.kind !== "transitioning" ||
    runtime.transitionId !== message.transitionId ||
    state.presentation.revision !== message.expectedPresentationRevision
  ) {
    return { kind: "no-op", state, reason: "stale-settle" }
  }
  if (!nextRevisionIsValid(state, message.nextPresentationRevision)) {
    return {
      kind: "rejected",
      state,
      error: error(
        "REVISION_NOT_ADVANCED",
        "transition settle must advance presentation revision",
      ),
    }
  }

  if (state.presentation.target.mode === "focus-sankey") {
    return {
      kind: "committed",
      state: {
        ...state,
        presentation: {
          ...state.presentation,
          revision: message.nextPresentationRevision,
          settled: state.presentation.target,
          focusSankey: {
            kind: "settled",
            sourceEntityKey: state.presentation.target.focusEntityKey,
            frozenUniverse: runtime.frozenUniverse,
            pendingCanonicalRevision: runtime.pendingCanonicalRevision,
          },
        },
      },
    }
  }

  return {
    kind: "committed",
    state: {
      ...state,
      presentation: {
        ...state.presentation,
        revision: message.nextPresentationRevision,
        settled: MAP_PRESENTATION,
        focusSankey: { kind: "inactive" },
      },
    },
  }
}

function replaceByKey<Value>(
  values: readonly Value[],
  keyOf: (value: Value) => string,
  next: Value,
): Value[] {
  const key = keyOf(next)
  const index = values.findIndex((value) => keyOf(value) === key)
  if (index < 0) return [...values, next]
  return values.map((value, itemIndex) => (itemIndex === index ? next : value))
}

function sameEntityIdentity(left: EntityRef, right: EntityRef): boolean {
  if (left.entityClass !== right.entityClass || left.entityKey !== right.entityKey) {
    return false
  }

  switch (left.entityClass) {
    case "platform": {
      if (right.entityClass !== "platform") return false
      return (
        left.identity.workspaceId === right.identity.workspaceId &&
        left.identity.platformKind === right.identity.platformKind &&
        left.identity.uid === right.identity.uid
      )
    }
    case "resource": {
      if (right.entityClass !== "resource") return false
      return (
        left.identity.workspaceId === right.identity.workspaceId &&
        left.identity.clusterUid === right.identity.clusterUid &&
        left.identity.uid === right.identity.uid &&
        left.identity.canonicalGroupKind.group ===
          right.identity.canonicalGroupKind.group &&
        left.identity.canonicalGroupKind.kind ===
          right.identity.canonicalGroupKind.kind
      )
    }
    case "embedded": {
      if (right.entityClass !== "embedded") return false
      return (
        left.identity.parentEntityKey === right.identity.parentEntityKey &&
        left.identity.embeddedKind === right.identity.embeddedKind &&
        left.identity.stableKey === right.identity.stableKey
      )
    }
    case "projection":
      return (
        right.entityClass === "projection" &&
        left.projectionKey === right.projectionKey
      )
    case "external":
      return right.entityClass === "external" && left.externalKey === right.externalKey
    case "placeholder":
      return right.entityClass === "placeholder"
  }
}

function sameRelationKeyMaterial(
  left: CanonicalRelation,
  right: CanonicalRelation,
): boolean {
  return (
    left.relationKey === right.relationKey &&
    left.plane === right.plane &&
    left.relationType === right.relationType &&
    left.source.entityKey === right.source.entityKey &&
    left.target.entityKey === right.target.entityKey &&
    (left.portKey ?? null) === (right.portKey ?? null) &&
    (left.protocol ?? null) === (right.protocol ?? null) &&
    (left.relationQualifier ?? null) === (right.relationQualifier ?? null)
  )
}

function applyCanonicalBatch(
  state: TopologyCoreState,
  batch: CanonicalDeltaBatch,
): TopologyCoreTransition {
  const graph = state.canonical
  if (batch.streamId !== graph.streamId) {
    return { kind: "resync-required", state, reasonCode: "STREAM_CHANGED" }
  }
  if (!Number.isSafeInteger(batch.sequence) || batch.sequence < 0) {
    return {
      kind: "rejected",
      state,
      error: error("INVALID_STREAM_SEQUENCE", "stream sequence must be a safe integer"),
    }
  }
  if (batch.sequence <= graph.streamSequence) {
    return { kind: "no-op", state, reason: "old-stream-sequence" }
  }
  if (batch.sequence !== graph.streamSequence + 1) {
    return { kind: "resync-required", state, reasonCode: "STREAM_GAP" }
  }
  if (batch.baseCanonicalRevision !== graph.canonicalRevision) {
    return {
      kind: "resync-required",
      state,
      reasonCode: "BASE_REVISION_MISMATCH",
    }
  }
  if (batch.baseFrameId !== graph.frameId) {
    return { kind: "resync-required", state, reasonCode: "BASE_FRAME_MISMATCH" }
  }
  if (batch.nextCanonicalRevision === batch.baseCanonicalRevision) {
    return {
      kind: "rejected",
      state,
      error: error("REVISION_NOT_ADVANCED", "canonical batch must advance revision"),
    }
  }
  if (batch.nextFrameId === batch.baseFrameId) {
    return {
      kind: "rejected",
      state,
      error: error("FRAME_NOT_ADVANCED", "canonical batch must advance frame id"),
    }
  }

  let entities = [...graph.entities]
  let relations = [...graph.relations]
  let mapUniverseEntityKeys = [...graph.mapUniverseEntityKeys]
  let keyMaterialViolation: TopologyCoreError | null = null

  for (const delta of batch.deltas) {
    switch (delta.type) {
      case "entity.upserted": {
        const existing = entities.find(
          (entity) => entity.ref.entityKey === delta.entity.ref.entityKey,
        )
        if (
          existing !== undefined &&
          !sameEntityIdentity(existing.ref, delta.entity.ref)
        ) {
          keyMaterialViolation = error(
            "ENTITY_IDENTITY_MUTATION",
            `entity ${delta.entity.ref.entityKey} changed stable identity material`,
          )
          break
        }
        entities = replaceByKey(
          entities,
          (entity) => entity.ref.entityKey,
          delta.entity,
        )
        break
      }
      case "entity.deleted":
        entities = entities.filter(
          (entity) => entity.ref.entityKey !== delta.entityKey,
        )
        break
      case "relation.upserted": {
        const existing = relations.find(
          (relation) => relation.relationKey === delta.relation.relationKey,
        )
        if (
          existing !== undefined &&
          !sameRelationKeyMaterial(existing, delta.relation)
        ) {
          keyMaterialViolation = error(
            "RELATION_KEY_MATERIAL_MUTATION",
            `relation ${delta.relation.relationKey} changed canonical key material`,
          )
          break
        }
        relations = replaceByKey(
          relations,
          (relation) => relation.relationKey,
          delta.relation,
        )
        break
      }
      case "relation.deleted":
        relations = relations.filter(
          (relation) => relation.relationKey !== delta.relationKey,
        )
        break
      case "mapUniverse.replaced":
        mapUniverseEntityKeys = [...delta.entityKeys]
        break
    }
    if (keyMaterialViolation !== null) break
  }

  if (keyMaterialViolation !== null) {
    return {
      kind: "rejected",
      state,
      error: keyMaterialViolation,
    }
  }

  const nextGraph: CanonicalGraphState = {
    canonicalRevision: batch.nextCanonicalRevision,
    universeRevision: batch.nextUniverseRevision,
    frameId: batch.nextFrameId,
    streamId: batch.streamId,
    streamSequence: batch.sequence,
    entities,
    relations,
    mapUniverseEntityKeys,
  }
  const violations = validateCanonicalGraphState(nextGraph)
  if (violations.length > 0) {
    return {
      kind: "rejected",
      state,
      error: error(
        "ATOMIC_BATCH_INVALID",
        violations.map((violation) => violation.message).join("; "),
      ),
    }
  }

  const runtime = state.presentation.focusSankey
  const nextFocus: FocusSankeyRuntimeState =
    runtime.kind === "inactive"
      ? runtime
      : { ...runtime, pendingCanonicalRevision: batch.nextCanonicalRevision }

  return {
    kind: "committed",
    state: {
      ...state,
      canonical: nextGraph,
      presentation: {
        ...state.presentation,
        focusSankey: nextFocus,
      },
    },
  }
}

export function reduceTopologyCore(
  state: TopologyCoreState,
  message: TopologyCoreMessage,
): TopologyCoreTransition {
  switch (message.channel) {
    case "canonical-stream":
      return applyCanonicalBatch(state, message.batch)
    case "presentation-effect":
      return reduceFocusSettled(state, message)
    case "presentation-intent":
      switch (message.type) {
        case "focusSankey.entered":
          return reduceFocusEnter(state, message)
        case "focusSankey.retargeted":
          return reduceFocusRetarget(state, message)
        case "focusSankey.exited":
          return reduceFocusExit(state, message)
      }
  }
}

export function isMapPresentation(
  presentation: TopologyPresentation,
): presentation is MapPresentation {
  return presentation.mode === "map"
}
