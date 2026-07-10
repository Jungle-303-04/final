---
title: Frontend-led Product Data Consumer Contract
status: planned-contract
owner: frontend-platform
version: product-data/v1
last_verified: 2026-07-11
---

# 프론트 API 계약 요구사항

## 0. 권한, 범위, 비목표

이 문서는 Applications, GitOps, Tree/Insights, Timeline, Metrics, Topology, GitOps Operations 화면이 소비할 canonical 데이터와 사용자 경험의 구현 예정 계약이다. 현재 repo의 실제 코드와 통과한 테스트가 source of truth이며, 아래 DTO와 schema가 현 코드에 없으면 구현 완료가 아니라 후속 작업 기준으로만 읽는다. 백엔드는 이 의미 계약을 OpenAPI와 runtime schema로 구현하고, 프론트는 `[OPENAPI_ACCEPTED]` 이후 live adapter를 확정한다.

구현 우선순위:

1. 현재 repo의 실제 코드와 통과한 executable test.
2. 이 문서의 사용자 의미와 상태 전이.
3. `topology-engine.md`의 identity, relation, metric, stream 불변조건.
4. 생성된 TypeScript/runtime schema와 승인된 OpenAPI.
5. live/synthetic adapter 구현.

비목표:

- 특정 GitOps provider 이름으로 페이지, 상태, 버튼, DTO를 분기하지 않는다.
- provider DTO, API path, 상태 문자열을 canonical UI에 그대로 노출하지 않는다.
- SQL table, FastAPI router, worker, queue 구현을 결정하지 않는다.
- mutation 성공을 optimistic하게 확정하지 않는다.
- product view/state에 fixture, fake count, demo resource를 넣지 않는다.

## 1. 공통 wire 규칙

### 1.1 Required, optional, nullable

- `field: T`는 항상 존재하고 null이 아니다.
- `field: T | null`은 질문이 적용되지만 관측값이 없거나 redacted됐음을 뜻한다.
- `field?: T`는 capability/expansion을 요청하지 않아 payload에 포함되지 않았을 때만 허용한다.
- 빈 문자열, `0`, 빈 배열을 missing 대용으로 사용하지 않는다.
- collection은 요청됐으면 빈 배열로 존재한다. pagination metadata도 항상 존재한다.
- `null` 이유는 같은 객체의 status/reason 또는 completeness에서 설명한다.

### 1.2 ID와 시간

- 모든 ID는 opaque string이며 display name이 아니다.
- Kubernetes live resource ID는 workspace + cluster UID + resource UID에서 안정적으로 생성한다. served API version은 identity가 아니다.
- desired-only manifest ID는 application instance + source revision + canonical manifest key에서 생성한다.
- 같은 이름으로 재생성된 resource는 다른 ID다.
- cursor, resume token, operation receipt ID는 opaque하고 client가 파싱하지 않는다.
- 모든 timestamp는 timezone offset을 가진 RFC 3339 string이고 server가 UTC canonical form으로 응답한다.
- duration/age/step은 정수 millisecond다.
- metric/cost 수치는 canonical decimal string이며 JS number wire value를 사용하지 않는다.

### 1.3 공통 primitive

```ts
type OpaqueId = string
type DecimalString = string & { readonly __brand: "DecimalString" }
type Timestamp = string
type DurationMs = number
type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

type ResumeCursor = {
  streamId: string
  streamEpoch: string
  sequence: number
  resumeToken: string
  resumeTokenExpiresAt: Timestamp
}

type DataOrigin =
  | { kind: "live"; adapterId: string; endpointId: string }
  | { kind: "synthetic"; adapterId: string; datasetId: string; seed: string }
  | { kind: "replay"; adapterId: string; recordingId: string }

type CursorPage<T> = {
  items: readonly T[]
  nextCursor: string | null
  hasMore: boolean
  snapshotRevision: string
  total: number | null
  totalState: "exact" | "estimated" | "unknown" | "forbidden"
}

type DataCompleteness =
  | {
      state: "complete"
      observedCount: number
      expectedAuthorizedCount: number
      missingSources: readonly []
      reasons: readonly []
    }
  | {
      state: "partial"
      observedCount: number
      expectedAuthorizedCount: number | null
      missingSources: readonly string[]
      reasons: NonEmptyReadonlyArray<StatusReason>
    }
  | {
      state: "unknown"
      observedCount: number | null
      expectedAuthorizedCount: number | null
      missingSources: readonly string[]
      reasons: NonEmptyReadonlyArray<StatusReason>
    }
  | {
      state: "forbidden" | "unsupported"
      observedCount: null
      expectedAuthorizedCount: null
      missingSources: readonly []
      reasons: NonEmptyReadonlyArray<StatusReason>
    }

type StatusReason = {
  code: string
  messageKey: string
  detail: string | null
}

type RevisionValue =
  | { state: "known"; value: string; reason: null }
  | { state: "unknown" | "redacted"; value: null; reason: StatusReason }
  | { state: "not_applicable"; value: null; reason: null }

type AccessMode =
  | { mode: "read_write"; reason: null; redaction: "none" | "partial" }
  | { mode: "read_only"; reason: StatusReason; redaction: "none" | "partial" }
  | { mode: "forbidden"; reason: StatusReason; redaction: "full" }

type SuccessfulAccessMode = Extract<AccessMode, { mode: "read_write" | "read_only" }>
```

`detail`은 안전하게 redacted된 text이며 UI 분기에는 `code`를 사용한다.

## 2. Canonical 상태와 capability

### 2.1 Sync, health, freshness

```ts
type SyncStatus = {
  state:
    | "synchronized"
    | "out_of_sync"
    | "unknown"
  desiredRevision: RevisionValue
  liveRevision: RevisionValue
  comparedAt: Timestamp | null
  reason: StatusReason | null
}

type HealthStatus = {
  level:
    | "healthy"
    | "progressing"
    | "degraded"
    | "unhealthy"
    | "unknown"
  observedAt: Timestamp | null
  reason: StatusReason | null
}

type Freshness = {
  state: "fresh" | "stale" | "unknown"
  observedAt: Timestamp | null
  receivedAt: Timestamp
  ageMs: DurationMs | null
  staleAfterMs: DurationMs
  reason: StatusReason | null
}

type LifecycleStatus = {
  state: "active" | "suspended" | "archived" | "unknown"
  changedAt: Timestamp | null
  reason: StatusReason | null
}
```

Sync, health, freshness는 직교한다. 예를 들어 synchronized + unhealthy + stale이 가능하다. 하나의 색이나 status enum으로 합치지 않는다.

- `fresh`와 `stale`은 observedAt/ageMs가 non-null이며 `ageMs = receivedAt - observedAt`의 server 계산값이다.
- `fresh`는 `ageMs <= staleAfterMs`, `stale`은 `ageMs > staleAfterMs`다.
- `unknown`은 observedAt/ageMs가 null이고 reason이 non-null이다. receivedAt은 response가 조립된 시각, staleAfterMs는 해당 source 정책값으로 항상 존재한다.
- lifecycle은 별도 축이다. suspended instance도 synchronized/out_of_sync와 healthy/degraded를 독립적으로 가진다.

### 2.2 CapabilitySet

```ts
type CapabilityId =
  | "refresh"
  | "diff"
  | "reconcile.plan"
  | "reconcile.apply"
  | "suspend"
  | "resume"
  | "terminate"
  | "rollback"
  | "history"
  | "approval.decide"
  | "prune"
  | "selective_sync"
  | "metrics.instant"
  | "metrics.range"
  | "topology.snapshot"
  | "topology.stream"
  | "topology.historical"

type CapabilityConstraints = {
  allowedReconcileModes: readonly ("plan" | "apply")[]
  maxSelectedResources: number | null
  allowedApprovalDecisions: readonly ("approve" | "reject")[]
  requiresImmutablePlan: boolean
  planMaxAgeMs: DurationMs | null
  requiredFreshnessMs: DurationMs | null
}

type CapabilityDecision = {
  capabilityId: CapabilityId
  applicable: boolean
  supported: boolean
  permitted: boolean
  enabled: boolean
  visibility: "visible" | "hidden"
  effects: readonly ("read" | "desired_state_write" | "cluster_write" | "operation_control")[]
  requiresConfirmation: boolean
  requiresApproval: boolean
  constraints: CapabilityConstraints
  readOnlyReason: StatusReason | null
  disabledReason: StatusReason | null
}

type CapabilitySet = {
  revision: string
  decisions: Readonly<Record<CapabilityId, CapabilityDecision>>
}
```

버튼 규칙:

- 현재 대상에 의미가 없는 capability는 `applicable=false`, `visibility=hidden`이다.
- 제품에서 예상되는 기능이지만 target이 지원하지 않으면 visible + disabled + reason이다.
- 권한 또는 management read-only 때문에 실행할 수 없으면 visible + disabled + reason이다. 존재 자체가 민감하면 backend가 visibility=hidden을 반환한다.
- provider metadata는 tooltip/detail의 부가 정보일 뿐 capability 결정에 provider 이름을 사용하지 않는다.

Cross-field invariant:

- `enabled=true`이면 applicable, supported, permitted가 모두 true이고 visibility는 visible이며 disabledReason은 null이다.
- `visibility=hidden`이면 enabled=false다. hidden reason 자체가 민감할 수 있으므로 disabledReason은 null일 수 있다.
- `visibility=visible`, applicable=true, enabled=false이면 disabledReason이 non-null이다.
- applicable=false는 현재 target에 의미가 없다는 뜻이며 supported 여부와 별개다.
- requiresApproval=true가 permission이나 read-only restriction을 우회하지 않는다. 애초 실행 불가능한 write는 approval을 만들지 않는다.
- CapabilitySet은 정확한 OperationTarget과 actor/access/source/current-operation snapshot에 대한 atomic decision이고 revision이 바뀌면 confirmation/plan을 재검증한다.

### 2.3 API error

```ts
type ApiErrorCode =
  | "invalid_request"
  | "unauthenticated"
  | "permission_denied"
  | "not_found"
  | "conflict"
  | "precondition_failed"
  | "capability_unsupported"
  | "read_only_target"
  | "approval_required"
  | "rate_limited"
  | "source_unavailable"
  | "stale_cursor"
  | "schema_incompatible"
  | "internal_error"

type ApiError = {
  errorId: string
  code: ApiErrorCode
  messageKey: string
  detail: string | null
  retryable: boolean
  retryAfterMs: DurationMs | null
  fieldErrors: readonly { field: string; code: string; messageKey: string }[]
  correlationId: string | null
}

type UnsupportedCapabilityError = ApiError & {
  code: "capability_unsupported"
  capabilityId: CapabilityId
  targetId: string
}
```

HTTP 200 partial response는 ApiError가 아니다. completeness/freshness로 표현한다. 401, 403, 404, 409/412, 429, 502/503는 각각 canonical error로 adapter가 변환한다. 404 하나로 provider 미설치를 추정하지 않는다.

## 3. Resource, source, destination

```ts
type ResourceRef =
  | {
      entityId: string
      entityClass: "resource"
      identityKind: "live_kubernetes"
      clusterUid: string
      group: string
      kind: string
      namespace: string | null
      name: string
      uid: string
      redacted: false
    }
  | {
      entityId: string
      entityClass: "resource"
      identityKind: "desired_manifest"
      clusterUid: string | null
      group: string
      kind: string
      namespace: string | null
      name: string
      uid: null
      sourceId: string
      manifestKey: string
      redacted: false
    }
  | {
      entityId: string
      entityClass: "platform"
      identityKind: "cluster"
      clusterUid: string
      kind: "Cluster"
      name: string
      redacted: false
    }
  | {
      entityId: string
      entityClass: "embedded"
      identityKind: "container" | "endpoint" | "port" | "condition"
      clusterUid: string
      parentEntityId: string
      stableSubKey: string
      kind: string
      name: string
      redacted: false
    }
  | {
      entityId: string
      entityClass: "projection"
      identityKind: "projection"
      clusterUid: string | null
      projectionKey: string
      kind: string
      name: string
      redacted: false
    }
  | {
      entityId: string
      entityClass: "external"
      identityKind: "external"
      clusterUid: string | null
      externalKey: string
      kind: string
      name: string
      redacted: false
    }
  | {
      entityId: string
      entityClass: "restricted"
      identityKind: "restricted"
      disclosure: "existence_only" | "kind_only" | "coordinate"
      clusterUid: string | null
      group: string | null
      kind: string | null
      namespace: string | null
      name: string | null
      uid: null
      redacted: true
    }

type GitSourceRef = {
  sourceId: string
  repositoryId: string
  repositoryDisplayName: string
  repositoryUrl: string | null
  revisionType: "branch" | "tag" | "commit" | "semver" | "digest" | "unknown"
  requestedRevision: string | null
  resolvedRevision: string | null
  path: string | null
  chart: string | null
  providerMetadata: Readonly<Record<string, string>>
  redacted: boolean
}

type DeploymentDestination = {
  destinationId: string
  clusterUid: string
  clusterDisplayName: string
  environmentId: string | null
  environmentName: string | null
  namespace: string | null
  managementRole: "workload" | "management" | "hybrid"
  interactionMode: "read_write" | "read_only"
  readOnlyReason: StatusReason | null
}
```

