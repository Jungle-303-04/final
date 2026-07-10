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
  | { type: "operation.status.fetch"; operationId: string; receiptId: string }
  | { type: "operation.watch"; operationIds: NonEmptyReadonlyArray<string>; resumeToken: string | null }
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
  | { type: "operation.snapshotReceived"; snapshot: OperationSnapshot }
  | { type: "url.replaceCompleted" }
  | { type: "navigation.completed" }
  | { type: "effect.cancelled"; reason: "aborted" | "superseded" | "session-ended" }
  | {
      type: "effect.failed"
      error: StructuredError
      delivery: "not-applicable" | "not-sent" | "possibly-sent" | "acknowledged"
    }
```

`command.execute`는 언제나 `retryPolicy.kind="none"`다. transport failure가 `possibly-sent`이면 command를 자동 반복하지 않고 동일 idempotency key/receipt를 `operation.status.fetch`로 조회한다.

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
  cursor: ResumeCursor
  emittedAt: Timestamp
  frame: Omit<
    ProjectionFrame,
    "schemaVersion" | "frameId" | "dataOrigin" | "hashes" | "cursor" | "emittedAt"
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

Handshake 규칙:

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
  | {
      type: "restrictedBoundary.upserted"
      boundaryKey: string
      marker: RestrictedBoundaryMarker
    }
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
  | { type: "warning.upserted"; warningKey: string; warning: StructuredWarning }
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

type OperationSnapshot = {
  operationId: string
  receiptId: string
  actionId: string
  target: ActionTarget
  idempotencyKey: string
  operationSequence: number
  phase: OperationPhase
  approval: ApprovalStatus
  progress: OperationProgress
  requestedAt: Timestamp
  startedAt: Timestamp | null
  finishedAt: Timestamp | null
  reason: StatusReason | null
  auditRef: string
}

type CommandReceiptBase = {
  receiptId: string
  invocationId: InvocationId
  idempotencyKey: string
  origin: DataOrigin
  receivedAt: Timestamp
}

type CommandReceipt =
  | (CommandReceiptBase & { outcome: "accepted"; operation: OperationSnapshot })
  | (CommandReceiptBase & { outcome: "rejected"; error: StructuredError })
  | (CommandReceiptBase & { outcome: "unknown"; lookupToken: string; reason: StatusReason })

type OperationEventBase = {
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
  | (OperationEventBase & {
      type: "operation.statusUnknown"
      phase: "unknown"
      lastKnownPhase: OperationPhase | null
      reason: StatusReason
    })
  | (OperationEventBase & { type: "operation.reconciled"; snapshot: OperationSnapshot })
```

`percentBasisPoints`는 safe integer 0..10,000이다. total이 없으면 `indeterminate`; 가짜 percent를 만들지 않는다.

Operation phase 전이:

| 현재 | 허용 다음 phase |
|---|---|
| 없음 | pending, pending_approval, running, succeeded, failed, cancelled, unsupported, unknown |
| pending | pending_approval, running, failed, cancelled, unsupported, unknown |
| pending_approval | pending, failed, cancelled, unknown |
| running | running, succeeded, failed, cancelled, unknown |
| unknown | 더 높은 operationSequence의 authoritative snapshot이 가진 모든 phase |
| succeeded / failed / cancelled / unsupported | 동일 terminal snapshot만 |

- approval approved는 pending, rejected/expired는 실행되지 않은 종료 의미의 cancelled로 canonicalize한다.
- cancel intent나 terminate receipt만으로 target operation을 cancelled로 바꾸지 않는다. authoritative cancelled event가 필요하다.
- operationSequence gap은 topology 전체 resync가 아니라 해당 operation status fetch를 만든다.
- terminal 뒤 다른 terminal 또는 non-terminal event는 protocol corruption이다.
