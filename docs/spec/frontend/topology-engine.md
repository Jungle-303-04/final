---
title: Universal Kubernetes Topology Engine Implementation Contract
status: archived — 현재 작업에 참조 금지
owner: frontend-platform
last_verified: 2026-07-11
---

# Universal Kubernetes Topology Engine 구현 계약

## 0. 문서의 권한과 목적

이 문서는 Kubernetes 시각화 제품의 frontend 의미·상태·상호작용·데이터 소비를 정리한 설계 계약 초안이다. 제품 기획 소개가 아니며 backend DTO를 복제하는 문서도 아니다. 현재 repo의 실제 코드와 통과한 테스트가 source of truth이고, 현재 코드에 package, route, schema, renderer, plugin이 없으면 구현 완료가 아니라 후속 작업 기준으로만 읽는다. 계약 변경은 frontend ADR, schema major/minor 판정, migration, test traceability 갱신 없이 허용하지 않는다. 실제 배포 완료는 승인된 OpenAPI, generated runtime schema, 구현 코드, executable test가 모두 통과한 경우에만 주장한다.

함께 읽는 부속 계약:

- `product-data-contract.md`: Applications/GitOps/Tree/Timeline/Metrics/Topology/operation의 제품 consumer contract.
- `topology-message-action-schema.md`: message/reducer/effect/snapshot/delta/action wire protocol.
- `topology-visual-motion-tokens.md`: light/dark/high-contrast, geometry, gesture, motion, renderer handoff의 수치 계약.

구현할 때는 제품 사용자 의미를 `product-data-contract.md`, protocol type/ordering을 message adjunct, visual/motion 수치를 visual adjunct에서 추적한다. 실제 충돌 판정은 현재 코드와 통과한 테스트, 승인된 schema 변경 절차를 기준으로 한다.

이 문서가 고정하는 결과는 다음과 같다.

1. Cluster → Node → Pod → Container 실행 위치를 중첩 Treemap으로 표현한다.
2. 실행 위치와 Service, Ingress/Gateway, Workload controller, 설정, 스토리지, 정책, GitOps, 실제 트래픽 관계를 서로 다른 relation plane으로 보존한다.
3. Scope를 확대해도 같은 리소스 UID는 같은 시각 객체로 유지한다.
4. placement map cube를 focus-Sankey로 전체 재투영하고, 지원 capability가 있을 때만 좌우 relation rail/fold를 보조 전환으로 제공한다.
5. 모든 설치된 Kubernetes GVK와 CRD를 discovery 기반으로 generic하게 표시하고, 의미를 아는 종류는 plugin으로 보강한다.
6. AWS, GCP, Azure, 온프레미스, bare metal, k3s, kind, minikube를 동일한 core 계약으로 처리한다.
7. CPU, memory, storage, cost 등 합산 가능한 metric으로 면적을 계산하고, 복수 metric은 무차원 composite score로만 결합한다.
8. 모든 사용자 입력과 외부 delta는 하나의 `dispatch(EngineMessage)` 경로로 처리한다.
9. 실시간 갱신, 풍부한 motion, light/dark/high-contrast, reduced-motion, RBAC, partial/stale/error 상태를 정상 상태로 취급한다.
10. view code의 domain hardcoding을 금지하고 독립 판매 가능한 headless engine과 renderer package로 분리한다.

`오류가 없어야 한다`는 요구는 테스트 없이 무결함을 선언한다는 뜻이 아니다. 허용되는 상태를 타입으로 닫고, 정의되지 않은 입력은 planner 또는 schema boundary에서 거부하며, property/fuzz/visual/performance/chaos gate가 모두 통과해야 release할 수 있다는 뜻이다.

## 1. 비협상 불변조건

### 1.1 실행 계층 불변조건

- 공간적 포함 관계는 `Cluster → Node → Pod → Container`뿐이다.
- Cluster는 플랫폼 entity이며 Kubernetes API object가 아니다.
- Pod는 Node에 `spec.nodeName`으로 배치한다.
- 미스케줄 Pod는 가짜 Node를 만들지 않고 Cluster의 `Unscheduled` projection에 둔다.
- 정상 PodSpec에는 regular container가 최소 1개 존재하고 여러 개일 수 있다. init container와 ephemeral container는 0개 이상이다. restartable sidecar는 별도 container type이 아니라 Kubernetes sidecar semantics를 가진 init container이므로 `containerType=init`과 `restartPolicy=Always` 의미를 함께 보존한다. Pod와 Container를 1:1로 가정하지 않는다.
- Service, Deployment, ReplicaSet, ConfigMap, Secret, PVC, Git repository는 Node 또는 Pod의 공간적 자식이 아니다.
- 모든 parent 면적은 같은 metric universe에서 보이는 descendant leaf 면적의 정확한 합이어야 한다.

### 1.2 관계 불변조건

- 하나의 canonical directed edge만 저장한다. 역방향 표시는 renderer가 계산하며 inverse edge를 중복 저장하지 않는다.
- `Service selector가 Pod를 선택함`, `EndpointSlice에 Pod가 실재함`, `트래픽이 관측됨`은 서로 다른 edge다.
- ownership, placement, dependency edge의 두께는 수량을 뜻하지 않는다.
- canonical relation 중에는 traffic edge만 정량적 width/particle encoding을 사용할 수 있다. `focus-face-connector`는 relation/traffic edge가 아닌 presentation geometry이며 face 결합 높이를 사용할 수 있다.
- 근거가 없는 관계를 이름 prefix만으로 확정하지 않는다.
- 관계마다 evidence, authority, state, observed time을 가진다.
- 해석할 수 없는 참조는 삭제하지 않고 explicit placeholder로 남긴다.
- 권한이 없는 peer는 explicit-reference redaction policy를 통과한 경우만 restricted placeholder로 축약한다. 추론으로만 발견한 hidden peer는 entity/edge/count를 만들지 않는다.

### 1.3 식별자 불변조건

- Kubernetes resource identity key는 `workspaceId + clusterUid + metadata.uid`다. API version은 identity가 아니다.
- 동일 이름으로 재생성된 resource는 새 UID이므로 새 entity다.
- Container identity는 `podEntityKey + containerType + containerName`이다.
- Cluster identity는 provider ARN이 아니라 플랫폼 발급 `clusterUid`다.
- API object가 UID 없이 들어오면 resource boundary validation을 실패시킨다. 이름만 있는 참조는 resource로 위장하지 않고 placeholder ref로 보존하고, UID가 확인되면 명시적 resolution event를 발생시킨다.
- label, display name, namespace/name 문자열은 identity가 아니다.

### 1.4 Metric 불변조건

- Treemap area는 0 이상의 합산 가능한 절대값 또는 명시된 무차원 composite score다.
- percentage, ratio, percentile, health score를 물리 면적으로 직접 사용하지 않는다.
- CPU core와 byte, cost를 raw sum하지 않는다.
- metric의 presence, freshness, completeness, access, support, error는 서로 직교하며 하나의 quality enum으로 합치지 않는다.
- missing을 0으로 바꾸지 않는다.
- 사용자 요구에 따라 tile 내부 percentage gauge는 렌더링하지 않는다.
- 공유 PVC, shared cost, Service 관계 때문에 같은 물리량을 여러 번 합산하지 않는다.

### 1.5 Event 불변조건

- component는 API를 직접 호출하거나 engine state를 직접 수정하지 않는다.
- component는 typed UI intent를 생성하고 오직 `dispatch(EngineMessage)`를 호출한다.
- 외부 snapshot, delta, metric, flow, layout 결과도 같은 envelope를 거친다.
- reducer는 pure하고 deterministic하다.
- fetch, stream, worker, persistence, navigation, command 실행은 effect runner만 수행한다.
- transport exactly-once를 주장하지 않는다. at-least-once transport와 idempotent reducer로 effectively-once application을 제공한다.
- sequence gap, epoch change, schema mismatch는 조용히 무시하지 않고 resync state로 전환한다.

### 1.6 범용성 불변조건

- core package는 AWS, EKS, ARN, ELB, CloudWatch를 알지 못한다.
- cloud/vendor integration은 capability adapter로만 등록한다.
- provider가 없거나 로컬 cluster이면 core 기능이 정상 동작하고 vendor 기능만 `unsupported`가 된다.
- resource kind, metric, relation, health, action, detail panel, route는 registry에서 온다.
- CRD는 설치되지 않았다는 이유로 오류가 아니며, 설치된 CRD는 generic renderer로 최소 표시 가능해야 한다.

## 2. Hardcoding의 정확한 정의

### 2.1 금지되는 hardcoding

다음 값이 React component, CSS selector, renderer branch, event handler 안에 literal로 존재하면 실패다.

- Kubernetes Kind, GVK, GVR, namespace, resource name, cloud provider 이름
- 리소스 수와 sample resource
- relation source/target 조합
- metric ID, PromQL, 단위, reducer, window
- health status 이름과 색상 mapping
- node coordinate, tile size, Sankey width, layer gap
- 대규모 cluster threshold, grouping count, animation duration
- API URL, route, permission, action payload
- 제품 상태를 성공으로 보이게 만드는 fixture/fallback

### 2.2 허용되는 중앙 계약

다음은 hardcoding이 아니라 versioned protocol 또는 configuration이다.

- schema가 생성한 discriminant와 enum
- engine package가 소유한 semantic primitive
- server-provided catalog와 capability
- injected `EngineConfig`, theme token, motion token, layout policy
- Kubernetes 표준 field를 읽는 versioned extractor plugin
- product tree 밖 test runner의 pure generator와 network-boundary fixture. runtime gateway/adapter나 product composition binding으로 재사용할 수 없음

허용되는 literal도 view에 중복하지 않는다. schema generator 또는 한 registry source에서 생성하고 exhaustiveness test로 보호한다.

## 3. 용어

| 용어 | 정의 |
|---|---|
| Entity | 화면에서 identity를 유지하는 resource, projection, external, placeholder |
| Resource | API server 또는 provider가 UID와 함께 제공하는 실제 객체 |
| Projection | PodGroup, Unscheduled, Missing data rail처럼 계산된 객체 |
| Scope | 현재 포함 계층의 범위: fleet, cluster, node, pod |
| Lens | 같은 entity를 다른 관계 기준으로 재배치하는 관점 |
| Presentation mode | 같은 query/projection 위에서 map, focus-Sankey, fold-lens 중 하나를 선택하는 상호작용 상태 |
| Plane | placement, ownership, network 등 관계의 의미 축 |
| Frame | 서로 다른 source의 시간과 completeness를 함께 고정한 투영 응답 |
| Catalog | resource, relation, metric, renderer, action capability 목록 |
| Query AST | Query Bar가 생성하고 URL/API가 공유하는 canonical typed query |
| LOD | 정보를 버리지 않는 집계 projection과 expansion token |
| Rail | Treemap 바깥에서 관계 entity를 정렬하는 좌우 영역 |
| Focus face connector | focus-Sankey에서 health partition과 member 집합을 잇는 표현 전용 기하 ribbon. canonical relation이나 traffic 양이 아님 |

## 4. 제품 의미 모델

### 4.1 Entity class

```ts
type EntityClass = "platform" | "resource" | "embedded" | "projection" | "external" | "placeholder"

type CanonicalGvk = {
  group: string
  version: string
  kind: string
}

type CanonicalGvkPattern = {
  group: string
  kind: string
  versions: "any-served" | readonly string[]
}

type CanonicalGroupKind = {
  group: string
  kind: string
}

type KubernetesResourceIdentity = {
  workspaceId: string
  clusterUid: string
  uid: string
  canonicalGroupKind: CanonicalGroupKind
  servedGvk: CanonicalGvk
  namespace?: string
  name: string
}

type PlatformIdentity = {
  workspaceId: string
  platformKind: "cluster"
  uid: string
}

type EmbeddedIdentity = {
  parentEntityKey: string
  embeddedKind: "container" | "endpoint" | "port" | "condition"
  stableKey: string
}

type EntityRef =
  | { entityKey: string; entityClass: "platform"; identity: PlatformIdentity }
  | { entityKey: string; entityClass: "resource"; identity: KubernetesResourceIdentity }
  | { entityKey: string; entityClass: "embedded"; identity: EmbeddedIdentity }
  | { entityKey: string; entityClass: "projection"; projectionKey: string }
  | { entityKey: string; entityClass: "external"; externalKey: string }
  | {
      entityKey: string
      entityClass: "placeholder"
      placeholderReason: "unresolved" | "restricted" | "deleted" | "not-collected"
      unresolvedCoordinate?: { group?: string; kind?: string; namespace?: string; name?: string }
    }
```

동일 Kubernetes object가 `extensions/v1beta1`, `apps/v1`처럼 다른 served version으로 관측되어도 metadata.uid가 같으면 entity는 하나다. `servedGvk`는 현재 표현/decoder 선택용이고 key material이 아니다. UID uniqueness scope는 cluster이므로 workspace와 cluster를 함께 key에 넣는다. Cluster는 Kubernetes resource가 아니라 `platform` entity다.

Container는 `embeddedKind=container`, `parentEntityKey=Pod entityKey`, `stableKey=containerType + containerName`을 사용한다. EndpointSlice endpoint도 `embeddedKind=endpoint`를 사용한다. Embedded entity는 독립 Kubernetes UID나 CRUD route가 없고 parent revision/evidence에서 생명주기를 얻는다.

- `PlatformIdentity.uid`는 Scope와 모든 entity의 `clusterUid`에 사용하는 동일한 플랫폼 cluster UID다.
- placeholder가 resource로 확인되면 `entity.resolutionCommitted {placeholderKey, resourceKey, evidenceId}`를 dispatch한다.
- reducer는 relation endpoint를 resourceKey로 교체하고, focus/selection을 resourceKey로 이전하며, placeholder를 tombstone 처리한다.
- 이름만 같은 것은 resolution evidence가 아니다. UID 또는 authoritative targetRef/lookup 결과가 필요하다.
- alias map은 current stream epoch 동안만 유지하고 anti-entropy snapshot 이후 compact한다.

`PodGroup`은 Kubernetes Kind가 아니다. `entityClass: "projection"`이며 Pod count와 별도로 집계한다. UI는 `Pods 112 · rendered as 14 groups`처럼 total과 rendered count를 구분한다. Pod와 PodGroup을 더해 126으로 표시하는 것은 금지한다.

### 4.2 Canonical relation

```ts
type RelationPlane =
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

type RelationAuthority = "authoritative" | "derived" | "heuristic"
type RelationConditions = {
  configuration: "configured" | "not-configured" | "not-applicable" | "unknown"
  admission: "accepted" | "rejected" | "not-applicable" | "unknown"
  readiness: "ready" | "not-ready" | "not-applicable" | "unknown"
  activity: "active" | "inactive" | "not-applicable" | "unknown"
  resolution: "resolved" | "unresolved" | "unknown"
  access: "allowed" | "restricted"
  freshness: "fresh" | "stale" | "unknown"
}

type RelationClaim = {
  claimId: string
  providerId: string
  authority: RelationAuthority
  conditions: RelationConditions
  evidenceIds: readonly string[]
  observedAt: string
  attributes: Readonly<Record<string, JsonValue>>
}

type EffectiveRelationAssessment = {
  authority: RelationAuthority
  conditions: RelationConditions
  resolverPolicyId: string
  conflictAxes: readonly (keyof RelationConditions)[]
}

type CanonicalRelation = {
  relationKey: string
  plane: RelationPlane
  relationType: string
  source: EntityRef
  target: EntityRef
  portKey?: string
  protocol?: string
  relationQualifier?: string
  claims: readonly RelationClaim[]
  effective: EffectiveRelationAssessment
  evidence: readonly EvidenceRef[]
  observedAt: string
  validFrom?: string
  validUntil?: string
  attributes: Readonly<Record<string, JsonValue>>
}
```

`relationType`은 server catalog에서 온다. renderer는 unknown type도 plane의 generic style로 표시한다.

Relation conditions는 직교한다. Gateway relation은 동시에 `configured + accepted + ready + active + resolved + allowed + fresh`일 수 있다. 하나의 lifecycle/state union으로 합쳐 서로 덮어쓰지 않는다.

Relation key는 `plane + relationType + source.entityKey + target.entityKey + portKey + protocol + relationQualifier`의 canonical encoding을 hash해 만든다. claim, evidence, timestamp, 상태는 key에 넣지 않는다.

여러 provider claim의 effective assessment 규칙:

1. restricted claim은 redaction policy를 먼저 적용한다.
2. fresh claim을 stale claim보다 우선한다.
3. authority는 authoritative > derived > heuristic 순이다.
4. 가장 높은 동일 authority의 claim들이 한 axis에서 동의하면 그 값을 사용한다.
5. 동급 claim이 충돌하면 해당 effective axis를 `unknown`으로 하고 `conflictAxes`와 warning을 남긴다.
6. evidence와 모든 claim은 inspector에 보존한다. effective 값만 보고 원 claim을 삭제하지 않는다.

### 4.3 Relation plane의 canonical 방향

| Plane | Canonical 방향 | 예 |
|---|---|---|
| placement | container → parent | Container → Pod, Pod → Node, Node → Cluster |
| ownership | owner → dependent | Deployment → ReplicaSet → Pod |
| network-configured | route/client → backend declaration | HTTPRoute → Service, Service → selected Pod |
| network-effective | route/service → effective endpoint | Service → EndpointSlice endpoint → Pod/IP |
| network-observed | observed source → observed destination | Pod/Workload → Service/Pod/External |
| dependency | consumer → dependency | Pod → ConfigMap/Secret/ServiceAccount |
| storage | consumer → claim/backing | Pod → PVC → PV → StorageClass |
| scaling-policy | policy → scale target | HPA/KEDA → Deployment |
| policy-security | security policy/binding → selected or bound subject | NetworkPolicy/RBAC → subject/scope |
| policy-availability | availability policy → selected workload | PDB → workload/Pods |
| policy-governance | quota/constraint → namespace or selected subject | Quota/LimitRange → scope |
| gitops-provenance | declaration → managed target | Git revision → Argo/Flux object → Workload |

UI가 오른쪽 rail에서 `Pod ← ReplicaSet ← Deployment`로 보이게 하더라도 stored edge는 owner → dependent 방향을 유지한다.

### 4.4 공통 primitive

```ts
type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue }

type TopologyCursorPage<T> = {
  items: readonly T[]
  nextCursor: string | null
  hasMore: boolean
  snapshotRevision: string
}

type TimeWindow = {
  asOf: string
  start: string
  end: string
  stepMs?: number
}

type EvidenceRef = {
  evidenceId: string
  sourceId: string
  sourceRef: string
  authority: RelationAuthority
  observedAt: string
  resourceVersion?: string
  window?: TimeWindow
}

type SourceLifecycle =
  | "discovering"
  | "listing"
  | "watching"
  | "ready"
  | "error"

type SourceWatermark = {
  sourceId: string
  lifecycle: SourceLifecycle
  implementation: "supported" | "unsupported"
  installation: "installed" | "not-installed" | "unknown"
  access: "allowed" | "forbidden"
  availability: "available" | "partial" | "unavailable" | "error"
  freshness: "fresh" | "stale" | "unknown"
  completeness: "complete" | "partial" | "unknown"
  observedAt?: string
  lastSuccessAt?: string
  window?: TimeWindow
  ageMs?: number
  maxAgeMs?: number
  coverageCount?: number
  eligibleCount?: number
  reason?: string
}

type CompletenessSummary = {
  completeness: "complete" | "partial" | "unknown"
  access: "allowed" | "limited" | "forbidden"
  sources: readonly SourceWatermark[]
}

type StructuredWarning = {
  warningKey: string
  code: string
  severity: "info" | "warning" | "error"
  message: string
  entityKeys?: readonly string[]
  sourceIds?: readonly string[]
}

type StructuredError = {
  code: string
  scope: "catalog" | "query" | "snapshot" | "stream" | "layout" | "action" | "effect"
  recoverable: boolean
  message: string
  retryAfterMs?: number
  causeRef?: string
}

type RestrictedBoundaryMarker = {
  boundaryKey: string
  sourceEntityKey: string
  plane: RelationPlane
  direction: "incoming" | "outgoing" | "unknown"
  policyId: string
  messageKey: string
}

type Entity = {
  ref: EntityRef
  displayName: string
  kindLabel: string
  membershipRole: "primary" | "ancestor-context" | "relation-context" | "filtered-remainder" | "structural-shelf"
  lifecycle: "live" | "deleting" | "tombstone-exit" | "historical"
  parentEntityKey?: string
  ownHealth?: TopologyHealthVerdict
  aggregateHealth?: AggregateHealth
  attributes: Readonly<Record<string, JsonValue>>
  observedAt: string
}

type Rollup = {
  parentEntityKey: string
  metricId: string
  valueDecimal: DecimalString | null
  unitId: UnitId
  childCount: number
  observedLeafCount: number
  expectedAuthorizedLeafCount: number
  status: MetricStatus
}
```

ISO timestamp는 timezone offset을 포함하고 server에서 UTC로 canonicalize한다. number는 finite인지 runtime schema에서 검증한다. 모든 ID는 실제 구현에서 branded string으로 생성해 서로 대입되지 않게 한다.