`providerMetadata`는 표시용 allowlisted metadata이며 UI 조건문 입력으로 쓰지 않는다. repositoryUrl은 credential/userinfo/query secret을 제거한 allowlisted `https` URL만 허용한다. restricted ResourceRef는 허용된 source가 이미 참조를 노출한 경우에만 disclosure 수준에 맞는 coordinate 일부를 포함하고, 추론으로 발견한 hidden peer는 ResourceRef 자체를 만들지 않는다. live Kubernetes branch의 UID는 필수이고 desired manifest branch에 가짜 UID를 만들지 않는다.

## 4. Applications 목록과 상세

### 4.1 의미 모델

- Product Application은 사용자가 인식하는 하나의 앱이다.
- Application Instance는 하나 이상의 desired-state source 집합이 하나의 destination binding에 배포되는 canonical 단위다.
- 한 Product Application은 여러 cluster/environment/namespace의 instance를 가진다.
- mutation은 항상 하나의 instance를 명시해야 한다. aggregate Application 전체에 암묵적으로 실행하지 않는다.

```ts
type Approval = {
  approvalId: string
  version: string
  state: "pending" | "approved" | "rejected" | "expired" | "unknown"
  policyId: string
  policyDisplayName: string
  requestedAt: Timestamp
  expiresAt: Timestamp | null
  requestedBy: { actorId: string; displayName: string | null; redacted: boolean }
  decidedAt: Timestamp | null
  decidedBy: { actorId: string; displayName: string | null; redacted: boolean } | null
  reason: StatusReason | null
}

type ApprovalStatus =
  | { state: "not_required"; approval: null }
  | {
      [S in Approval["state"]]: { state: S; approval: Approval & { state: S } }
    }[Approval["state"]]

type PolicyStatus = {
  state: "compliant" | "warning" | "violating" | "not_evaluated" | "unknown"
  findingCount: number | null
  blockingFindingCount: number | null
  observedAt: Timestamp | null
  reason: StatusReason | null
  completeness: DataCompleteness
}

type OperationPhase =
  | "pending"
  | "pending_approval"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "unsupported"
  | "unknown"

type LatestOperationSummary = {
  operationId: string
  receiptId: string
  kind: GitOpsOperationKind
  phase: OperationPhase
  requestedAt: Timestamp
  startedAt: Timestamp | null
  finishedAt: Timestamp | null
  progressPercent: number | null
  reason: StatusReason | null
}

type ResourceCountSummary = {
  desired: number | null
  live: number | null
  synchronized: number | null
  outOfSync: number | null
  missing: number | null
  extra: number | null
  unhealthy: number | null
  state: "exact" | "partial" | "unknown" | "forbidden"
}

type ApplicationInstanceSummary = {
  instanceId: string
  applicationId: string
  bindingId: string
  displayName: string
  primarySource: GitSourceRef
  additionalSourceCount: number
  destination: DeploymentDestination
  lifecycle: LifecycleStatus
  sync: SyncStatus
  health: HealthStatus
  freshness: Freshness
  approval: ApprovalStatus
  policy: PolicyStatus
  diffSummary: DiffSummary | null
  resources: ResourceCountSummary
  latestOperation: LatestOperationSummary | null
  capabilities: CapabilitySet
  labels: Readonly<Record<string, string>>
  completeness: DataCompleteness
}

type AggregateLifecycleStatus = {
  effectiveState: LifecycleStatus["state"]
  counts: Readonly<Record<LifecycleStatus["state"], number>>
  changedAt: Timestamp | null
  reasons: readonly StatusReason[]
  completeness: DataCompleteness
}

type AggregateSyncStatus = {
  effectiveState: SyncStatus["state"]
  counts: Readonly<Record<SyncStatus["state"], number>>
  comparedAt: Timestamp | null
  reasons: readonly StatusReason[]
  completeness: DataCompleteness
}

type AggregateHealthStatus = {
  effectiveLevel: HealthStatus["level"]
  counts: Readonly<Record<HealthStatus["level"], number>>
  observedAt: Timestamp | null
  reasons: readonly StatusReason[]
  completeness: DataCompleteness
}

type AggregateFreshness = {
  effectiveState: Freshness["state"]
  counts: Readonly<Record<Freshness["state"], number>>
  oldestObservedAt: Timestamp | null
  maximumAgeMs: DurationMs | null
  reasons: readonly StatusReason[]
  completeness: DataCompleteness
}

type ApplicationSummary = {
  applicationId: string
  displayName: string
  description: string | null
  repositoryIds: readonly string[]
  instanceCount: number
  destinationCount: number
  aggregateLifecycle: AggregateLifecycleStatus
  aggregateSync: AggregateSyncStatus
  aggregateHealth: AggregateHealthStatus
  aggregateFreshness: AggregateFreshness
  approvalCounts: Readonly<Record<ApprovalStatus["state"], number>>
  operationCounts: Readonly<Record<OperationPhase, number>>
  instancePreview: readonly ApplicationInstanceSummary[]
  completeness: DataCompleteness
}

type ApplicationInstanceDetail = ApplicationInstanceSummary & {
  sources: NonEmptyReadonlyArray<GitSourceRef>
  lastSuccessfulRevision: string | null
  currentOperation: GitOpsOperationStatus | null
  recentInsights: readonly GitOpsInsight[]
  navigation: {
    topologyAvailable: boolean
    timelineAvailable: boolean
    metricsAvailable: boolean
  }
}

type ApplicationDetail = {
  application: ApplicationSummary
  instances: CursorPage<ApplicationInstanceSummary>
  aggregateInsights: readonly GitOpsInsight[]
  completeness: DataCompleteness
}
```

Aggregate status는 worst color 하나만 반환하지 않는다. backend가 canonical aggregate level과 reason/count를 함께 반환하고, frontend는 instance count/partial coverage를 표시한다.

`sources`는 최소 한 개이며 `primarySource.sourceId`와 같은 항목을 정확히 하나 포함한다. `additionalSourceCount = sources.length - 1`이고 summary의 primarySource는 detail 항목과 동일 revision이다. desired/live revision의 instance-level 권위는 `SyncStatus` 하나이며 detail에 중복 필드를 두지 않는다. lifecycle, sync, health, freshness, policy, approval, operation은 서로 독립이다.

### 4.2 목록 query

```ts
type ApplicationListQuery = {
  search: string | null
  clusterUids: readonly string[]
  environmentIds: readonly string[]
  namespaces: readonly string[]
  includeClusterScoped: boolean
  repositoryIds: readonly string[]
  lifecycleStates: readonly LifecycleStatus["state"][]
  syncStates: readonly SyncStatus["state"][]
  healthLevels: readonly HealthStatus["level"][]
  freshnessStates: readonly Freshness["state"][]
  approvalStates: readonly ApprovalStatus["state"][]
  managementRoles: readonly DeploymentDestination["managementRole"][]
  sort:
    | "name_asc"
    | "name_desc"
    | "health_severity_desc"
    | "sync_severity_desc"
    | "freshness_asc"
    | "latest_operation_desc"
  cursor: string | null
  limit: number
}
```

- 같은 facet 값은 OR, 다른 facet은 AND다.
- search는 display name/source/destination의 authorized search index를 사용한다.
- cursor는 filter/sort/snapshot revision에 bind하고 stale cursor는 first-page refetch를 요구한다.
- stable tie-break는 applicationId 또는 instanceId다.
- limit 기본/최대는 catalog가 반환하고 frontend literal로 고정하지 않는다.

### 4.3 Binding 선택 UX

- Applications 목록의 한 row/card는 Application aggregate다.
- 선택하면 상세에서 instance selector가 cluster → environment → namespace 순으로 destination을 표시한다.
- cluster 이름이 같아도 clusterUid로 구분한다.
- 한 instance만 있으면 selector를 축약하되 현재 binding 문맥은 header에 표시한다.
- `All instances`는 aggregate read view다. mutation button은 하나의 instance를 선택하기 전 disabled이며 이유를 표시한다.
- managementRole=management이고 interactionMode=read_only이면 `관리 클러스터 · 읽기 전용` badge를 지속 표시한다.

## 5. GitOps 목록과 상세

GitOps 목록의 canonical row는 `ApplicationInstanceSummary`다. provider마다 별도 page/DTO를 만들지 않는다.

필수 표시:

- application/instance name과 binding destination.
- repository, requested/resolved desired revision, live revision.
- sync, health, freshness와 reason.
- diff/resource count summary.
- policy/approval state.
- current/latest operation.
- capability-driven action entry.
- provider metadata는 접힌 integration detail에만 표시.

GitOps detail은 `ApplicationInstanceDetail`을 root payload로 사용하고 Tree, Insights, History, Timeline, Metrics, Topology를 lazy section query로 불러온다. 상세 root가 무거운 graph/series/event 배열을 포함하지 않는다.

### 5.1 Diff

```ts
type StructuredValue =
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "integer"; value: string }
  | { type: "decimal"; value: DecimalString }
  | { type: "null" }
  | { type: "redacted"; reason: StatusReason }
  | { type: "array"; items: readonly StructuredValue[]; truncated: boolean }
  | { type: "object"; fields: readonly { key: string; value: StructuredValue }[]; truncated: boolean }

type ResourceObjectView = {
  schemaVersion: "resource-object-view/v1"
  value: StructuredValue
  byteSize: number
  truncated: boolean
  redactionCount: number
}

type DiffChangeType = "create" | "update" | "delete" | "move" | "conflict" | "unknown"

type DiffSummary = {
  state: "none" | "available" | "partial" | "unavailable" | "unknown"
  total: number | null
  creates: number | null
  updates: number | null
  deletes: number | null
  conflicts: number | null
  unknown: number | null
  pruneCandidates: number | null
  comparedDesiredRevision: string | null
  comparedLiveRevision: string | null
  generatedAt: Timestamp | null
  completeness: DataCompleteness
  reason: StatusReason | null
}

type ResourceDiff = {
  diffId: string
  resource: ResourceRef
  desiredResource: ResourceRef | null
  liveResource: ResourceRef | null
  changeType: DiffChangeType
  summary: string
  fields: readonly {
    path: string
    changeType: "add" | "replace" | "remove" | "unknown"
    desired: StructuredValue | null
    live: StructuredValue | null
    redacted: boolean
  }[]
  policyFindings: readonly GitOpsInsight[]
  completeness: DataCompleteness
}
```

Secret/sensitive field는 desired/live 값 모두 null + redacted=true다. Diff fields는 cursor pagination되고 한 resource의 큰 structured diff도 chunk cursor를 지원한다.

## 6. Tree와 Insights

### 6.1 Desired/live 대응 의미

Tree는 파일 트리가 아니라 하나의 Application Instance에서 선언된 desired resource와 관측된 live resource를 대응시키는 resource graph다. 대응은 이름 유사성으로 만들지 않고 source manifest key, 관리 표식, live UID, owner reference, controller evidence를 조합한 backend의 canonical 판정만 소비한다.

```ts
type ResourceNodeState =
  | "matched"
  | "desired_only"
  | "live_only"
  | "missing"
  | "extra"
  | "orphan"
  | "conflict"
  | "unknown"
  | "restricted"
  | "aggregate"

type ResourceNodeCategory =
  | "cluster"
  | "namespace"
  | "application_binding"
  | "source_revision"
  | "workload"
  | "pod"
  | "container"
  | "service"
  | "endpoint"
  | "ingress"
  | "job"
  | "cron_job"
  | "storage"
  | "scaling"
  | "configuration"
  | "policy"
  | "external"
  | "generic"
  | "aggregate"
  | "restricted"

type RelationEvidence = {
  evidenceId: string
  type:
    | "api_reference"
    | "selector_match"
    | "endpoint_membership"
    | "source_declaration"
    | "controller_observation"
    | "telemetry_observation"
    | "policy_derivation"
    | "unknown"
  authority: "authoritative" | "derived" | "observed" | "heuristic"
  confidence: DecimalString | null
  observedAt: Timestamp | null
  summary: string | null
  redacted: boolean
}

type ResourceEdgeKind =
  | "contains"
  | "runs_on"
  | "owns"
  | "selects"
  | "routes_to"
  | "mounts"
  | "depends_on"
  | "deployed_by"
  | "declared_as"
  | "scales"
  | "governs"

type ResourceRelationPlane =
  | "placement"
  | "ownership"
  | "network_configured"
  | "network_effective"
  | "network_observed"
  | "dependency"
  | "storage"
  | "scaling_policy"
  | "policy"
  | "gitops_provenance"

type ResourceEdgeConditions = {
  configuration: "configured" | "not_configured" | "not_applicable" | "unknown"
  admission: "accepted" | "rejected" | "not_applicable" | "unknown"
  readiness: "ready" | "not_ready" | "not_applicable" | "unknown"
  activity: "active" | "inactive" | "not_applicable" | "unknown"
  resolution: "resolved" | "unresolved" | "unknown"
  access: "allowed" | "restricted"
  freshness: Freshness["state"]
}

type ResourceEdgeClaim = {
  claimId: string
  sourceId: string
  authority: RelationEvidence["authority"]
  conditions: ResourceEdgeConditions
  evidenceIds: readonly string[]
  observedAt: Timestamp | null
}

type ResourceNode = {
  nodeId: string
  category: ResourceNodeCategory
  identity: ResourceRef
  logicalKey: string
  desiredRef: ResourceRef | null
  liveRef: ResourceRef | null
  state: ResourceNodeState
  sync: SyncStatus
  health: HealthStatus
  freshness: Freshness
  desiredRevision: string | null
  liveRevision: string | null
  diffSummary: DiffSummary | null
  childCount: number | null
  expandable: boolean
  expansionState: "not_requested" | "available" | "exhausted" | "forbidden"
  insightCounts: Readonly<Record<GitOpsInsightSeverity, number>>
  completeness: DataCompleteness
}

type ResourceEdge = {
  edgeId: string
  fromNodeId: string
  toNodeId: string
  kind: ResourceEdgeKind
  plane: ResourceRelationPlane
  direction: "directed"
  effectiveConditions: ResourceEdgeConditions
  claims: readonly ResourceEdgeClaim[]
  evidences: readonly RelationEvidence[]
  freshness: Freshness
  redacted: boolean
}
```

