---
title: Topology Engine Message and Action Protocol
status: planned-contract
owner: frontend-platform
version: topology-engine-message/v1
last_verified: 2026-07-11
---

# Topology Message / Action Protocol

## 0. 권한과 경계

이 문서는 `topology-engine.md`의 message, reducer, effect, snapshot/delta, action/operation wire 계약을 채우는 구현 예정 보조 계약이다. 현재 repo의 실제 코드와 통과한 테스트가 source of truth이며, 아래 discriminated union과 validation rule이 현 코드에 없으면 구현 완료가 아니라 후속 작업 기준으로만 읽는다. 제품 GitOps operation의 사용자 의미는 `product-data-contract.md`의 구현 예정 계약을 함께 따른다.

- 모든 사용자/URL/stream/worker/effect/system 입력은 `dispatch(EngineMessage)` 한 경로만 사용한다.
- runtime schema 검증 전 payload를 reducer에 전달하지 않는다.
- reducer는 외부 I/O를 수행하지 않고 `ReducerTransition`과 `EffectDirective`만 반환한다.
- 모든 timestamp는 UTC canonical RFC 3339, ID/cursor/token은 opaque다.
- timestamp, Kubernetes resourceVersion, generation, eventId를 stream ordering에 사용하지 않는다.
- 사용자 intent, command receipt, operation progress는 resource success 상태를 optimistic하게 확정하지 않는다.

## 1. 공통 envelope

```ts
type OpaqueId = string
type Timestamp = string
type DurationMs = number
type StateRevision = number
type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

type EngineSource = "ui" | "url" | "snapshot" | "stream" | "worker" | "effect" | "system"

type DataProjectionHashes = Pick<QueryHashes, "dataQueryHash" | "projectionHash">

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
  hashes: DataProjectionHashes
}

type SystemMessageContext = {
  sessionId: OpaqueId
  workspaceId: OpaqueId
  causationEventId: OpaqueId | null
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
  | EngineMessageBase<"worker", EffectResultContext, WorkerPayload>
  | EngineMessageBase<"effect", EffectResultContext, EffectResultPayload>
  | EngineMessageBase<"system", SystemMessageContext, SystemPayload>
```

`StateRevision`, cursor sequence, progress count는 non-negative safe integer다. `source="stream"`의 cursor/hashes/origin은 검증된 outer wire envelope에서 context로 한 번만 복사하고 payload에 중복하지 않는다.

## 2. 사용자 intent

```ts
type QueryTokenId = OpaqueId
type InvocationId = OpaqueId

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
  | { type: "lens.progressChanged"; gestureId: OpaqueId; gestureRevision: LayoutRevision; progress: number }
  | { type: "lens.committed"; lens: Lens; method: "gesture" | "pointer" | "keyboard" | "url"; gestureId: OpaqueId | null }
  | { type: "entity.focused"; entityKey: string | null; reason: "pointer" | "keyboard" | "restoration" | "programmatic" }
  | { type: "entity.activated"; entityKey: string; activationId: OpaqueId; method: "pointer" | "keyboard" }
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

type EffectPayload =
  | { type: "catalog.fetch" }
  | { type: "query.plan"; query: TopologyQuery }
  | { type: "snapshot.fetch"; planId: string; queryId: string }
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
  | { kind: "cancel"; abortKey: OpaqueId; reason: "superseded" | "session-ended" | "resync" | "user-dismissed" }

type EffectResultPayload =
  | { type: "catalog.changed"; catalog: TopologyCatalogResponse }
  | { type: "query.planResolved"; plan: QueryPlanResponse }
  | { type: "query.planRejected"; error: StructuredError }
  | { type: "stream.connected"; acceptedCursor: ResumeCursor; headSequence: number }
  | { type: "stream.disconnected"; reasonCode: string; retryable: boolean; retryAfterMs: DurationMs | null }
  | { type: "command.receiptReceived"; receipt: CommandReceipt }
  | { type: "command.receiptLookupReceived"; result: OperationReceiptLookupResult }
  | { type: "operation.snapshotReceived"; cut: OperationStatusCut }
  | { type: "url.replaceCompleted" }
  | { type: "navigation.completed" }
  | { type: "effect.cancelled"; reason: "aborted" | "superseded" | "session-ended" }
  | {
      type: "effect.failed"
      error: StructuredError
      delivery: "not-applicable" | "not-sent" | "possibly-sent" | "acknowledged"
    }
```

