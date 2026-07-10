---
title: Universal Kubernetes Topology Engine Implementation Contract
status: planned-contract
owner: frontend-platform
local_source_commit: 7d77e0279e5f90cbd18d59ac9ec8e1cc3c18cec1
external_reference_source: 외부 기준 저장소
external_reference_commit: f4c0ee4e5993c1a99237c1e4a5fa0f44d543bfa6
last_verified: 2026-07-11
---

# Universal Kubernetes Topology Engine 구현 계약

## 0. 문서의 권한과 목적

이 문서는 Kubernetes 시각화 제품을 구현하기 위한 계약 초안이다. 제품 기획을 설명하는 소개 문서가 아니며, 현재 repo의 실제 코드와 테스트가 source of truth다. 아래 package, route, schema, renderer, plugin 이름이 현 코드에 없으면 구현 완료가 아니라 구현 예정 계약으로만 읽고, 실제 동작 문서처럼 인용하지 않는다. 코드와 충돌하는 항목은 코드 기준으로 갱신한다.

이 문서가 고정하는 결과는 다음과 같다.

1. Cluster → Node → Pod → Container 실행 위치를 중첩 Treemap으로 표현한다.
2. 실행 위치와 Service, Ingress/Gateway, Workload controller, 설정, 스토리지, 정책, GitOps, 실제 트래픽 관계를 서로 다른 relation plane으로 보존한다.
3. Scope를 확대해도 같은 리소스 UID는 같은 시각 객체로 유지한다.
4. 가운데 placement Treemap과 좌우 relation rail 사이를 종이접기처럼 연속 전환한다.
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
- Pod에는 regular, init, restartable sidecar, ephemeral container가 0개 이상 존재할 수 있다. Pod와 Container를 1:1로 가정하지 않는다.
- Service, Deployment, ReplicaSet, ConfigMap, Secret, PVC, Git repository는 Node 또는 Pod의 공간적 자식이 아니다.
- 모든 parent 면적은 같은 metric universe에서 보이는 descendant leaf 면적의 정확한 합이어야 한다.

### 1.2 관계 불변조건

- 하나의 canonical directed edge만 저장한다. 역방향 표시는 renderer가 계산하며 inverse edge를 중복 저장하지 않는다.
- `Service selector가 Pod를 선택함`, `EndpointSlice에 Pod가 실재함`, `트래픽이 관측됨`은 서로 다른 edge다.
- ownership, placement, dependency edge의 두께는 수량을 뜻하지 않는다.
- traffic edge만 정량적 width/particle encoding을 사용할 수 있다.
- 근거가 없는 관계를 이름 prefix만으로 확정하지 않는다.
- 관계마다 evidence, authority, state, observed time을 가진다.
- 해석할 수 없는 참조는 삭제하지 않고 explicit placeholder로 남긴다.
- 권한이 없는 peer는 존재 정보를 노출하지 않는 restricted placeholder로 축약한다.

### 1.3 식별자 불변조건

- Kubernetes resource identity는 `workspaceId + clusterUid + canonical GVK + metadata.uid`다.
- 동일 이름으로 재생성된 resource는 새 UID이므로 새 entity다.
- Container identity는 `podEntityKey + containerType + containerName`이다.
- Cluster identity는 provider ARN이 아니라 플랫폼 발급 `clusterUid`다.
- UID가 일시적으로 없는 discovery 결과는 provisional coordinate key를 쓰되, authoritative UID가 도착하면 명시적 identity reconciliation event를 발생시킨다.
- label, display name, namespace/name 문자열은 identity가 아니다.

### 1.4 Metric 불변조건

- Treemap area는 0 이상의 합산 가능한 절대값 또는 명시된 무차원 composite score다.
- percentage, ratio, percentile, health score를 물리 면적으로 직접 사용하지 않는다.
- CPU core와 byte, cost를 raw sum하지 않는다.
- `zero`, `missing`, `stale`, `partial`, `forbidden`, `unsupported`, `error`는 서로 다른 상태다.
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
- test fixture와 Storybook/testkit sample

허용되는 literal도 view에 중복하지 않는다. schema generator 또는 한 registry source에서 생성하고 exhaustiveness test로 보호한다.

## 3. 용어

| 용어 | 정의 |
|---|---|
| Entity | 화면에서 identity를 유지하는 resource, projection, external, placeholder |
| Resource | API server 또는 provider가 UID와 함께 제공하는 실제 객체 |
| Projection | PodGroup, Unscheduled, Missing data rail처럼 계산된 객체 |
| Scope | 현재 포함 계층의 범위: fleet, cluster, node, pod |
| Lens | 같은 entity를 다른 관계 기준으로 재배치하는 관점 |
| Plane | placement, ownership, network 등 관계의 의미 축 |
| Frame | 서로 다른 source의 시간과 completeness를 함께 고정한 투영 응답 |
| Catalog | resource, relation, metric, renderer, action capability 목록 |
| Query AST | Query Bar가 생성하고 URL/API가 공유하는 canonical typed query |
| LOD | 정보를 버리지 않는 집계 projection과 expansion token |
| Rail | Treemap 바깥에서 관계 entity를 정렬하는 좌우 영역 |

## 4. 제품 의미 모델

### 4.1 Entity class

```ts
type EntityClass = "resource" | "projection" | "external" | "placeholder"

type CanonicalGvk = {
  group: string
  version: string
  kind: string
}

type ResourceIdentity = {
  workspaceId: string
  clusterUid: string
  gvk: CanonicalGvk
  uid: string
  namespace?: string
  name: string
}

type EntityRef = {
  entityKey: string
  entityClass: EntityClass
  identity?: ResourceIdentity
  projectionKey?: string
  externalKey?: string
  placeholderReason?: "unresolved" | "restricted" | "deleted" | "not-collected"
}
```

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
  | "gitops-provenance"

type RelationAuthority = "authoritative" | "derived" | "heuristic"
type RelationState =
  | "configured"
  | "accepted"
  | "ready"
  | "inactive"
  | "rejected"
  | "unresolved"
  | "stale"
  | "restricted"

type CanonicalRelation = {
  relationKey: string
  plane: RelationPlane
  relationType: string
  source: EntityRef
  target: EntityRef
  portKey?: string
  protocol?: string
  state: RelationState
  authority: RelationAuthority
  evidence: EvidenceRef[]
  providerId: string
  observedAt: string
  validFrom?: string
  validUntil?: string
  attributes: Readonly<Record<string, JsonValue>>
}
```

`relationType`은 server catalog에서 온다. renderer는 unknown type도 plane의 generic style로 표시한다.

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
| gitops-provenance | declaration → managed target | Git revision → Argo/Flux object → Workload |

UI가 오른쪽 rail에서 `Pod ← ReplicaSet ← Deployment`로 보이게 하더라도 stored edge는 owner → dependent 방향을 유지한다.

## 5. 패키지 경계

최종 구현은 제품 페이지 안에 거대한 component로 만들지 않는다. 아래 package graph를 유지한다.

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
@product/topology-testkit
  └─ generators, fake clock, stream chaos, visual/perf fixtures

references/ui-layer-lab/src/product/features/topology
  └─ product composition only; no domain rules
```