`logicalKey`와 `nodeId`는 graph object constancy를 위한 값이다. desired manifest의 revision-scoped `ResourceRef.entityId`가 commit마다 바뀌어도, 같은 instance·source·canonical manifest 위치의 논리 resource라면 `nodeId`는 유지된다. live object가 재생성돼 UID가 바뀌면 live `entityId`는 바뀌며, backend가 동일 logical resource임을 판정한 경우에만 기존 nodeId에 새 liveRef를 대응시킨다.

Configured/effective/observed network truth는 각각 다른 `plane`의 edge다. 한 enum을 덮어써 상태 전이처럼 만들지 않는다. 같은 endpoints와 kind라도 plane이 다르면 edgeId가 다르다. claim의 직교 conditions를 resolver가 판정하며 동급 evidence 충돌은 해당 axis를 unknown으로 만든다. `confidence`는 null 또는 canonical decimal [0,1]이고 화면 정렬의 유일한 근거로 쓰지 않는다.

상태의 경계:

- `desired_only`: desired는 있지만 live 비교가 partial/stale/forbidden이라 부재를 확정할 수 없다.
- `missing`: 충분히 최신이고 complete한 관측에서 desired에 대응하는 live가 없음을 확정했다.
- `live_only`: live는 있지만 desired 범위가 partial/stale/forbidden이라 extra인지 확정할 수 없다.
- `extra`: 관리 대상 instance와의 연관은 확정했지만 현재 desired에는 없다.
- `orphan`: live object의 authoritative desired 또는 owner를 찾을 수 없고 instance 귀속도 확정되지 않았다.
- `conflict`: 하나의 desired/live에 복수 대응 후보가 있거나 identity evidence가 충돌한다.
- `unknown`은 자료 부족, `restricted`는 권한 때문에 구조 일부만 공개, `aggregate`는 budget 때문에 접힌 묶음이다.

### 6.2 Snapshot, expansion, detail

```ts
type ResourceGraphKind = "gitops_tree" | "runtime_topology"

type GraphStreamCursor = ResumeCursor

type GraphStreamStart =
  | { mode: "stream"; cursor: GraphStreamCursor }
  | { mode: "poll"; pollAfterMs: DurationMs }
  | { mode: "static"; reason: StatusReason }

type GraphClusterCut = {
  clusterUid: string
  projectionRevision: string | null
  inventoryEpoch: string | null
  access: "full" | "partial" | "restricted" | "unavailable"
  sourceCuts: readonly { sourceId: string; watermark: string | null; observedAt: Timestamp | null }[]
  completeness: DataCompleteness
  freshness: Freshness
  reason: StatusReason | null
}

type ResourceGraphSnapshot = {
  snapshotId: string
  graphKind: ResourceGraphKind
  queryId: string
  canonicalQueryHash: string
  instanceIds: readonly string[]
  graphRevision: string
  generatedAt: Timestamp
  streamStart: GraphStreamStart
  clusterCuts: readonly GraphClusterCut[]
  rootNodeIds: readonly string[]
  nodes: readonly ResourceNode[]
  edges: readonly ResourceEdge[]
  nextExpansionCursor: string | null
}

type GitOpsTreeQuery = {
  applicationId: string
  instanceId: string
  bindingId: string
  rootNodeIds: readonly string[]
  nodeStates: readonly ResourceNodeState[]
  nodeCategories: readonly ResourceNodeCategory[]
  relationKinds: readonly ResourceEdgeKind[]
  maxInitialNodes: number
  maxInitialEdges: number
  queryHash: string
}

type ResourceGraphExpansionQuery = {
  snapshotId: string
  graphRevision: string
  parentNodeId: string
  relationKinds: readonly ResourceEdgeKind[]
  cursor: string | null
  limit: number
}

type ResourceGraphExpansion = {
  snapshotId: string
  baseGraphRevision: string
  nodes: readonly ResourceNode[]
  edges: readonly ResourceEdge[]
  nextCursor: string | null
  hasMore: boolean
  completeness: DataCompleteness
}

type ResourceObjectPayload =
  | { state: "available"; object: ResourceObjectView; reason: null }
  | {
      state: "not_requested" | "absent" | "forbidden" | "unsupported"
      object: null
      reason: StatusReason | null
    }

type ResourceDetailExpansion = {
  includeObjects: boolean
  includeRelations: boolean
  includeDiffs: boolean
  includeInsights: boolean
  includeTimeline: boolean
  includeMetricTemplates: boolean
  relationCursor: string | null
  diffCursor: string | null
  insightCursor: string | null
  timelineCursor: string | null
  limit: number
}

type ResourceNodeDetail = {
  snapshotId: string
  graphRevision: string
  node: ResourceNode
  inbound: CursorPage<ResourceEdge>
  outbound: CursorPage<ResourceEdge>
  desiredObject: ResourceObjectPayload
  liveObject: ResourceObjectPayload
  diffs: CursorPage<ResourceDiff>
  insights: CursorPage<GitOpsInsight>
  recentTimeline: CursorPage<TimelineEvent>
  metricQueryTemplates: readonly MetricQueryTemplate[]
  capabilities: CapabilitySet
  availableNavigation: readonly ("timeline" | "metrics" | "topology" | "gitops")[]
  completeness: DataCompleteness
}
```

- 초기 snapshot은 viewport와 node/edge budget에 맞춘 roots + 첫 depth만 반환한다. 전체 graph를 강제 직렬화하지 않는다.
- expansion cursor는 snapshotId, graphRevision, parent, relationKinds, authorization scope에 bind한다.
- expansion 중 revision이 바뀌면 409/412 또는 typed `stale_cursor`로 현재 snapshot을 보존한 채 재동기화 CTA를 표시한다.
- aggregate node 선택은 해당 묶음의 정확한 expansion query를 실행한다. frontend가 임의 node/edge를 만들어 채우지 않는다.
- detail object는 metadata 기본이다. Secret data, ConfigMap content, credential, token, sensitive diff는 redaction 규칙을 강제한다.

### 6.3 Insight

```ts
type GitOpsInsightKind =
  | "diff"
  | "policy"
  | "approval"
  | "root_cause"
  | "evidence"
  | "recovery"
  | "change_proposal"
  | "rollout"

type GitOpsInsightSeverity = "info" | "notice" | "warning" | "critical" | "unknown"

type GitOpsInsight = {
  insightId: string
  scope:
    | { type: "application"; applicationId: string }
    | { type: "application_instance"; applicationId: string; instanceId: string; bindingId: string }
  kind: GitOpsInsightKind
  severity: GitOpsInsightSeverity
  status: "open" | "acknowledged" | "resolved" | "superseded" | "unknown"
  titleKey: string
  summary: string
  affectedResources: readonly ResourceRef[]
  evidenceRefs: readonly RelationEvidence[]
  correlationId: string | null
  recommendedCapabilityIds: readonly CapabilityId[]
  firstObservedAt: Timestamp | null
  lastObservedAt: Timestamp | null
  freshness: Freshness
  completeness: DataCompleteness
  redacted: boolean
}
```

Insight는 자동 실행 명령이 아니다. change proposal, recovery, rollout 제안은 evidence와 required capability를 표시하고 사용자의 명시적 operation flow로 진입한다. 특정 SCM의 PR 명칭은 connector metadata에서 표시할 수 있지만 canonical kind는 `change_proposal`이다. `summary`를 HTML로 신뢰하지 않으며 allowlisted plain text/structured fields만 렌더링한다.

## 7. Timeline

### 7.1 DTO와 순서

```ts
type TimelineEventSeverity = "debug" | "info" | "notice" | "warning" | "critical"
type TimelineEventSource =
  | "gitops_operation"
  | "resource_observation"
  | "policy"
  | "approval"
  | "incident"
  | "metric_alert"
  | "audit"
  | "system"

type TimelineEventTypeKey = string & { readonly __brand: "TimelineEventTypeKey" }

type TimelineEventTypeDescriptor = {
  eventTypeKey: TimelineEventTypeKey
  source: TimelineEventSource
  labelKey: string
  descriptionKey: string
  defaultSeverity: TimelineEventSeverity
}

type TimelineEventTypeCatalog = {
  revision: string
  types: readonly TimelineEventTypeDescriptor[]
}

type TimelineCursor =
  | { mode: "stream"; cursor: ResumeCursor }
  | { mode: "poll"; sinceCursor: string; pollAfterMs: DurationMs }
  | { mode: "static"; reason: StatusReason }

type TimelineEvent = {
  eventId: string
  dedupeKey: string
  eventTypeKey: TimelineEventTypeKey
  eventTypeCatalogRevision: string
  source: TimelineEventSource
  severity: TimelineEventSeverity
  occurredAt: Timestamp
  receivedAt: Timestamp
  ingestSequence: string
  late: boolean
  titleKey: string
  summary: string
  applicationId: string | null
  instanceId: string | null
  bindingId: string | null
  clusterUid: string | null
  namespace: string | null
  resources: readonly ResourceRef[]
  operationId: string | null
  correlationId: string | null
  phase: OperationPhase | null
  progressPercent: number | null
  revision: string | null
  freshness: Freshness
  redacted: boolean
}

type TimelinePage = {
  queryId: string
  canonicalQueryHash: string
  items: readonly TimelineEvent[]
  nextCursor: string | null
  hasMore: boolean
  snapshotRevision: string
  total: number | null
  totalState: "exact" | "estimated" | "unknown" | "forbidden"
  liveStart: TimelineCursor
}

type TimelineQuery = {
  applicationIds: readonly string[]
  instanceIds: readonly string[]
  bindingIds: readonly string[]
  clusterUids: readonly string[]
  namespaces: readonly string[]
  resourceEntityIds: readonly string[]
  operationIds: readonly string[]
  correlationIds: readonly string[]
  sources: readonly TimelineEventSource[]
  severities: readonly TimelineEventSeverity[]
  eventTypeKeys: readonly TimelineEventTypeKey[]
  startAt: Timestamp | null
  endAt: Timestamp | null
}

type TimelinePageRequest = {
  query: TimelineQuery
  cursor: string | null
  limit: number
}

type TimelineStreamEnvelope = {
  schemaVersion: "timeline-stream/v1"
  dataOrigin: DataOrigin
  queryId: string
  canonicalQueryHash: string
  cursor: ResumeCursor
  emittedAt: Timestamp
  payload:
    | { type: "event_appended"; event: TimelineEvent }
    | { type: "event_corrected"; event: TimelineEvent; replacesEventId: string }
    | { type: "projection_invalidated"; reason: StatusReason }
    | { type: "heartbeat"; watermark: Timestamp }
}
```

정렬·중복·지연 규칙:

- history page는 `(occurredAt DESC, ingestSequence DESC, eventId DESC)`의 stable order다.
- stream 적용 순서는 `cursor.(streamEpoch, sequence)`이며 gap이 있으면 적용을 멈추고 resume, 불가능하면 page+stream atomic cut을 다시 받는다.
- `eventId`가 동일하면 중복이다. 다른 source가 같은 domain event를 재발행할 수 있으므로 `dedupeKey`도 secondary dedupe key다.
- 늦게 도착한 event는 `late=true`로 정확한 occurredAt 위치에 삽입하되 사용자의 scroll anchor와 현재 읽는 row 위치를 보존한다. 상단에 새 이벤트 배지를 제공하고 강제 점프하지 않는다.
- correction은 기존 event를 숨겨 덮지 않고 audit 가능한 replace 관계를 보존한다.
- operation progress와 domain event는 같은 TimelineEvent shape를 쓰되 operation status의 최종 권위는 GitOpsOperationStatus다.
- stream은 TimelinePage가 반환한 queryId/canonicalQueryHash/liveStart만 사용해 연결한다. client가 queryHash를 재구성하지 않는다. reconnect는 마지막 성공 적용 resumeToken으로 시작하고 token 만료/stale은 새 page+stream atomic cut을 받는다.

## 8. Metrics

### 8.1 Query와 결과

