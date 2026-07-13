---
title: Topology Engine Message and Action Protocol
status: archived — 현재 작업에 참조 금지
owner: frontend-platform
version: topology-engine-message/v1
last_verified: 2026-07-11
---

# Topology Message / Action Protocol

## 0. 권한과 경계

이 문서는 `topology-engine.md`의 message, reducer, effect, snapshot/delta, action/operation wire 의미를 채우는 구현 예정 보조 계약이다. 현재 repo의 실제 코드와 통과한 테스트가 source of truth이며, 아래 discriminated union과 validation rule이 현 코드에 없으면 구현 완료가 아니라 후속 작업 기준으로만 읽는다. 제품 GitOps operation의 사용자 의미는 `product-data-contract.md`의 구현 예정 계약을 함께 따른다.

외부 기준 저장소 피벗 이후 이 문서의 presentation 전용 타입과 절은 P1·P2·P3 구현 근거가 아니다. generic
message ordering, idempotency, atomic delta, command receipt 규칙의 장기 보존 여부와 presentation
전용 절 분리는 `topology-engine.md` 후속 검토에서 함께 결정한다. 현재 화면과 interaction은
`reference-feature-inventory.md`가 정본이다.

- 모든 사용자/URL/stream/worker/effect/system 입력은 `dispatch(EngineMessage)` 한 경로만 사용한다.
- runtime schema 검증 전 payload를 reducer에 전달하지 않는다.
- reducer는 외부 I/O를 수행하지 않고 `ReducerTransition`과 `EffectDirective`만 반환한다.
- 모든 timestamp는 UTC canonical RFC 3339, ID/cursor/token은 opaque다.
- timestamp, Kubernetes resourceVersion, generation, eventId를 stream ordering에 사용하지 않는다.
- 사용자 intent, command receipt, operation progress는 resource success 상태를 optimistic하게 확정하지 않는다.

계약 정의 위치는 다음과 같다. generated module은 이 경계를 실제 import 방향으로 보존해야 한다.

| 계약 | 정의 위치 | 이 문서의 역할 |
|---|---|---|
| `RenderScene`, `RenderGeometry` | `topology-engine.md` renderer/scene contract | 참조만 하며 재선언하지 않음 |
| `ActionDescriptor`, `AvailableAction` | `topology-engine.md` catalog/action contract | intent 검증에 사용하되 재선언하지 않음 |
| `LayoutRequest`, layout worker result | 이 문서 §3.1 | effect/worker message 정의 |
| `EngineTelemetry` | 이 문서 §3.2 | telemetry effect payload 정의 |
| entity/relation/query/frame/layout/scene types | `topology-engine.md` canonical engine module | generated type import만 허용 |
| `ConsumerEnvelope`, `StatusReason`, GitOps operation DTO | `product-data-contract.md` canonical consumer core | generated type import만 허용 |

`RenderScene`은 renderer에만 넘기는 immutable derived value이며 effect/wire payload가 아니다. `ActionDescriptor`는 catalog에서 받은 설명자이고, reducer는 current `AvailableAction`과 capability revision을 함께 검증한 후에만 command를 만든다.

## 1. 공통 envelope

```ts
type OpaqueId = string
type Timestamp = string
type DurationMs = number
type StateRevision = number
type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

type EngineSource =
  | "ui"
  | "url"
  | "snapshot"
  | "stream"
  | "operation-stream"
  | "worker"
  | "effect"
  | "system"

type RootMessageContext = {
  sessionId: OpaqueId
  workspaceId: OpaqueId
  baseRevision: StateRevision
}

type EffectResultContext = {
  sessionId: OpaqueId
  workspaceId: OpaqueId
  effectId: OpaqueId
  causationEventId: OpaqueId
  abortKey: OpaqueId
}

type ResumeCursor = {
  streamId: OpaqueId
  streamEpoch: OpaqueId
  sequence: number
  resumeToken: string
  resumeTokenExpiresAt: Timestamp
}

type StreamStart =
  | { mode: "stream"; cursor: ResumeCursor }
  | { mode: "poll"; pollAfterMs: DurationMs }
  | { mode: "static"; reason: StatusReason }

type StreamMessageContext = {
  sessionId: OpaqueId
  workspaceId: OpaqueId
  queryId: OpaqueId
  entitlementEpoch: OpaqueId
  dataOrigin: DataOrigin
  cursor: ResumeCursor
  hashes: TopologyPlanHashes
}

type OperationStreamMessageContext = {
  sessionId: OpaqueId
  workspaceId: OpaqueId
  operationId: OpaqueId
  dataOrigin: DataOrigin
  cursor: ResumeCursor
}

type SystemMessageContext = {
  sessionId: OpaqueId
  workspaceId: OpaqueId
  causationEventId: OpaqueId | null
}

type UrlPayload = {
  type: "url.hydrated"
  codecVersion: string
  serializedHash: string
  query: TopologyQuery
}

type EngineMessageBase<S extends EngineSource, C, P extends { type: string }> = {
  schemaVersion: "topology-engine-message/v1"
  eventId: OpaqueId
  traceId: OpaqueId
  source: S
  emittedAt: Timestamp
  context: C
  payload: P
}

type EngineMessage =
  | EngineMessageBase<"ui", RootMessageContext, UserIntent>
  | EngineMessageBase<"url", RootMessageContext, UrlPayload>
  | EngineMessageBase<"snapshot", EffectResultContext, SnapshotPayload>
  | EngineMessageBase<"stream", StreamMessageContext, StreamPayload>
  | EngineMessageBase<"operation-stream", OperationStreamMessageContext, OperationStreamPayload>
  | EngineMessageBase<"worker", EffectResultContext, WorkerPayload>
  | EngineMessageBase<"effect", EffectResultContext, EffectResultPayload>
  | EngineMessageBase<"system", SystemMessageContext, SystemPayload>
```

`StateRevision`, cursor sequence, progress count는 non-negative safe integer다. `source="stream"`의 cursor/hashes/origin은 topology outer wire envelope에서 context로 한 번만 복사한다. `source="operation-stream"`은 operationId/dataOrigin/cursor만 가지며 topology queryId, entitlementEpoch, data/projection hash에 bind하지 않는다.

## 2. 사용자 intent