### 5.1 Dependency rules

- packages는 위에서 아래로 역참조하지 않는다.
- `contracts`는 runtime validation schema의 유일한 source다.
- `core`와 `query`는 browser 없이 Node test에서 실행되어야 한다.
- fetch는 product `api` 또는 engine effect adapter에만 존재한다.
- React component가 raw Kubernetes object를 해석하지 않는다.
- renderer가 API response를 직접 읽지 않고 `RenderScene`만 받는다.
- geometry는 worker가 계산하고 typed CSS custom property 또는 typed scene buffer로 전달한다.
- product style은 모든 색·spacing·type·radius·shadow·z-index·motion을 named token으로만 사용한다.

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
- informer 상태는 `discovering | listing | watching | ready | partial | forbidden | unavailable | error`다.
- timeout을 `ready`로 기록하지 않는다.
- sync 전 empty cache를 실제 empty로 확정하지 않는다.
- watch는 ADDED, MODIFIED, DELETED, BOOKMARK, ERROR를 모두 처리한다.
- `410 Gone`이면 relist하고 새 epoch 또는 continuity marker를 발행한다.
- deletion tombstone, duplicate RV, out-of-order RV를 처리한다.
- Kubernetes `Event` object와 watch lifecycle event를 별개 타입으로 보존한다.

### 6.2 Inventory projection

- raw object는 UID, GVK, GVR, RV, generation, owners 전체, labels 전체 또는 selector index에 필요한 lossless form을 가진다.
- secrets의 data 값은 수집하거나 전송하지 않는다. metadata와 reference만 처리한다.
- PodSpec은 container requests/limits, init/sidecar semantics, overhead, volumes, service account, scheduling을 보존한다.
- EndpointSlice는 service-name label, address, targetRef UID, nodeName, zone, ready/serving/terminating, hints, ports를 보존한다.
- generic CRD는 metadata, status conditions, owner refs, catalog-safe summary를 보존한다.
- RBAC forbidden과 empty를 구분한다.

### 6.3 Relation projection

Provider는 다음 interface를 구현한다.

```ts
type RelationProvider = {
  id: string
  inputGvks: readonly CanonicalGvkPattern[]
  outputRelationTypes: readonly string[]
  extract(context: RelationContext): AsyncIterable<CanonicalRelation>
}
```

- provider output은 canonical relation key로 dedupe한다.
- 두 provider가 같은 관계를 만들면 evidence 배열을 merge하되 authority/state 충돌을 숨기지 않는다.
- network configured/effective/observed는 merge하지 않는다.
- heuristic은 authoritative evidence를 덮어쓰지 않는다.

### 6.4 Metric projection

- raw samples를 metric catalog의 canonical unit으로 변환한다.
- 동일 window/asOf를 공유하는 frame에 조인한다.
- spec request, live usage, cost allocation, flow는 source time이 다름을 보존한다.
- 최신값만 남기더라도 `observedAt`, `window`, `quality`, `maxAge`를 잃지 않는다.
- cost rollup은 하나의 Pod allocation fact table에서 Cluster/Node/Namespace/Workload로 계산한다.

### 6.5 Coherent ProjectionFrame

Kubernetes inventory, Prometheus window, OpenCost window, flow stream은 원자적으로 같은 시점에 존재하지 않는다. API는 거짓 atomic snapshot을 주장하지 않고 다음 frame을 반환한다.

```ts
type ProjectionFrame = {
  schemaVersion: string
  frameId: string
  graphEpoch: string
  sequence: number
  queryHash: string
  resourceRevision: string
  emittedAt: string
  effectiveWindow: TimeWindow
  sources: Record<string, SourceWatermark>
  completeness: CompletenessSummary
  entities: readonly Entity[]
  relations: readonly CanonicalRelation[]
  metricValues: readonly MetricValue[]
  rollups: readonly Rollup[]
  warnings: readonly StructuredWarning[]
}
```

`SourceWatermark`는 observedAt, window, lastSuccess, age, maxAge, completeness, coverage, state를 포함한다. UI는 frame freshness를 표시하며 source skew가 정책 한계를 넘으면 `partial` 또는 `stale`로 보인다.

## 7. Cloud/provider neutral capability model

### 7.1 Core와 adapter 경계

```ts
type ProviderCapability = {
  capabilityId: string
  providerId: string
  state: "available" | "partial" | "forbidden" | "unsupported" | "error"
  scopes: readonly string[]
  reason?: string
  lastCheckedAt: string
}
```

예시 adapter는 AWS pricing/load balancer, GCP billing/network endpoint group, Azure cost/load balancer, OpenCost, on-prem Prometheus다. adapter가 없어도 placement, ownership, Kubernetes-configured/effective network는 동작해야 한다.

### 7.2 금지되는 provider 가정

- Node에 cloud provider ID가 항상 있다고 가정하지 않는다.
- LoadBalancer Service가 AWS ELB라고 가정하지 않는다.
- zone/region label key 하나를 고정하지 않는다. topology label catalog와 CSI/provider adapter를 사용한다.
- cost가 USD라고 가정하지 않는다.
- managed control plane resource를 모든 cluster에 표시하지 않는다.
- Prometheus, Metrics Server, CNI observability가 설치되어 있다고 가정하지 않는다.

## 8. Scope와 Lens