```ts
type MetricScope =
  | { type: "cluster"; clusterUids: readonly string[] }
  | { type: "namespace"; clusterUid: string; namespaces: readonly string[] }
  | { type: "workload"; resources: readonly ResourceRef[] }
  | { type: "pod"; resources: readonly ResourceRef[] }
  | { type: "container"; resources: readonly ResourceRef[] }
  | { type: "application_instance"; instanceIds: readonly string[] }

type MetricAggregation = "sum" | "avg" | "min" | "max" | "count" | "p50" | "p90" | "p95" | "p99" | "last"

type MetricFilter = {
  dimensionKey: string
  operator: "equals" | "not_equals" | "in" | "not_in"
  values: readonly string[]
}

type MetricQueryBase = {
  queryId: string
  metricKey: string
  scope: MetricScope
  aggregation: MetricAggregation
  groupBy: readonly ("cluster" | "namespace" | "workload" | "pod" | "container" | "resource")[]
  maxPointsPerSeries: number
  filters: readonly MetricFilter[]
}

type MetricQuery =
  | (MetricQueryBase & { mode: "instant"; instantAt: Timestamp })
  | (MetricQueryBase & {
      mode: "range"
      startAt: Timestamp
      endAt: Timestamp
      requestedStepMs: DurationMs
    })

type MetricQueryTemplate = {
  templateId: string
  metricKey: string
  allowedScopeTypes: readonly MetricScope["type"][]
  allowedAggregations: readonly MetricAggregation[]
  suggestedGroupBy: readonly MetricQueryBase["groupBy"][number][]
}

type MetricPoint =
  | { timestamp: Timestamp; state: "value"; value: DecimalString; reason: null }
  | {
      timestamp: Timestamp
      state: "missing" | "forbidden" | "source_error"
      value: null
      reason: StatusReason
    }

type MetricCoverage = {
  state: "complete" | "partial" | "none" | "forbidden" | "unknown"
  expectedSeries: number | null
  returnedSeries: number
  expectedPoints: number | null
  returnedPoints: number
  missingScopes: readonly string[]
  reasons: readonly StatusReason[]
}

type MetricSeries = {
  seriesId: string
  metricKey: string
  label: string
  unit: string
  unitFamily: "cpu" | "bytes" | "duration" | "count" | "rate" | "currency" | "ratio" | "custom"
  aggregation: MetricAggregation
  labels: Readonly<Record<string, string>>
  resource: ResourceRef | null
  points: readonly MetricPoint[]
  coverage: MetricCoverage
  freshness: Freshness
}

type MetricSourceState = "available" | "degraded" | "unavailable" | "forbidden" | "unknown"

type MetricResultBase = {
  queryId: string
  canonicalQueryHash: string
  evaluatedAt: Timestamp
  series: readonly MetricSeries[]
  coverage: MetricCoverage
  sources: readonly {
    sourceId: string
    displayName: string
    state: MetricSourceState
    observedAt: Timestamp | null
    freshness: Freshness
    reason: StatusReason | null
  }[]
}

type MetricResult =
  | (MetricResultBase & { mode: "instant"; effectiveInstantAt: Timestamp })
  | (MetricResultBase & {
      mode: "range"
      effectiveStartAt: Timestamp
      effectiveEndAt: Timestamp
      effectiveStepMs: DurationMs
    })
```

필드 불변조건:

- instant/range는 discriminated union이므로 적용되지 않는 time field 자체가 존재하지 않는다. range는 startAt < endAt, requestedStepMs > 0이다.
- metric value는 절대값 decimal string이다. ratio/percent는 면적에 쓰지 않고 명시적으로 허용된 chart/summary에서만 표시한다.
- zero는 `value:"0"`, missing은 `value:null,state:"missing"`이다. no-data, source error, permission denied를 같은 빈 chart로 합치지 않는다.
- source가 여러 개면 합성 전에 unit/semantic compatibility와 duplicate ownership을 backend가 판정하고 completeness로 설명한다.
- 서버는 requestedStepMs를 더 큰 effectiveStepMs로 올릴 수 있으나 maxPointsPerSeries를 넘기지 않는다. UI는 실제 step을 표시한다.
- card는 최신 유효 point 1개, sparkline은 2개 이상일 때만 선을 그린다. range chart는 유효 point가 2개 미만이면 수치를 표시하되 선을 만들지 않는다. 화면은 임의 interpolation을 하지 않는다.
- 한 response의 series당 point 상한은 catalog에서 협상하며 제품 기본 hard ceiling은 1,500이다. 초과 범위는 서버 downsampling 또는 cursor/chunk query를 사용한다.
- v1 `metrics.query`는 AbortSignal로 취소 가능한 synchronous result 계약으로 확정한다. async receipt를 암묵적으로 섞지 않는다. backend가 budget 안에 결과를 만들 수 없으면 typed timeout/rate/source error를 반환하고, 향후 async metrics는 별 capability와 schema version으로 추가한다.

### 8.2 Cache, cancellation, freshness

- cache key는 canonical MetricQuery에서 queryId를 제외한 hash + authorization scope + catalog revision이다.
- 새로운 query가 같은 panel의 이전 query를 대체하면 AbortSignal로 취소하고 늦게 온 결과는 canonicalQueryHash 불일치로 버린다.
- instant 기본 refresh interval, staleAfterMs, range revalidation interval은 metric catalog가 내려준다. component literal로 정하지 않는다.
- background refresh 중 마지막 성공 결과를 유지하고 refreshing indicator를 표시한다. 실패하면 stale data + 오류를 함께 표시하며 값을 0으로 바꾸지 않는다.
- visibility hidden, offline, battery/data-saving policy에서는 자동 refresh를 일시 중단할 수 있고 재개 시 즉시 revalidate한다.

## 9. Topology consumer contract

Topology는 §6의 `ResourceNode`, `ResourceEdge`, `ResourceGraphSnapshot`을 재사용하고 `graphKind="runtime_topology"`로 구분한다. Tree와 Topology가 같은 리소스를 다른 ID로 만들지 않는다.

### 9.1 Scope와 projection

```ts
type TopologyScopeBase = {
  workspaceId: string
  applicationIds: readonly string[]
  instanceIds: readonly string[]
  clusterUids: readonly string[]
  namespaces: readonly string[]
  rootEntityIds: readonly string[]
}

type TopologyScope =
  | (TopologyScopeBase & { timeMode: "live" })
  | (TopologyScopeBase & { timeMode: "historical"; at: Timestamp })

type TopologyProjection = {
  lens: "placement" | "network" | "ownership" | "dependencies" | "gitops" | "butterfly"
  relationKinds: readonly ResourceEdgeKind[]
  nodeCategories: readonly ResourceNodeCategory[]
  metricOverlayKeys: readonly string[]
  grouping: readonly ("cluster" | "namespace" | "node" | "application" | "workload")[]
  maxInitialNodes: number
  maxInitialEdges: number
}

type TopologyFilter =
  | { type: "health"; values: readonly HealthStatus["level"][] }
  | { type: "sync"; values: readonly SyncStatus["state"][] }
  | { type: "freshness"; values: readonly Freshness["state"][] }
  | { type: "resource_kind"; values: readonly string[] }
  | { type: "label"; key: string; operator: "equals" | "not_equals" | "in"; values: readonly string[] }
  | { type: "search"; value: string }

type TopologyQuery = {
  scope: TopologyScope
  projection: TopologyProjection
  filters: readonly TopologyFilter[]
  queryHash: string
}

type TopologyMetricOverlay = {
  graphRevision: string
  metricQueryHash: string
  values: readonly {
    nodeId: string
    metricKey: string
    unit: string
    point: MetricPoint
  }[]
  coverage: MetricCoverage
  freshness: Freshness
}

type ResourceGraphDelta = {
  deltaId: string
  baseGraphRevision: string
  nextGraphRevision: string
  upsertNodes: readonly ResourceNode[]
  removeNodeIds: readonly string[]
  upsertEdges: readonly ResourceEdge[]
  removeEdgeIds: readonly string[]
  overlay: TopologyMetricOverlay | null
}

type ResourceGraphStreamEnvelope = {
  schemaVersion: "resource-graph-stream/v1"
  dataOrigin: DataOrigin
  queryId: string
  cursor: GraphStreamCursor
  emittedAt: Timestamp
  canonicalQueryHash: string
  payload:
    | { type: "graph_delta"; delta: ResourceGraphDelta }
    | { type: "completeness_changed"; completeness: DataCompleteness }
    | { type: "source_state_changed"; freshness: Freshness; reason: StatusReason | null }
    | { type: "projection_invalidated"; reason: StatusReason }
    | { type: "heartbeat"; graphRevision: string }
}
```

### 9.2 Node/edge와 drill-down

- Cluster, Namespace, ApplicationBinding은 platform/projection node다. Deployment, Rollout, DaemonSet, StatefulSet, ReplicaSet, Pod, Service, Endpoint/EndpointSlice, Ingress/Gateway/Route, Job, CronJob, PVC/PV, HPA 및 발견된 CRD는 canonical ResourceRef를 가진다.
- Container와 endpoint member처럼 독립 API object가 아닌 항목은 `entityClass="embedded"`이고 parent UID + stable sub-key로 식별한다.
- `contains`는 화면 grouping, `runs_on`은 scheduling placement, `owns`는 controller ownership, `selects`는 configured selector, `routes_to`는 effective/observed network, `mounts`는 volume binding, `depends_on`은 configuration/dependency, `deployed_by`·`declared_as`는 GitOps provenance다. 한 edge kind로 서로 다른 truth를 뭉개지 않는다.
- 선택한 node는 inspector에서 identity, desired/live, status, relation evidence, freshness/completeness, metrics, recent timeline, 가능한 capability를 보여준다.
- cross-navigation은 application instance/binding context와 filter를 URL state로 보존한다. 동일 entityId가 있으면 Tree↔Topology↔Timeline↔Metrics에서 선택을 유지한다.

### 9.3 Snapshot + stream cutover

1. client가 queryHash로 snapshot을 요청한다.
2. snapshot의 streamStart와 clusterCuts를 저장한 뒤 렌더한다.
3. stream mode이면 정확히 그 GraphStreamCursor 이후부터 연결하고, poll/static이면 stream을 열지 않는다.
4. snapshot 이전 또는 이미 적용한 deltaId는 버리고, baseGraphRevision이 현재 revision과 일치하는 delta만 원자 적용한다.
5. cursor sequence gap, epoch change, revision mismatch는 delta 적용을 멈추고 resume한다. resume 불가 시 새 snapshot으로 교체한다.
6. multi-cluster snapshot은 cluster별 cut/access를 포함한다. 일부 cluster가 forbidden/unavailable이어도 전체를 empty/error로 바꾸지 않고 partial graph와 cluster별 reason을 표시한다.

Resume cursor는 query stream 전체에 하나뿐이다. `GraphClusterCut`은 각 cluster의 inventory epoch/source watermark와 skew를 설명하는 provenance이며 독립 stream cursor가 아니다. restricted/unavailable cluster는 projectionRevision/inventoryEpoch가 null일 수 있고 reason/completeness가 그 원인을 설명한다.

Restricted node는 권한 있는 edge가 hidden peer를 참조한다는 사실을 허용된 정책이 명시할 때만 placeholder로 나타난다. 숨은 리소스 이름·namespace·UID·edge count를 추론해서는 안 된다. metric overlay는 graphRevision과 query hash가 맞는 경우에만 적용하고 coverage/freshness를 지속 표시한다.

## 10. GitOps Operations

### 10.1 Canonical request, receipt, status

`history`와 `capabilities`는 read query다. 나머지는 receipt를 만드는 operation이다. `diff`와 `plan`도 계산 시간이 길거나 approval/policy evidence가 필요할 수 있으므로 동일 operation model을 사용한다.