## 5. 패키지 경계

최종 구현은 제품 페이지 안에 거대한 component로 만들지 않는다. 아래 이름은 추출 가능한 논리 모듈 경계이며 현재 Vite repo에 즉시 별도 workspace package/monorepo를 만든다는 뜻이 아니다.

```text
@product/topology-contracts
  ├─ generated schemas, branded IDs, envelopes, catalogs
  ↓
@product/topology-core
  ├─ pure reducer, normalized store, selectors, effect descriptions
  ├─ no React, DOM, fetch, CSS
  ↓
@product/topology-query
  ├─ parser, AST, canonicalizer, type checker, URL codec
  ├─ no React, DOM, fetch
  ↓
@product/topology-kubernetes
  ├─ GVK registry, extractors, health/relationship plugins
  ↓
@product/topology-metrics
  ├─ dimensions, units, rollups, composite evaluator
  ↓
@product/topology-layout-worker
  ├─ treemap, rail, bundle, LOD layout in Worker
  ↓
@product/topology-renderer
  ├─ SVG/Canvas/WebGL adaptive scene renderer
  ↓
@product/topology-react
  ├─ provider, hooks, accessible controls, intent adapters
  ↓
@product/topology-theme
  ├─ semantic tokens, light/dark/high-contrast/motion
  ↓
tests/topology (product tree 밖)
  └─ pure generators, fake clock, stream chaos, test-runner network fixtures; runtime adapter 없음

references/ui-layer-lab/src/product/features/topology
  └─ product composition only; no domain rules
```

현재 repo mapping은 다음으로 고정한다.

| 논리 모듈 | 현재 경로 | 허용 import |
|---|---|---|
| contracts | `src/product/features/topology/contracts/` | 없음, generated schema primitive만 |
| core | `src/product/features/topology/core/` | contracts |
| query | `src/product/features/topology/query/` | contracts |
| kubernetes registry | `src/product/features/topology/kubernetes/` | contracts |
| metrics | `src/product/features/topology/metrics/` | contracts, query numeric policy |
| layout worker | `src/product/features/topology/layout/` | contracts, core scene input types |
| renderer | `src/product/features/topology/renderer/` | contracts, layout output, injected theme contract |
| React/application | `src/product/features/topology/react/` | feature modules, `product/api` public gateway, `product/shared` |
| actual API adapter | `src/product/api/topology/` | `product/api` schemas/transport, `product/shared` only |
| product theme values | `src/product/styles/tokens.css` | raw colors의 유일한 product source |
| test-only network fixtures | `tests/topology/network-fixtures/` | test runner만 사용; gateway/adapter 구현과 production import 금지 |

이 mapping은 `AGENTS.md`의 `app → pages → features → shared`, `feature → product/api`, `product/api → shared` 방향을 유지한다. `@product/topology-*` physical package 추출은 별도 ADR에서 workspace tool, public API, versioning, license, build를 승인한 뒤에만 수행한다. Headless engine은 product import가 없도록 작성해 추출 가능성을 유지한다.

기존 backend route/Pydantic contract는 현재 구현 사실을 확인하는 근거다. 이 문서의 신규 topology contract가 이미 구현됐다고 주장하지 않으며, 구현 순서는 frontend consumer contract 검토 → backend ADR/OpenAPI → frontend acceptance → generated schema → actual API adapter다. 계약 변경은 schema revision과 함께 승인하고 같은 변경에서 코드·test traceability를 동기화한다.

### 5.1 Dependency rules

- 위 allowed-import 표 밖 역참조를 금지한다. 세로 그림의 배치 순서를 실제 import chain으로 해석하지 않는다.
- `contracts`는 runtime validation schema의 유일한 source다.
- `core`와 `query`는 browser 없이 Node test에서 실행되어야 한다.
- fetch는 product `api` 또는 engine effect adapter에만 존재한다.
- React component가 raw Kubernetes object를 해석하지 않는다.
- renderer가 API response를 직접 읽지 않고 `RenderScene`만 받는다.
- geometry는 worker가 계산하고 typed CSS custom property 또는 typed scene buffer로 전달한다.
- product style은 모든 색·spacing·type·radius·shadow·z-index·motion을 named token으로만 사용한다.

### 5.2 제품 전체 API port와 test-only network fixture 경계

이 절은 topology feature만의 규칙이 아니라 전체 frontend service architecture의 최상위 정책이다. Auth, organization, Fleet, inventory, topology, metrics, RCA, incident, notification, GitOps, repository, workflow, cost, command/action 등 모든 API feature에 적용한다.

- feature의 application/core package가 port interface를 소유한다.
- `references/ui-layer-lab/src/product` runtime은 `product/api`의 actual HTTP adapter만 사용한다.
- composition root에는 actual adapter 하나만 주입한다. dev, preview, query parameter, environment variable로 다른 data adapter를 선택하는 mode를 만들지 않는다.
- view, hook, selector, reducer는 concrete adapter, base URL, fetch, WebSocket, environment variable을 알지 못한다.
- actual API JSON은 generated runtime schema로 validate한 뒤에만 domain message가 된다.
- actual request 실패를 fake success, sample count, fixture object, 임의 empty array로 바꾸지 않는다.
- loading skeleton, blank placeholder, empty-state illustration은 허용하지만 실제 resource/metric처럼 보이는 가짜 이름·숫자·상태는 product code에 둘 수 없다.
- test payload가 필요하면 product tree 밖 `tests/**/network-fixtures`에서 test runner가 actual HTTP boundary를 intercept한다. fixture는 gateway/adapter를 구현하거나 product composition에 bind하지 않는다.
- test-only network fixture 응답도 production runtime schema를 통과해야 하며 product/preview/dev bundle에는 포함하지 않는다.
- production dependency graph, ESLint boundary, bundle scan이 test fixture/MSW import를 차단한다.
- write/command adapter는 read adapter와 분리하고 idempotency/audit/confirmation 규칙을 동일하게 지킨다.

Feature별 runtime port binding은 actual adapter 하나뿐이며 이름은 generated architecture registry에서 관리한다.

```text
SessionGateway          → HttpSessionAdapter
FleetGateway            → HttpFleetAdapter
TopologyGateway         → HttpTopologyGateway
MetricsGateway          → HttpMetricsAdapter
IncidentGateway         → HttpIncidentAdapter
GitOpsGateway           → HttpGitOpsAdapter
NotificationGateway     → HttpNotificationAdapter
CommandGateway          → HttpCommandAdapter
```

backend endpoint/capability가 실제로 없으면 해당 gateway method와 UI surface를 구현·노출하지 않는다. disabled menu나 demo response로 capability 존재를 가장하지 않는다.

### 5.3 Topology port의 구체 계약

제품 component, selector, reducer, renderer에는 fixture, mock, demo object, fallback count를 넣지 않는다. 데이터 요청은 engine effect runner가 다음 port만 호출한다.

Cross-contract import ownership은 다음으로 고정한다.

| Type | Owner/generated module |
|---|---|
| `ConsumerEnvelope`, `DataOrigin`, `DecimalString`, `StatusReason` | `product-data-contract.md` canonical consumer core |
| `OperationReceiptLookupResult`, `OperationStatusCut`, `GitOpsOperationEvent` | `product-data-contract.md` operation core |
| `TopologyMessageV1.*`, `ResumeCursor`, `StreamStart` | `topology-message-action-schema.md` generated protocol module |

이 표의 type을 각 문서나 adapter에서 재선언하지 않는다. generated build는 같은 schema revision의 module import로 연결하고 순환 import가 생기면 common canonical core로 추출한다.

```ts
interface TopologyGateway {
  getCatalog(signal: AbortSignal): Promise<ConsumerEnvelope<TopologyCatalogResponse>>
  plan(query: TopologyPlanQuery, signal: AbortSignal): Promise<ConsumerEnvelope<QueryPlanResponse>>
  getSnapshot(request: TopologySnapshotRequest, signal: AbortSignal): Promise<SnapshotEnvelope>
  openStream(request: StreamSubscription, signal: AbortSignal): AsyncIterable<StreamEnvelope>
  getEntityDetail(request: EntityDetailRequest, signal: AbortSignal): Promise<ConsumerEnvelope<EntityDetail>>
}

type TopologySnapshotRequest = {
  planId: string
  previousFrameId: string | null
}

interface TopologyCommandGateway {
  execute(request: CommandRequest, signal: AbortSignal): Promise<CommandReceipt>
  lookupReceipt(idempotencyKey: string, signal: AbortSignal): Promise<ConsumerEnvelope<OperationReceiptLookupResult>>
  getStatusCut(operationId: string, signal: AbortSignal): Promise<ConsumerEnvelope<OperationStatusCut>>
  watch(operationId: string, cursor: ResumeCursor, signal: AbortSignal): AsyncIterable<GitOpsOperationEvent>
}
```

Product runtime binding은 하나뿐이다.

```text
product composition root
  └─ injects exactly one TopologyGateway
       └─ HttpTopologyGateway        actual /api only
```

강제 규칙:

- `HttpTopologyGateway` 응답만 production runtime schema를 통과해 reducer로 들어간다.
- `references/ui-layer-lab/src/product`의 component, core, query, renderer, composition root는 test fixture/MSW를 import할 수 없다.
- component/environment conditional branch로 data source를 선택하지 않는다.
- actual request 실패 시 error/stale state를 표시하고 다른 data source로 fallback하지 않는다.
- test-only network fixture는 `tests/topology/network-fixtures`에서 actual HTTP boundary를 intercept할 수 있지만 `TopologyGateway` 구현체가 아니며 composition root에 등록할 수 없다.
- fixture scenario는 empty, partial, stale, forbidden, reconnect, gap, malformed payload를 포함할 수 있고 deterministic seed/fake clock을 쓸 수 있다. 해당 fixture는 test runner process와 test bundle 밖으로 나가지 않는다.
- Definition of Done은 actual API contract test와 실제 API E2E를 요구하며 fixture 기반 visual test만으로 통과할 수 없다.

`ProjectionFrame`과 `StreamEnvelope`의 `dataOrigin`은 wire provenance 검증용이다. product runtime은 actual API가 제공하는 origin만 허용하고 다른 origin을 UI mode로 선택하거나 화면 데이터로 병합하지 않는다.

`TopologyGateway`는 Full Topology의 유일한 backend-facing port다. `product-data-contract.md`의 `ResourceGraphFacadePort`는 committed engine/GitOps Tree store를 읽는 frontend projection이며 HTTP/SSE/WebSocket을 열지 않는다. initial snapshot은 `previousFrameId=null`, poll/anti-entropy snapshot은 마지막 committed frameId를 보내고 응답은 항상 검증 가능한 full `SnapshotEnvelope`다. unchanged를 임의 empty frame으로 대체하지 않는다.

## 6. Backend projection architecture

```text
Kubernetes API / Metrics / Cost / Traffic / GitOps / Cloud adapters
                              │
                    Collection & Discovery
                              │
                    Inventory Projection
                              │
                    Relation Projection
                              │
                     Metric Projection
                              │
                       Query Planner
                              │
                  Snapshot + Delta Stream
                              │
                       Frontend Engine
```

### 6.1 Collection & discovery

- cluster마다 독립 cache/epoch를 가진다.
- API discovery에서 list/watch 가능한 GVR을 수집한다.
- typed informer와 dynamic informer 모두 동일한 raw resource envelope로 출력한다.
- initial LIST는 pagination과 `continue` token을 사용한다.
- informer lifecycle은 `discovering | listing | watching | ready | error`이며 support/access/availability/completeness/freshness 축은 별도다.
- timeout을 `ready`로 기록하지 않는다.
- sync 전 empty cache를 실제 empty로 확정하지 않는다.
- watch는 ADDED, MODIFIED, DELETED, BOOKMARK, ERROR를 모두 처리한다.
- `410 Gone`이면 relist하고 새 epoch 또는 continuity marker를 발행한다.
- deletion tombstone, duplicate event, query sequence gap을 처리한다. resourceVersion은 opaque resume/equality token으로만 쓴다.
- Kubernetes `Event` object와 watch lifecycle event를 별개 타입으로 보존한다.

Per-GVR LIST→WATCH continuity:

1. discovery 결과와 entitlement로 수집 GVR을 확정한다.
2. paginated LIST는 하나의 opaque list resourceVersion과 continue chain을 사용해 shadow cache를 만든다.
3. page 사이 변경이 있어도 API server의 consistent-list semantics를 따르고 page 결과를 live cache에 부분 노출하지 않는다.
4. complete LIST의 opaque resourceVersion부터 WATCH를 시작해 LIST 완료와 WATCH 연결 사이 event를 회수한다.
5. watch가 ready되고 buffered event가 연속 적용된 뒤 shadow cache를 해당 GVR의 active cache로 atomic swap한다.
6. continue token 만료, `410 Gone`, compaction이면 불완전 shadow cache를 폐기하고 새 LIST/WATCH epoch를 시작한다.
7. relist 동안 이전 active cache는 stale/partial로 유지하고 새 incomplete cache와 섞지 않는다.
8. BOOKMARK은 cursor만 전진시키며 object mutation을 만들지 않는다.
9. reflector/informer가 이 절차를 구현하더라도 source watermark에 list RV, watch start, sync 완료, relist reason을 노출한다.
10. collector continuity와 query gateway snapshot-stream continuity는 서로 다른 경계이며 둘 다 통과해야 live-complete다.

### 6.2 Inventory projection

- raw object는 UID, GVK, GVR, RV, generation, owners 전체, labels 전체 또는 selector index에 필요한 lossless form을 가진다.
- secrets의 data 값은 수집하거나 전송하지 않는다. metadata와 reference만 처리한다.
- PodSpec은 container requests/limits, init/sidecar semantics, overhead, volumes, service account, scheduling을 보존한다.
- EndpointSlice는 service-name label, address, targetRef UID, nodeName, zone, ready/serving/terminating, hints, ports를 보존한다.
- generic CRD는 metadata, status conditions, owner refs, catalog-safe summary를 보존한다.
- RBAC forbidden과 empty를 구분한다.

Data minimization policy:

- arbitrary discovered GVR의 기본 수집은 Kubernetes metadata content negotiation을 사용한 `PartialObjectMetadata` LIST/WATCH다.
- metadata negotiation을 지원하지 않는 generic GVR은 full object로 자동 fallback하지 않고 metadata capability를 partial/unsupported로 표시한다.
- semantic plugin이 필요한 표준/allowlisted GVK만 최소 권한으로 full typed object를 target-side memory에서 처리한다.
- full object는 target agent 밖으로 raw 전송하지 않고, logging, trace body, cache dump, database, support bundle에 기록하지 않는다.
- projection 전에 field allowlist와 redaction을 적용하고 payload depth/size budget을 검증한다.
- Secret은 항상 metadata-only다. data/stringData/key name/count도 topology API에 수집하지 않는다.
- ConfigMap은 기본 metadata-only다. key count capability는 명시적으로 허용된 target-side summarizer가 값과 key name을 버리고 count만 방출할 때만 available이며, live object/raw payload는 저장하지 않는다.
- Pod의 literal env value, projected token, imagePullSecret 내용, annotation allowlist 밖 값은 projection에서 제거한다.
- arbitrary CRD의 spec/status는 generic renderer가 자동 수집하지 않는다. signed semantic plugin과 admin-granted field policy가 있을 때만 declared path를 projection한다.
- raw object가 validation/redaction 전에 error logging으로 유출되지 않도록 error는 coordinate/UID/hash만 기록한다.

### 6.3 Relation projection

Provider는 다음 interface를 구현한다.

```ts
type RelationContext = {
  frameId: string
  workspaceId: string
  clusterUid: string | null
  inventoryEpoch: string
  entitlementEpoch: string
  observedAt: string
  signal: AbortSignal
  getEntity(entityKey: string): Entity | null
  listEntities(patterns: readonly CanonicalGvkPattern[]): AsyncIterable<Entity>
  lookupByAttribute(catalogFieldId: string, value: JsonPrimitive): AsyncIterable<Entity>
}

type RelationProvider = {
  id: string
  inputGvks: readonly CanonicalGvkPattern[]
  outputRelationTypes: readonly string[]
  extract(context: RelationContext): AsyncIterable<RelationClaimInput>
}

type RelationClaimInput = {
  plane: RelationPlane
  relationType: string
  source: EntityRef
  target: EntityRef
  portKey?: string
  protocol?: string
  relationQualifier?: string
  claim: RelationClaim
  evidence: readonly EvidenceRef[]
}
```

`RelationContext`는 validated/redacted canonical inventory reader다. provider SDK에 raw Kubernetes/client/provider object, credential, unrestricted JSON path, transport handle을 넘기지 않는다. lookup field는 catalog allowlist ID만 받고 결과는 현재 workspace/entitlement universe 안의 entity만 반환한다. abort 후 provider output은 commit하지 않는다.

- `RelationClaimInput`은 key material, claim, evidence를 함께 제공하고 projection layer가 CanonicalRelation을 만든다.
- provider output은 canonical relation key로 dedupe하되 claim은 claimId로 보존한다.
- 두 provider가 같은 관계를 만들면 evidence/claim 배열을 merge하고 effective resolver가 condition 충돌을 명시한다.
- network configured/effective/observed는 merge하지 않는다.
- heuristic은 authoritative evidence를 덮어쓰지 않는다.

### 6.4 Metric projection

- raw samples를 metric catalog의 canonical unit으로 변환한다.
- 동일 window/asOf를 공유하는 frame에 조인한다.
- spec request, live usage, cost allocation, flow는 source time이 다름을 보존한다.
- 최신값만 남기더라도 `observedAt`, `window`, `status`, `maxAge`를 잃지 않는다.
- cost rollup은 하나의 canonical CostFact ledger에서 계산한다. Pod allocation뿐 아니라 shared/idle/asset/unallocated fact를 보존한다.

### 6.5 Coherent ProjectionFrame

Kubernetes inventory, Prometheus window, OpenCost window, flow stream은 원자적으로 같은 시점에 존재하지 않는다. API는 거짓 atomic snapshot을 주장하지 않고 다음 frame을 반환한다.

```ts
type ProjectionFrame = {
  schemaVersion: string
  frameId: string
  dataOrigin: DataOrigin
  hashes: Pick<QueryHashes, "dataQueryHash" | "projectionHash">
  streamStart: StreamStart
  clusterCuts: readonly ClusterCut[]
  emittedAt: string
  effectiveWindow: TimeWindow
  sources: Record<string, SourceWatermark>
  completeness: CompletenessSummary
  entities: readonly Entity[]
  relations: readonly CanonicalRelation[]
  restrictedBoundaries: readonly RestrictedBoundaryMarker[]
  metricValues: readonly MetricValue[]
  flowValues: readonly FlowValue[]
  sizeValues: readonly ComputedSizeValue[]
  rollups: readonly Rollup[]
  warnings: readonly StructuredWarning[]
}

type StreamSubscription = {
  queryId: string
  resumeCursor: ResumeCursor
  expectedDataQueryHash: string
  expectedProjectionHash: string
}

type ClusterCut = {
  clusterUid: string
  access: "full" | "partial" | "restricted" | "unavailable"
  inventoryEpoch: string | null
  projectionRevision: string | null
  resourceCursors: Readonly<Record<string, string>>
  sourceWatermarks: readonly SourceWatermark[]
  reason: StatusReason | null
}
```

ClusterCut full은 inventoryEpoch/projectionRevision이 non-null이고 reason=null이다. partial은 관측 revision과 non-null reason을 가진다. restricted/unavailable은 두 revision이 null, resourceCursors/sourceWatermarks가 빈 collection, reason이 non-null이며 숨은 source 이름/count를 노출하지 않는다.

`resourceCursors`의 key는 canonical GVR이고 value는 opaque resourceVersion/resume token이다. 서로 다른 GVR 또는 cluster의 resourceVersion을 비교하지 않는다. `SourceWatermark`는 observedAt, window, lastSuccess, age, maxAge, lifecycle/implementation/installation/access/availability/freshness/completeness/coverage 축을 포함한다. UI는 frame freshness를 표시하며 source skew가 정책 한계를 넘으면 completeness와 freshness 축을 각각 `partial`, `stale`로 둔다.

## 7. Cloud/provider neutral capability model

### 7.1 Core와 adapter 경계

```ts
type ProviderCapability = {
  capabilityId: string
  providerId: string
  implementation: "supported" | "unsupported"
  installation: "installed" | "not-installed" | "unknown"
  access: "allowed" | "forbidden"
  availability: "available" | "partial" | "unavailable" | "error"
  scopes: readonly string[]
  reason?: string
  lastCheckedAt: string
}
```

예시 adapter는 AWS pricing/load balancer, GCP billing/network endpoint group, Azure cost/load balancer, OpenCost, on-prem Prometheus다. adapter가 없어도 placement, ownership, Kubernetes-configured/effective network는 동작해야 한다.