Scope와 Lens는 하나의 enum으로 합치지 않는다.

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
```

### 8.1 Scope별 화면 계약

| Scope | 중앙 placement | 관계 표현 | 클릭 결과 |
|---|---|---|---|
| fleet | Cluster Treemap, 내부 Node micro-block | 선택 cluster의 관계 요약만 | Cluster scope로 zoom |
| cluster | Node Treemap, 내부 Pod micro-block | Cluster detail부터 aggregate Service/controller bundle 제공 | Node scope 또는 relation focus |
| node | 선택 Node의 Pod Treemap | 왼쪽 network, 오른쪽 ownership/GitOps exact Pod 관계 | Pod 또는 relation entity focus |
| pod | Container Treemap/stack | config, storage, network, owner, events | detail/related resource navigation |

Node의 Service를 표현할 때 문구는 `이 Node가 소유한 Service`가 아니라 `이 Node에서 실행 중인 Pod와 연결된 Service`다.

### 8.2 Cluster detail부터 relation을 제공하는 이유

Service와 Deployment는 여러 Node의 Pod를 가로지른다. Node를 먼저 클릭해야만 관계가 보이면 사용자는 cluster 전체 분산과 장애 범위를 읽을 수 없다. Cluster detail에서는 Pod/Node aggregate bundle을 표시하고, Node detail에서 exact Pod edge로 펼친다.

### 8.3 종이접기/FEZ 전환

- gesture progress `p`는 `[-1, 1]`이다.
- `p = 0`은 placement Treemap이다.
- 한쪽 방향은 network rail을 펼치고 Treemap을 반대편으로 압축한다.
- 반대쪽 방향은 ownership/GitOps rail을 펼친다.
- 넓은 viewport의 butterfly lens는 양쪽 rail을 동시에 표시한다.
- drag 중 새 view를 교체하지 않고 하나의 scene graph에서 geometry를 연속 보간한다.
- snap point, direction, resistance, velocity threshold는 injected motion policy에서 온다.
- 가려지는 tile은 옆면을 렌더링하지 않는다. 모든 entity가 다른 2D layout으로 재투영된다.
- relation entity가 나타날 때 연결된 Pod tile은 같은 entityKey와 현재 interpolated rect를 유지한다.
- keyboard 사용자는 lens tab/shortcut으로 동일 전환을 수행한다.

## 9. Query Bar와 typed AST

Query Bar는 search box, scope picker, filter builder, metric composer의 단일 입구다. 문자열은 즉시 화면 상태를 임의 변경하지 않고 suggestion을 통해 typed token으로 확정한다.

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
```

Resource token은 display name이 아니라 entityKey를 저장한다. 동명이인 resource를 합치지 않는다.

### 9.2 Query AST

```ts
type Predicate =
  | { op: "and"; args: Predicate[] }
  | { op: "or"; args: Predicate[] }
  | { op: "not"; arg: Predicate }
  | { op: "eq"; field: FieldRef; value: Scalar }
  | { op: "in"; field: FieldRef; values: Scalar[] }
  | { op: "exists"; field: FieldRef }
  | { op: "compare"; field: FieldRef; comparator: Comparison; value: Scalar }
  | { op: "text"; normalized: string; fields: FieldRef[] }

type TopologyQuery = {
  schemaVersion: "topology-query/v1"
  scope: Scope
  where: Predicate
  size: SizeExpression
  flow?: FlowExpression
  lens: Lens
  time: QueryTime
  aggregateUniverse: "filtered-descendants" | "all-authorized-descendants"
}
```

### 9.3 Parsing과 boolean 규칙

- 같은 facet의 반복 값은 OR이다. 예: `namespace in (a,b)`.
- 다른 facet은 AND다. 예: namespace와 health.
- NOT과 복합 OR은 group token으로 표시한다.
- free text는 suggestion 선택 전까지 applied predicate가 아니다.
- exact resource 선택은 focus와 identity filter를 동시에 명시한다.
- Kind sidebar 클릭도 같은 Query AST에 Kind filter를 dispatch한다.
- filter 결과의 ancestor는 `contextOnly: true`로 유지할 수 있다.
- query canonicalizer는 field/order/weight/window를 정규화해 stable `queryHash`를 만든다.
- canonical query는 URL에 serialize되어 새로고침, 공유, back/forward가 재현 가능해야 한다.
- server planner가 반환한 canonical query가 최종 authority다.

### 9.4 Planner 검증

planner는 실행 전에 다음을 검증한다.

- schema version과 AST depth/clause budget
- field 존재와 scalar type
- regex/text query budget
- metric dimension/unit/additivity/rollup/window compatibility
- 현재 scope에서 metric 지원 여부
- source capability와 RBAC
- query cost, 예상 entity/edge 수, LOD plan
- composite term/weight/missing policy
- raw PromQL 또는 임의 expression injection 거부

지원하지 않는 query는 빈 화면으로 성공시키지 않고 typed planning error를 반환한다.

## 10. Metric catalog와 면적 수학

### 10.1 Metric descriptor

```ts
type MetricDimension =
  | "compute.cpu"
  | "memory"
  | "storage.ephemeral"
  | "storage.persistent"
  | "cost"
  | "resource.count"
  | "traffic.requests"
  | "traffic.bytes"
  | "traffic.connections"
  | "traffic.latency"

type MetricQuality =
  | "present"
  | "zero"
  | "missing"
  | "stale"
  | "partial"
  | "forbidden"
  | "unsupported"
  | "error"

type MetricDescriptor = {
  id: string
  label: string
  dimension: MetricDimension
  measure: "request" | "limit" | "usage" | "capacity" | "allocation" | "rate" | "latency" | "count"
  canonicalUnit: string
  valueType: "gauge" | "counter" | "delta" | "allocation"
  additive: boolean
  rollup: "sum" | "last" | "avg" | "max" | "p95" | "none"
  supportedEntityKinds: readonly string[]
  supportedScopes: readonly Scope["level"][]
  sources: readonly string[]
  temporalModes: readonly ("instant" | "range")[]
  reducers: readonly string[]
  maxAgePolicyId: string
  availability: ProviderCapability
}

type MetricValue = {
  metricId: string
  entityKey: string
  value: number | null
  canonicalUnit: string
  quality: MetricQuality
  source: string
  observedAt: string
  window?: TimeWindow
  maxAgeMs: number
  coverageCount: number
  eligibleCount: number
  reason?: string
}
```

Kind 목록은 catalog에서 오며 descriptor의 `supportedEntityKinds`를 view에서 literal 비교하지 않는다.

### 10.2 기본 metric 목록

서버는 최소 다음 semantic metric을 capability가 있을 때 등록한다.

| ID | 단위 | 의미 | 기본 rollup |
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
| `cost.allocation_per_window` | currency/window | 하나의 allocation table 비용 | sum |
| `resource.pod_count` | count | generic engine primitive | sum |

`resource.pod_count`는 physical capacity가 아니라 count임을 formula summary에 명시한다. 서버 capability가 기본 metric을 제공하지 않으면 이 primitive를 explicit fallback suggestion으로 제시할 수 있지만 조용히 자동 전환하지 않는다.

### 10.3 Physical mode

```ts
type PhysicalSizeExpression = {
  mode: "physical"
  term: SizeMetricTerm
}
```

- additive descriptor 하나만 선택한다.
- value는 canonical unit의 절대값이다.
- 음수, NaN, Infinity는 `error`다.
- parent value는 visible/authorized leaf의 합이다.
- filter 적용 시 기본 universe는 `filtered-descendants`다.
- exact value, unit, reducer, window를 query formula summary와 inspector에 표시한다.

### 10.4 Composite mode

다른 단위를 raw sum하는 대신 같은 complete leaf cohort에서 share를 계산한다.

```ts
type CompositeSizeExpression = {
  mode: "composite-score"
  terms: readonly WeightedMetricTerm[]
  missingPolicy: "strict" | "renormalize-available"
}
```

기본은 `strict`다. 선택 metric 집합을 `M`, 모든 term이 present 또는 zero인 공통 leaf 집합을 `C`, canonicalized weight를 `w_m`이라 한다.