```ts
type QueryTokenId = OpaqueId
type InvocationId = OpaqueId
type FocusSankeyTransitionId = OpaqueId

type FocusSankeyEntryMethod = "pointer" | "keyboard" | "explicit-control"
type FocusSankeyExitMethod = "back" | "escape" | "explicit-control"

type SelectionChange =
  | { kind: "replace"; entityKeys: readonly string[] }
  | { kind: "toggle"; entityKey: string }
  | { kind: "range"; fromEntityKey: string; toEntityKey: string }
  | { kind: "lasso"; entityKeys: readonly string[] }
  | { kind: "clear" }

type ActionTarget =
  | { kind: "entity"; entityKeys: NonEmptyReadonlyArray<string> }
  | { kind: "application-instance"; instanceId: OpaqueId; bindingId: OpaqueId }
  | { kind: "operation"; operationId: OpaqueId }

type RouteRef = {
  routeId: string
  pathParameters: Readonly<Record<string, string>>
  queryParameters: Readonly<Record<string, string | readonly string[]>>
  fragment: string | null
}

type ActionParameterValue =
  | { kind: "text"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "integer"; value: number }
  | { kind: "decimal"; value: DecimalString }
  | { kind: "choice"; value: string }
  | { kind: "entity"; entityKey: string }
  | { kind: "list"; values: readonly ActionParameterValue[] }

type ActionParameters = Readonly<Record<string, ActionParameterValue>>

type UserIntent =
  | { type: "query.textChanged"; draftId: OpaqueId; text: string; composing: boolean }
  | { type: "query.tokenCommitted"; tokenId: QueryTokenId; token: QueryToken; expectedQueryRevision: OpaqueId }
  | { type: "query.tokenRemoved"; tokenId: QueryTokenId; expectedQueryRevision: OpaqueId }
  | {
      type: "query.planRequested"
      expectedQueryRevision: OpaqueId
      reason: "apply" | "scope" | "filter" | "metric" | "time" | "retry"
    }
  | { type: "scope.entered"; scope: Scope; trigger: "pointer" | "keyboard" | "query" | "navigation" }
  | { type: "scope.exited"; expectedScope: Scope }
  | {
      type: "focusSankey.entered"
      transitionId: FocusSankeyTransitionId
      sourceEntityKey: string
      expectedFrameId: OpaqueId
      expectedPresentationRevision: OpaqueId
      method: FocusSankeyEntryMethod
    }
  | {
      type: "focusSankey.retargeted"
      transitionId: FocusSankeyTransitionId
      sourceEntityKey: string
      expectedFrameId: OpaqueId
      expectedPresentationRevision: OpaqueId
      method: FocusSankeyEntryMethod
    }
  | {
      type: "focusSankey.exited"
      transitionId: FocusSankeyTransitionId
      expectedFrameId: OpaqueId
      expectedPresentationRevision: OpaqueId
      method: FocusSankeyExitMethod
    }
  | { type: "lens.progressChanged"; gestureId: OpaqueId; gestureRevision: LayoutRevision; progress: number }
  | { type: "lens.committed"; lens: Lens; method: "gesture" | "pointer" | "keyboard" | "url"; gestureId: OpaqueId | null }
  | { type: "entity.focused"; entityKey: string | null; reason: "pointer" | "keyboard" | "restoration" | "programmatic" }
  | {
      type: "entity.activated"
      entityKey: string
      activationId: OpaqueId
      actionId: string
      descriptorRevision: string
      capabilityRevision: string
      method: "pointer" | "keyboard"
    }
  | { type: "selection.changed"; change: SelectionChange; expectedSelectionRevision: OpaqueId }
  | { type: "viewport.changed"; viewportRevision: OpaqueId; centerX: number; centerY: number; zoom: number }
  | {
      type: "action.invoked"
      invocationId: InvocationId
      actionId: string
      target: ActionTarget
      parameters: ActionParameters
      capabilityRevision: string
      expectedStateToken: string | null
    }
  | { type: "action.confirmed"; invocationId: InvocationId; confirmationToken: string }
  | { type: "action.dismissed"; invocationId: InvocationId }
  | {
      type: "operation.cancelRequested"
      operationId: OpaqueId
      cancelActionId: string
      capabilityRevision: string
    }
  | { type: "retry.requested"; scope: StructuredError["scope"]; errorId: OpaqueId | null }
  | { type: "theme.changed"; themeId: string }
  | { type: "motion.changed"; motionPolicyId: string }
```

Validation:

- lens progress는 finite `[-1, 1]`, viewport 좌표/zoom도 finite다.
- integer parameter는 safe integer다. metric/cost/coefficient는 tagged decimal만 허용하고 `JsonValue` number로 우회하지 않는다.
- Application aggregate는 mutation target이 아니다. `application-instance` target은 정확히 instanceId + bindingId 하나다.
- action descriptor의 target cardinality, parameter schema, capability revision, current permission을 reducer가 effect 생성 전에 검증한다.
- capability 미로딩/stale/disabled이면 action intent를 command로 승격하지 않는다.

Focus-Sankey intent refinement:

- `entered`는 current presentation이 `map | fold-lens`이고 source가 그 presentation이 보존한 captured base map universe에 정확히 한 번 있을 때만 허용한다. fold-lens/gesture 중이면 active fold transition을 cancel하고 current interpolated geometry를 focus transition의 `fromGeometry`로 사용한다. map endpoint로 순간 복귀하거나 중간 frame을 commit하지 않는다.
- `retargeted`는 current presentation이 focus-Sankey이고 새 source가 현재 visible column 또는 source에 있을 때만 허용한다. 같은 source로의 retarget은 no-op이다.
- `exited`는 focus-Sankey preparing/transitioning/settled 중에만 허용한다.
- 세 intent 모두 expected frame/presentation revision이 current와 같아야 한다. 다르면 추정하지 않고 stale intent no-op 후 현재 화면을 유지한다.
- focus source를 filter나 selection으로 승격하지 않고 presentation 상태로만 보존한다.
- `url.hydrated.query.presentation.mode="focus-sankey"`는 query plan/snapshot이 준비되기 전에 즉시 설치하지 않는다. source entity key를 새 authoritative map universe에서 재검증한 후 enter와 같은 freeze/layout 경로를 사용하며, 없거나 forbidden이면 map을 유지하고 typed restoration warning을 남긴다. URL presentation을 `UrlPayload`의 별도 field로 복제하지 않는다.
- UI activation resolver는 pointer/keyboard activation 하나를 current catalog의 `ActionDescriptor`와 `AvailableAction`으로 먼저 해석한다. descriptor가 `dispatch.kind="engine-intent"`, `intentType="focusSankey.entered"`이면 resolver는 `entity.activated`를 만들지 않고 current frame/presentation revision을 채운 `focusSankey.entered`를 유일한 `EngineMessage`로 dispatch한다.
- `entity.activated`는 focus 진입이 아닌 catalog-declared inspect/navigation/query activation에만 쓴다. reducer는 `actionId`, descriptor/capability revision, entity target을 current catalog에서 다시 검증하고 같은 reducer transition에서 detail/navigation/query effect를 직접 반환한다. `entity.activated`가 `focusSankey.entered`나 다른 `EngineMessage`를 후속 dispatch하는 것은 금지한다.

## 3. Effect와 command