- `implementation=unsupported`: 제품 adapter/plugin이 해당 capability를 이해하지 못한다.
- `installation=not-installed`: authoritative API discovery 또는 provider discovery가 부재를 확인했다.
- `access=forbidden`: 설치 여부를 누설하지 않는 범위에서 authorization이 거부됐다.
- `availability=unavailable`: 지원되고 설치됐지만 현재 endpoint/collector가 동작하지 않는다.
- `availability=error`: 시도 결과 오류이며 reason code가 있다.
- proxy/router의 HTTP 404 하나만으로 `not-installed`를 판정하지 않는다. discovery 결과와 endpoint identity가 일치해야 한다.

### 7.2 금지되는 provider 가정

- Node에 cloud provider ID가 항상 있다고 가정하지 않는다.
- LoadBalancer Service가 AWS ELB라고 가정하지 않는다.
- zone/region label key 하나를 고정하지 않는다. topology label catalog와 CSI/provider adapter를 사용한다.
- cost가 USD라고 가정하지 않는다.
- managed control plane resource를 모든 cluster에 표시하지 않는다.
- Prometheus, Metrics Server, CNI observability가 설치되어 있다고 가정하지 않는다.

### 7.3 Plugin SDK 안전성

```ts
type PluginManifest = {
  pluginId: string
  pluginVersion: string
  engineVersionRange: string
  schemaVersion: string
  signatureRef: string
  capabilities: readonly string[]
  inputGvkPatterns: readonly CanonicalGvkPattern[]
  outputNamespaces: readonly string[]
  deterministic: true
}
```

- pluginId/output ID는 reverse-domain namespace를 사용한다. core ID collision은 catalog load failure다.
- major schema/engine incompatibility는 plugin만 disabled하고 source watermark에 unsupported를 표시한다. unknown major를 실행하지 않는다.
- cluster의 CRD, annotation, URL이 client/server code를 제공할 수 없다.
- browser catalog는 signed declarative data만 받는다. remote JS, `eval`, dynamic URL import, arbitrary React renderer를 금지한다.
- client renderer/detail/action plugin은 product build에 compile된 allowlist module만 manifest ID로 선택한다.
- server extractor는 signed/admin-approved module이며 clock, network, filesystem을 직접 쓰지 않고 bounded context capability만 받는다.
- extractor는 동일 canonical input에서 byte-equivalent canonical claims를 출력해야 한다.
- `PluginExecutionPolicy/v1` 기본 budget은 batch 1,000 objects당 CPU 200ms, plugin working memory 64 MiB, object당 relation claim 32개다. 초과 시 plugin output batch를 폐기하고 해당 capability만 partial/error로 격리한다.
- plugin crash/timeout이 core inventory와 다른 plugin을 중단시키지 않는다.
- manifest signature, schema compatibility, collision, determinism, timeout, output budget, malicious payload contract test를 배포 전에 통과한다.
- catalog revision이 plugin 추가/제거/major 변경으로 바뀌면 current query를 replan한다.

## 8. Scope, presentation mode와 Lens

Scope, presentation mode, Lens는 하나의 enum으로 합치지 않는다. v0의 기본 상호작용은 `map → focus-sankey`이며, fold/rail lens는 이를 대체하지 않는 capability-gated 보조 상호작용이다.

```ts
type Scope =
  | { level: "fleet" }
  | { level: "cluster"; clusterUid: string }
  | { level: "node"; clusterUid: string; nodeUid: string }
  | { level: "pod"; clusterUid: string; podUid: string }

type Lens =
  | { kind: "placement" }
  | { kind: "network"; mode: "configured" | "effective" | "observed" | "combined" }
  | { kind: "ownership" }
  | { kind: "dependency" }
  | { kind: "storage" }
  | { kind: "gitops" }
  | { kind: "butterfly"; left: "network"; right: "ownership-gitops" }

type TopologyPresentation =
  | { mode: "map"; lens: { kind: "placement" } }
  | { mode: "focus-sankey"; lens: { kind: "placement" }; focusEntityKey: string }
  | {
      mode: "fold-lens"
      lens: Exclude<Lens, { kind: "placement" }>
      anchorEntityKey: string | null
      capabilityRevision: string
    }

type Grouping =
  | { kind: "placement-parent" }
  | { kind: "namespace" }
  | { kind: "topology-domain"; key: string }
  | { kind: "node-pool"; providerId: string }
  | { kind: "application"; projectionProviderId: string }
  | { kind: "label"; key: string }
```

Scope, presentation mode, Lens, Grouping은 서로 독립이다. `focus-sankey`는 Lens가 아니며 data query와 projection membership을 바꾸지 않는다. Namespace는 API scope이자 논리 partition이지만 실행 위치 parent가 아니다. zone, node pool, application도 projection grouping이며 placement edge를 바꾸지 않는다. Namespace frame으로 관계 graph를 정리할 수는 있지만 중앙 containment truth를 `Cluster → Namespace → Workload`로 교체하지 않는다.

### 8.1 Scope별 화면 계약

| Scope | 중앙 placement | 관계 표현 | cube activation / 명시적 containment action |
|---|---|---|---|
| fleet | Cluster Treemap, 내부 Node micro-block | 선택 cluster의 관계 요약 | focus-Sankey / `Cluster로 들어가기` |
| cluster | Node Treemap, 내부 Pod micro-block | aggregate Service/controller bundle | focus-Sankey / `Node로 들어가기` |
| node | 선택 Node의 Pod Treemap | exact Pod network·ownership·GitOps 관계 | focus-Sankey / `Pod로 들어가기` |
| pod | Container Treemap/stack | config, storage, network, owner, events | focus-Sankey / Container detail action |

Node의 Service를 표현할 때 문구는 `이 Node가 소유한 Service`가 아니라 `이 Node에서 실행 중인 Pod와 연결된 Service`다.

### 8.2 Cluster detail부터 relation을 제공하는 이유

Service와 Deployment는 여러 Node의 Pod를 가로지른다. Node를 먼저 클릭해야만 관계가 보이면 사용자는 cluster 전체 분산과 장애 범위를 읽을 수 없다. Cluster detail에서는 Pod/Node aggregate bundle을 표시하고, Node detail에서 exact Pod edge로 펼친다.

### 8.3 v0 기본: map → focus-Sankey

초기 presentation은 `mode="map"`이다. 사용자가 map의 cube를 click/Enter하면 같은 authorized projection universe를 `mode="focus-sankey"`로 재투영한다. 선택 cube는 왼쪽 source가 되고, source를 제외한 모든 map item은 오른쪽 세로 열에 정확히 한 번 나타난다. 이 동작은 query를 다시 만들거나 resource를 숨기는 필터가 아니다.

```ts
type FocusHealthLevel = TopologyHealthVerdict["level"]

type FocusSankeyMember =
  | {
      kind: "related"
      entityKey: string
      relationKeys: readonly [string, ...string[]]
      healthLevel: FocusHealthLevel
    }
  | {
      kind: "unrelated"
      entityKey: string
      relationKeys: readonly []
      healthLevel: FocusHealthLevel
    }

type FocusSankeyConnector = {
  connectorKey: string
  healthLevel: FocusHealthLevel
  memberEntityKeys: readonly [string, ...string[]]
  canonicalRelationKeys: readonly [string, ...string[]]
  sourceFaceStartRatio: DecimalString
  sourceFaceEndRatio: DecimalString
}

type FocusSankeyLayout = {
  layoutRevision: LayoutRevision
  universeRevision: string
  sourceEntityKey: string
  members: readonly FocusSankeyMember[]
  orderedRightEntityKeys: readonly string[]
  connectors: readonly FocusSankeyConnector[]
  unrelatedEntityKeys: readonly string[]
}
```

Focus membership과 layout은 다음 불변조건을 모두 만족해야 commit된다.

1. `sourceEntityKey`는 직전 committed map universe에 정확히 한 번 존재한다.
2. `flatten(connectors.memberEntityKeys)`, `unrelatedEntityKeys`, `{sourceEntityKey}`는 서로소이고 그 합집합은 map universe와 정확히 같다.
3. 따라서 `orderedRightEntityKeys.length + 1 === mapUniverse.length`이며 right item은 중복되거나 사라지지 않는다.
4. source와 허용된 canonical relation이 하나 이상 연결된 item만 connector member다. 여러 relation이 있어도 item은 한 번만 배치하고 모든 relation key/evidence는 item과 inspector에 보존한다.
5. connector는 `unhealthy > degraded > unknown > neutral > healthy` 순으로 배치하며 같은 group 안은 projection order 후 entityKey로 결정적으로 정렬한다.
6. 관계가 없는 item도 right column 아래의 `unrelatedEntityKeys`에 남고 dimmed 처리할 뿐 숨기지 않는다.
7. 비어 있지 않은 health connector마다 focus face connector를 정확히 하나 만든다. source 오른쪽 face partition은 settled target geometry에서 group 첫 item의 block-start부터 마지막 item의 block-end까지 측정한 face block-size 비율로 계산하고 합은 정확히 1이다. decimal residual은 §10의 largest-remainder/tie-break 규칙으로 배정하며 member 수는 label에만 쓰고 비율 입력으로 사용하지 않는다.
8. connector의 source 쪽 경계는 이 face partition, target 쪽 경계는 같은 settled group block-start/block-end다. center-point attachment와 member-count 기반 face 분할은 금지한다.
9. focus face connector는 presentation geometry다. `CanonicalRelation` store, relation count, evidence authority, traffic legend, traffic metric 합계에 삽입하지 않는다.
10. entitlement/schema epoch가 바뀌면 transition을 cancel하고 replan/resync한다. 일반 delta는 canonical reducer에 계속 적용하되 transition이 끝날 때까지 presentation universe/revision을 capture하고, settle 직후 latest frame으로 interruptible retarget한다.

compact/mobile에서도 동일한 완전성 불변조건을 지킨다. ribbon을 축약하거나 accessible grouped list로 바꿀 수는 있지만 right member를 조용히 생략할 수 없다. 너무 큰 universe는 §19 LOD aggregate 자체를 map item으로 사용하며, focus 진입 후 임의 client-side sampling을 하지 않는다.

`map`과 `focus-sankey`는 core capability다. `fold-lens`는 catalog가 현재 subject에 대해 지원 capability와 revision을 제공할 때만 노출한다. 의미 없는 대상에는 control을 숨기고, 사용자가 기대할 수 있지만 권한·source·viewport 조건으로 사용할 수 없을 때만 disabled reason을 표시한다.

### 8.4 보조 기능: 종이접기/FEZ fold-lens 전환

- gesture progress `p`는 `[-1, 1]`이다.
- `p = 0`은 placement Treemap이다.
- `p = +1`은 network lens, `p = -1`은 ownership/GitOps lens다.
- LTR에서 canvas를 오른쪽으로 끌면 inline-start의 network rail이 나타나고 `p`가 증가한다. 왼쪽으로 끌면 ownership rail과 함께 `p`가 감소한다. RTL에서는 inline-start/end와 drag 방향을 mirror하지만 semantic p 부호는 유지한다.
- 넓은 viewport의 butterfly lens는 양쪽 rail을 동시에 표시한다.
- drag 중 새 view를 교체하지 않고 하나의 scene graph에서 geometry를 연속 보간한다.
- snap point, direction, resistance, velocity threshold는 injected motion policy에서 온다.
- 가려지는 tile은 옆면을 렌더링하지 않는다. 모든 entity가 다른 2D layout으로 재투영된다.
- relation entity가 나타날 때 연결된 Pod tile은 같은 entityKey와 현재 interpolated rect를 유지한다.
- keyboard 사용자는 lens tab/shortcut으로 동일 전환을 수행한다.

### 8.5 Gesture와 async layout의 일관성

```ts
type GestureLayoutSet = {
  revision: LayoutRevision
  placement: RenderGeometry
  network: RenderGeometry
  ownership: RenderGeometry
}
```

1. scope/query가 settle되면 worker가 같은 LayoutRevision에 대한 세 endpoint layout을 precompute한다.
2. pointer drag는 GestureLayoutSet이 ready인 경우만 시작한다. 준비 전에는 explicit control이 loading state를 표시하고 완료 후 전환한다.
3. pointerdown에서 `gestureRevision`과 endpoint geometry를 capture한다.
4. drag frame은 worker를 호출하지 않고 placement↔network 또는 placement↔ownership geometry를 pure interpolation한다.
5. canonical reducer는 stream delta를 계속 적용하지만 presentation selector는 capture된 membership/geometry를 gesture 종료까지 유지한다. 삭제 entity는 interaction-disabled ghost가 된다.
6. entitlement/schema epoch 변경은 gesture를 즉시 cancel하고 resync한다. 일반 add/update/delete는 손실 없이 `postGestureRetarget` queue에 남는다.
7. pointerup/cancel에서 captured endpoint 또는 center로 snap한 뒤 latest canonical revision의 layout을 요청하고 현재 interpolated geometry에서 새 geometry로 interruptible retarget한다.
8. stale worker 결과는 gestureRevision과 current revision 양쪽을 검증해 폐기한다.
9. relation line path도 양 끝 layout과 같은 revision에서 계산한다. drag preview 중에는 line을 정량 animation하지 않고, snap 후 tile/rail node settle이 끝난 다음 line unfold, 그 다음 observed particle 순서로 시작한다.
10. interpolation, z-order, timing, pointer threshold의 실제 수치는 `topology-visual-motion-tokens.md`가 규정한다.

## 9. Query Bar와 typed AST

Query Bar는 search box, scope picker, filter builder, metric composer의 단일 입구다. 문자열은 즉시 화면 상태를 임의 변경하지 않고 suggestion을 통해 typed token으로 확정한다.

```ts
type Scalar = string | number | boolean
type FieldRef = { catalogFieldId: string }
type Comparison = "lt" | "lte" | "eq" | "gte" | "gt"

type QueryTime =
  | { mode: "live"; lookbackMs: number; stepMs: number; asOf?: never }
  | { mode: "frozen-frame"; frameId: string; asOf: string }
  | { mode: "historical"; asOf: string; start: string; end: string; stepMs: number; historyPolicyId: string }
```

Field는 free-form JSON path가 아니라 server field catalog ID다. live query도 planner가 실행할 때 고정 effective asOf/start/end를 응답해 한 frame 안의 모든 source가 같은 anchor를 공유하게 한다.

- `frozen-frame`은 이미 생성된 ProjectionFrame을 움직이지 않고 보는 mode다. frame retention/entitlement가 만료되면 explicit expired error다.
- `historical`은 inventory/relations/metrics/cost의 versioned history store가 해당 범위와 시각을 지원할 때만 가능하다.
- metric history만 있고 resource history가 없으면 과거 topology를 현재 inventory와 합쳐 historical이라고 부르지 않는다.
- Kubernetes Event/timeline 보존은 resource snapshot history capability를 자동으로 의미하지 않는다.
- planner는 cluster/source별 history coverage를 검증하고 unsupported/partial이면 정확한 source와 기간을 반환한다.

### 9.1 Token type

```ts
type QueryToken =
  | ScopeToken
  | ResourceIdentityToken
  | FilterToken
  | SizeMetricToken
  | FlowMetricToken
  | TimeToken
  | LensToken

type OmnibarSuggestion =
  | { kind: "query-token"; token: QueryToken }
  | { kind: "action"; actionId: string; labelKey: string; availability: "enabled" | "disabled" }

type ScopeToken = {
  type: "scope"
  scope: Scope
  label: string
}

type ResourceIdentityToken = {
  type: "resource-identity"
  entityKey: string
  label: string
}

type FilterToken = {
  type: "filter"
  expression: Predicate
  label: string
}

type SizeMetricToken = {
  type: "size-metric"
  term: SizeMetricTerm
  label: string
}

type FlowMetricToken = {
  type: "flow-metric"
  expression: FlowExpression
  label: string
}

type TimeToken = {
  type: "time"
  time: QueryTime
  label: string
}

type LensToken = {
  type: "lens"
  lens: Lens
  label: string
}
```

Resource token은 display name이 아니라 entityKey를 저장한다. 동명이인 resource를 합치지 않는다. `LensToken`은 secondary fold-lens의 committed target 또는 placement 복귀만 나타내며 focus-Sankey source를 저장하지 않는다. focus source는 `TopologyPresentation`과 URL codec이 소유한다.

### 9.2 Query AST

```ts
type Predicate =
  | { op: "true" }
  | { op: "and"; args: Predicate[] }
  | { op: "or"; args: Predicate[] }
  | { op: "not"; arg: Predicate }
  | { op: "eq"; field: FieldRef; value: Scalar }
  | { op: "in"; field: FieldRef; values: Scalar[] }
  | { op: "exists"; field: FieldRef }
  | { op: "compare"; field: FieldRef; comparator: Comparison; value: Scalar }
  | { op: "text"; normalized: string; fields: FieldRef[] }

type TopologyDataQuery = {
  scope: Scope
  where: Predicate
  size: SizeExpression
  flow?: FlowExpression
  time: QueryTime
  areaPolicy:
    | { kind: "filtered-only" }
    | { kind: "all-authorized-with-filtered-remainder"; projectionPolicyId: string }
}

type TopologyProjection = {
  grouping: Grouping
  lodPolicyId: string
}

type TopologyPlanQuery = {
  schemaVersion: "topology-plan-query/v1"
  data: TopologyDataQuery
  projection: TopologyProjection
}

type TopologyQuery = {
  schemaVersion: "topology-view-query/v1"
  data: TopologyDataQuery
  projection: TopologyProjection
  presentation: TopologyPresentation
}

type QueryHashes = {
  dataQueryHash: string
  projectionHash: string
  presentationHash: string
  shareHash: string
}

type TopologyPlanHashes = Pick<QueryHashes, "dataQueryHash" | "projectionHash">
```

### 9.3 Parsing과 boolean 규칙

- 같은 facet의 반복 값은 OR이다. 예: `namespace in (a,b)`.
- 다른 facet은 AND다. 예: namespace와 health.
- NOT과 복합 OR은 group token으로 표시한다.
- free text는 suggestion 선택 전까지 applied predicate가 아니다.
- exact resource 선택은 focus와 identity filter를 동시에 명시한다.
- Kind sidebar 클릭도 같은 Query AST에 Kind filter를 dispatch한다.
- filter 결과의 ancestor는 `membershipRole="ancestor-context"`로 유지할 수 있다.
- query canonicalizer는 field/order/weight/window를 정규화하고 네 hash를 만든다. `TopologyQuery`는 URL/로컬 view state이고, effect runner는 그중 data/projection만 `TopologyPlanQuery`로 투영해 backend planner에 보낸다. presentation은 backend request, plan cache key, capability subject에 포함하지 않는다.
- `dataQueryHash`는 scope/filter/metric/flow/time/areaPolicy만 포함한다.
- `projectionHash`는 data hash와 grouping/LOD policy를 포함한다.
- `presentationHash`는 projection hash와 committed presentation mode, lens, focus/anchor entityKey를 포함한다. drag progress와 animation progress는 포함하지 않는다.
- `shareHash`는 URL에 직렬화되는 전체 canonical document의 hash다.
- canonical query는 URL에 serialize되어 새로고침, 공유, back/forward가 재현 가능해야 한다.
- URL codec은 `mode=focus-sankey`의 `focusEntityKey`를 opaque identity로 직렬화한다. 권한이 없어졌거나 현재 map universe에 없는 key는 추정 대상을 선택하지 않고 map으로 안전하게 복귀하며 이유를 알린다.
- server planner가 반환한 canonical `TopologyPlanQuery`와 `TopologyPlanHashes`가 data/projection의 최종 authority다. reducer는 이를 local `TopologyQuery`의 data/projection에 병합하되 current presentation을 보존하고 `presentationHash`/`shareHash`는 frontend canonicalizer가 계산한다. presentation validity는 committed frame에서 별도로 재검증한다.
- exact identity token은 해당 entity와 필요한 ancestor/context relation만 남긴다. context membership role은 검색 결과 count에 포함하지 않는다.
- filter가 없으면 predicate는 명시적 `{op:"true"}`다. empty `and/or` node는 canonical schema가 거부한다.
- action suggestion은 QueryToken/AST가 아니다. 선택하면 `action.invoked` EngineMessage를 dispatch하고 command effect 정책을 따른다.

Area leaf set 규칙:

- `filtered-only`: area leaf set은 authorized resource 중 filter에 match한 metric leaf다.
- `all-authorized-with-filtered-remainder`: match leaf는 개별 tile이고, authorized하지만 숨겨진 leaf의 합은 실제로 보이는 `Filtered remainder` projection tile 하나 이상으로 렌더링한다.
- hidden leaf를 parent area에만 넣고 visible child 없이 두는 것은 금지한다.
- `ancestor-context`와 `relation-context` entity는 frame/rail context이며 sibling area leaf set에 들어가지 않는다.
- `filtered-remainder`는 area에는 들어가지만 query match count에는 들어가지 않는 projection이다.
- parent area는 항상 현재 scene에 보이는 primary + filtered-remainder descendant의 합이다.

Exact identity focus plan:

```ts
type FocusExpansionPlan = {
  rootEntityKey: string
  includePlacementAncestors: true
  relationPlanes: readonly RelationPlane[]
  maxDepthByPlane: Readonly<Partial<Record<RelationPlane, number>>>
  maxNeighborsPerHop: number
  truncated: boolean
  continuationCursor?: string
}
```