```text
C = { i | 모든 m ∈ M에 대해 value(i,m)가 present 또는 zero }

n(i,m) = raw(i,m) / Σ(j ∈ C) raw(j,m)

Σ(m ∈ M) w_m = 1,  w_m ≥ 0

score(i) = Σ(m ∈ M) w_m × n(i,m)
```

규칙은 다음과 같다.

- weight 합은 server가 정확히 1로 canonicalize하고 effective weight를 응답한다.
- 어떤 term의 cohort 합이 0이면 expression 전체가 `unavailable-for-group`이다. 그 term을 조용히 버리지 않는다.
- `C` 밖 leaf는 `No data` rail에 들어간다.
- `strict`에서 missing term이 하나라도 있으면 score는 null이다.
- `renormalize-available`은 명시적으로 선택된 경우만 허용하며 entity마다 `partial: true`와 `weightCoverage`를 표시한다.
- parent score는 descendant leaf score의 합이다. parent마다 다시 normalize하지 않는다.
- filter로 cohort가 바뀌면 query revision이 바뀌고 score를 재계산한다.
- lens만 바뀌면 cohort와 score가 바뀌지 않는다.
- UI는 이를 CPU+memory 양이라고 부르지 않고 `Weighted score`로 표시한다.
- log/p99 normalization은 별도 versioned normalizer plugin이 등록되지 않은 한 사용하지 않는다.

### 10.5 Zero, missing, residual rail

Treemap은 양의 면적만 물리적으로 표현한다. 다음 shelf/rail은 면적 metric이 아닌 구조 목록이다.

- `Zero value`: 정상 측정된 0.
- `No data`: missing, partial, stale policy rejection.
- `Unavailable`: source unsupported/error/forbidden의 범위를 누설하지 않는 요약.
- `Unscheduled`: Node가 없는 Pod.
- `System / unattributed`: Node actual usage와 귀속 Pod usage 합의 양의 차이.

Node usage보다 Pod 합이 큰 시계열 skew는 residual을 음수로 만들지 않는다. residual은 0으로 두고 `inconsistent-sources` warning, source timestamps, skew를 표시한다.

모든 값이 0 또는 missing이면 균등 Treemap으로 위장하지 않는다. 선택 metric으로 양의 면적을 만들 수 없다는 명시 상태와 구조 목록을 제공한다.

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
- allocation policy가 없으면 PVC metric은 storage lens 또는 PVC scope에서만 area metric으로 허용한다.
- CSI가 usage를 제공하지 않으면 `unsupported` 또는 `missing`이며 request를 usage로 대체하지 않는다.

### 10.8 Cost

- 비용은 `amount + currency + window + pricingSource + allocationPolicy + estimated`를 가진다.
- 한 frame에서 currency와 window가 일치해야 합산한다.
- 서로 다른 currency는 FX source와 FX observedAt 없이 합산하지 않는다.
- Node와 Workload cost를 서로 다른 query에서 가져와 같은 total인 것처럼 보이지 않는다.
- Pod allocation fact table에서 idle, shared, overhead를 보존한 뒤 모든 상위 rollup을 계산한다.
- cloud pricing adapter가 없는 local/on-prem cluster는 OpenCost 등 source가 없다면 `unsupported`다.

## 11. Resource catalog, sidebar와 메인 정보 우선순위

### 11.1 Discovery-driven resource catalog

Sidebar의 Networking, Workloads, Configuration, Scaling 같은 group은 view literal이 아니다. server catalog가 다음 정보를 제공한다.

```ts
type ResourceCatalogEntry = {
  gvkPattern: CanonicalGvkPattern
  familyId: string
  groupId: string
  label: string
  iconToken: string
  sortWeight: number
  entityClass: EntityClass
  renderCapabilities: readonly string[]
  relationCapabilities: readonly string[]
  countState: "exact" | "partial" | "unknown" | "forbidden"
}
```

- CRD는 generic group 또는 plugin group에 자동 등장한다.
- unknown GVK도 Resources 목록과 search에 나타난다.
- category click은 `FilterToken`을 만들어 같은 Query AST에 추가한다.
- view는 Ingress, Service, Deployment 등을 switch statement로 열거하지 않는다.

### 11.2 Count semantics

한 숫자로 모든 의미를 덮지 않는다.

```ts
type CatalogCount = {
  totalAuthorized: number | null
  queryMatched: number | null
  renderedEntities: number
  projectedMembers?: number
  state: "exact" | "partial" | "unknown" | "forbidden"
}
```

- unreadable/forbidden은 0이 아니다.
- pagination/partial sync 중 수치는 partial이다.
- PodGroup은 `renderedEntities`이며 `projectedMembers`가 실제 Pod 수다.
- aggregate LOD가 원본 resource count를 숨기지 않는다.

### 11.3 Fleet-first 메인 화면

외부 기준 저장소의 single-cluster dashboard에서 확인된 정보 우선순위를 범용 Fleet 제품에 다음처럼 재배치한다.

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
| border pattern | missing/stale/partial/forbidden state |
| text | display name, 허용 밀도에서 absolute value 한 줄 |
| focus ring | keyboard/pointer focus |
| relation line | relation plane/state |
| particle/ribbon | observed traffic only |

resource kind별 임의 색은 health color와 충돌하므로 기본 tile fill에 쓰지 않는다. Kind는 icon token과 label로 구분한다.

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
  measure: "requests-per-second" | "bytes-per-second" | "connections-per-second" | "event-rate" | "latency" | "errors"
  unit: string
  source: string
  window: TimeWindow
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

### 13.4 Gateway와 cross-namespace

- Ingress `defaultBackend`를 처리한다.
- Gateway → Route → backendRef chain을 보존한다.
- ReferenceGrant와 parent/backend conditions를 검증한다.
- cross-namespace ref가 허용되지 않으면 rejected/unresolved relation이다.
- ExternalName, selectorless, headless Service는 별도 semantics plugin으로 처리한다.

## 14. Ownership, dependency, GitOps

### 14.1 Ownership chain

- ownerReference UID와 `controller=true`가 authoritative source다.
- Deployment → ReplicaSet → Pod를 생략하지 않는다.
- renderer가 편의를 위해 Deployment → Pod shortcut을 표시할 수 있으나 `derived-path`임을 보존한다.
- old ReplicaSet은 삭제하지 않고 `historical` flag와 revision으로 보존한다.
- StatefulSet, DaemonSet, Job, CronJob, Rollout 등은 plugin이 같은 canonical ownership plane을 출력한다.
- owner cycle은 graph corruption warning으로 격리하고 traversal budget을 초과하지 않는다.

### 14.2 Dependency