```ts
type RetryPolicy =
  | { kind: "none" }
  | { kind: "idempotent-read"; maxAttempts: number; backoffPolicyId: string }
  | { kind: "resumable-stream"; backoffPolicyId: string; maxElapsedMs: DurationMs }

type CommandConfirmation =
  | { kind: "not-required" }
  | { kind: "confirmed"; token: string }

type CommandPrecondition =
  | { kind: "none" }
  | { kind: "state-token"; token: string }

type CommandRequest = {
  invocationId: InvocationId
  actionId: string
  target: ActionTarget
  parameters: ActionParameters
  parametersHash: string
  idempotencyKey: string
  capabilityRevision: string
  confirmation: CommandConfirmation
  precondition: CommandPrecondition
}

type LayoutViewport = {
  contentRect: { x: number; y: number; width: number; height: number }
  devicePixelRatio: number
  direction: "ltr" | "rtl"
  containerMode: "compact" | "medium" | "wide" | "xwide"
}

type LayoutTextMeasurement = {
  entityKey: string
  nameWidthPx: number
  valueWidthPx: number | null
}

type LayoutEntityInput = {
  entityKey: string
  parentEntityKey: string | null
  membershipRole: Entity["membershipRole"]
  visualRole: "frame" | "tile" | "relation-entity" | "projection" | "structural-shelf"
  stableOrderKey: string
  sizeValueDecimal: DecimalString | null
  sizeStatus: MetricStatus
  healthLevel: TopologyHealthVerdict["level"]
  text: LayoutTextMeasurement
}

type LayoutRelationInput = {
  relationKey: string
  sourceEntityKey: string
  targetEntityKey: string
  plane: RelationPlane
  relationType: string
  conditions: CanonicalRelation["effective"]["conditions"]
  authority: CanonicalRelation["effective"]["authority"]
}

type PresentationUniverse = {
  universeId: OpaqueId
  universeRevision: OpaqueId
  frameId: OpaqueId
  stateRevision: StateRevision
  catalogRevision: string
  entitlementEpoch: OpaqueId
  hashes: TopologyPlanHashes
  mapEntityKeys: readonly string[]
  relationKeys: readonly string[]
  capturedAt: Timestamp
}

type LayoutTarget =
  | { targetId: OpaqueId; kind: "lens"; lens: Lens }
  | {
      targetId: OpaqueId
      kind: "focus-sankey"
      sourceEntityKey: string
      grouping: "related-health"
      relatedHealthOrder: readonly ["unhealthy", "degraded", "unknown", "neutral", "healthy"]
      includeEveryUnrelatedEntity: true
      ribbonMode: "one-face-ribbon-per-related-group"
      expectedColumnCardinality: number
    }

type LayoutRequest = {
  schemaVersion: "topology-layout-request/v1"
  transactionId: OpaqueId
  reason:
    | "initial"
    | "structure-changed"
    | "geometry-metric-changed"
    | "scope-changed"
    | "lens-changed"
    | "focus-sankey-enter"
    | "focus-sankey-exit"
    | "focus-sankey-retarget"
    | "post-settle-reconcile"
    | "viewport-changed"
    | "policy-changed"
    | "retry"
  revision: LayoutRevision
  presentationRevision: OpaqueId
  universe: PresentationUniverse
  viewport: LayoutViewport
  entities: readonly LayoutEntityInput[]
  relations: readonly LayoutRelationInput[]
  targets: NonEmptyReadonlyArray<LayoutTarget>
  previousGeometryByTarget: readonly { targetId: OpaqueId; geometry: RenderGeometry }[]
  layoutPolicyId: string
  visualMotionPolicyId: string
}

type FocusSankeyGroupProof = {
  groupKey: string
  healthLevel: TopologyHealthVerdict["level"]
  memberEntityKeys: NonEmptyReadonlyArray<string>
  sourceFaceStartRatio: DecimalString
  sourceFaceEndRatio: DecimalString
  ribbonConnectorKey: string
}

type FocusSankeyCompletenessProof = {
  sourceEntityKey: string
  mapEntityCount: number
  columnEntityKeys: readonly string[]
  unrelatedEntityKeys: readonly string[]
  groups: readonly FocusSankeyGroupProof[]
}

type LayoutTargetResult = {
  targetId: OpaqueId
  geometry: RenderGeometry
  focusSankeyProof: FocusSankeyCompletenessProof | null
}

type LayoutResult = {
  schemaVersion: "topology-layout-result/v1"
  transactionId: OpaqueId
  presentationRevision: OpaqueId
  universeId: OpaqueId
  universeRevision: OpaqueId
  revision: LayoutRevision
  targets: NonEmptyReadonlyArray<LayoutTargetResult>
  computeDurationMs: DurationMs
  warnings: readonly StructuredWarning[]
}

type PresentationTransitionRequest = {
  schemaVersion: "topology-presentation-transition/v1"
  transitionId: FocusSankeyTransitionId
  reason: "enter" | "exit" | "retarget" | "post-settle-reconcile"
  presentationRevision: OpaqueId
  universeId: OpaqueId
  layoutRevision: LayoutRevision
  sourceEntityKey: string | null
  fromGeometry: RenderGeometry
  toGeometry: RenderGeometry
  sequencePolicyId:
    | "focus-sankey-enter/v1"
    | "focus-sankey-exit/v1"
    | "focus-sankey-retarget/v1"
    | "focus-sankey-reconcile/v1"
  motionPolicyId: string
}

type EffectPayload =
  | { type: "catalog.fetch" }
  | { type: "query.plan"; query: TopologyPlanQuery }
  | { type: "snapshot.fetch"; planId: string; queryId: string; previousFrameId: string | null }
  | { type: "stream.subscribe"; request: StreamSubscription }
  | { type: "entityDetail.fetch"; request: EntityDetailRequest }
  | { type: "layout.compute"; request: LayoutRequest }
  | { type: "url.replace"; serialized: string }
  | { type: "navigation.internal"; route: RouteRef }
  | { type: "navigation.external"; verifiedUrl: string }
  | { type: "command.execute"; command: CommandRequest }
  | { type: "command.receipt.lookup"; idempotencyKey: string }
  | { type: "operation.status.fetch"; operationId: string }
  | { type: "operation.watch"; operationId: string; cursor: ResumeCursor }
  | { type: "presentation.transition.start"; request: PresentationTransitionRequest }
  | { type: "telemetry.record"; record: EngineTelemetry }

type EffectEnvelope<P extends EffectPayload = EffectPayload> = {
  schemaVersion: "topology-engine-effect/v1"
  effectId: OpaqueId
  causationEventId: OpaqueId
  sessionId: OpaqueId
  abortKey: OpaqueId
  createdAt: Timestamp
  hashes: Partial<QueryHashes>
  retryPolicy: RetryPolicy
  payload: P
}

type EffectDirective =
  | { kind: "start"; effect: EffectEnvelope }
  | {
      kind: "cancel"
      abortKey: OpaqueId
      reason:
        | "superseded"
        | "session-ended"
        | "resync"
        | "user-dismissed"
        | "presentation-retargeted"
        | "entitlement-changed"
        | "schema-changed"
    }

type EffectResultPayload =
  | { type: "catalog.changed"; response: ConsumerEnvelope<TopologyCatalogResponse> }
  | { type: "query.planResolved"; response: ConsumerEnvelope<QueryPlanResponse> }
  | { type: "query.planRejected"; error: StructuredError }
  | { type: "stream.connected"; acceptedCursor: ResumeCursor; headSequence: number }
  | { type: "stream.disconnected"; reasonCode: string; retryable: boolean; retryAfterMs: DurationMs | null }
  | { type: "entityDetail.received"; response: ConsumerEnvelope<EntityDetail> }
  | { type: "command.receiptReceived"; receipt: CommandReceipt }
  | { type: "command.receiptLookupReceived"; response: ConsumerEnvelope<OperationReceiptLookupResult> }
  | { type: "operation.snapshotReceived"; response: ConsumerEnvelope<OperationStatusCut> }
  | {
      type: "focusSankey.transitionSettled"
      transitionId: FocusSankeyTransitionId
      presentationRevision: OpaqueId
      universeId: OpaqueId
      layoutRevision: LayoutRevision
      settledAt: Timestamp
    }
  | { type: "telemetry.recorded"; recordId: OpaqueId }
  | { type: "url.replaceCompleted" }
  | { type: "navigation.completed" }
  | {
      type: "effect.cancelled"
      reason:
        | "aborted"
        | "superseded"
        | "session-ended"
        | "presentation-retargeted"
        | "entitlement-changed"
        | "schema-changed"
    }
  | {
      type: "effect.failed"
      error: StructuredError
      delivery: "not-applicable" | "not-sent" | "possibly-sent" | "acknowledged"
    }
```

`command.execute`는 언제나 `retryPolicy.kind="none"`다. transport failure가 `possibly-sent`이면 command를 자동 반복하지 않고 idempotency key로 `command.receipt.lookup`을 먼저 실행한다. operation/status fetch는 receipt에서 operationId를 얻은 뒤에만 가능하다.

### 3.1 Layout worker와 focus-Sankey presentation 계약

```ts
type WorkerPayload =
  | { type: "layout.resolved"; result: LayoutResult }
  | {
      type: "layout.failed"
      transactionId: OpaqueId
      presentationRevision: OpaqueId
      universeId: OpaqueId
      revision: LayoutRevision
      error: StructuredError
    }

type SystemPayload =
  | {
      type: "engine.initialized"
      runtimePolicyRevision: string
      configuredOrigin: DataOrigin
    }
  | {
      type: "snapshot.requested"
      planId: OpaqueId
      queryId: OpaqueId
      previousFrameId: OpaqueId | null
    }
  | {
      type: "stream.resyncRequired"
      reasonCode: string
      retainedFrameId: OpaqueId | null
    }
  | { type: "layout.requested"; request: LayoutRequest }
  | {
      type: "layout.rejectedAsStale"
      transactionId: OpaqueId
      presentationRevision: OpaqueId
      universeId: OpaqueId
      requestedRevision: LayoutRevision
      currentRevision: LayoutRevision
    }

type FocusSankeyPresentationState =
  | { kind: "inactive"; presentationRevision: OpaqueId }
  | {
      kind: "preparing"
      transitionId: FocusSankeyTransitionId
      transitionKind: "enter" | "exit" | "retarget" | "post-settle-reconcile"
      sourceEntityKey: string | null
      frozenUniverse: PresentationUniverse
      presentationRevision: OpaqueId
      layoutTransactionId: OpaqueId
      canonicalRevisionPending: StateRevision | null
    }
  | {
      kind: "transitioning"
      transitionId: FocusSankeyTransitionId
      transitionKind: "enter" | "exit" | "retarget" | "post-settle-reconcile"
      sourceEntityKey: string | null
      frozenUniverse: PresentationUniverse
      presentationRevision: OpaqueId
      transitionEffectId: OpaqueId
      canonicalRevisionPending: StateRevision | null
    }
  | {
      kind: "settled"
      sourceEntityKey: string
      universe: PresentationUniverse
      presentationRevision: OpaqueId
      layoutRevision: LayoutRevision
    }
```