- exact resource는 primary match다.
- Cluster/Node/Pod placement ancestor는 ancestor-context로 복원한다.
- current lens가 요구하는 Service/controller/config/storage neighbor는 relation-context로 확장한다.
- relation-context는 filter match/area/count에 들어가지 않는다.
- expansion budget을 넘으면 임의 절단하지 않고 aggregate + continuation cursor를 반환한다.

### 9.4 Planner 검증

planner는 실행 전에 다음을 검증한다.

- schema version과 AST depth/clause budget
- field 존재와 scalar type
- regex/text query budget
- metric dimension/unit/additivity/spatial aggregation/temporal reducer/window compatibility
- 현재 scope에서 metric 지원 여부
- source capability와 RBAC
- query cost, 예상 entity/edge 수, LOD plan
- composite term/weight/missing policy
- raw PromQL 또는 임의 expression injection 거부

지원하지 않는 query는 빈 화면으로 성공시키지 않고 typed planning error를 반환한다.

## 10. Metric catalog와 면적 수학

### 10.1 Metric descriptor

```ts
type MetricDimensionId = string & { readonly __brand: "MetricDimensionId" }
type MetricMeasureId = string & { readonly __brand: "MetricMeasureId" }
type UnitId = string & { readonly __brand: "UnitId" }

type MetricUnitDescriptor = {
  unitId: UnitId
  dimension: MetricDimensionId
  symbolKey: string
  scaleToCanonicalDecimal: DecimalString
  currencyCode?: string
  perDurationMs?: number
}

type EntityMetricTarget =
  | { entityClass: "resource"; gvkPattern: CanonicalGvkPattern }
  | { entityClass: "platform"; platformKind: "cluster" }
  | { entityClass: "embedded"; embeddedKind: EmbeddedIdentity["embeddedKind"] }
  | { entityClass: "projection"; projectionFamilyId: string }
  | { entityClass: "external"; externalFamilyId: string }

type MetricPresence = "present" | "zero" | "missing"
type MetricFreshness = "fresh" | "stale" | "unknown"
type MetricCompleteness = "complete" | "partial" | "unknown"
type MetricAccess = "allowed" | "forbidden"
type MetricSupport = "supported" | "unsupported"

type MetricStatus = {
  presence: MetricPresence
  freshness: MetricFreshness
  completeness: MetricCompleteness
  access: MetricAccess
  support: MetricSupport
  errorCode?: string
}

type MetricDescriptor = {
  id: string
  label: string
  dimension: MetricDimensionId
  measure: MetricMeasureId
  canonicalUnitId: UnitId
  sampleKind: "gauge" | "cumulative-counter" | "delta" | "allocation"
  additive: boolean
  spatialAggregation: "sum" | "unique-sum" | "none"
  allowedTemporalReducers: readonly ("last" | "avg" | "max" | "p95" | "sum" | "rate")[]
  counterToRatePolicyId?: string
  supportedEntityPatterns: readonly EntityMetricTarget[]
  supportedScopes: readonly Scope["level"][]
  decompositionPolicyIds: readonly string[]
  aggregationUniverseId: string
  compatibleCompositeGroup: string
  defaultCompositeCoefficient?: DecimalString
  sources: readonly string[]
  temporalModes: readonly ("instant" | "range")[]
  maxAgePolicyId: string
  capabilitiesByCluster: readonly { clusterUid: string; capability: ProviderCapability }[]
}

type MetricValue = {
  seriesKey: string
  metricId: string
  entityKey: string
  valueDecimal: DecimalString | null
  unitId: UnitId
  status: MetricStatus
  source: string
  observedAt: string
  window?: TimeWindow
  maxAgeMs: number
  coverageCount: number
  eligibleCount: number
  reason?: string
}

type MetricWindowSpec = {
  lookbackMs: number
  stepMs?: number
}

type SizeMetricTerm = {
  metricId: string
  temporalReducer: "last" | "avg" | "max" | "p95" | "sum" | "rate"
  window?: MetricWindowSpec
  coefficient: DecimalString
}

type WeightedMetricTerm = SizeMetricTerm

type ComputedSizeContribution = {
  metricId: string
  normalizedShareDecimal: DecimalString
  effectiveWeightDecimal: DecimalString
  contributionDecimal: DecimalString
  status: MetricStatus
}

type ComputedSizeValue = {
  entityKey: string
  mode: "physical" | "composite-score"
  valueDecimal: DecimalString | null
  unitId: UnitId
  status: MetricStatus
  formulaRevision: string
  cohortId: string
  partial: boolean
  weightCoverageDecimal: DecimalString
  contributions: readonly ComputedSizeContribution[]
  missingMetricIds: readonly string[]
}

type SizeDecompositionPlan =
  | {
      status: "supported"
      metricId: string
      scopeLevel: Scope["level"]
      leafUniverseId: string
      leafTarget: EntityMetricTarget
      parentMappingPolicyId: string
      residualProjectionPolicyIds: readonly string[]
      nextScopeSupport: "supported" | "not-decomposable"
      suggestedNextScopeMetricIds: readonly string[]
    }
  | {
      status: "unsupported"
      metricId: string
      scopeLevel: Scope["level"]
      reasonCode: string
      suggestedMetricIds: readonly string[]
    }
```

`EntityMetricTarget`은 entity class와 GVK pattern/catalog family를 discriminated union으로 표현한다. Kind 목록은 catalog에서 오며 view가 문자열 비교하지 않는다.

예를 들어 값 0이 오래됐으면 `zero + stale + complete + allowed + supported`이며, 권한이 없으면 `missing + unknown + unknown + forbidden + supported`다. UI용 단일 badge는 selector가 이 축에서 파생할 수 있지만 source data를 단일 quality 문자열로 축약하지 않는다.

- `presence = zero`이면 valueDecimal은 canonical `"0"`이다.
- `presence = present`이면 valueDecimal은 finite canonical decimal이며 0이 아니다.
- `presence = missing`이면 valueDecimal은 null이다.
- `access = forbidden` 또는 `support = unsupported`이면 presence는 missing이고 valueDecimal은 null이다.
- source error 뒤 마지막 값이 남아 있으면 valueDecimal/presence는 유지할 수 있지만 freshness는 stale이고 errorCode를 가진다. area eligibility에는 사용하지 않는다.
- generated runtime schema의 cross-field refinement가 위 조합을 강제하고 invalid combination을 quarantine한다.
- size metric의 physical valueDecimal은 0 이상이어야 한다. negative cost credit 등은 area descriptor로 등록할 수 없고 별도 breakdown에서만 처리한다.

`aggregationUniverseId`는 합산 leaf의 정체성을 고정한다. 예를 들어 CPU와 memory의 Pod allocation 값은 `pod-allocation/v1`일 수 있다. PVC 자체 값은 `persistent-volume/v1`이므로 Pod allocation policy 없이 CPU와 composite할 수 없다. Cost도 동일 Pod allocation fact로 내려온 경우만 같은 composite group에 들어간다.

Wire precision 규칙:

- metric, byte, cost, coefficient, score wire 값은 canonical decimal string이다. JS `number`로 API 원값을 운반하지 않는다.
- decimal schema는 sign, 최대 integer/fraction digit, exponent 금지/허용 정책을 descriptor별로 검증한다.
- unit 변환은 `MetricUnitDescriptor.scaleToCanonicalDecimal`과 arbitrary-precision decimal로 수행한다.
- geometry worker에 넘길 때만 normalized finite float로 변환하고 원 decimal을 inspector/export에 보존한다.
- cost unit은 단순 문자열이 아니라 dimension + ISO currencyCode + perDurationMs로 식별한다.
- 서로 다른 currency, pricing source, amortization, allocation policy, window는 같은 additive cohort에 들어갈 수 없다.

### 10.2 기본 metric 목록

서버는 최소 다음 semantic metric을 capability가 있을 때 등록한다.

| ID | 단위 | 의미 | 공간 집계 |
|---|---|---|---|
| `cpu.request_cores` | core | scheduler 기준 effective Pod request | sum |
| `cpu.limit_cores` | core | effective limit policy에 따른 합 | sum |
| `cpu.usage_cores` | core | 고정 window의 average/last usage | sum |
| `memory.request_bytes` | byte | effective Pod request | sum |
| `memory.limit_bytes` | byte | container/Pod limit | sum |
| `memory.usage_bytes` | byte | 고정 window usage | sum |
| `storage.ephemeral_request_bytes` | byte | ephemeral request | sum |
| `storage.ephemeral_usage_bytes` | byte | local ephemeral usage | sum |
| `storage.pvc_request_bytes` | byte | unique PVC requested capacity | sum by PVC universe |
| `storage.pvc_usage_bytes` | byte | unique PVC used capacity | sum by PVC universe |
| `cost.total_per_window` | currency/window | 호환되는 canonical CostFact ledger 비용 | unique-sum |
| `resource.pod_count` | count | generic engine primitive | sum |

`resource.pod_count`는 physical capacity가 아니라 count임을 formula summary에 명시한다. 서버 capability가 physical metric을 제공하지 않으면 catalog default policy가 이 primitive를 visible generated chip으로 적용한다. view가 조용히 임의 fallback하지 않는다.

Initial/default size policy:

```ts
type DefaultSizePolicy = {
  policyId: string
  scopeLevel: Scope["level"]
  lensKind: Lens["kind"]
  preferredMetricIds: readonly string[]
  fallbackCountMetricId: string
  effectiveExpression: SizeExpression
  reasonKey: string
}
```

- server catalog가 scope/lens/capability별 effective default expression을 결정한다. frontend에 metric 우선순위를 hardcode하지 않는다.
- engine은 첫 query 생성 전에 catalog default를 명시적 generated metric chip으로 넣는다.
- physical source가 하나도 없으면 server-registered count primitive를 사용하고 chip/formula에 `Resource count`임을 표시한다. count는 fake metric이 아니다.
- default가 source capability 변화로 바뀌면 current user expression을 덮어쓰지 않는다. 새 session 또는 사용자의 reset action에서만 적용한다.
- 마지막 user metric chip 제거 시 default chip 적용을 확인 가능한 `query.defaultSizeApplied` message로 dispatch한다. 화면 내부에서 보이지 않게 이전 metric을 복원하지 않는다.

### 10.3 Physical mode

```ts
type PhysicalSizeExpression = {
  mode: "physical"
  term: SizeMetricTerm
}
```

- additive descriptor 하나만 선택한다.
- valueDecimal은 catalog canonical unit의 절대값이다.
- 음수, NaN, Infinity는 `error`다.
- parent value는 visible/authorized leaf의 합이다.
- filter 적용 시 기본 areaPolicy는 catalog가 선언한 `filtered-only`이며, 숨겨진 합을 비교하려면 explicit filtered-remainder policy를 사용한다.
- exact value, unit, reducer, window를 query formula summary와 inspector에 표시한다.

현재 scope의 outer frame은 비교 대상 tile이 아니라 viewport/context이므로 화면을 채운다. 면적 규칙은 그 frame 안의 sibling child에 적용한다. 따라서 Pod가 0개인 Node를 직접 열면 Node frame은 유지되고 내부가 empty다. Cluster overview에서 metric 0인 Node는 양의 metric Node와 같은 Treemap 면적을 가장하지 않고 `Zero value` shelf에 남는다.

### 10.3.1 Scope별 decomposition

planner는 `SizeDecompositionPlan`을 반환하고 renderer는 metric ID를 보고 leaf를 추정하지 않는다.

- CPU/memory request·limit: Container fact를 합산하고 Pod overhead/restartable-init semantics를 Pod residual projection으로 보존한다. Pod → Node → Cluster rollup이 가능하다.
- CPU/memory usage: container series가 있으면 Container → Pod로 분해한다. Pod series만 있으면 Pod가 최소 leaf이며 Pod scope에서 가짜 Container 균등 배분을 하지 않는다.
- Node usage와 Pod attributable usage의 차이는 `System / unattributed` projection이다.
- Node capacity/allocatable: Fleet/Cluster에서 Node가 leaf다. 같은 metric으로 Pod까지 분해할 수 없으므로 Node drilldown에서 `not-decomposable`을 반환하고 compatible request/usage metric을 suggestion한다. 자동 metric 교체는 금지한다.
- Pod overhead, system residual, idle/shared cost는 실제 Kubernetes resource가 아닌 projection이며 entity count에 합산하지 않는다.
- persistent storage: unique PVC/PV fact가 leaf다. 명시적 Pod allocation policy가 없으면 placement Node/Pod decomposition을 지원하지 않는다.
- resource count: catalog가 scope별 count target을 명시한다. Pod count를 Container scope까지 같은 metric인 것처럼 확장하지 않는다.
- current scope의 metric이 next scope를 지원하지 않아도 outer resource frame과 relation inspector는 열 수 있다. 내부 area map은 `not-decomposable` 상태와 metric suggestion을 표시한다.

### 10.4 Composite mode

다른 단위를 raw sum하는 대신 같은 complete leaf cohort에서 share를 계산한다.

```ts
type CompositeSizeExpression = {
  mode: "composite-score"
  terms: readonly WeightedMetricTerm[]
  missingPolicy: "strict" | "renormalize-available"
}
```

```ts
type SizeExpression = PhysicalSizeExpression | CompositeSizeExpression
```

기본은 `strict`다. `eligible(i,m)`은 metric `m`이 entity `i`에 대해 `presence ∈ {present, zero}`, `freshness = fresh`, `completeness = complete`, `access = allowed`, `support = supported`, `errorCode 없음`인 경우다. 선택 metric 집합을 `M`, 모든 term이 eligible인 공통 leaf 집합을 `C`, canonicalized weight를 `w_m`이라 한다.

```text
C = { i | 모든 m ∈ M에 대해 eligible(i,m) }

n(i,m) = raw(i,m) / Σ(j ∈ C) raw(j,m)

Σ(m ∈ M) w_m = 1,  w_m ≥ 0

score(i) = Σ(m ∈ M) w_m × n(i,m)
```

규칙은 다음과 같다.

- weight 합은 server가 정확히 1로 canonicalize하고 effective weight를 응답한다.
- coefficient와 effective weight는 canonical decimal string이며 server가 fixed precision decimal로 계산한다. renderer용 float 변환은 geometry 단계에서만 허용하고 tolerance를 test contract에 기록한다.
- 어떤 term의 cohort 합이 0이면 expression 전체가 `unavailable-for-group`이다. 그 term을 조용히 버리지 않는다.
- `C` 밖 leaf는 `No data` rail에 들어간다.
- `strict`에서 missing term이 하나라도 있으면 score는 null이다.
- `renormalize-available`은 아래 공식으로 명시적으로 선택된 경우만 허용하며 entity마다 `partial: true`와 `weightCoverage`를 표시한다.
- parent score는 descendant leaf score의 합이다. parent마다 다시 normalize하지 않는다.
- filter로 cohort가 바뀌면 query revision이 바뀌고 score를 재계산한다.
- lens만 바뀌면 cohort와 score가 바뀌지 않는다.
- UI는 이를 CPU+memory 양이라고 부르지 않고 `Weighted score`로 표시한다.
- log/p99 normalization은 별도 versioned normalizer plugin이 등록되지 않은 한 사용하지 않는다.
- planner는 모든 term의 `aggregationUniverseId`, compatible group, authorized leaf set이 일치하는지 검증한다.
- 서로 다른 window를 허용하는 catalog policy가 있더라도 모든 term은 동일 `asOf`에 anchor되고 각 window가 formula summary에 노출되어야 한다.

`renormalize-available`의 공식은 다음과 같다. 각 metric의 eligible cohort를 `C_m`, 합을 `D_m`, entity `i`에서 eligible한 metric을 `A_i`, weight coverage를 `q_i`라 한다.

```text
C_m = { i | eligible(i,m) }
D_m = Σ(j ∈ C_m) raw(j,m)
A_i = { m | eligible(i,m) }
q_i = Σ(m ∈ A_i) w_m

partialScore(i) =
  Σ(m ∈ A_i) (w_m / q_i) × (raw(i,m) / D_m)
```

- 모든 선택 term의 `D_m`은 0보다 커야 한다. 하나라도 0이면 두 missing policy 모두 expression unavailable이며 term을 조용히 제거하지 않는다.
- `q_i = 0`이면 entity는 `No data` rail이다.
- `0 < q_i < 1`이면 entity는 positive Treemap에 들어가되 partial pattern, coverage, 사용된 term을 inspector에 표시한다.
- `q_i = 1`이면 complete다.
- partial score 총합은 1이라는 보장이 없으므로 strict score와 수치 비교하지 않는다. query mode와 formula를 항상 표시한다.
- parent partial score는 child partial score 합이며 상위에서 다시 normalize하지 않는다.
- strict mode에서는 `C` 밖 entity가 `No data` rail이고 positive Treemap에 들어가지 않는다.

Metric chip 추가/제거 규칙은 다음으로 고정한다.

- 처음 physical term 하나는 coefficient canonical decimal `"1"`이다.
- 두 번째 term을 추가하면 mode가 composite로 전환된다.
- 새 term의 기본 coefficient는 catalog default이며 정의되지 않으면 engine primitive `"1"`이다.
- canonical weight는 모든 coefficient를 합이 1이 되도록 정규화한다.
- term 제거 시 남은 coefficient는 보존하고 canonical weight만 다시 정규화한다.
- 같은 metric/temporalReducer/window term을 재추가하면 duplicate를 만들지 않고 기존 chip을 focus한다.
- 사용자는 coefficient를 수정할 수 있으며 0 이하, NaN, Infinity, exponent abuse, precision policy 초과는 commit하지 않는다.
- 마지막 term을 제거하면 catalog effective default를 visible generated chip으로 적용하는 `query.defaultSizeApplied`를 dispatch한다. 적용할 default조차 없는 catalog는 invalid이며 catalog load가 실패한다.

### 10.5 Zero, missing, residual rail

Treemap은 양의 면적만 물리적으로 표현한다. 다음 shelf/rail은 면적 metric이 아닌 구조 목록이다.

- `Zero value`: 정상 측정된 0.
- `No data`: strict mode에서 하나 이상 ineligible이거나 renormalize mode에서 `q_i = 0`.
- `Unavailable`: support/access/error 축 때문에 source가 실행 불가능한 범위를 누설하지 않는 요약. forbidden member count는 표시하지 않는다.
- `Unscheduled`: Node가 없는 Pod.
- `System / unattributed`: Node actual usage와 귀속 Pod usage 합의 양의 차이.

Node usage보다 Pod 합이 큰 시계열 skew는 residual을 음수로 만들지 않는다. residual은 0으로 두고 `inconsistent-sources` warning, source timestamps, skew를 표시한다.

모든 값이 0 또는 missing이면 균등 Treemap으로 위장하지 않는다. 선택 metric으로 양의 면적을 만들 수 없다는 명시 상태와 구조 목록을 제공한다.

Aggregate coverage 규칙:

- parent rollup value/score는 eligible descendant의 합이다.
- parent는 `coverageCount`, `eligibleCount`가 아니라 `observedLeafCount`, `expectedAuthorizedLeafCount`를 함께 가져 전체 coverage를 계산한다. RBAC 밖 leaf는 expected denominator에 넣지 않는다.
- `expectedAuthorizedLeafCount = 0`이면 coverage는 100%가 아니라 `not-applicable`이다.
- coverage가 100% 미만인 parent area는 완전한 total이 아니라 `known lower bound`다.
- partial parent는 hatch/header marker와 context strip coverage로 표시하며 다른 complete parent와 정확히 동등한 total이라고 설명하지 않는다.
- tile 내부 percentage gauge는 여전히 사용하지 않는다.
- 사용자는 `completeness = complete` filter로 완전한 parent만 비교할 수 있다.
- missing descendant 자체는 `No data` rail에서 검색/선택 가능하고 parent aggregate와 중복 count하지 않는다.

### 10.6 Kubernetes request 계산

- regular container 단순 합과 scheduler effective Pod request를 구분한다.
- init container max, restartable sidecar, Pod overhead, in-place resize 상태를 Kubernetes version policy로 처리한다.
- frontend가 raw PodSpec에서 이 계산을 재구현하지 않는다.
- request calculator version과 Kubernetes semantic version을 metric provenance에 포함한다.

### 10.7 Storage

- ephemeral storage와 persistent volume을 다른 dimension으로 둔다.
- unique PVC를 aggregation leaf로 사용한다.
- 여러 Pod가 같은 PVC를 참조해도 용량을 Pod마다 복제하지 않는다.
- PVC를 Pod/Workload/Node에 배분하려면 versioned allocation policy와 contribution을 응답해야 한다.
- allocation policy가 없으면 PVC metric은 Cluster/Node scope 안의 storage lens가 제공하는 PVC aggregation surface에서만 area metric으로 허용한다. Scope union에 존재하지 않는 가상 `PVC scope`를 만들지 않는다.
- CSI가 usage를 제공하지 않으면 `unsupported` 또는 `missing`이며 request를 usage로 대체하지 않는다.