- Pod → ConfigMap/Secret은 env, envFrom, volume, projected volume reference를 모두 추출한다.
- Pod → ServiceAccount를 추출한다.
- Pod → PVC → PV → StorageClass를 추출한다.
- HPA/VPA/KEDA → scaleTargetRef를 추출한다.
- PDB/NetworkPolicy selector는 ownership이 아니라 scaling-policy/policy relation이다.
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
- 외부 기준 저장소에서 재사용 가능한 것은 Argo `status.resources`, Flux inventory, tracking annotation, revision, source URL/path/chart parser다.
- GitHub API, PR, Actions 정보는 별도 connector capability가 있을 때만 추가한다.
- desired revision과 observed live revision을 구분한다.
- evidence가 heuristic이면 UI에 heuristic이라고 표시한다.
- Git URL은 protocol/host allow policy로 검증하고 SSH/OCI/raw unsafe link를 browser navigation으로 열지 않는다.

## 15. Engine event, reducer, effect 계약

### 15.1 단일 envelope

```ts
type EngineSource = "ui" | "url" | "snapshot" | "stream" | "worker" | "effect" | "system"

type EngineMessage<P extends EnginePayload = EnginePayload> = {
  schemaVersion: "topology-engine-message/v1"
  eventId: string
  traceId: string
  source: EngineSource
  emittedAt: string
  streamEpoch?: string
  sequence?: number
  queryHash?: string
  baseRevision?: number
  payload: P
}
```

`EnginePayload`는 discriminated union이며 UI intent, URL hydration, snapshot/delta, connection, layout, theme/motion, focus/navigation result를 모두 포함한다. outer envelope와 dispatch 함수는 하나다. payload 종류가 여러 개인 것은 이벤트 경로가 여러 개라는 뜻이 아니다.

### 15.2 Required payload families

```text
engine.initialized
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
entity.focused
entity.activated
viewport.changed
snapshot.requested
snapshot.received
stream.connected
stream.disconnected
stream.resyncRequired
entity.upserted
entity.deleted
relation.upserted
relation.deleted
metric.batchReceived
flow.batchReceived
layout.requested
layout.resolved
layout.rejectedAsStale
layout.failed
theme.changed
motion.changed
effect.failed
```

### 15.3 Reducer rules

- 동일 eventId는 한 번만 적용한다.
- streamEpoch가 현재와 다르면 이전 delta를 적용하지 않는다.
- sequence가 current+1이 아니면 gap state와 snapshot effect를 생성한다.
- resourceVersion/generation이 더 오래된 upsert는 무시하고 diagnostic count를 올린다.
- queryHash가 current와 다른 metric/layout result는 stale result로 폐기한다.
- layout transaction ID가 current가 아니면 적용하지 않는다.
- 삭제 중인 focus entity는 exit가 끝날 때까지 presentation state에 남기고 logical state에서는 tombstone이다.
- 모든 reducer branch는 invariant checker를 통과해야 commit된다.

### 15.4 Effect runner

```ts
type EngineEffect =
  | { type: "catalog.fetch" }
  | { type: "query.plan"; query: TopologyQuery }
  | { type: "snapshot.fetch"; planId: string }
  | { type: "stream.subscribe"; queryId: string; afterSequence?: number }
  | { type: "layout.compute"; request: LayoutRequest }
  | { type: "url.replace"; serialized: string }
  | { type: "navigation.internal"; route: RouteRef }
  | { type: "navigation.external"; verifiedUrl: string }
  | { type: "command.execute"; command: CommandRequest }
  | { type: "telemetry.record"; record: EngineTelemetry }
```

Effect 결과와 실패는 다시 EngineMessage로 dispatch한다. component callback에 직접 promise/fetch/navigation 로직을 넣지 않는다.

## 16. Snapshot과 단일 stream

### 16.1 API surface

```text
GET  /api/v2/topology/catalog
POST /api/v2/topology/query/plan
POST /api/v2/topology/snapshot
GET  /api/v2/topology/stream?queryId=...&afterSequence=...
GET  /api/v2/topology/entities/{entityKey}
```

한 browser engine은 하나의 logical stream과 하나의 outer event envelope만 소비한다. inventory, relation, metric, flow는 payload channel로 구분하고 server가 channel별 rate policy를 적용한다. 별도 frontend event bus를 만들지 않는다.

### 16.2 Stream envelope

```ts
type StreamEnvelope = {
  schemaVersion: string
  eventId: string
  workspaceId: string
  clusterUid: string
  streamId: string
  streamEpoch: string
  sequence: number
  emittedAt: string
  observedAt: string
  queryHash: string
  payload: StreamPayload
}
```

- initial versioned snapshot 뒤 delta를 적용한다.
- reconnect는 `afterSequence`로 resume한다.
- server가 resume할 수 없으면 explicit resync-required를 보낸다.
- periodic anti-entropy snapshot으로 drift를 복구한다.
- structural add/delete는 조용히 drop하지 않는다.
- metric은 series별 latest value로 coalesce할 수 있다.
- flow는 고정 window aggregate로 coalesce한다.
- backpressure가 correctness를 위협하면 drop이 아니라 resync-required를 보낸다.
- durable timeline에는 original event를 보존하고 live scene에는 frame batch를 적용한다.