generated `EngineState`는 `focusSankey: FocusSankeyPresentationState`를 정확히 하나 소유한다. canonical graph/frame store와 presentation store는 구분하지만 둘 다 같은 `ReducerTransition` 안에서만 commit되며 별도 reducer/event bus를 만들지 않는다. `presentationRevision`은 equality-only opaque revision이고 대소 비교하지 않는다. accepted focus intent, current layout commit, transition settle/reconcile 전환은 각각 새 revision을 발급하며 stale intent/result는 revision을 올리지 않는다.

`LayoutRequest`의 모든 number는 finite이며 width/height/DPR/text width/duration/count는 non-negative다. count와 `StateRevision`은 safe integer다. `entities`, `relations`, target ID, previous geometry target ID는 각 자신의 범위에서 unique해야 한다. relation endpoint는 같은 request entity universe에 있어야 하며 renderer가 API DTO를 다시 해석하도록 raw object를 넘기지 않는다.

request target ID와 result target ID는 exact bijection이다. `kind="focus-sankey"` target result만 non-null completeness proof를 가지고 lens target은 null이다. `previousGeometryByTarget`는 요청 target의 subset이고 targetId당 최대 하나다. fold-lens에서 focus enter할 때는 취소 시점의 current interpolated geometry를 previous/from geometry로 capture하며 placement endpoint geometry로 교체하지 않는다.

`PresentationTransitionRequest`는 reason과 sequence policy가 1:1이다. enter/retarget/post-settle-reconcile의 `sourceEntityKey`는 non-null이고 exit는 null이다. enter/retarget/reconcile settle은 `FocusSankeyPresentationState.kind="settled"`, exit settle은 `kind="inactive"`로 이동한다. reduced motion에서 duration이 0이어도 같은 transition effect/settled message/correlation을 거치고 동기 직접 mutation으로 우회하지 않는다.

`universeRevision`은 ordered `mapEntityKeys`, layout entity의 parent/role/order/size/health/text measurement, included relation key/endpoints/plane, viewport, layout/visual policy revision의 canonical encoding을 hash한다. focus-Sankey는 health로 group하므로 health 변화도 이 mode에서는 layout-affecting이다. worker result는 transaction, presentation, universe, layout revision을 byte-for-byte echo해야 하며 하나라도 current와 다르면 geometry를 commit하지 않는다.

Focus-Sankey target은 다음 proof를 reducer에서 다시 검증한다.

1. `mapEntityCount === mapEntityKeys.length`이고 source는 `mapEntityKeys`에 정확히 한 번 있다.
2. `columnEntityKeys`는 source를 뺀 `mapEntityKeys`의 exact ordered permutation이다. 따라서 `columnEntityKeys.length + 1 === mapEntityKeys.length`다.
3. `groups.flatMap(memberEntityKeys)`가 related exact set이다. related와 `unrelatedEntityKeys`는 서로소이고 합집합이 column이다. relation이 없는 entity를 삭제하지 않는다.
4. related entity는 정확히 하나의 group에 속하고 모든 member의 frozen health는 group `healthLevel`과 같다. group key, health level, ribbon connector key는 각각 unique하며 severity/order policy와 일치한다.
5. group 하나당 `ribbonConnectorKey`가 정확히 하나이고 geometry에 같은 `focus-face-connector.connectorKey`가 정확히 하나 있다. connector의 health/member key는 group proof와 정확히 같고 다른 group과 connector를 공유하지 않는다.
6. source face ratio는 canonical decimal `0 <= start < end <= 1`이다. 첫 group은 0에서 시작하고 인접 group의 end/start가 정확히 같으며 마지막 group은 1에서 끝난다. group이 0개면 source face 분할/ribbon도 0개다. worker는 먼저 각 target group의 settled block-start부터 block-end까지의 face block-size를 계산하고, 그 합에 대한 exact share를 §8 DecimalPolicy로 quantize해 residual/tie 규칙으로 합을 정확히 1로 닫는다. reducer는 `RenderGeometry`에서 같은 block-size를 독립적으로 다시 계산해 proof ratio와 일치하는지 검증한다. `memberEntityKeys.length`는 label의 `memberCount`에만 쓰며 source face ratio 입력으로 사용하지 않는다.

Transition이 preparing/transitioning으로 들어갈 때 reducer는 그 시점의 immutable `PresentationUniverse`와 presentation revision을 freeze한다. 이 freeze는 presentation 배치·grouping·label·health·ribbon membership만 대상이다. canonical entity/relation/metric reducer는 계속 모든 valid stream batch를 sequence 순서대로 atomic commit하고 `canonicalRevisionPending`에 latest revision을 coalesce한다. stream event를 버리거나 canonical state 적용을 지연하지 않는다.

`focusSankey.transitionSettled`가 active effect/transition/revision과 정확히 일치하면 reducer는 settled presentation을 먼저 commit한 뒤 current canonical revision과 frozen universe를 비교한다.

- layout-affecting input이 같으면 frozen flag만 해제하고 latest semantic overlay를 같은 entity key에 적용한다.
- 다르고 source가 여전히 authorized/existing이면 방금 settled geometry를 `previousGeometryByTarget`로 사용한 `reason="post-settle-reconcile"` layout을 한 번 발행한다. 도착한 추가 revision은 또 latest 하나로 coalesce한다.
- ordinary delete로 source가 사라졌으면 transition 중에는 interaction-disabled exit ghost로 유지하고 settle 후 latest map으로 exit/reconcile한다. 동명 entity를 source로 추정하지 않는다.
- settle result가 stale/cancelled면 presentation을 진전시키지 않고 current interpolated geometry 또는 last valid scene을 유지한다.

entitlement epoch 변경은 일반 data update가 아니다. active layout/transition을 즉시 cancel하고 frozen universe를 폐기하며, 이전 scene이 권한 밖 entity를 계속 그리지 않도록 authoritative resync 전까지 restricted/loading surface로 교체한다. compatible catalog/schema revision 변경은 transition을 cancel하고 replan한다. incompatible major는 frozen/last scene을 폐기하고 compatibility-fatal로 이동한다. 이 세 경우에는 post-settle reconcile로 구버전 presentation을 부활시키지 않는다.

### 3.2 Engine telemetry 계약