`command.execute`는 언제나 `retryPolicy.kind="none"`다. transport failure가 `possibly-sent`이면 command를 자동 반복하지 않고 idempotency key로 `command.receipt.lookup`을 먼저 실행한다. operation/status fetch는 receipt에서 operationId를 얻은 뒤에만 가능하다.

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
  hashes: DataProjectionHashes
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
  hashes: DataProjectionHashes
  payload: StreamPayload
}

type StreamPayload =
  | { type: "stream.ready"; acceptedCursor: ResumeCursor; headSequence: number }
  | { type: "stream.deltaBatch"; batch: TopologyDeltaBatch }
  | { type: "operation.eventReceived"; event: OperationEvent }
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

type FlowValue = {
  flowKey: string
  relationKey: string
  metricId: string
  valueDecimal: DecimalString | null
  unitId: UnitId
  status: MetricStatus
  window: TimeWindow
  observedAt: Timestamp
  sourceId: string
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
  | { type: "source.watermarkReplaced"; watermark: SourceWatermark }
  | { type: "frame.completenessReplaced"; completeness: CompletenessSummary }
  | { type: "warning.upserted"; warning: StructuredWarning }
  | { type: "warning.deleted"; warningKey: string }

type TopologyDeltaBatch = {
  batchId: OpaqueId
  baseFrameId: OpaqueId
  deltas: NonEmptyReadonlyArray<TopologyDelta>
}
```

한 batch는 scratch state에 적용하고 모든 cross-field/global invariant가 통과한 경우에만 commit한다. 한 structural key를 같은 batch에서 upsert와 delete 양쪽에 넣으면 invalid다.

고정 적용 phase:

1. entity upsert와 placeholder resolution.
2. relation/restricted boundary upsert.
3. metric/flow/size/rollup/watermark/completeness/warning replace.
4. relation/boundary/value delete.
5. entity delete.

Relation endpoint는 기존 state 또는 같은 batch의 entity/placeholder에 존재해야 한다. 이미 없는 delete는 idempotent no-op이며 이름이나 좌표로 다른 항목을 추정 삭제하지 않는다. Snapshot이 가진 entity/relation/boundary/metric/flow/size/rollup/watermark/completeness/warning state-space를 delta가 모두 표현해야 한다.

## 6. Command receipt와 operation

```ts
type OperationProgress =
  | { kind: "indeterminate" }
  | {
      kind: "fraction"
      completedDecimal: DecimalString
      totalDecimal: DecimalString
      unitId: string | null
      percentBasisPoints: number
    }

type OperationSnapshotBase = {
  operationId: string
  receiptId: string
  actionId: string
  target: ActionTarget
  idempotencyKey: string
  operationSequence: number
  approval: ApprovalStatus
  progress: OperationProgress
  requestedAt: Timestamp
  startedAt: Timestamp | null
  auditRef: string
}

type OperationSnapshot = OperationSnapshotBase &
  (
    | {
        phase: "pending" | "pending_approval" | "running"
        finishedAt: null
        reason: StatusReason | null
      }
    | { phase: "succeeded"; finishedAt: Timestamp; reason: null }
    | {
        phase: "failed" | "cancelled" | "unsupported"
        finishedAt: Timestamp
        reason: StatusReason
      }
  )

type CommandReceiptBase = {
  schemaVersion: "topology-command-receipt/v1"
  receiptId: string
  invocationId: InvocationId
  idempotencyKey: string
  dataOrigin: DataOrigin
  receivedAt: Timestamp
}

type CommandReceipt =
  | (CommandReceiptBase & { outcome: "accepted"; operation: OperationSnapshot })
  | (CommandReceiptBase & { outcome: "rejected"; error: StructuredError })
  | (CommandReceiptBase & { outcome: "unknown"; lookupToken: string; reason: StatusReason })

type OperationEventBase = {
  schemaVersion: "topology-operation-event/v1"
  dataOrigin: DataOrigin
  operationEventId: OpaqueId
  operationId: OpaqueId
  receiptId: OpaqueId
  actionId: string
  target: ActionTarget
  idempotencyKey: string
  operationSequence: number
  occurredAt: Timestamp
  observedAt: Timestamp
  auditRef: string
}

type OperationEvent =
  | (OperationEventBase & { type: "operation.accepted"; phase: "pending" | "pending_approval" | "running" })
  | (OperationEventBase & {
      type: "operation.approvalRequested"
      phase: "pending_approval"
      approvalId: string
      expiresAt: Timestamp | null
    })
  | (OperationEventBase & {
      type: "operation.approvalDecided"
      decision: "approved" | "rejected" | "expired"
      phase: "pending" | "cancelled"
    })
  | (OperationEventBase & { type: "operation.started"; phase: "running"; startedAt: Timestamp })
  | (OperationEventBase & { type: "operation.progressed"; phase: "running"; progress: OperationProgress })
  | (OperationEventBase & {
      type: "operation.succeeded"
      phase: "succeeded"
      finishedAt: Timestamp
      resultRefs: readonly ResourceRef[]
    })
  | (OperationEventBase & {
      type: "operation.failed"
      phase: "failed"
      finishedAt: Timestamp
      error: StructuredError
    })
  | (OperationEventBase & {
      type: "operation.cancelled"
      phase: "cancelled"
      finishedAt: Timestamp
      reason: StatusReason
    })
  | (OperationEventBase & { type: "operation.unsupported"; phase: "unsupported"; reason: StatusReason })
```

`percentBasisPoints`는 safe integer 0..10,000이다. total이 없으면 `indeterminate`; 가짜 percent를 만들지 않는다.

Operation phase 전이:

| 현재 | 허용 다음 phase |
|---|---|
| 없음 | pending, pending_approval |
| pending | pending_approval, running, failed, cancelled, unsupported |
| pending_approval | pending, running, failed, cancelled |
| running | succeeded, failed, cancelled |
| succeeded / failed / cancelled / unsupported | 없음 |

- approval approved는 pending, rejected/expired는 실행되지 않은 종료 의미의 cancelled로 canonicalize한다.
- cancel intent나 terminate receipt만으로 target operation을 cancelled로 바꾸지 않는다. authoritative cancelled event가 필요하다.
- operationSequence gap은 topology 전체 resync가 아니라 해당 operation status fetch를 만든다.
- terminal 뒤 다른 terminal 또는 non-terminal event는 protocol corruption이다.
- same active phase progress는 lifecycle transition이 아니다. authoritative OperationStatusCut은 higher sequence에서 어떤 phase든 최초 설치할 수 있으며 이는 incremental event transition이 아니라 snapshot reconciliation이다.
- connection/source 불확실성은 phase를 바꾸지 않고 ObservedOperationStatus가 last known status를 보존한다.

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
      hashes: DataProjectionHashes
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
- query 변경은 이전 plan/snapshot/stream/detail/layout effect를 취소한다.
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
5. resume rejection, retention expiry, epoch/hash mismatch는 새 snapshot을 요구한다.
6. resync 중 old/new delta를 이어 붙이지 않는다.
7. buffer overflow는 silent drop이 아니라 resync다.
8. schema major mismatch는 resync loop가 아니라 compatibility fatal이다.
9. reconnect/resync/forbidden을 authoritative empty로 바꾸지 않는다.

## 10. Message validation matrix

| Message / delta | 허용 source | 필수 검증 | commit / 실패 처리 |
|---|---|---|---|
| `engine.initialized` | system | uninitialized, config/schema/runtime policy | session 생성, catalog fetch |
| `catalog.changed` | effect | active effect, schema, ID collision | compatible replan; major fatal |
| `url.hydrated` | url | codec version/migration/size/depth/entitlement | pending query; invalid면 이전 scene 유지 |
| `query.textChanged` | ui | base revision, length/control char | draft만 변경 |
| `query.tokenCommitted` | ui | token schema/catalog/revision/duplicate | canonical query + plan |
| `query.tokenRemoved` | ui | token 존재/revision/default size | canonical query + plan |
| `query.planRequested` | ui/system | AST, field/unit/window/action 혼입 | 이전 query effect cancel, plan |
| `query.planResolved` | effect | active effect/expiry/hash/catalog | loading snapshot |
| `query.planRejected` | effect | active effect/typed error | 이전 scene 유지, rejected |
| `scope.entered/exited` | ui | identity/entitlement/containment | query 변경; graph 직접 mutation 금지 |
| `lens.progressChanged` | ui | finite p, gesture/layout revision | presentation only |
| `lens.committed` | ui | lens capability/data hash 불변 | URL/layout; data refetch 금지 |
| `entity.focused` | ui | visible/restorable target | presentation only |
| `entity.activated` | ui | current entity/activation descriptor | declared query/navigation/action |
| `selection.changed` | ui | revision/entity existence/limit | atomic selection |
| `viewport.changed` | ui | finite coordinate/zoom/policy | presentation only |
| `action.invoked` | ui | descriptor/capability/target/parameters | confirmation 대기 또는 command effect |
| `action.confirmed` | ui | pending invocation/token target/hash/expiry | 같은 invocation/key command |
| `action.dismissed` | ui | pending invocation | local pending 제거 |
| `operation.cancelRequested` | ui | non-terminal/cancel capability | command 제출; phase 유지 |
| `snapshot.received` | snapshot | correlation/workspace/query/origin/epoch/catalog/hash/streamStart/frame invariant | frame atomic install; stream mode만 subscribe |
| `stream.ready` | stream | accepted=requested, head>=accepted | accepted+1 replay |
| `stream.disconnected` | effect | active subscribe | frame 유지/reconnect |
| `stream.resyncRequired` | stream/system | active tuple/reason | frame 유지, stream/layout cancel, snapshot |
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
| `source.watermarkReplaced` | stream batch | catalog/orthogonal axes | full source replace |
| `frame.completenessReplaced` | stream batch | count/access/source consistency | completeness only |
| `warning.*` | stream batch | stable key/redaction | keyed replace/delete |
| `layout.resolved` | worker | active effect/full revision/transaction | geometry commit |
| `layout.rejectedAsStale` | worker/system | revision mismatch | geometry 불변 |
| `layout.failed` | worker | active effect/recoverability | last layout 유지 |
| `command.receiptReceived` | effect | effect/key/dataOrigin/fingerprint | accepted op install; rejected/unknown graph 불변 |
| `command.receiptLookupReceived` | effect | active lookup/key/fingerprint | found/pending/not-found branch; graph 불변 |
| `operation.eventReceived` | stream | ID/cursor/operationSequence/receipt/key/legal phase | operation slice; gap은 status cut fetch |
| `operation.snapshotReceived` | effect | active lookup/authoritative status cut | last-known/gap reconcile |
| `theme.changed` | ui | registered complete token set | query/layout identity 불변 |
| `motion.changed` | ui | registered policy | geometry identity 불변 |
| `effect.failed` | effect | active effect/scoped error/delivery | 이전 scene 유지, scope error |

## 11. Product DTO ↔ engine mapping

- product `ResourceRef.entityId`와 engine `EntityRef.entityKey`는 같은 canonical identity string을 사용한다.
- product `entityClass="restricted"`는 engine에서 `entityClass="placeholder", placeholderReason="restricted"`로만 표현한다. UI adapter는 좌표/이름/count를 추가 추론하지 않는다.
- product `HealthStatus`는 Application Instance의 GitOps/aggregate health다. engine `TopologyHealthVerdict`는 개별 runtime entity의 판정이다. product health는 topology child health의 단순 worst-value 복사가 아니며 backend가 별도 reason/evidence로 제공한다.
- product `ResourceEdgeKind`는 UI consumer taxonomy, engine `RelationPlane/relationType`은 projection taxonomy다. mapping catalog가 versioned many-to-one/one-to-many 규칙과 evidence 보존을 소유한다.
- product `GitOpsOperationStatus`와 engine `OperationSnapshot`은 operationId/receiptId/idempotency/phase/approval를 동일 의미로 유지한다. engine은 topology action presentation에 필요한 slice이고 product port DTO가 최종 사용자 계약이다.
- common `DecimalString`, `DataOrigin`, `StatusReason`, `OperationPhase`, `ApprovalStatus`는 한 generated core module에서 import하며 다시 선언하지 않는다.

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