### 10.8 Cost

```ts
type CostFact = {
  factId: string
  factKind: "allocated" | "shared" | "idle" | "asset" | "unallocated"
  subject?: EntityRef
  clusterUid: string
  amountDecimal: DecimalString
  unitId: UnitId
  window: TimeWindow
  pricingSourceId: string
  allocationPolicyId: string
  amortizationPolicyId: string
  estimated: boolean
  evidence: readonly EvidenceRef[]
}
```

- 비용은 amount, currency/unit, window, pricingSource, allocationPolicy, amortizationPolicy, estimated를 가진다.
- 한 frame에서 currency와 window가 일치해야 합산한다.
- 서로 다른 currency는 FX source와 FX observedAt 없이 합산하지 않는다.
- Node와 Workload cost를 서로 다른 query에서 가져와 같은 total인 것처럼 보이지 않는다.
- allocated Pod fact만으로 전체 cluster cost를 만들지 않는다. control plane, Node/PV/LB asset, idle, shared, unallocated fact를 명시적 cost leaf로 보존한다.
- factId는 ledger 내 unique하며 여러 Node/Workload rollup에서 같은 fact를 중복 합산하지 않는다.
- placement lens에서는 Pod에 귀속 가능한 allocated fact와 명시적 Node/Cluster residual만 사용한다. asset/storage cost는 적합한 lens에 둔다.
- FX 변환이 허용되면 원 amount/currency와 FX rate/source/observedAt을 보존하고 converted fact를 별도 derived claim으로 만든다.
- cloud pricing adapter가 없는 local/on-prem cluster는 OpenCost 등 source가 없다면 `unsupported`다.

## 11. Resource catalog, sidebar와 메인 정보 우선순위

### 11.1 Discovery-driven resource catalog

Sidebar의 Networking, Workloads, Configuration, Scaling 같은 group은 view literal이 아니다. server catalog가 다음 정보를 제공한다.

```ts
type ResourceCatalogBase = {
  familyId: string
  groupId: string
  labelKey: string
  iconToken: string
  sortWeight: number
  renderCapabilities: readonly string[]
  relationCapabilities: readonly string[]
  countCompleteness: "exact" | "partial" | "unknown"
  countAccess: "allowed" | "forbidden"
}

type ResourceCatalogEntry = ResourceCatalogBase &
  (
    | { entityClass: "resource"; gvkPattern: CanonicalGvkPattern }
    | { entityClass: "platform"; platformKind: "cluster" }
    | { entityClass: "embedded"; embeddedKind: EmbeddedIdentity["embeddedKind"] }
    | { entityClass: "projection"; projectionFamilyId: string }
    | { entityClass: "external"; externalFamilyId: string }
  )
```

- CRD는 generic group 또는 plugin group에 자동 등장한다.
- unknown GVK도 Resources 목록과 search에 나타난다.
- category click은 `FilterToken`을 만들어 같은 Query AST에 추가한다.
- view는 Ingress, Service, Deployment 등을 switch statement로 열거하지 않는다.
- labelKey는 locale catalog에서 resolve하고 missing locale은 stable technical fallback을 사용한다.
- iconToken은 client build allowlist에서 resolve하며 unknown token은 generic resource icon으로 fallback한다. URL/SVG markup을 catalog가 직접 주입하지 않는다.

### 11.2 Count semantics

한 숫자로 모든 의미를 덮지 않는다.

```ts
type CatalogCount = {
  totalAuthorized: number | null
  queryMatched: number | null
  renderedEntities: number
  projectedMembers?: number
  completeness: "exact" | "partial" | "unknown"
  access: "allowed" | "forbidden"
}
```

- unreadable/forbidden은 0이 아니다.
- pagination/partial sync 중 수치는 partial이다.
- PodGroup은 `renderedEntities`이며 `projectedMembers`가 실제 Pod 수다.
- aggregate LOD가 원본 resource count를 숨기지 않는다.

### 11.3 Fleet-first 메인 화면

일반적인 single-cluster operations dashboard의 정보 우선순위를 범용 Fleet 제품에 다음처럼 재배치한다.

1. 전역 Query Bar: cluster/resource/metric/filter/action 검색.
2. Fleet Treemap: Cluster 면적과 상태, 내부 Node micro-block.
3. 선택 scope context strip:
   - cluster/display identity, provider capability, Kubernetes version, location/topology metadata;
   - connection state, last observed, auto/snapshot mode;
   - Pods/Nodes/Workloads ready count;
   - selected metric formula와 source freshness.
4. 선택 scope inspector:
   - CPU/memory used/requested/allocatable absolute values와 ratio;
   - 주요 resource family count;
   - active issues, recent timeline, traffic/source health, GitOps/Helm evidence.

동일한 수치를 hero ring, sidebar, Treemap label에 반복하지 않는다. overview는 위치와 이상 징후를 찾는 화면이고, 정확한 비율/세부값은 context strip/inspector가 담당한다.

### 11.4 Percentage 사용 위치

- Treemap tile 내부: 금지.
- tile의 nested child 위: 금지.
- 선택 scope의 별도 utilization summary: 허용.
- tooltip/inspector: 허용.
- percentage는 반드시 numerator, denominator, unit, source, window와 함께 표시한다.
- Node 비율 평균으로 Cluster 비율을 만들지 않는다. `Σ usage / Σ allocatable`로 계산한다.

## 12. Tile 시각 문법

### 12.1 의미 channel

| Channel | 의미 |
|---|---|
| area | physical absolute metric 또는 composite score |
| fill/border | canonical health/status |
| border pattern | metric presence/freshness/completeness/access 축의 파생 상태 |
| text | display name, 허용 밀도에서 absolute value 한 줄 |
| focus ring | keyboard/pointer focus |
| relation line | relation plane/lifecycle/resolution/freshness |
| observed particle/flow ribbon | measured traffic rate만 표현. 두께·속도는 unit/window/source가 검증된 정량값 |
| focus face connector | focus-Sankey health group의 face partition과 member 집합. 두께는 결합 face 높이의 기하 결과이며 traffic 양이 아님 |

리본 규칙의 유일한 비정량 두께 예외: **face-결합 리본의 두께는 결합 면 높이의 기하적 결과(집합 크기)로서 허용한다.**

resource kind별 임의 색은 health color와 충돌하므로 기본 tile fill에 쓰지 않는다. Kind는 icon token과 label로 구분한다.

두 ribbon은 타입, renderer primitive, legend, accessibility label을 공유하지 않는다. focus face connector에는 member count와 `관계 묶음` label을 표시하고 rate/unit/particle을 표시하지 않는다. observed traffic이 없다는 이유로 focus connector를 숨기지 않으며, focus connector가 있다는 이유로 traffic이 있다고 추론하지 않는다.

### 12.2 Density level

```ts
type TileDensity = "marker" | "name" | "name-value" | "summary"
```

- `marker`: text 없음, 접근성 mirror와 focus tooltip 유지.
- `name`: 이름만.
- `name-value`: 단일 physical metric의 absolute value 한 줄 허용.
- `summary`: name, absolute value, status marker. percentage gauge는 여전히 금지.
- composite contribution, formula, provenance는 inspector에만 둔다.
- density는 pixel area와 text measurement로 worker가 계산한다.

### 12.3 Health

Canonical level은 `healthy | neutral | degraded | unhealthy | unknown`을 기본 vocabulary로 쓴다. plugin은 reason/message를 반환하고 level ordering을 바꾸지 않는다.

```ts
type TopologyHealthVerdict = {
  level: "healthy" | "neutral" | "degraded" | "unhealthy" | "unknown"
  reason: string
  message?: string
  source: string
  observedAt: string
  freshness: "fresh" | "stale" | "unknown"
  completeness: "complete" | "partial" | "unknown"
  access: "allowed" | "forbidden"
  evidenceIds: readonly string[]
}

type AggregateHealth = {
  effectiveLevel: TopologyHealthVerdict["level"]
  counts: Record<TopologyHealthVerdict["level"], number>
  observedChildCount: number
  expectedAuthorizedChildCount: number
  policyId: string
}
```

- leaf resource fill은 own verdict를 나타낸다.
- Node 같은 resource frame의 border/header는 own verdict를 나타내고, 내부 Pod tile은 각 Pod verdict를 나타낸다.
- Cluster/PodGroup 같은 projection은 versioned aggregation policy가 만든 effective level과 counts를 가진다.
- 기본 aggregation은 `unhealthy > degraded > unknown > neutral > healthy` severity와 child count를 사용하지만, 단 하나의 child 상태를 전체 fill로 과장하지 않도록 header marker와 counts를 함께 표시한다.
- own health와 descendant aggregate를 하나의 필드로 덮어쓰지 않는다.
- health level은 마지막 semantic 판정이고 evidence freshness/completeness/access와 별개다. stale healthy는 green-only로 보이지 않고 stale pattern/desaturation과 age를 반드시 표시한다.
- forbidden이면 level은 unknown이며 hidden descendant를 aggregate denominator/count에 포함하지 않는다.
- parent aggregate counts는 authorized child만 사용하고 expected/observed count를 함께 가진다.

- Service health를 항상 healthy로 두지 않는다. Endpoint readiness, type/status, LB condition을 사용한다.
- Ingress/Gateway는 accepted/resolved/backend/LB condition을 사용한다.
- unknown CRD는 standard conditions가 있으면 plugin/generic condition evaluator가 판단하고, 없으면 unknown이다.
- 색만으로 상태를 전달하지 않고 border/icon/accessible text를 함께 사용한다.

## 13. Network truth와 traffic 문법

### 13.1 세 가지 truth

| Truth | 근거 | 시각 |
|---|---|---|
| configured | selector, Ingress rule, HTTPRoute backendRef | 점선 또는 얇은 정적 선 |
| effective | EndpointSlice targetRef/address/conditions | 실선, readiness state |
| observed | Hubble/Istio/Caretta/Prometheus 등의 관측 | ribbon/particle 가능 |

configured selector가 있어도 EndpointSlice가 없으면 configured-only다. EndpointSlice가 있으나 flow가 없으면 effective/static다. K8s relation 없이 flow만 관측되면 observed orphan edge와 warning을 남긴다.

### 13.2 Flow metric channel

```ts
type FlowMetricDescriptor = {
  id: string
  dimension: MetricDimensionId
  measure: MetricMeasureId
  unitId: UnitId
  source: string
  window: TimeWindow
  visualRoles: {
    widthMagnitude: boolean
    emissionRate: boolean
    travelDurationLatency: boolean
    errorSignal: boolean
  }
}

type FlowExpression = {
  metricId: string
  reducer: "rate" | "sum" | "avg" | "p95"
  window: TimeWindow
  truth: "observed"
}

type FlowValue = {
  flowKey: string
  relationKey: string
  metricId: string
  valueDecimal: DecimalString | null
  unitId: UnitId
  status: MetricStatus
  window: TimeWindow
  observedAt: string
  sourceId: string
}
```

- ribbon width는 `bytes/s`가 있으면 기본으로 사용한다. 없으면 사용자가 선택한 declared flow magnitude를 사용하고 단위를 표시한다.
- particle emission cadence는 RPS, connection rate 또는 Hubble event rate다.
- particle travel duration은 실제 latency가 있을 때만 latency와 연결한다.
- latency가 없으면 고정 token duration을 사용하고 정량적 의미가 없음을 tooltip에 명시한다.
- particle speed 하나로 트래픽량과 latency를 동시에 뜻하지 않는다.
- gradient/arrow는 source → destination 방향이다.
- dropped/rejected는 red semantic token과 pattern/pulse를 함께 쓴다.
- stale flow는 saturation 감소 후 animation을 멈춘다.
- observed sample이 snapshot count뿐이면 rate로 추정하지 않고 정적 edge로 둔다.
- ownership/dependency edge에는 traffic width/particle을 적용하지 않는다.

### 13.3 Network edge key

Service port가 여러 개일 수 있으므로 edge key는 source/target뿐 아니라 port name/number, protocol, truth type을 포함한다. 여러 Service가 같은 Pod를 선택하거나 한 Service가 여러 Node의 Pod를 선택해도 entity를 복제하지 않는다.

EndpointSlice endpoint는 독립 Kubernetes object가 아니므로 EndpointSlice resource entity 아래 `embedded` entity로 만든다. stableKey는 `addressType + normalized addresses + targetRef UID/coordinate + port key`의 canonical hash이며 배열 index만 사용하지 않는다. targetRef가 없으면 embedded endpoint가 external EntityRef를 가리키며 IP/address만으로 cluster 전역 resource identity를 만들지 않는다. renderer는 endpoint embedded entity를 접을 수 있지만 effective relation evidence에서 제거하지 않는다.

- ready/serving/terminating은 nullable tri-state로 각각 보존한다. nil을 false로 바꾸지 않는다. traffic eligibility는 Kubernetes version과 Service `publishNotReadyAddresses`를 반영한 versioned EndpointReadinessPolicy가 계산한다.
- targetRef가 Pod가 아니면 해당 GVK/UID resource로 resolve하고, targetRef가 없으면 address endpoint로 유지한다.
- IPv4/IPv6/FQDN addressType과 여러 address를 보존한다. 같은 targetRef의 dual-stack endpoint는 UI에서 묶을 수 있지만 evidence/port/address family를 합쳐 삭제하지 않는다.
- 여러 slice의 duplicate Service→target/port relation은 canonical relation claim으로 merge하고 endpoint entity 수와 backend resource 수를 구분한다.
- named Service targetPort와 EndpointSlice resolved port의 mapping evidence를 보존하며 불일치/미해결은 unknown/conflict다.

### 13.4 Gateway와 cross-namespace

- Ingress `defaultBackend`를 처리한다.
- Ingress host/path/pathType/TLS Secret/default backend와 Service port를 edge attributes/evidence로 보존한다.
- Gateway → HTTPRoute/GRPCRoute/TCPRoute/TLSRoute/UDPRoute → backendRef chain을 semantic plugin으로 보존한다.
- BackendTLSPolicy와 설치된 Gateway API policy attachment를 policy-security/configured claim으로 연결한다.
- ReferenceGrant와 parent/backend conditions를 검증한다.
- cross-namespace ref가 허용되지 않으면 rejected/unresolved relation이다.
- ExternalName, selectorless, headless Service는 별도 semantics plugin으로 처리한다.

### 13.5 NetworkPolicy와 flow source fusion

- NetworkPolicy spec selector/namespaceSelector/ipBlock/port/ingress/egress/default-deny는 `policy-security` configured evidence다.
- ingress와 egress 양쪽 policy, namespace labels, CNI semantics를 모두 평가한 verified policy engine이 있을 때만 `effective-allow/effective-deny` claim을 만든다.
- configured policy edge를 실제 허용 트래픽 edge처럼 그리지 않는다.
- Hubble, Istio, Prometheus, Caretta가 같은 flow를 관측할 수 있으므로 raw 값을 합산하지 않는다.
- FlowObservation은 source, reporter, sampling rate, direction, identity resolution, window, unit, confidence를 가진다.
- source selector가 하나를 authoritative로 선택하거나 versioned FusionPolicy가 reporter/request-response dedupe를 증명한 경우만 fused value를 만든다.
- Hubble은 event/flow evidence, Istio는 workload/service rate, Caretta는 관계 존재 fallback이라는 capability를 catalog에 명시한다. capability가 없는 bytes/rate/latency를 0으로 채우지 않는다.
- bidirectional flow는 두 canonical directed edge로 저장하고 UI bundling만 양방향 표식을 만들 수 있다.
- width domain, log mapping, clipping, legend, particle cap의 실제 수치는 visual/motion token spec에 고정한다.

Adapter normalization minimum:

| Source capability | 허용 의미 | 금지 |
|---|---|---|
| event-level flow observer | event rate, verdict/drop, resolved identities, 실제 제공된 latency/bytes | event count를 connection rate나 bytes로 추정 |
| service-mesh metric source | decimal workload/service request/byte/error rate와 declared window | workload identity를 Pod UID로 위장, rate 정수 반올림 |
| connection relationship source | configured/observed relationship evidence | HTTP RPS, byte rate, latency로 승격 |
| generic Prometheus adapter | catalog에 등록된 recording rule의 unit/dimension | raw label만으로 source/target을 임의 추론 |

어떤 adapter도 capability가 false인 field를 0으로 채우지 않는다.

## 14. Ownership, dependency, GitOps

### 14.1 Ownership chain

- UID가 일치하고 Kubernetes scope legality를 통과한 ownerReference 자체가 authoritative ownership evidence다. `controller=true`는 그 owner가 managing controller임을 분류한다.
- Deployment → ReplicaSet → Pod를 생략하지 않는다.
- renderer가 편의를 위해 Deployment → Pod shortcut을 표시할 수 있으나 `derived-path`임을 보존한다.
- 이전 rollout의 ReplicaSet이 API에 live object로 남아 있으면 inactive live entity와 revision으로 보존한다. API에서 삭제되면 exit tombstone 후 live graph에서 제거한다. 장기 historical entity는 history store와 historical query에서만 제공한다.
- StatefulSet, DaemonSet, Job, CronJob, Rollout 등은 plugin이 같은 canonical ownership plane을 출력한다.
- owner cycle은 graph corruption warning으로 격리하고 traversal budget을 초과하지 않는다.
- namespaced owner/dependent의 cross-namespace ref, cluster-scoped dependent의 namespaced owner, UID/name mismatch를 invalid claim으로 격리한다.
- 여러 `controller=true` ref 같은 malformed object는 임의 하나를 고르지 않고 conflict claim과 warning을 만든다.
- UID owner가 아직 수집되지 않았으면 unresolved placeholder를 만들되 permission redaction 규칙을 먼저 적용한다.

### 14.2 Dependency

- Pod → ConfigMap/Secret은 env, envFrom, volume, projected volume reference를 모두 추출한다.
- Pod → ServiceAccount를 추출한다.
- Pod → PVC → PV → StorageClass를 추출한다.
- HPA/VPA/KEDA → scaleTargetRef를 추출한다.
- PDB와 NetworkPolicy selector는 ownership이나 scaling이 아니라 각각 policy-availability, policy-security relation이다.
- Secret value와 권한 밖 reference detail은 노출하지 않는다.

### 14.3 GitOps provenance

정확한 chain은 다음이다.

```text
Git repository / revision
  → declares
Argo Application / Flux Kustomization / HelmRelease
  → manages
Workload
  → owns
Pod
```

- GitHub는 Pod의 owner가 아니다.
- provider adapter는 Argo inventory, Flux inventory, tracking annotation, revision, source URL/path/chart 등 서로 다른 evidence를 canonical provenance claim으로 변환한다.
- GitHub API, PR, Actions 정보는 별도 connector capability가 있을 때만 추가한다.
- desired revision과 observed live revision을 구분한다.
- evidence가 heuristic이면 UI에 heuristic이라고 표시한다.
- Git URL은 protocol/host allow policy로 검증하고 SSH/OCI/raw unsafe link를 browser navigation으로 열지 않는다.

### 14.4 표준 resource provider matrix

이 표는 view의 고정 Kind 목록이 아니다. Kubernetes adapter가 제공해야 할 최소 semantic plugin coverage다. 설치되지 않은 API group은 catalog에서 `unsupported/not-installed`다. 이 표 밖 GVK는 generic resource로 처리한다.

| Family | Resource/Projection | 추출하는 핵심 의미 | Plane/출력 |
|---|---|---|---|
| platform | Cluster | 연결, version, provider capability, freshness | placement root |
| core | Namespace | logical scope, quota context | grouping/filter |
| execution | Node | Ready, allocatable, topology, taints | placement |
| execution | Pod | nodeName, phase, readiness, owners, resources | placement/ownership |
| execution | Container/init/ephemeral | state, resources, image | derived placement child projection |
| workload | Deployment, ReplicaSet | owner chain, replica revision | ownership |
| workload | StatefulSet, ControllerRevision | ordinal/revision/claim templates | ownership/storage |
| workload | DaemonSet | desired/current/ready scheduled | ownership |
| workload | Job, CronJob | schedule/job/pod chain | ownership |
| workload CRD | Rollout and discovered controllers | plugin owner/status semantics | ownership |
| network | Service | selector, type, ports, externalName | configured network |
| network | EndpointSlice | service label, targetRef, conditions, hints | effective network |
| network | Ingress, IngressClass | rules/default backend/LB | configured network |
| network | Gateway, Route, ReferenceGrant | parents/backendRefs/conditions/grants | configured/effective network |
| network policy | NetworkPolicy and policy CRDs | selector/policy effect evidence | policy-security |
| configuration | ConfigMap, Secret metadata | Pod references, keys count only | dependency |
| identity | ServiceAccount, Role/Binding | usage and access context without secret | dependency/policy-security |
| storage | PVC, PV, StorageClass, VolumeAttachment | claim/binding/class/attachment | storage |
| scaling | HPA, VPA, KEDA scalers | scaleTargetRef, conditions | scaling-policy |
| availability | PDB | selector and disruption status | policy-availability |
| governance | ResourceQuota, LimitRange | namespace constraint | policy-governance/group context |
| packaging | Helm release evidence | desired/release provenance | gitops-provenance |
| GitOps | Argo/Flux resources | source revision/inventory/health | gitops-provenance |
| events | Kubernetes Event | involvedObject UID/reason/count/time | timeline evidence |
| projection | PodGroup, Unscheduled, Residual, Missing | explicit computed membership | no fake K8s Kind |