```ts
type EngineTelemetryWindow = {
  startedAt: Timestamp
  endedAt: Timestamp
  sampleCount: number
}

type EngineTelemetryContext = {
  performancePolicyRevision: string
  layoutPolicyId: string
  visualMotionPolicyId: string
  profileId: "S" | "M" | "F" | "X" | "unclassified"
  scopeLevel: Scope["level"]
  containerMode: LayoutViewport["containerMode"]
  rendererTier: "dom" | "canvas" | "svg" | "webgl" | "mixed" | "none"
  motionMode: "full" | "reduced"
  dataOriginKind: DataOrigin["kind"]
  layoutKind: "placement" | "lens" | "focus-sankey" | "none"
}

type EngineDurationMetricId =
  | "interaction-frame"
  | "input-to-presentation"
  | "worker-layout"
  | "validated-snapshot-to-first-meaningful-scene"
  | "query-commit-to-settled-morph"
  | "renderer-draw"
  | "presentation-transition"

type EngineCounterMetricId =
  | "main-thread-long-task"
  | "stream-coalesced-update"
  | "stream-resync"
  | "stale-worker-result"
  | "dropped-presentation-frame"
  | "renderer-handoff"
  | "layout-failure"
  | "protocol-corruption"
  | "presentation-transition-interrupted"
  | "post-settle-reconcile"

type EngineGaugeMetricId =
  | "stream-backlog-frame-batches"
  | "dom-node-count"
  | "heap-bytes"
  | "detached-dom-node-count"
  | "visible-entity-count"
  | "visible-relation-count"
  | "geometry-lag-ms"

type EngineGaugeMeasurement =
  | {
      metricId: "stream-backlog-frame-batches"
      unit: "frame-batches"
      value: number
    }
  | {
      metricId: "heap-bytes"
      unit: "bytes"
      value: number
    }
  | {
      metricId: "geometry-lag-ms"
      unit: "ms"
      value: number
    }
  | {
      metricId: Exclude<
        EngineGaugeMetricId,
        "stream-backlog-frame-batches" | "heap-bytes" | "geometry-lag-ms"
      >
      unit: "count"
      value: number
    }

type EngineTelemetryBase = {
  schemaVersion: "topology-engine-telemetry/v1"
  recordId: OpaqueId
  observedAt: Timestamp
  window: EngineTelemetryWindow
  context: EngineTelemetryContext
}

type EngineTelemetry =
  | (EngineTelemetryBase & {
      kind: "duration-summary"
      metricId: EngineDurationMetricId
      unit: "ms"
      p50: number
      p95: number
      p99: number
      max: number
    })
  | (EngineTelemetryBase & {
      kind: "counter"
      metricId: EngineCounterMetricId
      unit: "count"
      delta: number
    })
  | (EngineTelemetryBase & { kind: "gauge" } & EngineGaugeMeasurement)
  | (EngineTelemetryBase & {
      kind: "diagnostic"
      event:
        | "layout-rejected-stale"
        | "layout-failed"
        | "stream-gap"
        | "resync-required"
        | "renderer-context-lost"
        | "presentation-transition-cancelled"
        | "contract-refinement-rejected"
      outcome: "recovered" | "degraded" | "failed" | "cancelled"
      reasonCode: string
    })
```

telemetry number는 모두 finite/non-negative이다. count/delta/sampleCount는 safe integer이고 `sampleCount >= 1`, `startedAt <= endedAt <= observedAt`, duration quantile은 `p50 <= p95 <= p99 <= max`여야 한다. gauge의 unit은 metric registry에 고정하며 잘못된 metric/unit 조합을 거부한다.

frame/draw/layout raw sample은 in-process bounded ring buffer에서 summary로 집계한 후에만 adapter로 내보낸다. telemetry에 workspace ID, entity/resource/namespace/repository/operation ID, display name, label/annotation, URL, query text, raw error message, raw payload를 넣지 않는다. `reasonCode`는 versioned allowlist code만 허용하며 provider 문구나 exception message를 넣지 않는다. Runtime `dataOriginKind`는 실제 live source만 허용하고 test fixture sample은 production telemetry adapter에 전달하지 않는다.

telemetry effect도 active effect registry를 누수하지 않도록 adapter가 성공 시 같은 `recordId`의 `telemetry.recorded`를 terminal result로 반환한다. 실패는 generic `effect.failed`로 닫되 제품 state/scene을 바꾸지 않는다. telemetry 성공/실패를 다시 telemetry effect로 보내는 재귀를 금지한다.

## 4. Snapshot과 stream wire

```ts
type SnapshotEnvelope = {
  schemaVersion: "topology-snapshot/v1"
  eventId: OpaqueId
  workspaceId: OpaqueId
  queryId: OpaqueId
  planId: OpaqueId
  entitlementEpoch: OpaqueId
  catalogRevision: string
  frameId: OpaqueId
  dataOrigin: DataOrigin
  hashes: TopologyPlanHashes
  streamStart: StreamStart
  emittedAt: Timestamp
  frame: Omit<
    ProjectionFrame,
    "schemaVersion" | "frameId" | "dataOrigin" | "hashes" | "streamStart" | "emittedAt"
  >
}

type SnapshotPayload = { type: "snapshot.received"; snapshot: SnapshotEnvelope }

type StreamEnvelope = {
  schemaVersion: "topology-stream/v1"
  eventId: OpaqueId
  workspaceId: OpaqueId
  queryId: OpaqueId
  entitlementEpoch: OpaqueId
  catalogRevision: string
  dataOrigin: DataOrigin
  origin:
    | { kind: "query" }
    | { kind: "cluster"; clusterUid: string; inventoryEpoch: string }
  cursor: ResumeCursor
  emittedAt: Timestamp
  observedAt: Timestamp
  hashes: TopologyPlanHashes
  payload: StreamPayload
}

type StreamPayload =
  | { type: "stream.ready"; acceptedCursor: ResumeCursor; headSequence: number }
  | { type: "stream.deltaBatch"; batch: TopologyDeltaBatch }
  | { type: "catalog.revisionAnnounced"; catalogRevision: string }
  | {
      type: "stream.resyncRequired"
      reason:
        | "resume-rejected"
        | "retention-expired"
        | "epoch-changed"
        | "hash-mismatch"
        | "entitlement-changed"
        | "sequence-gap"
        | "backpressure"
        | "protocol-corruption"
        | "anti-entropy"
      retryAfterMs: DurationMs | null
    }

type OperationStreamPayload = {
  type: "operation.eventReceived"
  event: GitOpsOperationEvent
}
```

각 ordered envelope은 그 sequence까지 resume 가능한 signed token을 포함한다. token을 매 envelope 갱신할 수 없는 transport는 별도 checkpoint payload와 최대 replay 거리/만료를 contract version에 명시해야 하며, client가 sequence만 조립해 token을 만들지 않는다.

Handshake 규칙은 `streamStart.mode="stream"`일 때만 적용한다. poll/static에서는 subscribe하지 않는다.

1. client는 마지막 reducer-committed ResumeCursor를 보낸다.
2. server의 `acceptedCursor.sequence`는 그 마지막 committed sequence와 같아야 한다.
3. `headSequence >= acceptedSequence`여야 하며 replay는 accepted+1부터 연속 전달한다.
4. workspace/queryId/entitlementEpoch/dataOrigin/hashes/streamId/epoch 중 하나라도 불일치하면 delta를 적용하지 않는다.
5. retention/token 만료/epoch 변경은 `stream.resyncRequired`; schema major 불일치는 compatibility fatal이다.

## 5. Delta union과 atomic 적용

```ts
type MetricValueKey = {
  seriesKey: string
  entityKey: string
  metricId: string
  sourceId: string
  windowKey: string
}

type TopologyDelta =
  | { type: "entity.upserted"; entity: Entity }
  | { type: "entity.deleted"; entityKey: string; deletedAt: Timestamp; reasonCode: string }
  | {
      type: "entity.resolutionCommitted"
      placeholderKey: string
      resourceKey: string
      evidenceId: string
    }
  | { type: "relation.upserted"; relation: CanonicalRelation }
  | { type: "relation.deleted"; relationKey: string; deletedAt: Timestamp }
  | { type: "restrictedBoundary.upserted"; marker: RestrictedBoundaryMarker }
  | { type: "restrictedBoundary.deleted"; boundaryKey: string }
  | {
      type: "metric.batchReceived"
      upserts: readonly MetricValue[]
      removals: readonly MetricValueKey[]
    }
  | {
      type: "flow.batchReceived"
      upserts: readonly FlowValue[]
      removalKeys: readonly string[]
    }
  | {
      type: "size.batchReceived"
      upserts: readonly ComputedSizeValue[]
      removalEntityKeys: readonly string[]
    }
  | {
      type: "rollup.batchReceived"
      upserts: readonly Rollup[]
      removalKeys: readonly { parentEntityKey: string; metricId: string }[]
    }
  | { type: "clusterCuts.replaced"; clusterCuts: readonly ClusterCut[] }
  | { type: "effectiveWindow.replaced"; effectiveWindow: TimeWindow }
  | { type: "source.watermarkReplaced"; watermark: SourceWatermark }
  | { type: "frame.completenessReplaced"; completeness: CompletenessSummary }
  | { type: "warning.upserted"; warning: StructuredWarning }
  | { type: "warning.deleted"; warningKey: string }

type TopologyDeltaBatch = {
  batchId: OpaqueId
  baseFrameId: OpaqueId
  nextFrameId: OpaqueId
  deltas: NonEmptyReadonlyArray<TopologyDelta>
}
```