### 16.3 Frame batching

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
type LayoutRevision = {
  structureRevision: string
  metricValueRevision: string
  queryRevision: string
  scopeRevision: string
  lensRevision: string
  viewportRevision: string
  policyRevision: string
}
```

- health/status만 바뀌면 layout하지 않는다.
- structure add/delete는 worker layout을 요청한다.
- metric 값 변화는 projected pixel displacement가 policy threshold를 넘을 때 요청한다.
- lens 변화는 같은 entity set의 목표 geometry를 계산한다.
- 늦은 worker 응답은 전체 revision이 맞지 않으면 폐기한다.
- background update 때문에 자동 fitView하지 않는다.
- 사용자가 저장한 viewport/position은 structure/layout policy revision이 호환될 때만 복원한다.

### 17.2 Worker algorithms

- Treemap: stable squarified 또는 ordered treemap, deterministic tie-break by entityKey.
- Nested overview: outer Cluster/Node rect와 inner Node/Pod micro-layout을 별도 pass로 계산.
- Rail: entity grouping, ordering, edge port allocation.
- Bundle: shared source/target을 합치는 deterministic ribbon routing.
- Ownership detail: ELK layered layout adapter 사용 가능.
- Layout은 main thread에서 전체 graph를 계산하지 않는다.
- worker 사용 불가 시 low-volume safe fallback만 허용하고 명시적으로 degraded capability를 표시한다.
- 임의 fixed grid fallback으로 오류를 숨기지 않는다. 마지막 valid layout을 유지하고 retry/error state를 표시한다.

### 17.3 외부 기준 저장소에서 이식할 pattern

- order-independent structure hash.
- 구조가 같으면 layout skip.
- 기존 위치 보존과 신규 entity만 배치하는 merge.
- async layout generation token과 stale result 폐기.
- 그룹 내부/그룹 간 2단계 ELK Worker pattern.
- p50/p95/p99 layout telemetry ring buffer.

Treemap/Sankey/Motion은 외부 기준 저장소에 없으므로 새 engine으로 구현한다. 외부 기준 저장소의 TrafficGraph 전체 재-layout과 fixed-grid fallback은 이식하지 않는다.

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

duration, easing, stagger, gesture resistance, snap threshold, particle density, maximum simultaneous animations는 theme motion policy에서 온다. component literal을 금지한다.

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

### 19.2 LOD 불변조건

- LOD는 정보를 삭제하지 않는다.
- aggregate entity는 memberCount, health counts, metric totals, completeness, expansion token을 가진다.
- expansion은 server-side query/LOD plan으로 exact members를 가져온다.
- group boundary가 바뀌어도 underlying entity identity를 보존한다.
- visible count와 total authorized count를 구분한다.
- 외부 기준 저장소의 1000/2000 resource, 200 animation 같은 고정 threshold를 그대로 사용하지 않는다.

### 19.3 Performance budgets

구체 수치는 benchmark profile과 `PerformancePolicy` config로 version한다. release gate는 최소 다음을 측정한다.

- interaction frame p50/p95/p99와 long task.
- worker layout p50/p95/p99.
- query commit → first meaningful scene.
- query commit → settled morph.
- stream backlog, coalesced count, resync count.
- DOM node count, heap growth, detached node.
- Canvas/WebGL draw time.
- stale worker result와 dropped presentation frame.
- 1시간 이상 실시간 실행의 bounded memory.

목표 reference device/profile에서 interaction p95가 60fps frame budget을 만족해야 하며, profile을 명시하지 않은 `완전 부드럽다` 주장은 acceptance가 아니다.

## 20. Theme, visual system, responsive behavior

### 20.1 Semantic tokens

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
- activation: click/Enter로 zoom, relation focus, detail navigation 실행.
- scope: containment context.
- relation focus: scope를 바꾸지 않고 connected subgraph를 강조.

### 21.2 Activation routing

| Entity | 기본 activation |
|---|---|
| Cluster | Cluster scope containment zoom |
| Node | Node scope containment zoom |
| Pod | Pod inspector 또는 Pod scope |
| Container | Container detail/log/evidence action catalog |
| Service | Service-centered relation focus |
| Ingress/Gateway/Route | downstream network focus |
| Deployment/StatefulSet/DaemonSet/Rollout | managed descendant focus |
| ReplicaSet/Job | direct dependent focus |
| ConfigMap/Secret/PVC/PV | dependency/storage focus와 inspector |
| GitOps controller resource | GitOps detail route |
| verified Git HTTP URL | external navigation effect |
| projection/placeholder | explanatory inspector |

Activation handler는 Kind switch가 아니라 catalog의 `ActivationDescriptor`를 dispatch한다.

### 21.3 Focus restoration

- scope/lens/query 전환 동안 같은 entityKey가 보이면 focus를 유지한다.
- filter 때문에 사라지면 nearest visible ancestor, relation source, Query Bar 순으로 복원한다.
- 삭제된 entity는 tombstone announcement 후 focus를 복원한다.
- virtualized/Canvas tile은 DOM accessibility mirror의 동일 entityKey와 연결한다.

### 21.4 Undo와 URL

- query token, scope, lens, focused entity, time window는 URL codec이 직렬화한다.
- high-frequency drag progress는 URL에 기록하지 않고 committed snap만 기록한다.
- browser back/forward는 URL adapter가 `url.hydrated` message로 dispatch한다.
- engine state를 component history와 별도로 유지하지 않는다.

## 22. Accessibility

- tile은 semantic button/treeitem 또는 accessibility mirror의 동등 node다.
- roving tabindex를 사용한다.
- arrow key는 spatial neighbor index로 이동한다.
- Enter는 activate, Space는 select, Escape는 relation focus/scope를 단계적으로 해제한다.
- lens는 버튼/shortcut으로도 전환한다.
- screen reader label은 kind, name, namespace, status, selected metric exact value를 포함한다.
- 관계는 source, type, target, truth, freshness를 읽을 수 있는 textual list를 제공한다.
- 모든 telemetry tick을 aria-live로 알리지 않는다.
- user-triggered query/scope/lens 결과, disconnect, stale, action result만 polite announcement한다.
- 200% zoom, keyboard only, screen reader, reduced motion, high contrast를 release gate에 넣는다.
- tiny Canvas tile도 search/keyboard relation list에서 접근 가능하다.

## 23. 상태와 오류의 완전한 행렬

### 23.1 Page state

| State | 의미 | UI 행동 |
|---|---|---|
| bootstrapping | catalog/session 미확정 | skeleton, 조작 비활성 |
| planning | query 검증 중 | 이전 valid scene 유지, pending 표시 |
| loading-initial | 첫 snapshot 없음 | map skeleton |
| ready-live | snapshot + stream 정상 | live badge |
| ready-snapshot | 사용자가 snapshot mode 선택 | 기준 시각 표시, animation 제한 |
| partial | 일부 source/kind 불완전 | scene 유지, 범위/원인 표시 |
| stale | TTL 초과 | 마지막 scene 유지, flow stop, age 표시 |
| disconnected | stream 끊김 | 마지막 scene 유지, reconnect 상태 |
| resyncing | gap/epoch 변경 | last valid scene 유지, action 제한 |
| permission-limited | authorized universe만 존재 | 누설 없는 설명 |
| empty | authoritative query result 0 | filter-aware empty state |
| unsupported | 선택 capability 없음 | 대체 가능한 catalog suggestion |
| error | snapshot/layout/effect 실패 | last valid scene + scoped retry |

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

## 25. 외부 기준 저장소 심층 분석에 따른 이식 정책

분석 기준은 frontmatter의 `external_reference_commit`이다. 외부 기준 저장소는 Treemap/Sankey/Motion 기반의 이 제품 화면을 제공하지 않는다. 일반 Topology, Live Traffic, GitOps Tree가 서로 다른 state/layout 흐름이다. 따라서 UI 전체를 복사하지 않고 source 단위로 판정한다.

### 25.1 직접 또는 얇게 감싸 재사용

| 기준 자산 | 위치 | 이식 규칙 |
|---|---|---|
| typed informer resource set/lifecycle | `pkg/k8score/types.go`, `internal/k8s/cache.go` | cluster별 adapter, completeness 추가 |
| large LIST paging | `pkg/k8score/cache.go` | continue token/취소/telemetry 보존 |
| dynamic GVR discovery | `pkg/k8score/dynamic_cache.go` | sync state 오류 수정, provider registry 출력 |
| canonical health vocabulary | `pkg/health` | Service/Ingress/CRD evaluator 보강 |
| Prometheus discovery/client | `pkg/prom` | fixed frame time/window, catalog query만 허용 |
| Hubble connector | `internal/traffic/hubble.go` | reconnect/backpressure/byte capability 보강 |
| Argo/Flux inventory parser | `pkg/gitops/tree` | evidence/confidence/all sources 보존 |
| structure hash concept | `packages/k8s-ui/src/utils/structure-hash.ts` | layout revision의 한 부분으로 사용 |
| ELK worker request/version pattern | `packages/k8s-ui/.../topology/layout.ts` | ownership detail adapter로 사용 |
| Git provider safe URL parser | `packages/k8s-ui/src/utils/git-provider-urls.ts` | allow policy와 external effect로 이식 |
| p50/p95/p99 perf ring | `packages/k8s-ui/src/perf/store.ts` | engine telemetry로 일반화 |

### 25.2 수정 후 재사용

| 기준 자산 | 필요한 수정 |
|---|---|
| topology relationship builder | Node 포함 model, UID edge, relation plane/provider registry로 분해 |
| Service selector matching | `network-configured` evidence로만 사용 |
| topology neighborhood traversal | UID, plane별 bounded traversal, shared resource leaf policy |
| metrics history | timestamp/window/maxAge/quality와 실패 시 stale 전환 |
| OpenCost | user RBAC, Pod allocation fact, requested window |
| traffic source manager | global one-source 선택을 cluster/edge capability fusion으로 변경 |
| GitOps tree | desired/live revision, multi-source, explicit heuristic |
| Search pill UI | typed AST suggestion/commit shell로 변경 |
| freshness/snapshot control | ProjectionFrame watermarks와 연결 |
| saved positions | layout policy/revision compatibility 검증 |
| theme variables | 제품 semantic token과 light/dark/high-contrast로 재작성 |

### 25.3 거부

| 기준 구현 | 거부 이유 |
|---|---|
| 현재 `/api/topology` payload | multi-cluster/Node/UID/frame/metric projection 부족 |
| kind/namespace/name Node ID | 재생성, multi-cluster, CRD 충돌 |
| Karpenter/CAPI Node만 topology 포함 | 실행 계층 불완전 |
| fixed resource/category list | discovery/no-hardcode 위반 |
| Service selector를 effective endpoint로 표현 | 실제 EndpointSlice와 불일치 |
| Service/Ingress always healthy | health 증거 부재 |
| PodGroup client edge 복제/재작성 | relation type 왜곡과 double count |
| app label BFS를 authoritative grouping으로 사용 | shared label/resource 오염 |
| 전체 topology SSE replacement | object constancy, bandwidth, gap 복구 부족 |
| TrafficGraph flow마다 ELK 재실행 | 실시간 frame과 viewport 불안정 |
| React Flow `animated: true`를 유속처럼 사용 | rate/latency 의미 모호 |
| fixed node/namespace/animation thresholds | 환경·viewport·device 비범용 |
| layout error fixed grid | 오류 은폐와 의미 손상 |
| raw PromQL Query Bar | 보안/비용/타입 안정성 위반 |
| global active traffic source | source별 상호 보완과 cluster 격리 불가 |
| 현재 OpenCost public handler authorization | tenancy/RBAC 위험 |

### 25.4 실제 AWS 화면에서 검증된 외부 기준 저장소의 정보 구조

2026-07-11 AWS 설치 스크린샷으로 다음을 확인했다.

- namespace frame 안에 Service/ConfigMap → Deployment/DaemonSet/StatefulSet → Pod chain을 배치한다.
- relation color/type과 resource card 상태를 분리한다.
- single-cluster home은 identity, Kubernetes version, namespace count, freshness, Pods/Deployments/Nodes readiness, CPU/memory used/requested/allocatable, resource family count, topology preview, timeline, issues, traffic, Helm release를 우선한다.
- target namespace처럼 많은 resource에서도 grouped layered graph가 읽힌다.

우리 engine은 이 정보 우선순위와 세부 UX를 참고하되, Node placement, EndpointSlice truth, multi-cluster Fleet, unified Query AST, single reducer, Treemap/morph를 새 계약으로 제공한다.

## 26. 외부 기준 저장소와 라이선스

외부 기준 저장소 root license는 Apache-2.0이다. 실제 code를 이식하면 다음을 수행한다.

- 배포물에 Apache-2.0 license를 포함한다.
- 원 copyright/attribution을 보존한다.
- 수정 파일에 prominent modification notice를 남긴다.
- `THIRD_PARTY_NOTICES`에 repository URL, pinned commit, file mapping, 변경 요약을 기록한다.
- 외부 기준 저장소 이름, 로고, 고유 icon/brand는 사용하지 않는다. Apache-2.0은 trademark 권리를 주지 않는다.
- root에 NOTICE가 없더라도 dependency별 NOTICE/license를 별도 조사한다.
- React Flow, ELKjs, DOMPurify, font 등 direct/transitive dependency의 재배포 license를 SBOM과 함께 검증한다.
- 아이디어만 clean-room 재구현한 항목과 source code를 이식한 항목을 구분한다.

## 27. 현재 프로젝트의 mandatory backend gap

### 27.1 Collector gap

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

### 27.2 Normalization gap

- `safe_labels(limit=12)`를 selector truth source로 쓰지 않는다.
- first owner kind/name만 보존하지 않고 모든 owner UID/controller ref를 보존한다.
- DaemonSet/Job 등 kind-specific summary는 plugin으로 계산한다.
- Service health default healthy를 제거한다.
- name-based SHA identity를 UID identity로 migration한다.
- list limit 1000/no cursor를 server-side LOD/cursor query로 바꾼다.
- relationship repository의 one-hop heuristic을 Relation Projection으로 교체한다.

### 27.3 Realtime gap

- delta key를 `cluster/ns/kind/name`에서 workspace/cluster/GVK/UID로 변경한다.
- resourceVersion, generation, eventId, epoch, seq, timestamps, queryHash를 포함한다.
- Pod만이 아니라 entity/relation/metric/flow delta를 지원한다.
- configured namespace/pod limit가 전체 cluster truth인 것처럼 보이지 않게 한다.
- hub cache/fanout key에 workspace를 포함한다.
- queue overflow는 silent latest replacement가 아니라 resync contract를 사용한다.
- agent/gateway restart와 reconnect resume를 테스트한다.

### 27.4 Metrics/traffic/cost gap

- effective request/limit metric 생성.
- fixed `asOf/start/end/step` batch query.
- source timestamps와 stale TTL.
- standard flow edge schema.
- Hubble/Istio/Caretta/Prometheus capability adapters.
- unique PVC storage facts.
- Pod cost allocation facts와 currency/window.
- Node actual usage와 Pod attributable usage residual.

### 27.5 Current product frontend gap

- active product surface는 `references/ui-layer-lab/src/product`다.
- 삭제된 `frontend/`는 복구하거나 기반으로 삼지 않는다.
- 현재 product token은 dark-only이므로 light/high-contrast set을 추가해야 한다.
- product component는 `product/api` 밖에서 fetch하지 않는다.
- shadcn lab/vendor/generated component를 product에 import하지 않는다.
- runtime JSON은 generated schema로 validate한다.

## 28. API contract 상세

### 28.1 Catalog response

```ts
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