```ts
type GitOpsOperationKind =
  | "refresh"
  | "diff"
  | "reconcile_plan"
  | "reconcile_apply"
  | "suspend"
  | "resume"
  | "terminate"
  | "rollback"

type OperationTarget = {
  applicationId: string
  instanceId: string
  bindingId: string
  destinationId: string
}

type OperationConfirmation = {
  confirmationToken: string
  capabilityRevision: string
  confirmedAt: Timestamp
  acknowledgedEffects: readonly ("desired_state_write" | "cluster_write" | "operation_control")[]
}

type GitOpsOperationRequest =
  | {
      kind: "refresh"
      target: OperationTarget
      idempotencyKey: string
      input: { intensity: "normal" | "invalidate_cache" }
      confirmation: null
    }
  | {
      kind: "diff"
      target: OperationTarget
      idempotencyKey: string
      input: { desiredRevision: string | null; liveRevision: string | null }
      confirmation: null
    }
  | {
      kind: "reconcile_plan"
      target: OperationTarget
      idempotencyKey: string
      input: {
        desiredRevision: string | null
        prune: boolean
        selectedResourceIds: readonly string[]
        intent: "reconcile" | "rollback"
        rollbackHistoryEntryId: string | null
      }
      confirmation: null
    }
  | {
      kind: "reconcile_apply"
      target: OperationTarget
      idempotencyKey: string
      input: {
        planId: string
        planDigest: string
        approvalId: string | null
      }
      confirmation: OperationConfirmation
    }
  | {
      kind: "suspend"
      target: OperationTarget
      idempotencyKey: string
      input: { reason: string | null }
      confirmation: OperationConfirmation
    }
  | {
      kind: "resume"
      target: OperationTarget
      idempotencyKey: string
      input: { reason: string | null }
      confirmation: OperationConfirmation | null
    }
  | {
      kind: "terminate"
      target: OperationTarget
      idempotencyKey: string
      input: { targetOperationId: string; reason: string | null }
      confirmation: OperationConfirmation
    }
  | {
      kind: "rollback"
      target: OperationTarget
      idempotencyKey: string
      input: { historyEntryId: string }
      confirmation: OperationConfirmation | null
    }

type OperationProgress = {
  stageKey: string
  current: number | null
  total: number | null
  percent: number | null
  messageKey: string
  updatedAt: Timestamp
}

type OperationStep = {
  stepId: string
  labelKey: string
  phase: OperationPhase
  startedAt: Timestamp | null
  finishedAt: Timestamp | null
  progress: OperationProgress | null
  reason: StatusReason | null
}

type ReconcilePlanResult = {
  planId: string
  planDigest: string
  target: OperationTarget
  desiredRevision: string
  liveRevision: string | null
  diffSummary: DiffSummary
  prune: boolean
  selectedResourceIds: readonly string[]
  intent: "reconcile" | "rollback"
  expiresAt: Timestamp
  approval: ApprovalStatus
}

type GitOpsOperationResult =
  | { type: "refresh"; projectionRevision: string; freshness: Freshness }
  | { type: "diff"; diffSummary: DiffSummary; diffPageCursor: string | null }
  | { type: "plan"; plan: ReconcilePlanResult }
  | { type: "apply"; appliedRevision: string; projectionRevision: string | null }
  | { type: "lifecycle"; lifecycle: "active" | "suspended" }
  | { type: "termination"; targetOperationId: string; targetPhase: "cancelled" | "succeeded" | "failed" }
  | { type: "rollback_plan"; plan: ReconcilePlanResult }

type GitOpsOperationReceipt = {
  receiptId: string
  operationId: string
  kind: GitOpsOperationKind
  target: OperationTarget
  idempotencyKey: string
  acceptedAt: Timestamp
  phase: OperationPhase
  statusVersion: string
  approval: ApprovalStatus
  statusQueryRef: string
  eventStreamRef: string
  dataOrigin: DataOrigin
}

type GitOpsOperationStatus = {
  operationId: string
  receiptId: string
  kind: GitOpsOperationKind
  target: OperationTarget
  phase: OperationPhase
  statusVersion: string
  requestedAt: Timestamp
  startedAt: Timestamp | null
  finishedAt: Timestamp | null
  requestedBy: { actorId: string; displayName: string | null; redacted: boolean }
  approval: ApprovalStatus
  progress: OperationProgress | null
  steps: readonly OperationStep[]
  result: GitOpsOperationResult | null
  reason: StatusReason | null
  retryable: boolean
  retryAfterMs: DurationMs | null
  capabilityRevision: string
  freshness: Freshness
}

type GitOpsOperationEvent = {
  eventId: string
  operationId: string
  streamId: string
  streamEpoch: string
  sequence: number
  statusVersion: string
  occurredAt: Timestamp
  resumeToken: string
  payload:
    | { type: "status_changed"; status: GitOpsOperationStatus }
    | { type: "progress_changed"; progress: OperationProgress; steps: readonly OperationStep[] }
    | { type: "approval_changed"; approval: ApprovalStatus }
    | { type: "completed"; status: GitOpsOperationStatus }
    | { type: "heartbeat" }
}
```

`percent`는 0 이상 100 이하의 finite number이고, 정확한 total이 없으면 null이다. null을 가짜 진행률 애니메이션으로 바꾸지 않고 indeterminate indicator를 쓴다. `statusVersion`은 opaque monotonic version이며 client가 숫자로 파싱하지 않는다.

### 10.2 Operation별 UX 계약

| Operation | 기본 진입점 | 입력/확인 | capability와 permission | receipt 이후 표시 | 성공 후 invalidate | 실패 recovery |
|---|---|---|---|---|---|---|
| refresh | 목록 row, 상세 header | normal은 확인 없음; cache 무효화는 정책에 따라 확인 | `refresh`, 보통 read effect | row에 pending/running badge, 기존 데이터 유지 | instance detail, freshness, timeline, topology snapshot | 재시도, source 상태 열기 |
| diff | 상세 header, Tree, revision 비교 | desired/live revision; 확인 없음 | `diff`, read effect | diff 계산 중 skeleton이 아니라 operation progress | diff summary/page, Tree, insights, timeline | revision 재선택, source 새로고침 |
| reconcile plan | 상세 primary action | desired revision; optional prune/selective; 확인 없음 | `reconcile.plan`; prune/selective 각각 별도 capability | immutable plan review 화면 | plan/diff/approval/history | 입력 수정 후 새 idempotency key로 plan 재생성 |
| reconcile apply | plan review | planId+digest; write effect 확인 필수 | `reconcile.apply`; approval/permission/capability 모두 server 재검증 | 기존 sync 상태를 성공으로 바꾸지 않고 running overlay | instance/list, Tree, topology, timeline, metrics, history, capabilities | 최신 상태로 re-plan, approval 복구, 권한 요청 |
| suspend | 상세 overflow/toolbar | 선택 reason; 확인 필수 | `suspend` | pending/running; lifecycle 기존값 유지 | instance/list, capabilities, timeline, history | 최신 lifecycle 확인 후 재시도 |
| resume | suspended badge/toolbar | reason; 위험 정책일 때 확인 | `resume` | pending/running; active로 optimistic 변경 금지 | instance/list, capabilities, timeline, history | precondition 설명, 재-plan 또는 권한 요청 |
| terminate | running operation panel | targetOperationId+reason; 확인 필수 | `terminate`; target effect를 서버가 판정 | terminate operation running과 target `취소 요청됨`을 분리 | target/current operation, timeline, capabilities | 이미 terminal이면 상태 동기화, 그 외 재시도 |
| rollback | history entry | historyEntryId; 오래된/위험 revision 확인 | `rollback` | rollback plan 생성 progress | plan/diff/approval/history | 다른 history point 선택, source refresh |
| history | 상세 tab | filter/cursor; mutation 아님 | `history` | page loading/background refresh | 해당 없음 | retry/filter reset |
| capabilities | 모든 action surface | target binding 필수; mutation 아님 | 항상 query 가능한 범위 내 | 미로딩 동안 action disabled | capability revision cache | target/permission/source 상태 재조회 |

`prune`와 `selective_sync`는 optional capability다. 둘 다 `reconcile_plan` input에만 진입하며 apply request는 planId/digest만 전달한다. 브라우저가 raw manifest, raw patch, 재계산한 삭제 목록을 apply payload로 보내지 않는다.

Rollback은 즉시 write하지 않는다. `rollback`이 선택한 history point에 대한 immutable `ReconcilePlanResult(intent="rollback")`를 만들고, 이후 동일한 approval·confirmation을 거친 `reconcile_apply`로 실행한다.

### 10.3 Non-optimistic, idempotency, retry

- 모든 mutation은 HTTP 202 `GitOpsOperationReceipt` 수신 전 local operation row조차 만들지 않는다. 전송 중에는 버튼 자체에 `요청 전송 중` 상태만 표시한다.
- receipt 수신 후에도 sync, lifecycle, revision, health를 optimistic하게 변경하지 않는다. operation status와 기존 관측 상태를 나란히 표시한다.
- suspend/resume도 성공 status와 갱신된 instance query가 모두 확인되기 전 canonical lifecycle을 확정하지 않는다.
- idempotency key는 한 사용자 의도마다 client가 생성하고 retry에서 그대로 재사용한다. 동일 principal+target+kind+payload digest의 동일 key는 같은 receipt를 반환한다. 같은 key에 다른 payload는 409 conflict다.
- network timeout처럼 receipt 수신 여부가 불명확하면 같은 key로 재전송한다. terminal business failure 재시도는 새 사용자 의도이므로 새 key를 쓴다.
- 429/503은 retryAfterMs를 따르고 자동 retry는 read query와 receipt 확인에만 제한한다. write operation을 새로운 key로 자동 반복하지 않는다.
- terminal `failed`, `cancelled`, `unsupported`는 이유와 recovery CTA를 유지하며 toast만 남기고 사라지지 않는다.

### 10.4 Progress stream과 polling

- operation detail을 연 직후 status GET과 event stream을 snapshot/cutover cursor로 연결한다.
- event는 `(streamEpoch, sequence)`로 적용하고 eventId dedupe, statusVersion stale discard를 수행한다.
- stream 단절 시 마지막 resumeToken으로 reconnect한다. 그 동안 `연결 끊김 · 상태 확인 중`을 표시하고 operation을 failed로 바꾸지 않는다.
- resume 불가 또는 gap이면 status GET으로 수렴한 뒤 새 cursor를 받는다.
- stream을 사용할 수 없으면 pending 2초, running 3초, terminal 도달 시 중단을 기본 hint로 삼되 서버의 pollAfterMs가 우선한다. background tab은 더 느리게 polling한다.
- terminal status 후 invalidate 목록을 한 번 실행하고, 새 관측 revision이 늦으면 operation success + resource freshness stale을 동시에 표시한다.

### 10.5 Management read-only와 capability

- `managementRole` 또는 provider 이름을 보고 frontend가 action을 직접 차단하지 않는다. `CapabilityDecision.effects`, `enabled`, `disabledReason`을 사용한다.
- 일반 원칙상 management read-only에서 read effect인 refresh/diff/plan/history는 허용될 수 있다.
- desired-state/cluster write인 apply/suspend/resume/rollback/prune/selective sync는 disabled + `read_only_target` reason이다.
- terminate는 대상 operation effect와 정책에 따라 서버가 판정한다. UI가 operation 이름만 보고 허용하지 않는다.
- capability가 미수신/unknown이면 action은 disabled이고 `기능 확인 중`을 표시한다. enabled를 낙관 추정하지 않는다.

## 11. Revision history와 approval

```ts
type RevisionHistoryEntry = {
  historyEntryId: string
  instanceId: string
  desiredRevision: string
  liveRevision: string | null
  operationId: string | null
  outcome: "succeeded" | "failed" | "cancelled" | "observed" | "unknown"
  actor: { actorId: string; displayName: string | null; redacted: boolean } | null
  summary: string
  recordedAt: Timestamp
  rollbackCapability: CapabilityDecision
  freshness: Freshness
}

type RevisionHistoryQuery = {
  instanceId: string
  outcomes: readonly RevisionHistoryEntry["outcome"][]
  startAt: Timestamp | null
  endAt: Timestamp | null
  cursor: string | null
  limit: number
}
```

History는 provider log나 commit log를 그대로 노출하는 화면이 아니다. 한 instance에 대해 관측·operation과 연결된 canonical revision history다. approval은 versioned entity이며 pending approval UI는 approvalId, policy reason, requestedAt, expiry를 보여준다. grant/reject도 별도 receipt 기반 mutation으로 다루고 stale approval version은 409/412 후 최신 approval을 다시 표시한다.

## 12. 화면 상태 모델과 상태 행렬

### 12.1 상태를 한 enum으로 합치지 않는다

```ts
type PanelLoadState<T> =
  | { fetch: "initial_loading" }
  | { fetch: "ready"; data: T }
  | { fetch: "empty"; reason: StatusReason | null }
  | { fetch: "error"; error: ApiError }

type RemotePanelState<T> = {
  load: PanelLoadState<T>
  refreshing: boolean
  refreshError: ApiError | null
  connection: "connected" | "reconnecting" | "disconnected" | "not_applicable"
  completeness: DataCompleteness | null
  freshness: Freshness | null
  access: "read_write" | "read_only" | "forbidden" | "unknown"
  dataOrigin: DataOrigin | null
}
```

- `empty`는 해당 authorization scope의 complete collection이 0개임을 확인했을 때만 쓴다. forbidden, partial, disconnected, unavailable을 empty로 표현하지 않는다.
- background refresh는 마지막 성공 data를 유지하는 직교 flag다. refresh 실패 시 data + stale/오류를 함께 보여준다.
- synthetic/replay origin은 fetch 상태와 무관하며 화면 최상위에 `DEMO DATA`/`REPLAY DATA` marker를 지속 표시한다.
- pending approval/running/succeeded/failed는 operation 상태다. resource의 sync/health/freshness를 덮어쓰지 않는다.
- refreshing/refreshError는 ready 또는 empty에서만 의미가 있다. initial/error branch에는 false/null이다. ready는 non-null data, empty는 data field 없음, error는 non-null ApiError를 타입으로 강제한다.

### 12.2 화면·패널 상태 행렬