한 batch는 scratch state에 적용하고 모든 cross-field/global invariant가 통과한 경우에만 commit한다. 한 structural key를 같은 batch에서 upsert와 delete 양쪽에 넣으면 invalid다.

고정 적용 phase:

1. entity upsert와 placeholder resolution.
2. relation/restricted boundary upsert.
3. metric/flow/size/rollup/cluster-cuts/effective-window/watermark/completeness/warning replace.
4. relation/boundary/value delete.
5. entity delete.

Relation endpoint는 기존 state 또는 같은 batch의 entity/placeholder에 존재해야 한다. 이미 없는 delete는 idempotent no-op이며 이름이나 좌표로 다른 항목을 추정 삭제하지 않는다. `baseFrameId`는 current frame과 같고 `nextFrameId`는 base와 달라야 하며 batch commit과 동시에 current frame ID가 next로 바뀐다. 다음 batch는 그 nextFrameId를 base로 사용한다. Snapshot이 가진 entity/relation/boundary/metric/flow/size/rollup/cluster-cuts/effective-window/watermark/completeness/warning state-space를 delta가 모두 표현해야 한다.

## 6. Command receipt와 operation

```ts
type CommandReceiptBase = {
  schemaVersion: "topology-command-receipt/v1"
  invocationId: InvocationId
  idempotencyKey: string
  dataOrigin: DataOrigin
  receivedAt: Timestamp
}

type CommandReceipt =
  | (CommandReceiptBase & { outcome: "accepted"; receipt: GitOpsOperationReceipt })
  | (CommandReceiptBase & { outcome: "rejected"; error: StructuredError })
```

`CommandReceipt`는 topology action invocation과 canonical GitOps receipt의 correlation wrapper일 뿐 별도 operation model이 아니다. accepted branch의 idempotencyKey/dataOrigin은 nested receipt와 정확히 같아야 한다. transport가 possibly-sent이면 receipt를 만들지 않고 `effect.failed(delivery="possibly-sent")`를 dispatch해 receipt lookup으로 수렴한다. phase/progress/approval/result/transition/status-cut 규칙은 `product-data-contract.md` §10 하나만 따른다.

## 7. Reducer state와 transition

```ts
type QueryActivity =
  | { kind: "idle" }
  | { kind: "planning"; queryRevision: string; effectId: string }
  | { kind: "loading-snapshot"; queryId: string; planId: string; effectId: string }
  | { kind: "rejected"; queryRevision: string; error: StructuredError }
  | { kind: "failed"; queryRevision: string; error: StructuredError }

type VisibleFrameState =
  | { kind: "absent" }
  | {
      kind: "installed"
      frameId: string
      hashes: TopologyPlanHashes
      streamStart: StreamStart
      visibility: "current-query" | "previous-while-planning" | "stale-while-disconnected"
      content: "nonempty" | "empty-authoritative"
    }

type StreamState =
  | { kind: "not-applicable" }
  | { kind: "connecting"; expectedCursor: ResumeCursor; effectId: string }
  | { kind: "connected"; committedCursor: ResumeCursor; headSequence: number }
  | { kind: "disconnected"; committedCursor: ResumeCursor; retryAttempt: number }
  | { kind: "resyncing"; retainedFrameId: string | null; reasonCode: string }
  | { kind: "compatibility-fatal"; error: StructuredError }

type CatalogState =
  | { kind: "absent" }
  | { kind: "loading"; effectId: OpaqueId }
  | { kind: "ready"; response: TopologyCatalogResponse }
  | { kind: "failed"; error: StructuredError }

type EngineQueryState = {
  draft: TopologyQuery
  queryRevision: OpaqueId
  committed:
    | {
        queryId: OpaqueId
        planId: OpaqueId
        canonicalPlanQuery: TopologyPlanQuery
        hashes: QueryHashes
      }
    | null
  activity: QueryActivity
}

type EnginePresentationState = {
  settled:
    | {
        presentation: TopologyPresentation
        layoutRevision: LayoutRevision
        geometry: RenderGeometry
      }
    | null
  target: TopologyPresentation
  focusSankey: FocusSankeyPresentationState
}

type ActiveEffectState = {
  effectId: OpaqueId
  abortKey: OpaqueId
  causationEventId: OpaqueId
  payloadType: EffectPayload["type"]
}

type UnresolvedCommandState = {
  request: CommandRequest
  delivery: "not-sent" | "possibly-sent" | "acknowledged"
  operationId: OpaqueId | null
}

type ReducerRetentionState = {
  policyId: string
  sessionEventIds: readonly OpaqueId[]
  terminalEffectIds: readonly OpaqueId[]
  streamPayloadDigests: readonly { streamId: OpaqueId; streamEpoch: OpaqueId; sequence: number; digest: string }[]
}

type EngineState = {
  schemaVersion: "topology-engine-state/v1"
  sessionId: OpaqueId
  workspaceId: OpaqueId
  configuredOrigin: DataOrigin
  stateRevision: StateRevision
  catalog: CatalogState
  query: EngineQueryState
  frame: VisibleFrameState
  stream: StreamState
  presentation: EnginePresentationState
  selection: SelectionState
  activeEffects: Readonly<Record<OpaqueId, ActiveEffectState>>
  unresolvedCommands: Readonly<Record<OpaqueId, UnresolvedCommandState>>
  operations: Readonly<Record<OpaqueId, GitOpsOperationStatus>>
  errors: readonly StructuredError[]
  retention: ReducerRetentionState
}

type ReducerTransition =
  | { kind: "committed"; nextState: EngineState; directives: readonly EffectDirective[] }
  | {
      kind: "no-op"
      state: EngineState
      reason: "duplicate" | "stale-result" | "cancelled-effect" | "old-stream-sequence"
    }
  | { kind: "rejected"; state: EngineState; error: StructuredError }
  | {
      kind: "resync-required"
      nextState: EngineState
      reasonCode: string
      directives: readonly EffectDirective[]
    }
  | { kind: "compatibility-fatal"; nextState: EngineState; error: StructuredError }
```

`EnginePresentationState.settled`은 마지막으로 완결된 geometry이고 `target`은 현재 intent의 canonical 목표다. transition 중 둘이 달라도 허용되며 두 field를 같은 의미로 읽지 않는다. `target.mode="focus-sankey"`이거나 active focus transition일 때만 `focusSankey`가 preparing/transitioning/settled일 수 있다. map/fold-lens가 settled되고 focus transition이 없으면 `focusSankey.kind="inactive"`다. activeEffects key는 내부 effectId와 같고 unresolvedCommands key는 invocationId와 같다. retention collection은 policy bound를 지키되 active stream cursor와 possibly-sent command를 제거하는 근거로 사용하지 않는다.

Reducer pipeline은 고정한다.

```text
runtime schema
→ workspace/session/data-origin
→ dedupe
→ effect correlation 또는 stream continuity
→ query hash/catalog/entitlement
→ payload cross-field refinement
→ scratch state 적용
→ global invariant 검사
→ atomic commit
```