### 28.2 Plan response

```ts
type QueryPlanResponse = {
  schemaVersion: string
  planId: string
  queryId: string
  canonicalQuery: TopologyQuery
  queryHash: string
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

### 28.3 Detail response

Entity detail은 raw object dump 하나가 아니다.

```ts
type EntityDetail = {
  entity: Entity
  summarySections: DetailSection[]
  relationsByPlane: Record<RelationPlane, CanonicalRelation[]>
  metricSeries: MetricSeriesRef[]
  events: KubernetesEventSummary[]
  provenance: EvidenceRef[]
  actions: AvailableAction[]
  completeness: CompletenessSummary
}
```

action availability는 permission/capability/status를 반영하고 disabled 이유를 제공한다.

## 29. Test architecture와 release gates

### 29.1 Contract tests

- backend schema와 generated TypeScript의 compatibility.
- unknown enum/GVK forward compatibility.
- catalog revision migration.
- URL codec canonical round trip.
- old stream schema rejection/resync.

### 29.2 Property tests

- parent area equals descendant leaf sum within numeric tolerance.
- physical metric은 unit/dimension이 보존된다.
- composite weight 합은 1이고 score는 finite/nonnegative다.
- strict missing resource는 positive Treemap cohort에 들어가지 않는다.
- relation key는 deterministic하고 inverse duplicate가 없다.
- same UID는 ordering/query serialization과 무관하게 same entityKey다.
- same name/new UID는 다른 entityKey다.
- reducer는 동일 event를 두 번 적용해도 state가 같다.
- out-of-order event가 state를 되돌리지 않는다.
- lens change는 size score를 바꾸지 않는다.
- health-only update는 layout revision을 바꾸지 않는다.

### 29.3 Generator/fuzz matrix

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
- all zero/missing/stale/forbidden/mixed metric quality.
- currency/window mismatch and shared/idle cost.
- sequence duplicate/gap/reorder/epoch reset/reconnect.
- layout result reorder, timeout, crash, superseded result.

### 29.4 Visual regression

- Fleet, Cluster, Node, Pod scope.
- placement/network/ownership/butterfly lens.
- gesture progress의 대표 중간 frame.
- light/dark/high-contrast/reduced-motion.
- loading/empty/partial/stale/disconnected/resyncing/forbidden/error.
- tiny/medium/large tile density.
- no percentage gauge inside tiles.
- long name, CJK, RTL, 200% zoom.
- relation configured/effective/observed/dropped/stale states.

### 29.5 Interaction/click-path audit

모든 visible control과 clickable entity를 registry에서 enumerate하고 다음을 자동 검증한다.

- handler가 EngineMessage를 dispatch하는가.
- direct fetch/navigation/state mutation이 없는가.
- keyboard와 pointer 결과가 동등한가.
- loading/error/permission 상태에서 정확히 disabled되는가.
- focus가 복원되는가.
- action이 audit/confirmation contract를 통과하는가.

### 29.6 Performance/soak

reference profiles는 server-generated realistic topology로 고정하고 small/medium/large/extreme을 모두 둔다. 각 profile은 cluster/node/pod/relation/metric/flow rate, device/browser를 기록한다.

- initial snapshot memory/latency.
- continuous stream 1시간 이상.
- burst add/delete/rollout.
- high-rate flow with backpressure.
- rapid query token add/remove.
- lens drag 중 metric/structure update.
- repeated scope drilldown/back.
- theme/motion preference change.

### 29.7 Security/tenancy

- two workspaces with same display cluster ID.
- forbidden kind and cross-namespace peer redaction.
- cost/traffic derived endpoint permission.
- Secret/annotation redaction.
- malicious query/regex/URL.
- replayed/stale stream token.

### 29.8 License/SBOM

- copied file inventory와 source commit.
- Apache modification notice.
- dependency license allow/deny policy.
- brand/icon asset contamination scan.
- generated SBOM과 third-party notices.

## 30. 구현 순서: 완성 제품 vertical slices

이 순서는 MVP 범위를 줄이는 목록이 아니다. 최종 제품을 오류 없이 조립하기 위한 dependency order다. 각 단계는 다음 단계 전에 contract와 test를 완료한다.

### Phase 1 — Contracts and engine kernel

- schemas, entity/relation/metric/catalog/message types.
- generated TS/Python/Go models.
- pure reducer, effect descriptions, invariant checker.
- Query AST, canonicalizer, URL codec, planner contract.
- testkit generators and fake clock.

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
- relation rail/bundle worker.
- ELK ownership detail adapter.
- revision/hash/stale-result handling.

### Phase 5 — Renderer and design system

- adaptive DOM/Canvas/SVG renderer.
- semantic tiles/relations/particles.
- light/dark/high-contrast/reduced-motion tokens.
- object constancy and interruptible Motion morph.
- accessibility mirror/spatial navigation.

### Phase 6 — Product composition

- Query Bar.
- Fleet/Cluster/Node/Pod scopes.
- placement/network/ownership/butterfly lenses.
- context strip, catalog sidebar, inspector.
- relation focus and routing/actions.
- all state/error/permission screens.

### Phase 7 — Provider and operational depth

- Prometheus/Metrics Server/OpenCost.
- Hubble/Istio/Caretta flow fusion.
- Argo/Flux/Helm/Git provider provenance.
- AWS/GCP/Azure/on-prem/local adapters without core coupling.
- timeline/issues/checks/cost detail patterns informed by 외부 기준 저장소.

### Phase 8 — Hardening and commercialization

- full property/fuzz/visual/click-path/a11y/perf/soak/security suites.
- API compatibility and migration tests.
- plugin SDK docs and sample external CRD plugin.
- theming/embedding/white-label contracts.
- SBOM, notices, license audit.
- telemetry, diagnostics, support bundle.

## 31. Definition of Done

다음 조건을 모두 만족해야 완료다.

1. Fleet → Cluster → Node → Pod → Container가 authoritative UID로 drilldown된다.
2. Cluster detail부터 network와 ownership aggregate가 보이고 Node detail에서 exact Pod 관계로 펼쳐진다.
3. placement/network/ownership/butterfly 전환이 같은 entity identity를 보존한다.
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
16. 외부 기준 저장소 이식 항목의 license/notice/SBOM이 완성된다.
17. 모든 visible click path에 handler, permission, loading, error, focus test가 있다.
18. 이 문서의 필수 경우의 수가 traceability matrix에서 test ID와 연결된다.

## 32. 명시적으로 허용하지 않는 미정의 상태

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