| 상태 | Applications 목록/상세 | GitOps 목록/상세 | Tree / Insights | Timeline | Metrics | Topology | Operation surface |
|---|---|---|---|---|---|---|---|
| initial loading | row/card skeleton; 수치 없음 | identity/source/destination skeleton; action disabled | frame/node skeleton; 가짜 node 없음 | time row skeleton | axis/card skeleton; 가짜 선 없음 | viewport/frame skeleton; 가짜 tile 없음 | capability 확인 전 모두 disabled |
| background refreshing | 기존 목록·선택 유지, header spinner | 기존 revision/status 유지, 최신화 표식 | graph 유지, 변경 적용 전 `갱신 중` | scroll anchor 유지, 새 event badge | 기존 series 유지, panel spinner | geometry/selection 유지, delta buffer | status 유지, status query spinner |
| empty | `조건에 맞는 앱 없음`; filter reset/create 권한 CTA | `배포 인스턴스 없음`; binding 생성 CTA는 capability 기반 | complete root 0건만 `리소스 없음`; Insights 0건은 `열린 인사이트 없음` | complete time range 0건 | coverage none + source 정상일 때 `관측값 없음` | complete scope 0 node만 `표시할 리소스 없음` | history/operation 0건; action 자체와 구분 |
| no permission | 전면 또는 row redaction, 권한 요청 CTA | source/destination 허용 범위만; mutation hidden/disabled | restricted node/edge만 정책대로; count 추론 금지 | forbidden scope 안내; 다른 허용 scope 유지 | forbidden series를 no-data와 구분 | restricted placeholder와 cluster access reason | visible action은 disabled + permission reason; 민감 action hidden |
| partial | 관측/전체 count와 누락 source 표시 | 일부 instance/resource count 배지 | hatch/aggregate + missing source 설명 | 누락 시간/source banner | coverage 분수와 missing scopes | cluster별 partial band, topology 자체 유지 | status는 유지하되 영향 범위 불완전 경고 |
| stale | 마지막 값과 `관측 시각` 표시, 정렬값 stale 표시 | sync/health와 별도 stale badge | stale dot pattern, 자동 action 판단 금지 | event freshness banner | stale pattern, emission/auto refresh 정책 정지 | stale edge animation 정지, geometry 유지 | capability precondition 재조회; 실행 버튼 disabled 가능 |
| disconnected | cached data 유지, 연결 상태 banner | cached detail 유지, operation 성공/실패 추정 금지 | snapshot 유지, delta 적용 중단 | resume 중 표시, event를 failed로 만들지 않음 | 마지막 series 유지; refresh paused | snapshot 유지, stream cut marker 표시 | polling fallback; 둘 다 불가하면 상태 확인 불가 |
| provider/source unavailable | 영향 instance와 source reason; 다른 instance 유지 | canonical `source_unavailable`; provider 전용 화면 없음 | source별 unresolved/partial | source system event + retry | source status unavailable; 값 0 금지 | 해당 plane/source만 unavailable | 해당 capability disabled + source recovery CTA |
| pending approval | aggregate approval count + instance badge | primary action은 `승인 대기`; 중복 apply 차단 | plan/diff 유지, policy/approval insight | approval requested event | 기존 metrics 변화 없음 | 기존 topology 변화 없음 | approval card, expiry, policy, grant/reject 권한 |
| running | instance operation badge; resource status 유지 | progress strip + stop capability | 관련 node에 operation halo, state를 synced로 바꾸지 않음 | progress event 병합 | 자동 인과 추정/값 변경 없음 | 선택 대상 halo; background graph delta 계속 | 단계/진행률/로그 요약, terminate capability |
| succeeded | receipt 완료 badge 후 재조회; 잠시 결과 link | operation 성공과 새 관측 상태 병기 | 새 graph revision 도착 전 stale 가능 | terminal event | invalidate 후 새 series; 미도착이면 stale | 새 snapshot/delta 후 반영 | terminal summary, 결과/plan/diff link, 다시 실행 |
| failed | 앱 health를 자동 failed로 바꾸지 않음 | 실패 reason + 마지막 live 상태 | 영향 resource evidence가 있을 때만 표시 | terminal failure event | operation 실패를 metric 0으로 전환 금지 | topology 유지, 관련 evidence만 표시 | persistent failure panel, retry 가능 여부, recovery CTA |
| management read-only | destination badge 지속 | write action disabled, read action은 capability대로 | 탐색 가능, write CTA 없음/disabled | audit/history 조회 가능 범위 | read capability가 있으면 조회 | 관측 graph와 제한 이유 | effect 기반 disabled reason; provider/role 이름 추론 금지 |
| capability unsupported | 목록의 무의미 action은 hidden | 예상 action은 disabled + unsupported reason | unavailable insight/action만 숨김 또는 reason | filter/source가 적용 불가하면 설명 | instant/range 각각 decision 표시 | stream 미지원이면 snapshot/poll 모드 설명 | capability inspector에 supported=false와 제약 표시 |

### 12.3 Error와 상태 보존 불변조건

- initial query가 실패하고 사용할 cached data가 없을 때만 panel-level error boundary를 쓴다.
- background query 실패는 기존 data를 제거하지 않는다. non-blocking error banner와 retry를 제공한다.
- 401은 session revalidation 후 login; 403은 no permission; 404는 target deleted/not found이며 source 미설치로 추정하지 않는다.
- 409/412는 stale precondition/cursor/approval/plan을 구분해 최신 데이터를 불러오고 사용자 입력을 보존한다.
- 429는 retryAfterMs countdown, 502/503은 source unavailable 또는 disconnected mapping을 adapter error code로 결정한다.
- schema incompatible는 화면을 부분적으로 추측 렌더링하지 않고 안전한 incompatible state와 correlationId를 보여준다.
- 전체 route error와 한 panel error를 분리한다. Metrics 실패가 Application detail/Tree를 가리지 않는다.

## 13. API 소비 요구사항

### 13.1 공통 response와 selector catalog

아래 route 명칭은 OpenAPI 설계를 검증하기 위한 semantic proposal이며 backend framework 경로를 강제하지 않는다. 승인된 OpenAPI가 같은 의미, 상태, cursor, stream cut을 보장하면 경로는 달라도 된다.

```ts
type ConsumerEnvelope<T> = {
  schemaVersion: "product-data/v1"
  data: T
  requestId: string
  generatedAt: Timestamp
  freshness: Freshness
  completeness: DataCompleteness
  access: SuccessfulAccessMode
  dataOrigin: DataOrigin
  warnings: readonly StatusReason[]
}

type ScopeCatalog = {
  revision: string
  applications: CursorPage<{ applicationId: string; displayName: string; instanceCount: number }>
  instances: CursorPage<{
    instanceId: string
    applicationId: string
    bindingId: string
    destinationId: string
    clusterUid: string
    clusterDisplayName: string
    environmentId: string | null
    environmentName: string | null
    namespace: string | null
    interactionMode: "read_write" | "read_only"
  }>
  clusters: CursorPage<{
    clusterUid: string
    displayName: string
    access: "full" | "partial" | "restricted" | "unavailable"
    reason: StatusReason | null
  }>
  namespaces: CursorPage<{ clusterUid: string; namespace: string; restricted: boolean }>
  limits: { defaultPageSize: number; maxPageSize: number; maxGraphNodes: number; maxGraphEdges: number }
  completeness: DataCompleteness
}

type ScopeFacetQuery = {
  facet: "applications" | "instances" | "clusters" | "namespaces"
  search: string | null
  parentApplicationIds: readonly string[]
  parentClusterUids: readonly string[]
  parentEnvironmentIds: readonly string[]
  cursor: string | null
  limit: number
}

type ApplicationInstanceListQuery = {
  search: string | null
  applicationIds: readonly string[]
  instanceIds: readonly string[]
  clusterUids: readonly string[]
  environmentIds: readonly string[]
  namespaces: readonly string[]
  includeClusterScoped: boolean
  repositoryIds: readonly string[]
  lifecycleStates: readonly LifecycleStatus["state"][]
  syncStates: readonly SyncStatus["state"][]
  healthLevels: readonly HealthStatus["level"][]
  freshnessStates: readonly Freshness["state"][]
  approvalStates: readonly ApprovalStatus["state"][]
  operationPhases: readonly OperationPhase[]
  accessModes: readonly ("read_write" | "read_only")[]
  sort:
    | "name_asc"
    | "name_desc"
    | "health_severity_desc"
    | "sync_severity_desc"
    | "freshness_asc"
    | "latest_operation_desc"
  cursor: string | null
  limit: number
}

type InsightQuery = {
  instanceIds: readonly string[]
  kinds: readonly GitOpsInsightKind[]
  severities: readonly GitOpsInsightSeverity[]
  statuses: readonly GitOpsInsight["status"][]
  resourceEntityIds: readonly string[]
  cursor: string | null
  limit: number
}

type DiffPageQuery = {
  instanceId: string
  operationId: string | null
  changeTypes: readonly DiffChangeType[]
  resourceKinds: readonly string[]
  cursor: string | null
  limit: number
}

type MetricCatalogEntry = {
  metricKey: string
  displayName: string
  description: string
  unit: string
  unitFamily: MetricSeries["unitFamily"]
  allowedScopes: readonly MetricScope["type"][]
  allowedAggregations: readonly MetricAggregation[]
  additive: boolean
  areaEligible: boolean
  defaultRefreshMs: DurationMs
  defaultStaleAfterMs: DurationMs
  minStepMs: DurationMs
  maxPointsPerSeries: number
  capabilities: {
    instant: CapabilityDecision
    range: CapabilityDecision
  }
}

type MetricCatalog = {
  revision: string
  entries: CursorPage<MetricCatalogEntry>
  sources: CursorPage<{
    sourceId: string
    displayName: string
    state: MetricSourceState
    freshness: Freshness
    reason: StatusReason | null
  }>
}

type MetricCatalogQuery = {
  search: string | null
  scopeTypes: readonly MetricScope["type"][]
  areaEligible: boolean | null
  cursor: string | null
  limit: number
}
```

Scope selector는 cluster → environment → namespace → application instance의 종속 facet을 catalog에서 만든다. 선택 목록에 없는 ID를 URL에서 받으면 자동으로 첫 항목을 선택하지 않고 `선택 대상에 접근할 수 없음`을 표시한다. `All instances`는 read aggregate일 뿐 mutation target이 아니다.

### 13.2 화면별 query / mutation / stream

| 화면/목적 | Semantic query 또는 mutation | 주요 parameter | Response | Realtime / polling |
|---|---|---|---|---|
| 공통 scope | `scope.catalog` | workspace, optional search/scope | `ConsumerEnvelope<ScopeCatalog>` | catalog revision 변경 시 invalidate; 저빈도 polling 가능 |
| scope facet 추가 page | `scope.facets.list` | `ScopeFacetQuery` | 해당 facet의 `ConsumerEnvelope<CursorPage<...>>` | selector 검색/scroll 시 요청 |
| Applications 목록 | `applications.list` | `ApplicationListQuery` | `ConsumerEnvelope<CursorPage<ApplicationSummary>>` | foreground revalidate; operation completion invalidate |
| Application 상세 | `applications.get` | applicationId | `ConsumerEnvelope<ApplicationDetail>` | background revalidate; instance operation event가 targeted invalidate |
| Application instance page | `applications.instances.list` | `ApplicationInstanceListQuery` | `ConsumerEnvelope<CursorPage<ApplicationInstanceSummary>>` | optional projection update stream 또는 polling |
| GitOps 목록 | `gitops.instances.list` | `ApplicationInstanceListQuery` | 같은 instance page DTO | current operation이면 operation stream 결합 |
| GitOps 상세 | `gitops.instances.get` | instanceId, bindingId | `ConsumerEnvelope<ApplicationInstanceDetail>` | background revalidate + operation targeted invalidate |
| capabilities | `gitops.capabilities.get` | exact `OperationTarget` | `ConsumerEnvelope<CapabilitySet>` | operation/source/access change 시 즉시 invalidate |
| diff 목록 | `gitops.diffs.list` | `DiffPageQuery` | `ConsumerEnvelope<CursorPage<ResourceDiff>>` | diff operation 완료 후 fetch; stream 자체는 불필요 |
| Tree snapshot | `gitops.tree.snapshot` | `GitOpsTreeQuery` | `ConsumerEnvelope<ResourceGraphSnapshot>` | snapshot과 cut cursor를 원자 수신 |
| Tree expand | `gitops.tree.expand` | `ResourceGraphExpansionQuery` | `ConsumerEnvelope<ResourceGraphExpansion>` | 해당 graph revision에만 merge |
| Resource detail | `resources.get` | snapshotId, graphRevision, nodeId, expansion flags | `ConsumerEnvelope<ResourceNodeDetail>` | node change 시 invalidate, inspector background refresh |
| Insights | `gitops.insights.list` | `InsightQuery` | `ConsumerEnvelope<CursorPage<GitOpsInsight>>` | timeline/operation event 후 targeted invalidate |
| History | `gitops.history.list` | `RevisionHistoryQuery` | `ConsumerEnvelope<CursorPage<RevisionHistoryEntry>>` | terminal operation 후 invalidate |
| Timeline history | `timeline.list` | `TimelinePageRequest` | `ConsumerEnvelope<TimelinePage>` | page의 queryId/hash/liveStart로 atomic cutover |
| Timeline live | `timeline.stream` | queryId + canonicalQueryHash + full `ResumeCursor` | `TimelineStreamEnvelope` | resume stream; poll mode는 sinceCursor 사용 |
| Metric catalog | `metrics.catalog` | `MetricCatalogQuery` | `ConsumerEnvelope<MetricCatalog>` | source/capability revision에 따라 refresh |
| Metric query | `metrics.query` | `MetricQuery` | `ConsumerEnvelope<MetricResult>` | v1 synchronous/cancellable; instant interval/range revalidate |
| Topology snapshot | `topology.snapshot` | `TopologyQuery` | `ConsumerEnvelope<ResourceGraphSnapshot>` | `streamStart` mode에 따라 stream/poll/static |
| Topology expansion | `topology.expand` | graph expansion query | graph expansion DTO | current revision에만 merge |
| Topology stream | `topology.stream` | queryHash, snapshotId, full `GraphStreamCursor` | `ResourceGraphStreamEnvelope` | primary realtime; poll/static mode에서는 열지 않음 |
| Metric overlay | `topology.metrics` | graphRevision + MetricQuery | `ConsumerEnvelope<TopologyMetricOverlay>` | metric freshness policy; graph revision mismatch discard |
| Operation submit | `operations.submit` | `GitOpsOperationRequest`; body idempotencyKey가 semantic authority | `GitOpsOperationReceipt` (202) | receipt cursor로 stream/poll 시작 |
| Operation status | `operations.get` | operationId, optional statusVersion | `ConsumerEnvelope<GitOpsOperationStatus>` | stream fallback polling |
| Operation events | `operations.stream` | operationId, resumeToken | `GitOpsOperationEvent` | resume 가능한 ordered stream |
| Approval decision | `approvals.decide` | approvalId, decision, version, idempotencyKey | operation/decision receipt (202) | operation/approval stream |