새 query를 planning/loading하는 동안 이전 valid frame과 그 frame hash를 유지한다. pending query hash와 visible frame hash를 같은 필드로 덮어쓰지 않는다. authoritative empty는 complete+allowed snapshot의 명시적 결과에서만 설치한다.

## 8. Decimal 계산과 표시

```ts
type DecimalRoundingMode = "half-even"

type DecimalPolicy = {
  policyId: string
  maxIntegerDigits: number
  maxFractionDigits: number
  derivedFractionDigits: number
  guardDigits: number
  allowNegative: boolean
  roundingMode: DecimalRoundingMode
  overflow: "reject"
}

type DecimalDisplayPolicy = {
  policyId: string
  notation: "plain" | "compact"
  unitScale: "none" | "si" | "iec" | "currency-major"
  minimumFractionDigits: number
  maximumFractionDigits: number
  maximumSignificantDigits: number
  roundingMode: DecimalRoundingMode
  trailingZero: "trim" | "preserve"
}
```

Canonical plain decimal grammar:

```text
^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$
```

- `-0`, leading plus, exponent, whitespace, grouping separator, leading zero, trailing fractional zero를 거부한다. zero는 정확히 `"0"`다.
- source value는 arbitrary-precision base-10으로 파싱하고 unit 변환/sum 중간에 반올림하지 않는다.
- division이 필요한 normalized share/weight/contribution 경계에서만 `derivedFractionDigits`로 half-even quantize한다.
- quantized share 합을 정확히 1로 닫아야 하면 residual을 discarded remainder가 가장 큰 항에 배정하고 tie는 canonical term/entity key로 깬다.
- composite parent는 canonical child score 합이며 parent에서 다시 normalize하지 않는다.
- display rounding은 계산, URL, action parameter, export에 재사용하지 않는다.
- geometry worker는 decimal ratio를 normalize한 뒤 finite float로 변환한다.
- unit prefix는 반올림 전 절대값으로 선택하고 scale 후 한 번만 반올림한다.
- non-zero가 최소 표시 quantum보다 작으면 `0`이 아니라 `< quantum`; null은 reason-aware missing이다.
- denominator 0 percentage는 not-applicable이며 Infinity/NaN을 표시하지 않는다.
- currency는 ISO currency + window + source cohort가 같을 때만 합산한다.
- exact canonical value는 inspector/export에 보존하고 formatter는 `Number(decimalString)`을 거치지 않는다.

## 9. Idempotency, cancellation, reconnect

### 9.1 Message와 stream

- UI/URL/system message는 `(sessionId,eventId)`로 dedupe한다.
- stream primary key는 `(streamId,streamEpoch,sequence)`다.
- 같은 tuple에 다른 eventId 또는 payload digest가 오면 protocol corruption이다.
- `sequence <= committed`: 적용하지 않는다. retention 안이면 digest 일치 확인, compact 이후 old replay diagnostic.
- `sequence === committed + 1`: atomic apply 후보.
- `sequence > committed + 1`: 적용하지 않고 resync.
- streamId/epoch 변경은 새 snapshot/session 없이 수용하지 않는다.
- emittedAt/observedAt/resourceVersion/generation으로 순서를 추정하지 않는다.

### 9.2 Effect cancellation

- 동일 abortKey의 새 effect 전에 이전 effect를 cancelled registry에 기록한다.
- cancelled/inactive effectId 결과는 hash가 같아도 적용하지 않는다.
- 한 effectId의 첫 terminal result만 유효하며 다음 terminal result는 protocol error다.
- query/scope 변경은 이전 plan/snapshot/stream/detail/layout/presentation-transition effect를 취소한다.
- focus-Sankey retarget/exit는 active layout/transition만 `presentation-retargeted`로 취소하고 topology stream과 canonical reducer는 계속 진행한다.
- entitlement/schema 변경 취소는 frozen universe 폐기와 scene visibility 차단을 같은 reducer transition에서 atomic하게 수행한다. cancel directive만 내보내고 구 scene을 한 frame 더 노출하지 않는다.
- 이미 전송됐을 수 있는 command는 query 변경으로 취소 완료 처리하지 않고 unresolved command ledger에 둔다.
- registry/LRU는 bounded지만 active cursor와 unresolved command ledger는 임의 TTL/LRU eviction 대상이 아니다.

### 9.3 Command idempotency

- idempotency uniqueness scope는 workspace + actor + idempotencyKey다. action + target + parametersHash + capability revision은 저장 fingerprint다.
- 동일 key/fingerprint는 동일 receipt, 같은 key/다른 fingerprint는 conflict다.
- transport failure가 `possibly-sent`이면 자동 재실행하지 않고 receipt lookup을 먼저 실행한다.
- 같은 logical invocation retry는 key를 유지하고, 새 parameter/target/명시적 invocation만 새 key다.

### 9.4 Reconnect

1. 마지막 reducer-committed signed cursor로 reconnect한다.
2. handshake의 workspace/query/entitlement/origin/hashes/stream/epoch/accepted sequence를 모두 검증한다.
3. accepted+1부터 연속 replay한다.
4. disconnect 중 마지막 valid scene을 유지하고 connection/freshness만 갱신한다.
5. resume rejection, retention expiry, stream epoch/hash mismatch는 last valid scene을 유지하고 새 snapshot을 요구한다. entitlement epoch mismatch는 active presentation과 scene을 폐기한 후 restricted/loading surface에서 새 snapshot을 요구한다.
6. resync 중 old/new delta를 이어 붙이지 않는다.
7. buffer overflow는 silent drop이 아니라 resync다.
8. schema major mismatch는 resync loop가 아니라 compatibility fatal이다.
9. reconnect/resync/forbidden을 authoritative empty로 바꾸지 않는다.

## 10. Message validation matrix