### 14.5 Kubernetes watch와 Event object 처리

| 입력 | reducer/projection 처리 |
|---|---|
| ADDED | UID upsert, relation/metric invalidation |
| MODIFIED | stream sequence/epoch 검증 후 field-aware upsert; generation은 spec-change metadata |
| DELETED | UID tombstone, relation cleanup, exit motion |
| BOOKMARK | source watermark/RV advance, entity 변화 없음 |
| ERROR 410 | relist/resync, continuity state 갱신 |
| other ERROR | source partial/error, last valid state 유지 |
| duplicate event/RV equality | idempotent no-op |
| out-of-order stream sequence | reject + gap/resync diagnostic |
| informer reconnect | resume 또는 relist, completeness 표시 |
| Kubernetes Event object | durable timeline/evidence; watch lifecycle과 혼합 금지 |

삭제된 resource의 historical Kubernetes Event와 durable operational timeline은 남을 수 있지만 live relation target은 tombstone 또는 deleted placeholder로 분리한다.

## 15. Engine event, reducer, effect 계약

### 15.1 단일 envelope

```ts
type EngineMessage = TopologyMessageV1.EngineMessage
```

`TopologyMessageV1`은 `topology-message-action-schema.md`에서 생성되는 namespace다. source별 context가 effect correlation과 stream cursor를 required field로 닫는다. UI intent, URL hydration, snapshot/delta, connection, layout, theme/motion, focus/navigation result는 discriminated union이지만 outer envelope와 dispatch 함수는 하나다.

### 15.2 Required payload families

```text
engine.initialized
catalog.changed
url.hydrated
query.textChanged
query.tokenCommitted
query.tokenRemoved
query.planRequested
query.planResolved
query.planRejected
scope.entered
scope.exited
lens.progressChanged
lens.committed
focusSankey.entered
focusSankey.retargeted
focusSankey.exited
entity.focused
entity.activated
entityDetail.received
selection.changed
viewport.changed
action.invoked
action.confirmed
action.dismissed
operation.cancelRequested
snapshot.requested
snapshot.received
stream.connected
stream.disconnected
stream.resyncRequired
entity.upserted
entity.deleted
entity.resolutionCommitted
relation.upserted
relation.deleted
restrictedBoundary.upserted
restrictedBoundary.deleted
metric.batchReceived
flow.batchReceived
size.batchReceived
rollup.batchReceived
source.watermarkReplaced
frame.completenessReplaced
warning.upserted
warning.deleted
layout.requested
layout.resolved
layout.rejectedAsStale
layout.failed
command.receiptReceived
operation.eventReceived
operation.snapshotReceived
theme.changed
motion.changed
effect.failed
```

각 payload의 exact field/refinement와 message별 commit/failure rule은 message adjunct §2–10을 따른다.

### 15.3 Reducer rules

- 동일 eventId는 dedupe retention 안에서 한 번만 적용한다.
- stream event는 `(streamId, epoch, sequence)`가 primary idempotency key다. committed sequence 이하 eventId는 anti-entropy cut이 확정되면 compact한다.
- effect result는 active/cancelled effectId registry로 dedupe하고 effect 종료 후 session-scoped bounded LRU로 이동한다.
- UI/URL message는 session-scoped bounded LRU와 causation-specific guard를 사용한다.
- LRU size/TTL은 `EventRetentionPolicy`의 중앙 수치이며 eviction은 correctness에 필요한 stream cursor를 제거하지 않는다.
- topology epoch/sequence/query-hash continuity는 `source="stream"`에 적용한다. `source="operation-stream"`은 별도 operationId/dataOrigin/cursor continuity와 product operationSequence를 적용하고 topology query hash를 요구하지 않는다. UI/URL/worker/effect message에는 query/layout revision과 effect correlation을 적용한다.
- streamEpoch가 현재와 다르면 이전 delta를 적용하지 않는다.
- stream sequence가 current 이하이면 duplicate/old replay로 no-op, current+1이면 atomic apply, current+1보다 크면 gap/resync다. 같은 stream tuple의 payload digest가 다르면 protocol corruption이다.
- resourceVersion은 opaque token이므로 대소 비교하지 않는다. exact duplicate는 eventId/stream sequence/RV equality로 no-op하고 ordering은 query stream sequence와 epoch으로 판단한다.
- generation은 desired spec generation 판정에만 사용하고 event ordering에 사용하지 않는다.
- metric/flow result는 `dataQueryHash`, projection entity/result는 `projectionHash`, layout result는 `presentationHash`가 current와 다르면 stale result로 폐기한다.
- layout transaction ID가 current가 아니면 적용하지 않는다.
- 삭제 중인 focus entity는 exit가 끝날 때까지 presentation state에 남기고 logical state에서는 tombstone이다.
- 모든 reducer branch는 invariant checker를 통과해야 commit된다.
- compatible catalog revision change는 current query를 replan하고 unsupported token/plugin을 명시한다.
- catalog/schema major mismatch는 stream resync loop로 처리하지 않고 fatal compatibility state와 upgrade CTA를 표시한다.

### 15.4 Effect runner

```ts
type EffectEnvelope = TopologyMessageV1.EffectEnvelope
type EffectDirective = TopologyMessageV1.EffectDirective
type CommandRequest = TopologyMessageV1.CommandRequest
type CommandReceipt = TopologyMessageV1.CommandReceipt
```

Effect 결과와 실패는 다시 EngineMessage로 dispatch한다. component callback에 직접 promise/fetch/navigation 로직을 넣지 않는다.

- 새 query session은 이전 plan/snapshot/stream/layout의 abortKey를 취소한다.
- cancelled effect 결과와 current hash가 다른 결과는 state에 적용하지 않고 diagnostic만 남긴다.
- effect result message는 effectId와 causationEventId를 포함한다.
- automatic retry는 idempotent read에만 허용한다.
- command effect는 자동 retry하지 않는다. 같은 logical invocation은 같은 idempotencyKey를 사용하고, 응답 유실 가능성이 있으면 idempotency key receipt lookup을 먼저 실행한다. receipt에서 operationId를 얻은 뒤에만 status cut을 조회한다.
- confirmation은 `not-required | confirmed` union이다. confirmed token은 action catalog/authorization에서 발급되고 target, parameters hash, capability revision, expiry에 bind한다.
- reducer idempotence는 외부 부작용 exactly-once를 보장하지 않는다. command gateway가 idempotency ledger와 audit receipt를 보장해야 한다.

## 16. Snapshot과 단일 stream

### 16.1 API surface

```text
GET  /api/v2/topology/catalog
POST /api/v2/topology/query/plan
POST /api/v2/topology/snapshot
GET  /api/v2/topology/stream?queryId=...&resumeToken=...
GET  /api/v2/topology/entities/{entityKey}
```

한 browser engine query는 inventory, relation, metric, flow를 묶은 topology logical stream 하나만 소비한다. 진행 중 GitOps operation watch는 operationId별 독립 stream이며 topology query cursor/hash와 섞지 않고 `source="operation-stream"` EngineMessage로 같은 dispatch에 들어온다. transport가 둘 이상이어도 별도 frontend event bus나 reducer write path를 만들지 않는다.

물리 transport는 deployment capability에 따라 authenticated WebSocket 또는 resumable SSE가 될 수 있다. transport adapter가 연결/재시도/heartbeat를 담당하며 reducer에는 동일 StreamEnvelope만 전달한다. 고속 raw flow를 browser에 그대로 보내지 않고 server-side window aggregate/delta로 제한한다.

### 16.2 Stream envelope

```ts
type SnapshotEnvelope = TopologyMessageV1.SnapshotEnvelope
type StreamEnvelope = TopologyMessageV1.StreamEnvelope
type ResumeCursor = TopologyMessageV1.ResumeCursor
type StreamStart = TopologyMessageV1.StreamStart
```

- initial versioned snapshot 뒤 delta를 적용한다.
- reconnect는 각 committed envelope의 server-signed resumeToken으로 `(streamId, streamEpoch, sequence, query hashes, entitlement epoch)`를 resume한다. sequence 하나만 보내거나 client가 token을 조립하지 않는다.
- server가 resume할 수 없으면 explicit resync-required를 보낸다.
- periodic anti-entropy snapshot으로 drift를 복구한다.
- structural add/delete는 조용히 drop하지 않는다.
- metric은 series별 latest value로 coalesce할 수 있다.
- flow는 고정 window aggregate로 coalesce한다.
- backpressure가 correctness를 위협하면 drop이 아니라 resync-required를 보낸다.
- durable timeline에는 retention policy가 허용한 structural/domain/operation event의 canonical record를 보존하고 live scene에는 frame batch를 적용한다. raw metric sample/flow event를 무제한 보존하지 않는다.

`EventRetentionPolicy/v1`은 tenant별 event class, raw retention, aggregation/downsampling, deletion, legal hold, RBAC를 정의한다. 기본적으로 operation/audit/structural event는 canonical record, metrics는 series storage, traffic은 window aggregate로 분리하며 browser stream coalescing 전 raw payload를 UI timeline 저장소로 복사하지 않는다.

Fleet query도 stream sequence는 query stream 하나에서 전역 단조 증가한다. 각 cluster의 독립 continuity는 `origin.inventoryEpoch`와 frame의 `clusterCuts`로 추적한다. cluster resourceVersion을 fleet 전역 revision처럼 비교하지 않는다.

Stream handshake의 첫 envelope는 streamId/epoch/current sequence/dataQueryHash/projectionHash를 확인한다. token queryId 재사용, server restart epoch 변경, hash mismatch, retention expiry는 delta 전송 전에 `resync-required`로 종료한다.

### 16.3 Snapshot-stream cutover와 anti-entropy

Snapshot과 stream 사이에 변화가 사라지는 구간을 허용하지 않는다.

1. query gateway는 query session을 만들고 stream capability가 있으면 retained event log도 만든다.
2. snapshot은 `streamStart`를 포함한다. stream mode는 논리 cut `S`의 signed ResumeCursor, poll mode는 pollAfterMs, static mode는 reason이다.
3. stream mode에서만 client가 signed resumeToken으로 subscribe한다. stream이 먼저 열리면 `S`보다 큰 event를 buffer한다. poll/static에서 stream을 열지 않는다.
4. current data/projection hash와 일치하는 snapshot을 reducer에 설치한다.
5. stream mode는 buffer의 `S+1`부터 연속 sequence만 replay한다. poll mode는 다음 snapshot을 graph revision으로 원자 교체한다.
6. stream gap, epoch mismatch, retention expiry가 있으면 snapshot을 적용한 채 임의 delta를 이어 붙이지 않고 resync한다.
7. stream anti-entropy snapshot `S2`도 같은 방식으로 `>S2` event를 buffer한 뒤 UID diff/reconcile하고 replay한다.
8. multi-cluster frame은 `clusterCuts`로 각 cluster cut과 source skew를 공개한다. 전 cluster가 원자적으로 같은 Kubernetes 시각이었다고 주장하지 않는다.
9. server가 cut과 event retention을 보장할 수 없으면 topology.stream capability를 false로 하고 poll/static mode를 명시한다. poll을 realtime stream처럼 표시하지 않는다.

### 16.4 Frame batching

```text
stream events
  → schema/RBAC/epoch/sequence validation
  → UID keyed staging buffer
  → structural ordering preservation
  → status/metric latest-per-series coalescing
  → one batch EngineMessage per animation frame
  → reducer
  → selectors
  → conditional worker layout
  → interruptible presentation retarget
```

## 17. Layout engine

### 17.1 Layout revision

```ts
type SceneRect = { x: number; y: number; width: number; height: number }
type ScenePoint = { x: number; y: number }

type SceneEntityGeometry = {
  entityKey: string
  rect: SceneRect
  zLayer: number
  density: TileDensity
  interactive: boolean
}

type SceneRelationGeometry =
  | {
      kind: "canonical-relation"
      sceneRelationKey: string
      relationKey: string
      points: readonly [ScenePoint, ScenePoint, ...ScenePoint[]]
    }
  | {
      kind: "observed-flow"
      sceneRelationKey: string
      relationKey: string
      points: readonly [ScenePoint, ScenePoint, ...ScenePoint[]]
      flowKey: string
    }
  | {
      kind: "focus-face-connector"
      sceneRelationKey: string
      connectorKey: string
      healthLevel: FocusHealthLevel
      memberEntityKeys: readonly [string, ...string[]]
      sourceFace: readonly [ScenePoint, ScenePoint]
      targetFace: readonly [ScenePoint, ScenePoint]
    }

type RenderGeometry = {
  bounds: SceneRect
  entities: readonly SceneEntityGeometry[]
  relations: readonly SceneRelationGeometry[]
}

type LayoutRevision = {
  structureRevision: string
  logicalMetricRevision: string
  geometryMetricRevision: string
  presentationGroupingRevision: string
  dataQueryHash: string
  projectionHash: string
  presentationHash: string
  viewportRevision: string
  policyRevision: string
}

type RenderSceneEntity = SceneEntityGeometry & {
  label: string
  kindLabel: string
  healthLevel: FocusHealthLevel
  metricText: string | null
  membershipRole: Entity["membershipRole"]
  lifecycle: Entity["lifecycle"]
  statusTokens: readonly string[]
  accessibilityName: string
}

type RenderScene = {
  schemaVersion: "topology-render-scene/v1"
  frameId: string
  layoutRevision: LayoutRevision
  presentation: TopologyPresentation
  mapUniverseEntityKeys: readonly string[]
  geometry: RenderGeometry
  entities: readonly RenderSceneEntity[]
  focusedEntityKey: string | null
  selectedEntityKeys: readonly string[]
  completeness: CompletenessSummary
  warnings: readonly StructuredWarning[]
}
```

`RenderScene`은 renderer의 유일한 domain input이다. `geometry.entities`와 `entities`의 entityKey 집합은 정확히 같고 중복이 없어야 한다. `geometry.relations`의 discriminant를 지운 generic ribbon으로 합치지 않는다. 모든 좌표/치수는 finite이며 width/height는 non-negative다. renderer는 API DTO, canonical store, provider metadata를 직접 읽거나 health/traffic/focus 의미를 다시 계산하지 않는다.

- map/fold-lens에서 health/status만 바뀌면 layout하지 않는다. focus-Sankey에서 effective health bucket이 바뀌면 right group/order와 face partition이 달라지므로 `presentationGroupingRevision`을 올리고 focus layout만 다시 계산한다.
- structure add/delete는 worker layout을 요청한다.
- metric value는 logical state에 즉시 적용한다. geometry는 별도 revision으로 추적한다.
- projected cumulative boundary displacement가 0.5 CSS px 이상이면 layout을 요청한다.
- 0.5px 미만 변화도 최대 250ms 또는 다음 interaction idle 중 먼저 도달한 시점에 coalesced layout으로 동기화한다.
- logical/geometry revision이 다르면 inspector는 최신 값을 보여주되 `layout updating` 상태를 표시하고, tile 내부 absolute value line은 geometry sync 전 이전 geometry revision 값 또는 숨김을 사용한다.
- gesture 중에는 §8.5의 captured geometry를 사용하고 pointer release 직후 latest logical revision으로 retarget한다.
- geometry lag가 250ms를 넘으면 performance invariant failure이며 silent stale geometry를 허용하지 않는다.
- lens 변화는 같은 entity set의 목표 geometry를 계산한다.
- 늦은 worker 응답은 전체 revision이 맞지 않으면 폐기한다.
- background update 때문에 자동 fitView하지 않는다.
- 사용자가 저장한 viewport/position은 structure/layout policy revision이 호환될 때만 복원한다.

### 17.2 Worker algorithms

- Treemap: stable squarified 또는 ordered treemap, deterministic tie-break by entityKey.
- Nested overview: outer Cluster/Node rect와 inner Node/Pod micro-layout을 별도 pass로 계산.
- Rail: entity grouping, ordering, edge port allocation.
- Bundle: shared source/target을 합치는 deterministic ribbon routing.
- Focus-Sankey: §8.3의 exactly-once partition, health ordering, face interval, unrelated tail을 deterministic하게 계산한다.
- Ownership detail: ELK layered layout adapter 사용 가능.
- Layout은 main thread에서 전체 graph를 계산하지 않는다.
- worker 사용 불가 시 low-volume safe fallback만 허용하고 명시적으로 degraded capability를 표시한다.
- 임의 fixed grid fallback으로 오류를 숨기지 않는다. 마지막 valid layout을 유지하고 retry/error state를 표시한다.

### 17.3 Layout stability pattern

- order-independent structure hash.
- 구조가 같으면 layout skip.
- 기존 위치 보존과 신규 entity만 배치하는 merge.
- async layout generation token과 stale result 폐기.
- 그룹 내부/그룹 간 2단계 ELK Worker pattern.
- p50/p95/p99 layout telemetry ring buffer.

Treemap, relation rail, flow scene, Motion은 이 계약의 revision/object-constancy 규칙으로 구현한다. flow update마다 전체 graph를 재-layout하거나 fixed-grid fallback으로 오류를 숨기지 않는다.

## 18. Motion과 object constancy

### 18.1 Identity

- React key와 Motion `layoutId`는 entityKey다.
- lens/scope 전환 시 visible entity를 가능한 한 unmount하지 않는다.
- Pod가 Treemap에서 rail로 이동해도 같은 entity다.
- 동일 이름/새 UID는 새 tile enter motion을 수행한다.
- projection aggregate가 exact entity로 펼쳐질 때 명시적인 membership morph map을 사용한다.

### 18.2 Interruptible retarget

1. worker가 목표 geometry를 반환한다.
2. 현재 presentation geometry를 animation start로 캡처한다.
3. 이전 animation을 cancel한다.
4. 새 목표로 retarget한다.
5. animation 도중 새 frame이 오면 같은 절차를 반복한다.
6. focus/selection은 entityKey를 따라간다.
7. 사라진 focus는 가장 가까운 visible ancestor 또는 relation source로 복원한다.

### 18.3 Motion token

duration, easing, stagger, gesture resistance, snap threshold, particle density, maximum simultaneous animations는 `topology-visual-motion-tokens.md`의 `TopologyVisualMotionPolicy/v1`에서 온다. component literal을 금지한다. fold와 scope 전환은 해당 문서의 `tile settle → line unfold → particle` 순서와 interruption rule을 따른다.

### 18.4 Reduced motion

- spatial morph를 즉시 또는 짧은 opacity transition으로 바꾼다.
- particle, continuous dash, pulse를 정지한다.
- arrow, width, pattern 같은 정적 의미는 유지한다.
- keyboard focus와 announcement는 동일하게 동작한다.

## 19. Adaptive renderer와 LOD

### 19.1 Rendering tiers

- DOM: frames, focused/selected tiles, controls, inspector, accessibility mirror.
- Canvas: 많은 small tiles, ribbons, particles.
- SVG: 선택/hover된 적은 edge와 marker.
- WebGL: 매우 높은 particle/ribbon density에서 capability가 있을 때.

renderer choice는 count 하나가 아니라 projected pixel area, visible edge density, rolling frame time, DPR, device capability, motion preference로 결정한다.

DOM/Canvas/SVG/WebGL의 진입·복귀 threshold, hysteresis, particle budget, accessibility mirror bound는 visual/motion adjunct §13의 중앙 정책을 따른다.

- Motion `layoutId`는 DOM tile adapter에만 사용한다. core object constancy는 renderer-neutral SceneEntity ID와 from/to geometry buffer가 담당한다.
- Canvas/WebGL은 같은 interpolation clock과 geometry revision으로 직접 보간한다.
- DOM↔Canvas↔WebGL tier 전환은 한 handoff frame 동안 old/new renderer를 같은 geometry로 dual-render한 뒤 token duration crossfade한다. 서로 다른 위치에서 재등장하지 않는다.
- pointer hit index와 accessibility mirror는 renderer tier가 아니라 SceneEntity ID를 기준으로 유지한다.
- focused entity는 DOM accessibility mirror와 camera target을 계속 가진다.
- WebGL context loss는 particle을 중지하고 Canvas static edge로 fallback한 뒤 2초 안에 복구를 시도한다. data/reducer state는 손실하지 않는다.

### 19.2 LOD 불변조건

- LOD는 member를 client scene에서 생략할 수 있지만 조용히 폐기하지 않는다. aggregate provenance/count/metric/completeness/expansion cursor를 제공한다.
- aggregate entity는 memberCount, health counts, metric totals, completeness, expansion token을 가진다.
- expansion은 server-side query/LOD plan으로 exact members를 가져온다.
- client에 loaded된 member는 group boundary가 바뀌어도 identity를 보존한다. 아직 fetch하지 않은 aggregate member의 client identity 보존을 주장하지 않는다.
- visible count와 total authorized count를 구분한다.
- view component에 resource count/animation threshold를 하드코딩하지 않고 versioned LOD/PerformancePolicy를 사용한다.