### 13.3 Cursor, filter, sort 불변조건

- 모든 `*Query`의 filter 배열에서 `[]`는 해당 facet 제약 없음이다. zero-match를 뜻하지 않는다. filter object 자체가 존재하는 `MetricFilter`/`TopologyFilter`의 values는 non-empty이며 제약을 제거하려면 object를 제거한다.
- search의 trim 결과가 빈 문자열이면 canonical null이다. server와 client가 같은 normalizer/version을 사용한다.
- page cursor/limit은 projection/filter 의미가 아니라 transport page 의미다. canonical query hash는 cursor/limit을 제외하고 filter/sort/time/scope를 포함한다.
- 모든 list/history/diff/insight query는 opaque cursor를 쓴다. offset pagination은 realtime 변경에서 중복/누락을 만들므로 canonical 계약이 아니다.
- cursor는 normalized filter, sort, authorization scope, projection snapshot revision에 bind한다.
- 동일 facet 안 복수 값은 OR, 서로 다른 facet은 AND다. backend가 다른 의미를 쓰면 response metadata로 명시하는 것이 아니라 OpenAPI 계약을 수정한다.
- sort는 반드시 stable ID tie-break를 포함한다. client가 page를 받은 뒤 전역 재정렬하지 않는다.
- `total`은 exact/estimated/unknown/forbidden을 구분한다. unknown을 0으로 렌더링하지 않는다.
- cursor가 만료되면 기존 page와 scroll anchor를 유지하고 first page 재조회 후 stable ID로 anchor를 복원한다.

### 13.4 Cache key와 invalidation

| Data | Canonical cache key | Invalidation trigger |
|---|---|---|
| scope catalog | workspace + authz revision | session/permission/cluster/binding change |
| application list | workspace + normalized query hash + authz revision | relevant instance projection 또는 operation terminal |
| application detail | applicationId + expansion flags + authz revision | instance/binding/source change |
| instance detail | instanceId + bindingId + authz revision | operation terminal, approval/source/projection change |
| capability | exact target + actor/authz revision + capability revision | access/source/lifecycle/current operation/freshness change |
| diff | instanceId + compared revisions + filter + operation result version | refresh/plan/apply/new desired revision |
| Tree/Topology | queryHash + snapshot/graph revision + authz revision | stream invalidation, scope/query change |
| resource detail | snapshotId + graphRevision + nodeId + flags | node/edge delta affecting node |
| timeline | normalized TimelineQuery + snapshot revision | stream append/correction; page cache remains immutable |
| metrics | canonical MetricQuery hash + catalog revision + authz revision | timer/source revision/operation completion per affected scope |
| operation | operationId + statusVersion | newer stream/statusVersion only |

Invalidate는 cache 삭제와 즉시 blank 화면을 뜻하지 않는다. 이전 data를 stale-while-revalidate로 유지하되 authorization loss/redaction change는 즉시 민감 data를 제거한다.

### 13.5 Latency와 freshness budget

| Consumer | p95 response 목표 | 사용자가 기다리는 동안의 UI | 기본 freshness 정책 |
|---|---:|---|---|
| list/catalog | 500ms | 150ms 이후 skeleton; cached data가 있으면 유지 | server staleAfterMs, target 15s 이내 projection |
| detail/capability | 700ms | header context 보존, panel별 loading | capability는 action 직전 revalidate, detail target 15s |
| graph initial snapshot | 1,500ms | shell/known scope 즉시, 120ms 이후 cancellable pending | stream 연결 시 target 5s; source cut별 표시 |
| graph expansion/node detail | 750ms | 선택/viewport 유지, local pending | base graph revision과 동일해야 함 |
| timeline first page | 700ms | cached page/scroll anchor 유지 | live event 목표 end-to-end 5s, late 표식 별도 |
| metric instant | 1,000ms | 이전 value 유지, refreshing | catalog staleAfterMs; 일반적으로 2× 수집 interval 이하 |
| metric range | 2,500ms | cancellable chart loading/이전 range 유지 | historical immutable, latest bucket만 revalidate |
| operation receipt | 500ms | submit control `요청 전송 중`, 중복 클릭 차단 | receipt 즉시 authoritative |
| operation progress | event p95 2,000ms | stream/poll 연결 상태 표시 | running 동안 status 5s 이상 무관측이면 stale |

이 값은 frontend loading/timeout/diagnostic budget이며 component에 임의 수치로 중복하지 않는다. runtime policy/catalog에서 중앙 제공하고, hard network timeout은 retry/idempotency 정책과 별도로 설정한다. 목표 초과가 곧 실패는 아니며 cancel/retry와 진행 상태를 제공한다.

### 13.6 Payload 확장 전략

- list, history, insight, diff는 cursor page다. page limit은 ScopeCatalog/response policy로 협상한다.
- graph는 initial node/edge budget + node/relation expansion cursor다. 서버 LOD aggregate는 memberCount/completeness/expansion을 포함한다.
- node object, diff structured fields, event detail은 summary와 lazy detail을 분리한다.
- metric은 series당 max 1,500 point 및 response budget을 지키고 server-side downsampling의 effectiveStepMs를 반환한다. 임의 client decimation으로 min/max spike를 제거하지 않는다.
- stream frame은 bounded batch다. 초과 변경은 continuation frame 또는 projection invalidation을 사용하며 giant JSON 하나로 전송하지 않는다.
- redaction은 pagination 전후 모두 적용되어야 하며 hidden item 수가 total/count로 새지 않도록 `totalState="forbidden"`을 허용한다.

### 13.7 HTTP/transport 오류 → UI mapping

| Transport/ApiError | Canonical UI state | 자동 동작 |
|---|---|---|
| abort/cancel | 이전 data 유지, 사용자 오류 없음 | 새 query가 소유권 획득 |
| network offline | disconnected | reconnect/backoff, mutation 새 key 자동 실행 금지 |
| 401 unauthenticated | session expired | session revalidate 후 login |
| 403 permission_denied | no permission/read-only reason | cache의 민감 data 제거, 권한 CTA |
| 404 not_found | target deleted/not found | parent list invalidate; source unavailable로 추정 금지 |
| 409 conflict | idempotency/operation conflict | 같은 key receipt lookup 또는 최신 상태 CTA |
| 412 precondition_failed | stale plan/cursor/approval/capability | 최신 resource/capability 재조회; 입력 보존 |
| 422 invalid_request | field error | fieldErrors를 해당 control에 연결 |
| 429 rate_limited | non-blocking error + countdown | retryAfterMs 이후 read/status만 자동 retry |
| 502/503 source_unavailable | source unavailable 또는 partial | 다른 source data 유지, backoff |
| stale_cursor | stale/refresh required | first-page/snapshot 재동기화 |
| schema_incompatible | incompatible blocking panel | 추측 parse 금지, correlationId 제공 |
| 5xx internal_error | error 또는 background refresh error | retryable만 backoff, 기존 data 유지 |

## 14. Frontend ports, adapters, composition root

### 14.1 Feature ports

```ts
type RequestContext = {
  signal: AbortSignal
  requestId: string
}

interface ApplicationsPort {
  getScopeCatalog(context: RequestContext): Promise<ConsumerEnvelope<ScopeCatalog>>
  listApplications(query: ApplicationListQuery, context: RequestContext): Promise<ConsumerEnvelope<CursorPage<ApplicationSummary>>>
  getApplication(applicationId: string, context: RequestContext): Promise<ConsumerEnvelope<ApplicationDetail>>
  listInstances(query: ApplicationInstanceListQuery, context: RequestContext): Promise<ConsumerEnvelope<CursorPage<ApplicationInstanceSummary>>>
}

interface GitOpsPort {
  getInstance(instanceId: string, bindingId: string, context: RequestContext): Promise<ConsumerEnvelope<ApplicationInstanceDetail>>
  getCapabilities(target: OperationTarget, context: RequestContext): Promise<ConsumerEnvelope<CapabilitySet>>
  listDiffs(query: DiffPageQuery, context: RequestContext): Promise<ConsumerEnvelope<CursorPage<ResourceDiff>>>
  getTree(query: GitOpsTreeQuery, context: RequestContext): Promise<ConsumerEnvelope<ResourceGraphSnapshot>>
  expandTree(query: ResourceGraphExpansionQuery, context: RequestContext): Promise<ConsumerEnvelope<ResourceGraphExpansion>>
  getResourceDetail(snapshotId: string, graphRevision: string, nodeId: string, context: RequestContext): Promise<ConsumerEnvelope<ResourceNodeDetail>>
  listInsights(query: InsightQuery, context: RequestContext): Promise<ConsumerEnvelope<CursorPage<GitOpsInsight>>>
  listHistory(query: RevisionHistoryQuery, context: RequestContext): Promise<ConsumerEnvelope<CursorPage<RevisionHistoryEntry>>>
}

interface TimelinePort {
  list(query: TimelineQuery, context: RequestContext): Promise<ConsumerEnvelope<TimelinePage>>
  stream(queryHash: string, cursor: TimelineCursor, context: RequestContext): AsyncIterable<TimelineStreamEnvelope>
}

interface MetricsPort {
  getCatalog(context: RequestContext): Promise<ConsumerEnvelope<MetricCatalog>>
  query(query: MetricQuery, context: RequestContext): Promise<ConsumerEnvelope<MetricResult>>
}

interface TopologyPort {
  snapshot(query: TopologyQuery, context: RequestContext): Promise<ConsumerEnvelope<ResourceGraphSnapshot>>
  expand(query: ResourceGraphExpansionQuery, context: RequestContext): Promise<ConsumerEnvelope<ResourceGraphExpansion>>
  metricOverlay(snapshotId: string, graphRevision: string, query: MetricQuery, context: RequestContext): Promise<ConsumerEnvelope<TopologyMetricOverlay>>
  stream(queryHash: string, snapshotId: string, resumeToken: string, context: RequestContext): AsyncIterable<ResourceGraphStreamEnvelope>
}

interface OperationsPort {
  submit(request: GitOpsOperationRequest, context: RequestContext): Promise<GitOpsOperationReceipt>
  get(operationId: string, context: RequestContext): Promise<ConsumerEnvelope<GitOpsOperationStatus>>
  stream(operationId: string, resumeToken: string | null, context: RequestContext): AsyncIterable<GitOpsOperationEvent>
}

type ProductPorts = {
  applications: ApplicationsPort
  gitOps: GitOpsPort
  timeline: TimelinePort
  metrics: MetricsPort
  topology: TopologyPort
  operations: OperationsPort
}
```

UI component와 reducer는 URL, fetch, provider SDK를 호출하지 않고 이 ports를 effect를 통해서만 사용한다. runtime schema parse와 transport error mapping은 live adapter 경계에서 수행한다.

### 14.2 Adapter와 data origin

- `Live*Adapter`는 승인된 OpenAPI 이후 구현을 확정하며 모든 unknown JSON을 runtime schema로 검증한다.
- `Synthetic*Adapter`는 동일 port와 동일 contract test suite를 구현한다. dataset, seed, fake clock, capability matrix를 constructor로 주입하고 view/component에 fixture import를 허용하지 않는다.
- synthetic는 `DataOrigin.kind="synthetic"`를 모든 root response/stream/receipt에 넣는다. product shell은 route 전체에 `DEMO DATA` marker를 지속 표시한다.
- replay도 `REPLAY DATA`를 표시하고 live로 오인되는 timestamp/count를 만들지 않는다.
- live adapter failure는 synthetic로 자동 fallback하지 않는다. offline/source unavailable/error 상태로 남는다.
- composition root는 `mode: "live" | "synthetic" | "replay"`를 explicit build/runtime config로 선택한다. mode가 없거나 잘못되면 startup을 실패시키며 추정 default를 쓰지 않는다.
- production build/CI dependency graph는 `Synthetic`, `fixture`, `demoDataset`, testkit import가 product live entry에 도달하면 실패한다.

### 14.3 Composition root 불변조건

```ts
type ProductRuntimeConfig =
  | { mode: "live"; baseUrl: string }
  | { mode: "synthetic"; datasetId: string; seed: string }
  | { mode: "replay"; recordingId: string }

declare function createProductPorts(config: ProductRuntimeConfig): ProductPorts
```

Production release artifact는 live entry만 export한다. 별도 demo entry가 synthetic composition을 import한다. Story/test entry는 testkit을 사용할 수 있다. 동일 화면이 어떤 adapter에서도 DTO 의미를 바꾸지 않으며 provider별 fixture 대신 capability matrix를 조합한다.

## 15. Backend 소비자 계약 우선순위

### 15.1 MUST

Backend/OpenAPI는 다음을 모두 보장해야 한다.