| Message / delta | 허용 source | 필수 검증 | commit / 실패 처리 |
|---|---|---|---|
| `engine.initialized` | system | uninitialized, config/schema/runtime policy | session 생성, catalog fetch |
| `catalog.changed` | effect | active effect, envelope origin/access/completeness/schema, ID collision | active presentation cancel; compatible replan, major는 scene 폐기+fatal |
| `url.hydrated` | url | codec version/migration/size/depth/entitlement | pending query; focus source는 snapshot 후 재검증, invalid면 map 유지 |
| `query.textChanged` | ui | base revision, length/control char | draft만 변경 |
| `query.tokenCommitted` | ui | token schema/catalog/revision/duplicate | canonical query + plan |
| `query.tokenRemoved` | ui | token 존재/revision/default size | canonical query + plan |
| `query.planRequested` | ui/system | AST, field/unit/window/action 혼입 | 이전 query effect cancel, plan |
| `query.planResolved` | effect | active effect/envelope origin/access/expiry/data+projection hash/catalog; response에 presentation 없음 | canonical plan을 local view query에 병합하고 frontend presentation/share hash 계산 후 loading snapshot |
| `query.planRejected` | effect | active effect/typed error | 이전 scene 유지, rejected |
| `scope.entered/exited` | ui | identity/entitlement/containment | query 변경; graph 직접 mutation 금지 |
| `focusSankey.entered` | ui | map/fold-lens, captured base-map source exact membership, frame/presentation revision | fold transition은 cancel; current interpolated geometry에서 universe freeze+focus layout, map 순간 복귀 금지 |
| `focusSankey.retargeted` | ui | focus mode, new source membership, frame/presentation revision | active layout/transition cancel, current geometry에서 retarget |
| `focusSankey.exited` | ui | focus preparing/transitioning/settled, frame/presentation revision | active effect cancel, latest map target layout |
| `lens.progressChanged` | ui | finite p, gesture/layout revision | presentation only |
| `lens.committed` | ui | lens capability/data hash 불변 | URL/layout; data refetch 금지 |
| `entity.focused` | ui | visible/restorable target | presentation only |
| `entity.activated` | ui | current entity, current `ActionDescriptor`/`AvailableAction`, action/descriptor/capability revision, focus intent가 아님 | 같은 reducer transition에서 declared inspect/navigation/query effect; 다른 `EngineMessage` 후속 dispatch 금지 |
| `selection.changed` | ui | revision/entity existence/limit | atomic selection |
| `viewport.changed` | ui | finite coordinate/zoom/policy | presentation only |
| `action.invoked` | ui | descriptor/capability/target/parameters | confirmation 대기 또는 command effect |
| `action.confirmed` | ui | pending invocation/token target/hash/expiry | 같은 invocation/key command |
| `action.dismissed` | ui | pending invocation | local pending 제거 |
| `operation.cancelRequested` | ui | non-terminal/cancel capability | command 제출; phase 유지 |
| `snapshot.received` | snapshot | correlation/workspace/query/origin/epoch/catalog/hash/streamStart/frame invariant | frame atomic install; stream mode만 subscribe |
| `stream.ready` | stream | accepted=requested, head>=accepted | accepted+1 replay |
| `stream.disconnected` | effect | active subscribe | frame 유지/reconnect |
| `stream.resyncRequired` | stream/system | active tuple/reason | stream/layout/transition cancel; entitlement/schema는 frozen/last scene 폐기, 그 외은 last valid frame 유지 후 snapshot |
| `entityDetail.received` | effect | active effect/envelope origin/access/frame/cursor | matching inspector section replace |
| `entity.upserted` | stream batch | UID identity/workspace/cluster/budget | full replace |
| `entity.deleted` | stream batch | key/time/reason | tombstone; 이름 lookup 금지 |
| `entity.resolutionCommitted` | stream batch | authoritative evidence/both entities | relation/focus/selection alias 이전 |
| `relation.upserted` | stream batch | key/endpoints/evidence/claims | full replace |
| `relation.deleted` | stream batch | relation key | absent no-op |
| `restrictedBoundary.*` | stream batch | stable key/no cardinality leak | keyed replace/delete |
| `metric.batchReceived` | stream batch | decimal/status/unit/hash/entity | keyed replace/delete |
| `flow.batchReceived` | stream batch | observed truth/window/unit/relation | keyed replace/delete |
| `size.batchReceived` | stream batch | formula/cohort/hash/nonnegative | current formula only |
| `rollup.batchReceived` | stream batch | leaf universe/sum/coverage | keyed replace/delete |
| `clusterCuts.replaced` | stream batch | cluster uniqueness/access/revision/redaction | full collection replace |
| `effectiveWindow.replaced` | stream batch | valid ordered window/query time | full window replace |
| `source.watermarkReplaced` | stream batch | catalog/orthogonal axes | full source replace |
| `frame.completenessReplaced` | stream batch | count/access/source consistency | completeness only |
| `warning.*` | stream batch | stable key/redaction | keyed replace/delete |
| `layout.requested` | system | current frame/presentation/universe, one active transaction per abortKey | layout compute effect |
| `layout.resolved` | worker | active effect, transaction/presentation/universe/layout exact echo, focus completeness proof | current target geometry commit 후 transition effect |
| `layout.rejectedAsStale` | system | revision mismatch and rejected transaction identity | geometry 불변 |
| `layout.failed` | worker | active effect/recoverability | last layout 유지 |
| `focusSankey.transitionSettled` | effect | active effect/transition/presentation/universe/layout revision | settled commit 후 latest canonical과 비교, 필요 시 post-settle reconcile |
| `telemetry.recorded` | effect | active telemetry effect, exact recordId | terminal effect registry cleanup; product state/scene 불변 |
| `command.receiptReceived` | effect | effect/key/dataOrigin/fingerprint | accepted canonical receipt install; rejected graph 불변 |
| `command.receiptLookupReceived` | effect | active lookup/envelope origin/key/fingerprint | found/pending/not-found branch; graph 불변 |
| `operation.eventReceived` | operation-stream | operationId/origin/full cursor/operationSequence/status contract | operation ledger; gap은 해당 status cut fetch |
| `operation.snapshotReceived` | effect | active lookup/envelope origin/authoritative status cut | last-known/gap reconcile |
| `theme.changed` | ui | registered complete token set | query/layout identity 불변 |
| `motion.changed` | ui | registered policy | geometry identity 불변 |
| `effect.cancelled` | effect | active/cancelled registry, reason/abortKey correlation | cancelled effect terminal 처리; presentation 임의 진전 금지 |
| `effect.failed` | effect | active effect/scoped error/delivery | 이전 scene 유지, scope error |

## 11. Product DTO ↔ engine mapping

- product `ResourceRef.entityId`와 engine `EntityRef.entityKey`는 같은 canonical identity string을 사용한다.
- product `entityClass="restricted"`는 engine에서 `entityClass="placeholder", placeholderReason="restricted"`로만 표현한다. UI adapter는 좌표/이름/count를 추가 추론하지 않는다.
- product `HealthStatus`는 Application Instance의 GitOps/aggregate health다. engine `TopologyHealthVerdict`는 개별 runtime entity의 판정이다. product health는 topology child health의 단순 worst-value 복사가 아니며 backend가 별도 reason/evidence로 제공한다.
- product `ResourceEdgeKind`는 UI consumer taxonomy, engine `RelationPlane/relationType`은 projection taxonomy다. mapping catalog가 versioned many-to-one/one-to-many 규칙과 evidence 보존을 소유한다.
- engine operation ledger는 product `GitOpsOperationReceipt`, `GitOpsOperationStatus`, `GitOpsOperationEvent`를 그대로 저장하고 presentation selector만 파생한다. topology 전용 phase/progress/approval DTO를 다시 만들지 않는다.
- common `DecimalString`, `DataOrigin`, `StatusReason`, `OperationPhase`, `ApprovalStatus`는 `product-data-contract.md`의 generated canonical consumer core에서 import하며 다시 선언하지 않는다.

## 12. Protocol release gates

1. 모든 union은 runtime discriminant schema와 exhaustive reducer test를 가진다.
2. snapshot과 delta state-space parity test가 있다.
3. duplicate/old/next/gap/epoch change/resume expiry/property test가 있다.
4. batch 중간 failure에서 state가 byte-for-byte 이전 값임을 검증한다.
5. cancelled effect와 stale worker 결과가 current hash가 같아도 적용되지 않음을 검증한다.
6. command possibly-sent에서 자동 재실행이 0건인지 검증한다.
7. operation legal/illegal transition과 terminal corruption을 검증한다.
8. decimal grammar/overflow/half-even/residual tie/display separation property test가 있다.
9. restricted mapping이 name/count/total/edge cardinality를 누출하지 않음을 검증한다.
10. schema major incompatibility가 infinite resync loop가 아니라 fatal state로 끝남을 검증한다.
11. focus-Sankey property test가 source exact membership, `column + 1 = map`, group-members/unrelated exact partition, health group exact partition, settled target group block-size와 source face ratio의 일치·gap/overlap 0·합 1, group↔ribbon connector 1:1을 임의의 입력 순서와 서로 다른 member-count/block-size에서 검증한다.
12. enter/exit/retarget 전환 중 ordinary stream batch가 canonical state에 모두 atomic commit되고 presentation만 freeze되며, settle 후 latest frame으로 유실 없이 reconcile되는지 fake clock과 interleaving property test로 검증한다.
13. transition 중 source delete, retarget, Escape, entitlement epoch 변경, compatible/incompatible schema 변경을 각각 검증하며 entitlement/schema 변경 후 구 scene이 한 frame도 더 노출되지 않는다.
14. stale/cancelled layout·transition result가 current geometry/presentation revision을 진전시키지 않고 post-settle reconcile가 latest revision 하나로 coalesce되는지 검증한다.
15. telemetry runtime schema가 non-finite/negative/wrong-unit/raw identifier·message를 거부하고 test fixture sample이 live SLO aggregate에 유입되지 않는다.