### 19.3 Performance budgets

`PerformancePolicy/topology-v1`의 기준 환경은 4 vCPU, 8 GiB RAM, Playwright가 pin한 Chromium, 1440×900 viewport, DPR 1, animation enabled, production build다. 브라우저 major 또는 policy 변경은 benchmark baseline revision을 올린다.

Reference data profiles:

| Profile | Source topology | 최대 client scene |
|---|---|---|
| S | 5 clusters, 50 Nodes, 2,000 Pods, 5,000 relations, 100 delta/s | 3,000 entities, 5,000 visible relations |
| M | 20 clusters, 500 Nodes, 20,000 Pods, 50,000 relations, 500 delta/s | 6,000 entities, 8,000 visible relations via LOD |
| F | focused Node with 2,000 Pods and 5,000 exact relations | 2,500 entities, 5,000 relations |
| X | 100 clusters, 5,000 Nodes, 200,000 Pods | 8,000 aggregate/visible entities; members server-side |

Required budgets:

| Measure | Budget |
|---|---|
| gesture/zoom frame | p95 ≤ 16.7ms, p99 ≤ 33.4ms |
| input-to-presentation latency | p95 ≤ 50ms |
| main-thread long task during 5s gesture | 0 tasks > 50ms |
| worker layout S/M/F | p95 ≤ 80ms / 250ms / 500ms |
| validated snapshot → first meaningful scene | p95 ≤ 1,000ms |
| committed fold-lens/scope → settled morph | p95 ≤ 700ms |
| focus ribbon erase | canonical `ribbonErase=150ms` + 최대 1 animation frame; 완료 전 morph 0건 |
| ribbon erase 완료 → 마지막 cube settle | canonical `focusMorph=720ms` + map x순 stagger 최대 300ms + 최대 1 animation frame, 즉 최대 1,020ms + 1 frame; label은 cube-local `labelReveal=80%` |
| 마지막 cube settle → 마지막 connector complete | connector 0개면 0ms; 그 외 정지 60ms + canonical `ribbonDraw=560ms + (G-1)×connectorStagger(110ms)` + 최대 1 animation frame. `G≤5`이므로 최대 1,060ms + 1 frame |
| focus activation → pending/first visual response | p95 ≤ 50ms |
| Canvas/WebGL draw | p95 ≤ 8ms |
| stream staged backlog | p95 ≤ 2 animation-frame batches; structural drop = 0 |
| stable 1h run | unexpected resync = 0; detached DOM growth = 0 |
| heap M/X after settle | ≤ 350 MiB / 500 MiB |
| heap growth during 1h M soak | ≤ 25 MiB after GC checkpoints |
| DOM nodes | ≤ 2,500 in M/X; accessibility mirror included |
| geometry lag | ≤ 250ms and cumulative boundary error < 0.5 CSS px before sync |

Network/backend latency는 별도 API SLO로 측정하고 frontend render budget에서 숨기지 않는다. 낮은 성능 device에서는 adaptive LOD/motion policy가 scene을 줄이되 data completeness를 aggregate로 보존한다.

Release gate는 다음 telemetry를 함께 기록한다.

- interaction frame p50/p95/p99와 long task.
- worker layout p50/p95/p99.
- query commit → first meaningful scene.
- query commit → settled morph.
- stream backlog, coalesced count, resync count.
- DOM node count, heap growth, detached node.
- Canvas/WebGL draw time.
- stale worker result와 dropped presentation frame.
- 1시간 이상 실시간 실행의 bounded memory.

위 profile/budget을 통과하지 않은 `완전 부드럽다` 주장은 acceptance가 아니다. 수치는 view literal이 아니라 versioned PerformancePolicy와 benchmark fixture의 중앙 계약이다.

## 20. Theme, visual system, responsive behavior

### 20.1 Semantic tokens

실제 light/dark/high-contrast 값, pattern descriptor, contrast 목표, dimension, z-order는 `topology-visual-motion-tokens.md`가 authoritative하다. 아래 type은 theme adapter가 제공해야 할 의미 key의 축약 목록이며 색상 literal을 정의하지 않는다.

```ts
type TopologyThemeTokens = {
  canvas: string
  surface: string
  surfaceRaised: string
  surfaceInset: string
  text: string
  textSoft: string
  textMuted: string
  border: string
  borderStrong: string
  focusRing: string
  healthHealthy: string
  healthNeutral: string
  healthDegraded: string
  healthUnhealthy: string
  healthUnknown: string
  relationConfigured: string
  relationEffective: string
  relationObserved: string
  relationOwnership: string
  relationDependency: string
  metricMissingPattern: string
  metricStalePattern: string
  restrictedPattern: string
}
```

- raw color는 `product/styles/tokens.css`에만 존재한다.
- light, dark, high-contrast set이 같은 semantic key를 모두 구현한다.
- `color-scheme: dark`만 있는 현재 token은 완료 상태가 아니다.
- theme 전환은 identity, layout, query를 바꾸지 않는다.
- contrast를 모든 상태/선/텍스트에서 자동 검사한다.
- relation plane을 color alone으로 구분하지 않고 dash/marker/label을 함께 사용한다.

### 20.2 Industrial visual character

- 기본 화면은 calm, dense, evidence-led다.
- blur/glow는 focus나 observed flow의 제한된 강조에만 사용한다.
- 상태가 정상인 수천 tile을 모두 발광시키지 않는다.
- motion은 관계와 위치 변화를 설명해야 하며 장식용 무한 animation을 금지한다.
- 숫자는 tabular figure와 canonical unit formatter를 사용한다.
- 장황한 card dashboard보다 map과 inspector를 우선한다.

### 20.3 Responsive

- wide: butterfly relation lens와 persistent inspector 가능.
- medium: 한쪽 rail만 펼치고 inspector overlay/drawer.
- narrow: gesture 대신 explicit lens control, relation list와 focused chain을 우선.
- 어떤 viewport에서도 핵심 기능이 horizontal gesture에만 묶이지 않는다.
- mobile에서 모든 edge를 축소해 그리지 않고 selected chain과 aggregate relation을 제공한다.

## 21. Interaction, focus, selection, navigation

### 21.1 용어 분리

- hover: 일시적 preview.
- focus: keyboard/pointer가 현재 조작할 entity.
- selection: multi-select/query context.
- activation: click/Enter로 현재 presentation이 선언한 focus, retarget, detail navigation을 실행.
- scope: containment context.
- relation focus: scope를 바꾸지 않고 connected subgraph를 강조. v0 map에서는 focus-Sankey presentation이 이를 담당한다.

```ts
type SelectionState = {
  entityKeys: readonly string[]
  anchorEntityKey?: string
  mode: "replace" | "toggle" | "range" | "lasso"
  revision: string
}
```

- plain activation은 focus/activate이고 selection을 암묵적으로 query filter로 바꾸지 않는다.
- checkbox/Space는 replace, platform modifier는 toggle, ordered list Shift는 range, explicit canvas selection tool만 lasso를 사용한다.
- multi-selection은 aggregate inspector와 bulk action eligibility를 계산한다. relation focus는 별도 presentation state다.
- selection limit은 `InteractionPolicy/v1`의 500 entities다. 초과 lasso는 aggregate selection suggestion을 제공하고 일부만 조용히 선택하지 않는다.
- query/scope change 후 보이지 않는 selection은 제거하고 announcement한다.
- URL은 기본적으로 selection을 저장하지 않는다. 명시적 SavedView만 entitlement 재검증 가능한 entityKey selection을 저장한다.

### 21.2 Activation routing

같은 entity라도 현재 presentation과 surface role에 따라 descriptor가 달라진다. Kind switch로 처리하지 않는다.

| Surface role | 기본 activation |
|---|---|
| map cube | 해당 entity를 source로 `focus-sankey` 진입 |
| focus-Sankey right member | 해당 entity를 새 source로 interruptible retarget |
| focus-Sankey source | entity inspector 열기 |
| Cluster/Node/Pod의 명시적 `들어가기` action | containment scope zoom |
| Container의 detail action | Container detail/log/evidence |
| Service/Ingress/Gateway/Route detail action | network relation inspector 또는 연결 화면 |
| Deployment/StatefulSet/DaemonSet/Rollout/ReplicaSet/Job detail action | managed descendant/ownership inspector |
| ConfigMap/Secret/PVC/PV detail action | dependency/storage inspector |
| GitOps resource detail action | canonical GitOps detail route |
| verified Git HTTP URL | external navigation effect |
| projection/placeholder | explanatory inspector |

Cluster→Node→Pod→Container drill-down은 제거하지 않는다. 다만 cube click과 containment navigation을 한 제스처에 중복 배정하지 않는다. frame/header/inspector의 명시적 `들어가기` action과 breadcrumb가 scope를 바꾸며, map cube click/Enter는 focus-Sankey만 연다. scope마다 진입 대상이 없는 entity에는 `들어가기` action을 제공하지 않는다.

Activation handler는 catalog의 `ActionDescriptor`를 dispatch한다. pointer와 keyboard는 같은 descriptor/actionId를 사용하고, focus transition과 inspector/navigation을 동시에 실행하지 않는다.

### 21.3 Focus restoration

- scope/lens/query 전환 동안 같은 entityKey가 보이면 focus를 유지한다.
- filter 때문에 사라지면 nearest visible ancestor, relation source, Query Bar 순으로 복원한다.
- 삭제된 entity는 tombstone announcement 후 focus를 복원한다.
- virtualized/Canvas tile은 DOM accessibility mirror의 동일 entityKey와 연결한다.

### 21.4 Undo와 URL

- query token, scope, committed presentation mode, lens, focus-Sankey source, time window는 URL codec이 직렬화한다. 일시적인 keyboard focus/hover는 URL에 넣지 않는다.
- high-frequency drag progress는 URL에 기록하지 않고 committed snap만 기록한다.
- browser back/forward는 URL adapter가 `url.hydrated` message로 dispatch한다.
- engine state를 component history와 별도로 유지하지 않는다.
- URL에는 raw Secret/annotation, bearer token, provider credential, metric sample을 절대 넣지 않는다.
- 기본 공유 방식은 server-side SavedView의 opaque ID와 schema version이다. recipient는 자신의 entitlement/catalog로 query를 다시 plan한다.
- 아직 저장하지 않은 local view는 referrer로 전송되지 않는 URL fragment에 canonical query를 넣을 수 있지만 4,096 byte를 넘으면 SavedView 생성을 요구한다.
- fragment에도 resource display label 대신 entityKey/catalog field ID를 우선한다. namespace/label filter가 포함되면 공유 전 민감 가능성을 알린다.
- URL codec은 schema migration table을 가지며 unsupported major는 기존 state를 추정하지 않고 migration error를 표시한다.
- 권한이 다른 사용자가 link를 열면 원 사용자의 count/result를 캐시에서 보여주지 않고 새 session으로 replan한다.

## 22. Accessibility

- tile은 semantic button/treeitem 또는 accessibility mirror의 동등 node다.
- roving tabindex를 사용한다.
- arrow key는 spatial neighbor index로 이동한다.
- Enter는 activate, Space는 select, Escape는 relation focus/scope를 단계적으로 해제한다.
- focus-Sankey 진입·retarget·복귀와 fold-lens는 버튼/shortcut으로도 실행할 수 있다.
- screen reader label은 kind, name, namespace, status, selected metric exact value를 포함한다.
- 관계는 source, type, target, truth, freshness를 읽을 수 있는 textual list를 제공한다.
- 모든 telemetry tick을 aria-live로 알리지 않는다.
- user-triggered query/scope/lens 결과, disconnect, stale, action result만 polite announcement한다.
- 200% zoom, keyboard only, screen reader, reduced motion, high contrast를 release gate에 넣는다.
- tiny Canvas tile도 search/keyboard relation list에서 접근 가능하다.
- fine pointer와 keyboard accessibility mirror의 직접 target은 최소 24×24 CSS px, coarse pointer/touch target은 최소 44×44 CSS px다. 44×44보다 작은 tile의 touch는 visual adjunct의 56×56 target lens를 먼저 사용하며, 24×24보다 작은 data mark는 직접 조작 대상이 아니고 zoom/search/list로 접근한다.
- zoom in/out/reset/fit-selection에 visible button과 keyboard shortcut을 제공한다. wheel/pinch만으로 zoom하지 않는다.
- keyboard focus가 viewport 밖 entity로 이동하면 reduced-motion policy에 맞춰 camera가 해당 entity를 보이게 이동한다.
- hierarchy mirror는 `aria-level`, `aria-posinset`, `aria-setsize`, expanded state를 제공한다.
- RTL에서는 inline-start/end gesture와 spatial left/right를 mirror하고 graph edge direction의 source/target 의미는 유지한다.
- browser 400% zoom 또는 320 CSS px reflow에서 horizontal page overflow 없이 map 대체 list와 inspector를 사용할 수 있어야 한다.
- labelKey, number, unit, currency, relative/absolute time은 locale formatter registry를 사용하고 raw provider string을 UI 문구로 사용하지 않는다.

## 23. 상태와 오류의 완전한 행렬

### 23.1 Orthogonal engine status

Page state를 하나의 mutually-exclusive enum으로 만들지 않는다. partial이면서 stale이고 disconnected일 수 있으므로 다음 축을 동시에 가진다.

```ts
type EngineStatus = {
  bootstrap: "uninitialized" | "loading-session" | "loading-catalog" | "ready" | "failed"
  mode: "live" | "frozen-frame" | "historical"
  query: "idle" | "planning" | "loading-initial" | "ready" | "rejected" | "failed"
  frame: "absent" | "nonempty" | "empty-authoritative"
  connection: "not-applicable" | "connecting" | "connected" | "disconnected" | "resyncing"
  freshness: "fresh" | "mixed" | "stale" | "unknown"
  completeness: "complete" | "partial" | "unknown"
  permission: "full-for-authorized-scope" | "limited" | "forbidden"
  layout: "idle" | "computing" | "ready" | "failed"
  scopedErrors: readonly StructuredError[]
}
```

Composition 규칙은 다음과 같다.

1. session/catalog가 준비되지 않았고 valid frame도 없으면 bootstrap screen이다.
2. 첫 snapshot이 없으면 map skeleton이다.
3. valid frame이 하나라도 있으면 planning, disconnected, resyncing, stale, partial, layout failure 중에도 마지막 scene을 유지한다.
4. `empty-authoritative`는 query가 ready이고 관련 source completeness가 complete이며 authorized entity가 정확히 0일 때만 설정한다.
5. unsupported metric/relation은 query rejection 또는 capability banner이지 page 전체 error가 아니다.
6. error는 catalog, query, snapshot, stream, layout, action별 scoped error로 보존한다.
7. live/fixed mode, freshness, connection, completeness badge를 서로 덮어쓰지 않는다.

### 23.2 Empty와 forbidden

- informer ready + exact count 0만 empty다.
- 403은 forbidden이며 0이 아니다.
- 404 API group 없음은 unsupported/not-installed다.
- timeout은 error/partial이다.
- sync 전은 loading/partial이다.
- permission-limited count denominator에 forbidden resource를 포함하지 않는다.
- cross-namespace restricted peer는 이름, namespace, count를 누설하지 않는다.

### 23.3 Layout failure

- last valid layout을 유지한다.
- 첫 layout이라 last valid geometry가 없으면 blank/fake grid 대신 cursor-paginated accessible structure list, error reason, retry를 표시한다.
- scene을 arbitrary grid로 바꾸지 않는다.
- layout error와 retry action을 표시한다.
- 같은 revision의 무한 retry를 막는 bounded policy를 사용한다.
- simpler LOD retry는 의미 보존 aggregate를 사용하고 diagnostic을 남긴다.

### 23.4 Query failure

- invalid text를 AST에 commit하지 않는다.
- planner failure는 기존 scene을 유지한다.
- 실패한 token과 이유/지원 범위를 정확히 표시한다.
- source unavailable 때문에 metric term이 실행 불가하면 expression을 조용히 축소하지 않는다.

## 24. Security, tenancy, privacy

### 24.1 RBAC universe

- query 첫 단계에서 workspace/user/cluster/GVR별 authorized universe를 계산한다.
- projection, count, metric coverage denominator, relation traversal 모두 이 universe 안에서 수행한다.
- derived relation이 forbidden peer identity를 노출하지 않는다.
- user permission이 바뀌면 catalog/snapshot/stream epoch를 갱신한다.

Restricted reference 규칙:

- authorized source object의 spec에 target name/coordinate가 이미 명시돼 있으면 그 coordinate 범위 안에서만 restricted placeholder를 만들 수 있다. 예: 읽을 수 있는 PodSpec의 `secretName`.
- traffic, cost, metric join 또는 hidden object traversal에서 처음 발견한 peer는 placeholder, 이름, namespace, Kind, count를 만들지 않는다.
- 제품적으로 boundary 존재를 알릴 권한이 있을 때만 source에 cardinality 없는 `RestrictedBoundaryMarker`를 붙인다.
- marker는 peer 수, identity, namespace를 포함하지 않는다. 정책상 boundary 존재도 숨겨야 하면 marker도 생략한다.
- permission 변화 시 placeholder/marker를 같은 stream epoch에서 patch하지 않고 entitlement epoch를 바꾸고 resync한다.

### 24.2 Stream isolation

- cache key는 `workspaceId + clusterUid`다.
- display cluster ID만으로 cache/fanout하지 않는다.
- stream token은 queryId와 entitlement에 bind한다.
- delta에 GVR/GVK와 UID가 있어야 exact permission filter가 가능하다.
- browser subscription 전에 cluster access를 검증한다.
- gateway restart 후 authoritative snapshot에서 복구한다.

### 24.3 Sensitive resources

- Secret data, token, certificate body를 수집/전송/검색 index에 넣지 않는다.
- ConfigMap도 policy가 허용한 metadata/keys count만 overview에 표시한다.
- label/annotation은 catalog allow/redact policy를 적용한다.
- external URL은 scheme/host/provider parser로 검증한다.
- query language에 raw PromQL, CEL, regex denial-of-service, arbitrary code를 허용하지 않는다.
- action은 기존 command gateway, authorization, audit, confirmation을 거친다.
- resource name, label, annotation, status message, event message는 untrusted text다. React text node로만 렌더링하고 `dangerouslySetInnerHTML`/raw SVG/HTML을 금지한다.
- rich content가 필요한 first-party Markdown도 allowlisted parser와 sanitized AST만 사용한다.
- icon/marker는 build allowlist token으로만 선택하고 server-provided SVG markup/URL을 실행하지 않는다.
- runtime parser는 `__proto__`, `constructor`, `prototype` key를 거부하고 untrusted object를 plain-object merge하지 않는다.
- catalog/snapshot/detail/event payload에 최대 byte, array count, depth, string length budget을 적용한다.
- CSP와 Trusted Types를 production gate로 사용하고 external navigation은 `noopener,noreferrer`와 verified scheme/host policy를 적용한다.
- telemetry, error, support bundle은 secret/label/annotation/redacted field policy를 다시 적용하고 raw payload를 기록하지 않는다.

## 25. 현재 프로젝트의 mandatory backend gap

이 절은 기존 endpoint의 소규모 확장이 아니다. Inventory Projection, Relation Projection, Metric/Cost facts, Query Session, retained delta log, resumable stream을 추가하는 topology backend v2 프로그램이다. frontend 구현 착수 조건과 backend workstream을 별도 milestone/owner로 추적한다.

### 25.1 Collector gap

현재 `kubernetes_providers.py`는 configured namespace의 Pods, Events, Nodes, Pod/Node metrics, Deployment, StatefulSet, DaemonSet, ReplicaSet, Service, EndpointSlice만 고정 조회한다. 다음을 변경해야 한다.

- cluster 전체 또는 entitlement/query 기반 namespace discovery.
- paginated LIST와 watch.
- Namespace, Ingress, Gateway API, ConfigMap, Secret metadata, PVC/PV/StorageClass, Job/CronJob, HPA/VPA/KEDA, PDB/NetworkPolicy, ServiceAccount/RBAC, arbitrary CRD.
- typed/dynamic discovery catalog.
- raw UID/GVK/GVR/RV/generation/owner refs/controller flag.
- Pod/container request/limit/overhead/volume data.
- EndpointSlice service label, targetRef, condition, topology.
- kind/source별 completeness.

현재 403/404를 `{items: []}`로 합치는 동작은 forbidden, not-installed, empty를 분리하도록 변경한다.

### 25.2 Normalization gap

- `safe_labels(limit=12)`를 selector truth source로 쓰지 않는다.
- first owner kind/name만 보존하지 않고 모든 owner UID/controller ref를 보존한다.
- DaemonSet/Job 등 kind-specific summary는 plugin으로 계산한다.
- Service health default healthy를 제거한다.
- name-based SHA identity를 UID identity로 migration한다.
- identity migration은 old coordinate SHA와 새 UID key의 dual-read mapping, saved URL/bookmark/focus/timeline/action reference rewrite, recreation 분리, rollback/expiry policy를 포함한다.
- list limit 1000/no cursor를 server-side LOD/cursor query로 바꾼다.
- relationship repository의 one-hop heuristic을 Relation Projection으로 교체한다.