1. Application ↔ Application Instance ↔ Binding ↔ Destination을 opaque stable ID로 직접 연결한다. repository/name/path 유사성으로 binding을 추정하지 않는다.
2. 목록/상세에 typed schema를 제공한다. 자유형 map을 canonical DTO 대신 반환하지 않는다.
3. lifecycle, sync, health, freshness, completeness, access, approval, operation phase를 독립 필드로 유지한다.
4. 모든 collection에 filter/sort-bound opaque cursor, stable ID tie-break, hasMore, total state를 제공한다.
5. capability를 adapter support ∩ applicability ∩ actor permission ∩ target access ∩ source connectivity ∩ freshness/precondition ∩ approval policy ∩ current operation 상태의 교집합으로 서버에서 계산한다.
6. provider 이름을 canonical DTO top-level 분기 필드로 요구하지 않는다. provider metadata/extension은 allowlisted auxiliary object에 격리한다.
7. management read-only write는 approval 생성 전과 operation receipt 생성 전에 capability/read-only error로 일관되게 차단한다. `승인 성공 후 apply 거부` 전이를 허용하지 않는다.
8. 모든 mutation에 idempotency와 202 `GitOpsOperationReceipt`를 제공하고 status query와 resume 가능한 progress stream 또는 동등한 ordered transport를 제공한다.
9. refresh, diff, reconcile plan/apply, suspend, resume, terminate, rollback plan, history, capabilities를 canonical 의미로 제공한다. prune/selective sync는 지원할 때만 capability로 노출한다.
10. apply는 immutable planId+digest를 요구하고 server가 revision, approval, capability, permission, target access를 다시 검증한다.
11. rollback은 history point → immutable rollback plan → approval/confirmation → apply 순서를 지원한다.
12. desired/live resource correspondence와 edge evidence를 backend가 판정한다. frontend가 selector/owner/name으로 authoritative edge를 재구성하게 하지 않는다.
13. graph snapshot과 stream cutoverCursor/epoch/sequence/revision을 일관되게 제공하고 multi-cluster별 cut/access/completeness를 포함한다.
14. Timeline은 immutable eventId/dedupeKey/occurredAt/receivedAt/ingest order, cursor, resume, correction/late event 의미를 제공한다.
15. Metrics는 canonical metric key/scope/unit/aggregation/window/step, decimal string values, source freshness, coverage, missing/zero/forbidden/error를 구분한다. core UI에 raw query language나 endpoint URL을 요구하지 않는다.
16. 모든 read root에 freshness, completeness, data origin, warnings를 제공하고 partial success를 200 + typed completeness로 표현한다.
17. redaction은 name/count/total/edge를 통한 side channel까지 고려하며 Secret/sensitive content를 raw payload에 포함하지 않는다.
18. 401/403/404/409/412/422/429/source unavailable/stale cursor/schema incompatible를 canonical error code로 구분한다.
19. cursor, resume token, operation statusVersion, graph revision은 opaque하며 authorization scope에 bind하고 위조/재사용을 검증한다.
20. OpenAPI의 nullable/required/enum/time/decimal 규칙이 이 문서와 일치하고 generated TypeScript + runtime validator가 같은 schema revision을 사용하게 한다.

### 15.2 SHOULD

1. list/detail/graph/timeline/metric/operation latency와 freshness budget을 관측할 requestId/correlation metadata를 제공한다.
2. graph initial budget, node/relation expansion, metric downsampling, diff chunk pagination으로 큰 payload를 제한한다.
3. stream 불가 환경에서 status/since-cursor polling이 같은 canonical DTO로 수렴하게 한다.
4. capability/metric/scope catalog에 revision과 cache hint를 제공한다.
5. historical snapshot/query를 지원할 경우 live와 같은 identity/redaction/completeness 의미를 유지한다.
6. source별 unavailable/degraded reason을 제공해 한 source 장애가 전체 화면 error가 되지 않게 한다.
7. operation terminal 후 projection revision/freshness 갱신 여부를 결과에 포함해 `명령 성공, 관측 대기`를 표현할 수 있게 한다.
8. event/graph batch를 bounded frame으로 제공하고 backpressure 시 continuation 또는 invalidation 신호를 낸다.

### 15.3 OPTIONAL

1. prune와 selective sync capability 및 plan constraints.
2. historical topology/metric replay.
3. provider extension inspector. core action과 화면은 extension이 없어도 완전하게 작동해야 한다.
4. advanced raw metric query. 별도 capability/permission/sandbox 경계 안에 두고 canonical MetricQuery를 대체하지 않는다.
5. server-suggested recovery/Safe PR/rollout insight. evidence와 explicit operation 없이 자동 실행하지 않는다.

## 16. Provider-specific 누출 검토

허용:

- `GitSourceRef.providerMetadata`와 `ApplicationInstanceSummary.providerDisplayMetadata`의 allowlisted 표시용 문자열.
- opaque connector/source ID와 사용자에게 보여줄 source display name.
- 명시적으로 격리된 optional extension inspector.

금지:

- provider 이름을 switch/if key, route 선택, button availability, status mapping, component selection에 사용.
- core DTO top-level의 provider 전용 revision/status/path/URL/credential 필드.
- raw provider status를 `SyncStatus`, `HealthStatus`, `OperationPhase`로 parse하지 않고 그대로 표시.
- provider endpoint URL, query language, token, webhook payload를 view state에 보관.
- provider별 fixture로 제품 동작을 검증. capability/access/freshness matrix fixture를 사용한다.

Adapter는 provider response를 이 canonical contract로 변환할 수 없으면 `unknown`, `partial`, `unsupported`, `source_unavailable` 중 정확한 상태를 반환한다. 값이나 capability를 추측하지 않는다.

## 17. 품질과 검증 계약

### 17.1 TypeScript/runtime

- `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `noImplicitReturns`, `verbatimModuleSyntax`를 켠다.
- branded/opaque ID는 wire에서 string이지만 parsing 후 domain별 brand를 적용해 applicationId/bindingId/operationId 오사용을 compile-time에 줄인다.
- network JSON은 `unknown`에서 versioned runtime schema로 parse한다. `as Type` 단언으로 boundary를 통과하지 않는다.
- DecimalString은 finite canonical decimal grammar를 검증하고 JS binary float로 합계/비교하지 않는다.
- Date parse는 RFC 3339 offset을 검증하고 invalid date를 `unknown freshness`로 조용히 바꾸지 않고 schema error로 처리한다.

### 17.2 동일 adapter contract suite

Live와 Synthetic adapter는 같은 port contract suite를 통과해야 한다.

| Suite | 필수 사례 |
|---|---|
| schema | required/nullable/optional, enum exhaustiveness, unknown key policy, decimal/time validation |
| identity | rename/recreate/revision change, application-instance-binding direct linkage, multi-cluster same name |
| pagination | stable sort, cursor filter bind, insert/delete 사이 중복 없음, stale cursor |
| capabilities | applicable/support/permission/access/connectivity/freshness/approval/current-operation 조합 |
| state | loading/refresh/empty/forbidden/partial/stale/disconnected/unavailable/read-only/unsupported 전부 |
| operation | idempotent retry, key collision, pending approval, terminal failure, delayed projection, terminate race |
| stream | duplicate, late, out-of-order, gap, epoch change, resume expiry, snapshot cutover |
| graph | restricted peer, partial cluster, expansion revision conflict, 8k/12k visible budget, aggregate expansion |
| metrics | zero/missing/forbidden/source error, mixed unit rejection, partial coverage, stale source, 1,500-point bound |
| security | Secret/diff redaction, HTML/script text, URL allowlist, cache purge on permission loss |
| accessibility | keyboard/roving focus, screen reader status, 44px touch target, focus restore, reduced motion |

### 17.3 Canonical capability matrix fixture

Fixture 축은 provider가 아니라 다음 canonical 값이다.

- applicable true/false.
- supported true/false.
- permitted true/false.
- target read_write/read_only.
- source available/degraded/unavailable.
- freshness fresh/stale/unknown.
- approval not_required/pending/approved/rejected/expired.
- operation idle/pending/running/terminal.
- completeness complete/partial/forbidden.

모든 P0 경계와 pairwise 조합을 실행하고, write+read_only, unsupported+visible, hidden+forbidden, approval+stale plan, terminate+already terminal은 전용 case로 고정한다.

### 17.4 Production synthetic 차단

- live product entry dependency graph에 `Synthetic*Adapter`, dataset, fixture, seeded generator, fake clock import가 0건인지 CI가 검사한다.
- live runtime config에서 `mode=synthetic/replay`를 허용하지 않는다. demo/replay는 별도 entry/artifact다.
- live failure를 catch하여 demo를 반환하는 코드 pattern을 lint/architecture test로 금지한다.
- synthetic response에는 모든 root/stream/receipt에 synthetic DataOrigin이 있어야 하며 shell marker가 사라지는 route가 없어야 한다.

### 17.5 Interaction, accessibility, performance

- 모든 click path는 dispatch → reducer → effect → port의 단일 경로를 사용하고 handler/permission/loading/error/focus test를 가진다.
- operation action, Tree/Topology node, timeline row, metric series는 keyboard로 선택·확장·복귀 가능하다.
- stream update는 screen reader에 매 frame announce하지 않고 중요 terminal/approval/connection 상태를 throttled live region으로 알린다.
- reduced motion에서 정보/URL/focus 결과는 같고 spatial transform/particle/infinite animation만 제거한다.
- 390/768/1440과 container breakpoint에서 list/detail/graph/inspector/operation tray를 검증한다.
- large graph/metric/event/out-of-order test는 frame budget, memory bound, cancellation, stale result discard를 확인한다.
- 문서와 UI visible 용어는 일관된 한국어 명사형(`애플리케이션`, `배포 인스턴스`, `바인딩`, `동기화`, `상태`, `최신성`, `승인`, `작업`, `읽기 전용`)을 사용한다.

## 18. 결정 상태와 OpenAPI acceptance

### 18.1 아직 결정되지 않은 질문

프론트 사용자 의미, DTO nullable 규칙, 상태 전이, action, cursor, stream ordering, stale/partial/redaction, adapter 경계에는 미결 질문이 없다.

다음은 backend가 선택할 수 있는 구현 세부이며 프론트 계약의 미정의가 아니다.

- REST route naming과 grouping.
- SSE, WebSocket, gRPC-web 중 stream transport.
- storage/table/index/queue/worker 구조.
- provider adapter 내부 mapping과 credential 처리.
- budget을 만족하는 compression/serialization 방식.

어떤 선택도 이 문서의 canonical DTO와 의미, atomic cutover, resume/idempotency, capability 판정을 바꿀 수 없다.

### 18.2 OpenAPI 수신 후 검증 체크리스트

1. 모든 required DTO와 enum이 generated TypeScript/runtime schema에 존재한다.
2. optional과 nullable이 §1 규칙대로 구분되고 빈 문자열/0으로 missing을 대체하지 않는다.
3. applicationId-instanceId-bindingId-destinationId가 직접 연결되고 mutation target이 exact binding이다.
4. list/filter/sort/cursor/totalState가 모든 collection에 일관된다.
5. provider-specific top-level field와 provider-name operation 분기가 없다.
6. capability에 applicability/support/permission/enabled/visibility/effects/approval/confirmation/constraints/reason/revision이 있다.
7. management read-only write가 approval/receipt 전에 차단된다.
8. operation 202 receipt, status, progress/resume, idempotency, terminal states, poll fallback이 있다.
9. planId/digest/expiry/approval과 rollback plan flow가 있다.
10. graph node/edge identity/evidence/completeness/redaction/expansion과 snapshot-stream cut이 있다.
11. Timeline cursor/order/dedupe/late/correction/resume가 있다.
12. Metrics decimal/unit/scope/window/step/source/freshness/coverage/missing state가 있다.
13. HTTP error가 canonical ApiError로 손실 없이 mapping된다.
14. payload budget, page/expansion/downsampling, cancellation 식별자가 있다.
15. DataOrigin이 live root/stream/receipt에 있으며 synthetic/replay와 같은 union을 쓴다.
16. generated contract test가 Synthetic adapter suite와 동일한 semantic fixture를 통과한다.

하나라도 충족하지 않으면 `[OPENAPI_CHANGES_REQUIRED]`이며 live adapter를 확정하지 않는다. 모두 충족하고 contract tests가 통과한 경우에만 `[OPENAPI_ACCEPTED]`다.

### 18.3 Synthetic adapter로 선행 가능한 범위

- Applications/GitOps list/detail, binding selector, 검색/filter/sort/cursor UX.
- Tree/Insights snapshot/expansion/node inspector와 partial/stale/restricted 상태.
- Timeline page/live event/reconnect/out-of-order UI.
- Metrics catalog/query/coverage/source/freshness/취소 UI.
- Topology snapshot/delta/metric overlay/lens/drill-down/cross-navigation.
- 모든 operation receipt/progress/approval/terminal/recovery flow.
- management read-only와 capability hide/disabled reason.
- light/dark/high-contrast/reduced-motion/keyboard/large payload 테스트.

단, synthetic-only 통과는 live contract 완료가 아니며 demo entry에서만 실행한다. `[OPENAPI_ACCEPTED]` 전 live adapter endpoint/schema를 고정하지 않는다.

## 19. 요구사항 추적표

| 요구 영역 | Authoritative section |
|---|---|
| Applications | §4, §12, §13 |
| GitOps list/detail | §5, §12, §13 |
| Tree/Insights | §6, §12, §13 |
| Timeline | §7, §12, §13 |
| Metrics | §8, §12, §13 |
| Topology | §9 및 `topology-engine.md` |
| Operations/history/capabilities | §10–11 |
| 상태 행렬 | §12 |
| consumer API/cache/error/SLO | §13 |
| ports/live/synthetic/composition | §14 |
| backend MUST/SHOULD/OPTIONAL | §15 |
| provider-neutral 검토 | §16 |
| test/quality | §17 |
| OpenAPI gate | §18 |