### 25.3 Realtime gap

- workspace-scoped Query Session service를 새로 만든다.
- query session은 canonical query/hash, entitlement epoch, snapshot cut, streamId/epoch, retained event log cursor, expiry를 durable 또는 replicated state로 관리한다.
- NATS/outbox의 원 event를 query별 entity/relation/metric/flow delta로 projection하고 query stream global sequence를 부여한다.
- retained delta log는 resume TTL/size, tenant quota, compaction, server restart continuity를 보장한다.
- snapshot builder와 delta log 사이에 §16.3 cutover cursor를 원자적으로 발급한다.
- resumeToken 서명/검증, retention expiry, hash/epoch mismatch handshake를 구현한다.
- periodic anti-entropy snapshot과 UID diff/replay를 구현한다.
- horizontally scaled gateway의 session ownership/failover와 workspace 격리를 구현한다.
- delta key를 `cluster/ns/kind/name`에서 workspace/cluster/GVK/UID로 변경한다.
- resourceVersion, generation, eventId, epoch, query-stream seq, timestamps, data/projection hash를 포함한다.
- Pod만이 아니라 entity/relation/metric/flow delta를 지원한다.
- configured namespace/pod limit가 전체 cluster truth인 것처럼 보이지 않게 한다.
- hub cache/fanout key에 workspace를 포함한다.
- queue overflow는 silent latest replacement가 아니라 resync contract를 사용한다.
- agent/gateway restart와 reconnect resume를 테스트한다.
- 현재 in-memory realtime hub를 그대로 확장해 이 요구를 만족한다고 간주하지 않는다.

### 25.4 Metrics/traffic/cost gap

- effective request/limit metric 생성.
- fixed `asOf/start/end/step` batch query.
- source timestamps와 stale TTL.
- standard flow edge schema.
- Hubble/Istio/Caretta/Prometheus capability adapters.
- unique PVC storage facts.
- allocated/shared/idle/asset/unallocated CostFact ledger와 currency/window/pricing/allocation/amortization policy.
- Node actual usage와 Pod attributable usage residual.

### 25.5 Current product frontend gap

- active product surface는 `references/ui-layer-lab/src/product`다.
- 삭제된 `frontend/`는 복구하거나 기반으로 삼지 않는다.
- 현재 product token은 dark-only이므로 light/high-contrast set을 추가해야 한다.
- product component는 `product/api` 밖에서 fetch하지 않는다.
- 외부 기준 저장소의 lab/vendor/generated component를 product에 import하지 않는다.
- runtime JSON은 generated schema로 validate한다.

## 26. API contract 상세

### 26.1 Catalog response

```ts
type ClusterCapabilitySummary = {
  clusterUid: string
  displayName: string
  access: CompletenessSummary["access"]
  capabilityIds: readonly string[]
  sourceIds: readonly string[]
  observedAt: string | null
  freshness: "fresh" | "stale" | "unknown"
  completeness: "complete" | "partial" | "unknown"
}

type RelationCatalogEntry = {
  relationType: string
  plane: RelationPlane
  labelKey: string
  iconToken: string
  direction: "directed"
  authorities: readonly RelationAuthority[]
  sourceFamilyIds: readonly string[]
  targetFamilyIds: readonly string[]
  renderChannel: "line" | "bracket" | "configured-edge" | "observed-flow"
  capabilityId: string | null
}

type RendererDescriptor = {
  rendererId: string
  rendererRevision: string
  roles: readonly ("frame" | "tile" | "relation" | "flow" | "focus-face-connector" | "accessibility-mirror")[]
  tiers: readonly ("dom" | "canvas" | "svg" | "webgl")[]
  entityClasses: readonly EntityClass[]
  capabilityId: string | null
  priority: number
}

type ActionParameterDescriptor = {
  parameterId: string
  labelKey: string
  required: boolean
} & (
  | { kind: "text"; minLength: number; maxLength: number; patternId: string | null }
  | { kind: "boolean"; defaultValue: boolean | null }
  | { kind: "integer"; minimum: number | null; maximum: number | null }
  | { kind: "decimal"; unitId: UnitId | null; minimum: DecimalString | null; maximum: DecimalString | null }
  | { kind: "choice"; choices: readonly { value: string; labelKey: string }[]; allowMultiple: boolean }
  | { kind: "entity"; familyIds: readonly string[]; cardinality: "one" | "many" }
)

type ActionDescriptor = {
  actionId: string
  descriptorRevision: string
  labelKey: string
  descriptionKey: string | null
  category: "presentation" | "inspect" | "navigate" | "query" | "operation"
  target:
    | { kind: "entity"; cardinality: "one" | "many"; familyIds: readonly string[] }
    | { kind: "application-instance"; cardinality: "one" }
    | { kind: "operation"; cardinality: "one" }
  capabilityId: string | null
  permissionId: string
  parameters: readonly ActionParameterDescriptor[]
  confirmation:
    | { kind: "not-required" }
    | { kind: "required"; titleKey: string; bodyKey: string; risk: "low" | "medium" | "high" }
  dispatch:
    | { kind: "engine-intent"; intentType: string }
    | { kind: "internal-route"; routeTemplateId: string }
    | { kind: "external-navigation"; verifiedUrlFieldId: string }
    | { kind: "command"; commandKind: string; idempotencyScope: "workspace-actor" }
  invalidateTags: readonly string[]
}

type ActionUnavailableReason = {
  code: string
  messageKey: string
  recoverable: boolean
}

type AvailableActionBase = {
  actionId: string
  descriptorRevision: string
  capabilityRevision: string
  expectedStateToken: string | null
}

type AvailableAction =
  | (AvailableActionBase & { availability: "enabled"; reason: null })
  | (AvailableActionBase & { availability: "disabled"; reason: ActionUnavailableReason })

type TopologyCatalogResponse = {
  schemaVersion: string
  catalogRevision: string
  clusters: ClusterCapabilitySummary[]
  resources: ResourceCatalogEntry[]
  relations: RelationCatalogEntry[]
  metrics: MetricDescriptor[]
  flowMetrics: FlowMetricDescriptor[]
  actions: ActionDescriptor[]
  renderers: RendererDescriptor[]
  sourceHealth: SourceWatermark[]
}
```

`ActionDescriptor`는 실행 가능 여부 그 자체가 아니라 catalog schema다. 현재 target의 enabled/disabled/hidden 판정은 descriptor revision, subject capability, permission, current state token을 결합한 `AvailableAction`에서 계산한다. hidden action은 `AvailableAction[]`에 포함하지 않으며 count나 disabled reason도 노출하지 않는다. provider 이름, provider DTO, 임의 URL, executable code를 descriptor에 넣지 않는다. unknown `intentType`, route template, command kind는 registry validation에서 catalog 전체를 거부하지 않고 해당 action만 unsupported로 격리한다.

### 26.2 Plan response

```ts
type QueryPlanResponse = {
  schemaVersion: string
  planId: string
  queryId: string
  canonicalPlanQuery: TopologyPlanQuery
  hashes: TopologyPlanHashes
  estimated: {
    entities: number
    relations: number
    metricSeries: number
    lodLevel: string
  }
  effectiveCapabilities: string[]
  warnings: StructuredWarning[]
  expiresAt: string
}
```

### 26.3 Detail response

Entity detail은 raw object dump 하나가 아니다.

```ts
type DetailFieldValue =
  | { kind: "text"; value: string }
  | { kind: "decimal"; value: DecimalString; unitId: UnitId }
  | { kind: "count"; value: number }
  | { kind: "timestamp"; value: string }
  | { kind: "entity-ref"; entityKey: string; label: string }
  | { kind: "health"; level: TopologyHealthVerdict["level"]; reason: string }

type DetailField = {
  fieldId: string
  labelKey: string
  value: DetailFieldValue
  copyable: boolean
}

type DetailSection =
  | { sectionId: string; labelKey: string; state: "available"; fields: readonly DetailField[] }
  | {
      sectionId: string
      labelKey: string
      state: "partial"
      fields: readonly DetailField[]
      warning: StructuredWarning
    }
  | {
      sectionId: string
      labelKey: string
      state: "restricted" | "unavailable"
      fields: readonly []
      reason: ActionUnavailableReason
    }

type MetricSeriesRef = {
  seriesKey: string
  metricId: string
  label: string
  unitId: UnitId
  window: TimeWindow
  latestValueDecimal: DecimalString | null
  status: MetricStatus
  observedAt: string | null
  freshness: "fresh" | "stale" | "unknown"
  completeness: "complete" | "partial" | "unknown"
}

type KubernetesEventSummary = {
  eventKey: string
  regardingEntityKey: string
  eventType: "normal" | "warning" | "unknown"
  reason: string
  sanitizedMessage: string | null
  reportingController: string | null
  occurrenceCount: number
  firstObservedAt: string
  lastObservedAt: string
}

type EntityDetail = {
  entity: Entity
  summarySections: DetailSection[]
  relationsByPlane: Partial<Record<RelationPlane, TopologyCursorPage<CanonicalRelation>>>
  metricSeries: TopologyCursorPage<MetricSeriesRef>
  events: TopologyCursorPage<KubernetesEventSummary>
  provenance: TopologyCursorPage<EvidenceRef>
  actions: AvailableAction[]
  completeness: CompletenessSummary
}

type EntityDetailRequest = {
  entityKey: string
  relationPlanes: readonly RelationPlane[]
  relationCursorByPlane?: Partial<Record<RelationPlane, string>>
  metricCursor?: string
  eventCursor?: string
  provenanceCursor?: string
  pageSize: number
  metricWindow?: TimeWindow
}
```

action availability는 permission/capability/status를 반영하고 disabled 이유를 제공한다.

- `DetailField`는 catalog allowlist field만 사용하며 Secret/config value, credential, raw manifest/provider JSON을 포함하지 않는다. `copyable=true`는 redaction과 safe-value policy를 통과한 값에만 허용한다.
- Kubernetes event message는 control character/markup/credential policy를 통과한 plain text이며 raw object가 아니다. occurrenceCount는 1 이상의 safe integer이고 timestamp는 UTC canonical RFC 3339다.
- pageSize는 server catalog limit 안에서 planner가 canonicalize한다.
- page fetch는 entity focus/query change에서 abort한다.
- nextCursor는 opaque하고 snapshotRevision에 bind한다. revision mismatch는 first-page refetch다.
- route path의 entityKey는 opaque base64url-safe ID 또는 URL-safe encoding만 허용한다.

## 27. Test architecture와 release gates

### 27.1 Contract tests

- backend schema와 generated TypeScript의 compatibility.
- unknown enum/GVK forward compatibility.
- catalog revision migration.
- URL codec canonical round trip.
- old stream schema rejection/resync.

### 27.2 Property tests

- parent area equals descendant leaf sum within numeric tolerance.
- physical metric은 unit/dimension이 보존된다.
- composite weight 합은 1이고 score는 finite/nonnegative다.
- strict missing resource는 positive Treemap cohort에 들어가지 않는다.
- relation key는 deterministic하고 inverse duplicate가 없다.
- same UID는 ordering/query serialization과 무관하게 same entityKey다.
- same UID가 서로 다른 served API version으로 관측되어도 same entityKey다.
- same name/new UID는 다른 entityKey다.
- reducer는 동일 event를 두 번 적용해도 state가 같다.
- out-of-order event가 state를 되돌리지 않는다.
- fold-lens change는 size score를 바꾸지 않는다.
- fold-lens-only change는 dataQueryHash를 바꾸지 않고 presentationHash만 바꾼다.
- map/focus-Sankey mode 또는 focus source change는 dataQueryHash/projectionHash를 바꾸지 않고 presentationHash만 바꾼다.
- grouping change는 dataQueryHash를 바꾸지 않고 projection/presentation hash를 바꾼다.
- map/fold-lens의 health-only update는 layout revision을 바꾸지 않는다. focus-Sankey의 health bucket 변경은 data/projection hash를 유지하고 `presentationGroupingRevision`만 바꾼다.
- snapshot cut S와 buffered `S+1...N` replay 결과는 동일 event log를 순차 적용한 결과와 같다.
- focus partition은 임의 universe/relation/health 입력에서 `right + source = map universe`이고 source/connector/unrelated 집합이 서로소다.
- focus connector 수는 non-empty related health group 수와 같고 source face partition 합은 정확히 1이다.
- relation 수가 늘어도 같은 right entity가 중복되지 않으며 focus face connector는 canonical relation store를 바꾸지 않는다.

### 27.3 Generator/fuzz matrix

다음을 조합 생성한다.

- 0/1/many cluster, 0/1/many Node/Pod/Container.
- unscheduled, orphan, terminating, recreated UID.
- duplicate names across namespace/cluster/GVK.
- arbitrary CRD and malformed conditions.
- owner cycle, missing owner, multiple owners.
- selectorless/headless/ExternalName/multi-port Service.
- selector/EndpointSlice mismatch, not-ready/terminating endpoint.
- Ingress default backend, Gateway ReferenceGrant allow/deny.
- shared ConfigMap/Secret/PVC and cross-namespace ref.
- all zero/missing/stale/forbidden과 metric status 축의 모든 조합.
- currency/window mismatch and shared/idle cost.
- sequence duplicate/gap/reorder/epoch reset/reconnect.
- layout result reorder, timeout, crash, superseded result.

### 27.4 Visual regression

- Fleet, Cluster, Node, Pod scope.
- placement/network/ownership/butterfly lens.
- gesture progress의 대표 중간 frame.
- light/dark/high-contrast/reduced-motion.
- loading/empty/partial/stale/disconnected/resyncing/forbidden/error.
- tiny/medium/large tile density.
- no percentage gauge inside tiles.
- long name, CJK, RTL, 200% zoom.
- relation configured/effective/observed/dropped/stale states.
- map/focus-Sankey와 focus 전환 50% frame, face connector draw 50% frame.
- focus right column completeness, unrelated tail, health ordering, one connector/non-empty health group.
- observed flow ribbon과 focus face connector의 legend/label/style 비혼동.

### 27.5 Interaction/click-path audit

모든 visible control과 clickable entity를 registry에서 enumerate하고 다음을 자동 검증한다.

- handler가 EngineMessage를 dispatch하는가.
- direct fetch/navigation/state mutation이 없는가.
- keyboard와 pointer 결과가 동등한가.
- loading/error/permission 상태에서 정확히 disabled되는가.
- focus가 복원되는가.
- action이 audit/confirmation contract를 통과하는가.

### 27.6 Performance/soak

reference profiles는 server-generated realistic topology로 고정하고 small/medium/large/extreme을 모두 둔다. 각 profile은 cluster/node/pod/relation/metric/flow rate, device/browser를 기록한다.

- initial snapshot memory/latency.
- continuous stream 1시간 이상.
- burst add/delete/rollout.
- high-rate flow with backpressure.
- rapid query token add/remove.
- lens drag 중 metric/structure update.
- repeated scope drilldown/back.
- theme/motion preference change.

### 27.7 Security/tenancy

- two workspaces with same display cluster ID.
- forbidden kind and cross-namespace peer redaction.
- cost/traffic derived endpoint permission.
- Secret/annotation redaction.
- malicious query/regex/URL.
- replayed/stale stream token.

## 28. 구현 순서: 완성 제품 vertical slices

이 순서는 MVP 범위를 줄이는 목록이 아니다. 최종 제품을 오류 없이 조립하기 위한 dependency order다. 각 단계는 다음 단계 전에 contract와 test를 완료한다.

### Phase 1 — Contracts and engine kernel

- schemas, entity/relation/metric/catalog/message types.
- generated TypeScript/runtime-schema models와 backend 구현 언어 model. 현재 backend가 Python이면 Python model을 생성하며 존재하지 않는 언어 artifact를 요구하지 않는다.
- pure reducer, effect descriptions, invariant checker.
- Query AST, canonicalizer, URL codec, planner contract.
- product tree 밖 pure generators, fake clock, test-runner network fixtures.

### Phase 2 — Universal collection and projection

- cluster-scoped typed/dynamic discovery.
- paginated LIST/watch and completeness.
- UID inventory projection.
- relationship provider registry.
- metric/provider capability catalog.
- RBAC universe and redaction.

### Phase 3 — Snapshot/stream coherence

- ProjectionFrame and query plan endpoints.
- versioned snapshot.
- single outer stream envelope, resume/gap/resync.
- frame batching and anti-entropy.
- source watermarks/stale policy.

### Phase 4 — Headless query, metric, layout

- physical/composite evaluator.
- zero/missing/residual rails.
- stable nested Treemap worker.
- focus-Sankey exactly-once partition/health connector worker.
- relation rail/bundle worker.
- ELK ownership detail adapter.
- revision/hash/stale-result handling.

### Phase 5 — Renderer and design system

- adaptive DOM/Canvas/SVG renderer.
- semantic tiles/relations/particles.
- light/dark/high-contrast/reduced-motion tokens.
- object constancy and interruptible Motion morph.
- map→focus-Sankey face connector renderer와 observed-flow ribbon 타입 분리.
- accessibility mirror/spatial navigation.

### Phase 6 — Product composition

- Query Bar.
- Fleet/Cluster/Node/Pod scopes.
- map/focus-Sankey 기본 presentation과 capability-gated network/ownership/butterfly fold-lens.
- context strip, catalog sidebar, inspector.
- relation focus and routing/actions.
- all state/error/permission screens.

### Phase 7 — Provider and operational depth

- Prometheus/Metrics Server/OpenCost.
- Hubble/Istio/Caretta flow fusion.
- Argo/Flux/Helm/Git provider provenance.
- AWS/GCP/Azure/on-prem/local adapters without core coupling.
- timeline/issues/checks/cost detail을 canonical capability와 frontend consumer contract로 통합.

### Phase 8 — Hardening and commercialization

- full property/fuzz/visual/click-path/a11y/perf/soak/security suites.
- API compatibility and migration tests.
- plugin SDK docs and sample external CRD plugin.
- theming/embedding/white-label contracts.
- telemetry, diagnostics, support bundle.

## 29. Definition of Done

다음 조건을 모두 만족해야 완료다.

1. Fleet → Cluster → Node → Pod → Container가 명시적 `들어가기` action과 authoritative UID로 drilldown된다.
2. Cluster detail부터 network와 ownership aggregate가 보이고 Node detail에서 exact Pod 관계로 펼쳐진다.
3. map→focus-Sankey 기본 전환과 지원되는 placement/network/ownership/butterfly fold-lens가 같은 entity identity를 보존한다.
4. Service selector, EndpointSlice, observed flow가 서로 다른 truth로 표시된다.
5. Query Bar가 resource/filter/size/flow/time/lens token을 typed AST로 처리한다.
6. metric add/remove가 canonical formula에 따라 면적과 정렬을 결정한다.
7. tile 내부 percentage gauge가 없다.
8. 모든 discovered GVK가 generic하게 표시되고 plugin으로 의미가 보강된다.
9. AWS/GCP/Azure/on-prem/local에서 unsupported capability가 정상 상태로 처리된다.
10. view domain literal, direct fetch, direct URL/state mutation, duplicate event bus가 guard에서 0건이다.
11. single dispatch/reducer/effect path가 모든 input에 적용된다.
12. snapshot/delta sequence gap, stale, partial, forbidden, reconnect가 테스트된다.
13. light/dark/high-contrast/reduced-motion과 keyboard/screen reader가 통과한다.
14. reference performance profiles의 p95 budgets와 soak memory bound를 통과한다.
15. tenancy/redaction/action authorization을 통과한다.
16. 모든 visible click path에 handler, permission, loading, error, focus test가 있다.
17. 이 문서의 필수 경우의 수가 traceability matrix에서 test ID와 연결된다.
18. focus-Sankey의 `right + source = map universe`, 집합 서로소, health group당 connector 하나, settled target group block-size 기반 source face partition 합 1이 property/visual/a11y test를 통과한다.

## 30. 명시적으로 허용하지 않는 미정의 상태

- metric이 없을 때 무엇으로 area를 만들지 모름 → planner가 unsupported 또는 explicit count suggestion.
- 관계 evidence가 없음 → unresolved/heuristic, 추정 확정 금지.
- RBAC인지 empty인지 모름 → source state가 확정될 때까지 partial.
- stream gap인데 계속 적용 → resync-required.
- layout 실패 후 임의 grid → last valid layout + error.
- shared resource를 어느 parent에 넣을지 모름 → containment에 넣지 않고 relation entity로 유지.
- multiple unit raw sum → type error.
- same name recreation → UID로 새 entity.
- Git URL만 있어 현재 commit이라고 표시 → provenance state로만 표시.
- observed traffic이 없어 0이라고 표시 → missing/unknown.
- cloud adapter가 없어 core가 실패 → capability unsupported.
- unknown CRD라 숨김 → generic resource renderer.

이 문서에서 optional이라고 표현된 기능도 runtime에서는 `available | partial | forbidden | unsupported | error` 중 하나로 닫힌다. 구현자가 boolean fallback이나 임의 값으로 결정을 미루지 않는다.
