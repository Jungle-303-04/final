---
title: Topology Hierarchy API Integration Handoff
status: implemented-frontend-backend-handoff
owner: frontend-platform
version: topology-hierarchy/v1
last_verified: 2026-07-11
---

# Topology Hierarchy API 연동 계약

## 0. 결론

백엔드는 현재 프론트의 Cluster → Node → Pod 화면을 위해 아래 read endpoint 하나를 구현한다.

```text
GET /api/v1/workspaces/{workspaceId}/topology/hierarchy-snapshots/current
```

응답은 provider-neutral한 `topology-hierarchy/v1` 원자 스냅샷이다. 성공 응답은 반드시 `200`과 `{ "data": TopologyHierarchySnapshot }`을 반환한다. query parameter와 request body는 없다. Snapshot에는 topology cut의 `completeness`와 별도로 canonical `freshness`가 반드시 존재한다.

이 endpoint는 완성형 Full Topology protocol이 아니라 현재 hierarchy 화면을 실제 데이터로 부팅하기 위한 임시 projection이다. Namespace, workload, Service, Ingress, ownership/network edge, evidence, expansion, pagination, realtime delta를 이 endpoint에 추가하지 않는다. Full Topology의 `TopologyGateway`가 연결되는 시점에는 composition root에서 이 gateway를 **교체**한다. 두 transport를 동시에 실행하거나 revision·metric·entity를 병합하지 않는다.

백엔드 구현에 필요한 결정은 이 문서로 닫는다. 내부 framework, 저장소, collector 구조는 이 계약의 범위가 아니다.

## 1. 구현 기준 위치와 책임

이 문서가 backend handoff의 semantic authority이며, 아래 TypeScript DTO·Zod schema·adapter·tests가 동일 계약의 실행 정본이다. 문서와 실행 코드가 다르면 production 연동을 중단하고 둘을 같은 변경에서 다시 동기화한다.

| 책임 | 구현 기준 위치 |
|---|---|
| canonical hierarchy DTO와 port | [`contracts.ts`](../../../frontend/src/features/topology/contracts.ts) |
| request URL/config contract | [`topologyHierarchyApi.ts`](../../../frontend/src/features/topology/api/topologyHierarchyApi.ts) |
| runtime JSON schema와 cross-field validation | [`topologyHierarchySchema.ts`](../../../frontend/src/features/topology/api/topologyHierarchySchema.ts) |
| HTTP/error mapping | [`topologyHttpError.ts`](../../../frontend/src/features/topology/api/topologyHttpError.ts) |
| production HTTP adapter | [`HttpTopologyHierarchyGateway.ts`](../../../frontend/src/features/topology/adapters/HttpTopologyHierarchyGateway.ts) |
| live/synthetic 선택 경계 | [`liveComposition.ts`](../../../frontend/src/composition/liveComposition.ts) |
| request/error/cancel contract test | [`HttpTopologyHierarchyGateway.test.ts`](../../../frontend/src/features/topology/adapters/HttpTopologyHierarchyGateway.test.ts) |

### 1.1 문서·코드 동기화 상태

`TopologyHierarchySnapshot.freshness`를 포함한 §5 전체가 DTO, runtime schema, engine projection, UI badge/notice, live·synthetic fixture와 contract test에 구현되어 있다. Backend는 §5.8을 생략하거나 임시 string 상태로 바꾸면 안 된다.

완성형 제품 계약은 다음 문서를 함께 따른다.

- [Product data contract](product-data-contract.md) — canonical identity, completeness, freshness, Full Topology consumer contract.
- [Topology engine](topology-engine.md) — Full Topology의 유일한 backend-facing `TopologyGateway`, snapshot/stream/reducer 불변조건.
- [Topology message/action schema](topology-message-action-schema.md) — 완성형 `SnapshotEnvelope`/`StreamEnvelope` wire.
- [Topology visual/motion contract](topology-visual-motion-tokens.md) — 같은 entity가 map/focus/zoom presentation으로 재투영되는 규칙.

우선순위는 다음과 같다.

1. 현재 bootstrap endpoint의 실제 wire는 이 문서와 위 TypeScript/Zod 구현이 결정한다.
2. Full Topology로 전환할 때는 bootstrap DTO를 확장하지 않고 Full Topology 구현 기준으로 transport를 교체한다.
3. provider 이름이나 provider DTO는 어느 wire에도 canonical field로 추가하지 않는다.

## 2. 현재 bootstrap과 Full Topology의 경계

### 2.1 현재 실행 흐름

```text
liveComposition
  → HttpTopologyHierarchyGateway
  → GET hierarchy-snapshots/current
  → topologyHierarchySnapshotResponseSchema
  → TopologyHierarchySnapshot
  → hierarchy engine projection
  → Cluster → Node → Pod zoomable treemap
```

현재 gateway는 다음만 제공한다.

- authorized workspace의 Cluster 배열.
- Cluster 내부 Node 배열.
- Node 내부 Pod 배열.
- 각 entity의 health와 합산 가능한 면적 metric 상태.
- 한 observation cut의 revision, cut time, completeness, canonical freshness.
- 초기 mount 및 사용자 수동 refresh.

현재 gateway가 제공하지 않는 것:

- cursor pagination 또는 graph expansion.
- Namespace/ApplicationBinding/workload/Service/Ingress/PVC 등 Full Topology node.
- owns/selects/routes_to/mounts/depends_on/deployed_by 등 edge.
- snapshot 이후 stream, polling cursor, resume, delta.
- per-metric/per-source freshness와 coverage catalog. Snapshot 전체 freshness는 §5.8로 제공한다.
- historical query, filter, application binding, relation plane.

이 항목이 필요해졌다고 hierarchy endpoint에 임의 field, query, WebSocket을 추가하지 않는다. Full Topology 계획과 schema를 구현한다.

### 2.2 전환 불변조건

Full Topology 전환 시 composition root는 다음 중 정확히 하나만 등록한다.

1. 현재 `TopologyHierarchyGateway`, 또는
2. Full Topology `TopologyGateway`와 그 engine store.

금지:

- 두 gateway를 동시에 fetch/subscribe하기.
- hierarchy `snapshotRevision`과 Full Topology `frameId`를 같은 revision처럼 비교하기.
- hierarchy entity 배열을 Full ResourceGraph snapshot에 client-side merge하기.
- Full Topology 화면을 위한 두 번째 live `ResourceGraphFacadePort`를 만들기.
- hierarchy polling과 Full Topology stream을 동시에 유지하기.

Full ResourceGraph facade가 필요하면 [Runtime Topology 단일 wire 권위](product-data-contract.md#94-runtime-topology-단일-wire-권위)에 따라 같은 committed engine store를 projection한다. 별도 HTTP/SSE/WebSocket transport를 열지 않는다.

## 3. 브라우저 runtime 설정

### 3.1 환경 변수

| 변수 | 필수 | 허용값과 의미 |
|---|---|---|
| `VITE_TOPOLOGY_API_BASE_URL` | 필수 | `/`, root-relative prefix, 또는 absolute `http:`/`https:` URL. query, hash, URL credentials 금지. `//`로 시작하는 protocol-relative URL 금지. trailing slash는 제거된다. |
| `VITE_TOPOLOGY_WORKSPACE_ID` | 필수 | 비어 있지 않은 opaque workspace ID. 한 URL segment로 percent-encode된다. 값은 trim되어 전송되지 않으므로 배포값 앞뒤에 공백을 넣지 않는다. |
| `VITE_TOPOLOGY_API_CREDENTIALS` | 선택 | `omit | same-origin | include`. 기본값 `same-origin`. `include`는 의도적으로 구성한 credentialed CORS에서만 사용한다. |
| `VITE_TOPOLOGY_HIERARCHY_PATH_TEMPLATE` | 선택 | `/`로 시작하고 `//`로 시작하지 않으며 `{workspaceId}`를 정확히 한 번 포함하는 root-relative path. query/hash 금지. 미설정 시 제안 기본 path 사용. |

예시:

```dotenv
VITE_TOPOLOGY_API_BASE_URL=/
VITE_TOPOLOGY_WORKSPACE_ID=workspace-1
VITE_TOPOLOGY_API_CREDENTIALS=same-origin
VITE_TOPOLOGY_HIERARCHY_PATH_TEMPLATE=/api/v1/workspaces/{workspaceId}/topology/hierarchy-snapshots/current
```

`VITE_*` 값은 browser build 결과에 공개된다. bearer token, session secret, private credential을 넣지 않는다.

### 3.2 인증 방식

현재 `main.tsx`는 별도 `authHeaders` dependency 없이 `createLiveTopologyGateway()`를 호출한다. 즉시 연동 가능한 기본 방식은 다음 중 하나다.

- 동일 origin session cookie + `same-origin`.
- 명시적으로 허용한 cross-origin cookie + `include`와 credentialed CORS.

Adapter는 `authHeaders(signal)` injection을 지원하므로 향후 validated auth composition이 `Authorization` header를 요청 직전에 제공할 수 있다. 그 전에는 production entry가 bearer header를 자동 생성하지 않는다.

## 4. HTTP request 계약

### 4.1 Method와 path

| 항목 | 값 |
|---|---|
| Method | `GET` |
| 제안 기본 path | `/api/v1/workspaces/{workspaceId}/topology/hierarchy-snapshots/current` |
| Query | 없음 |
| Request body | 없음 |
| Success status | `200`만 사용 |
| Success media type | `application/json` 또는 `application/*+json` |

제안 path가 기존 API routing과 충돌하면 의미를 바꾸지 않는 다른 root-relative path를 OpenAPI에 확정하고 `VITE_TOPOLOGY_HIERARCHY_PATH_TEMPLATE`로 주입한다. `{workspaceId}` placeholder는 정확히 하나여야 한다.

`workspaceId`는 client가 `encodeURIComponent`로 한 path segment에 가둔다.

```text
workspace/test team
→ workspace%2Ftest%20team
```

Backend router는 decode한 opaque workspace ID를 authorization scope로 사용하며 `/`를 하위 path로 해석하지 않는다.

### 4.2 Request header

| Header | 필수/조건 | 규칙 |
|---|---|---|
| `Accept` | client 필수 | `application/json` |
| `X-Request-ID` | client 필수 | 요청마다 생성하는 opaque ID. 기본 client 구현은 `crypto.randomUUID()`를 사용한다. Backend log/correlation에 전달하되 authorization identity로 사용하지 않는다. |
| `Cookie` | 인증 방식에 따라 | browser credentials 정책에 따라 전송. |
| `Authorization` | injection 구성 시 | `authHeaders` provider가 요청 직전에 공급. Vite 환경 변수에서 만들지 않음. |

## 5. 성공 response 계약

### 5.1 Envelope

모든 성공 field는 별도 표에서 optional이라고 명시하지 않는 한 required이며 non-null이다.

| JSON path | Type | Required / nullable | 규칙 |
|---|---|---|---|
| `data` | `TopologyHierarchySnapshot` object | required, non-null | 성공 payload의 유일한 root. 배열 자체나 unwrapped snapshot 금지. |

성공 시 empty도 `204`가 아니라 `200`과 유효한 `data` object로 반환한다.

### 5.2 `TopologyHierarchySnapshot`

| Field | JSON type | Required / nullable | 정확한 규칙 |
|---|---|---|---|
| `schemaVersion` | string literal | required, non-null | 정확히 `topology-hierarchy/v1`. |
| `workspaceId` | string | required, non-null | 최소 한 개의 non-whitespace 문자를 포함. URL에서 요청한 decoded workspace ID와 byte-for-byte 같아야 함. |
| `snapshotRevision` | string | required, non-null | non-blank opaque revision. Client가 parsing/ordering하지 않음. semantic snapshot이 변하면 변경. 동일 cut이면 유지 가능. |
| `observedAt` | string | required, non-null | atomic hierarchy projection cut이 commit된 시각. timezone이 포함된 RFC 3339. `YYYY-MM-DDTHH:mm:ss[.fraction]Z` 또는 explicit `±HH:mm`. Freshness source observation과 다른 의미다. |
| `dataOrigin` | object | required, non-null | 아래 live origin 규칙. |
| `areaMetrics` | array | required, non-null, 최소 1개 | `AreaMetricDescriptor[]`. |
| `defaultAreaMetricId` | string | required, non-null | `areaMetrics[].metricId` 중 정확히 하나를 참조. |
| `clusters` | array | required, non-null | 0개 이상 `ClusterTopologyEntity`. Workspace에 authorized cluster가 없으면 `[]`. |
| `completeness` | discriminated object | required, non-null | `complete` 또는 `partial`. |
| `freshness` | discriminated object | required, non-null | `fresh | stale | unknown`. §5.8. Completeness/health와 독립. |

`dataOrigin`:

| Field | JSON type | 값 |
|---|---|---|
| `kind` | string literal | 정확히 `live` |
| `adapterId` | string literal | 현재 production composition에서는 정확히 `http-topology-hierarchy/v1` |

Backend가 collector/provider 이름을 `adapterId`에 넣지 않는다. 이 값은 frontend transport identity이며 infrastructure provider identity가 아니다.

### 5.3 `AreaMetricDescriptor`

| Field | JSON type | Required / nullable | 규칙 |
|---|---|---|---|
| `metricId` | string | required, non-null | non-blank, `areaMetrics` 안에서 unique, provider-neutral stable identity. |
| `label` | string | required, non-null | non-blank 사용자 label. |
| `unitId` | string | required, non-null | non-blank canonical unit ID. 같은 metric을 가진 모든 entity value와 exact match. |
| `additive` | boolean literal | required, non-null | 정확히 `true`. 비합산 비율/퍼센트는 면적 metric으로 제공하지 않음. |
| `order` | JSON integer | required, non-null | JavaScript safe integer. `areaMetrics` 안에서 unique. 음수도 schema상 유효하지만 backend는 변경되지 않는 안정적 순서를 사용해야 함. |

Metric catalog는 backend가 동적으로 제공한다. CPU, memory, storage, cost를 frontend field로 고정하지 않는다. 현재 UI는 catalog 중 한 metric을 면적 기준으로 선택한다.

### 5.4 Entity 공통 field

Cluster, Node, Pod는 아래 field를 모두 가진다.

| Field | JSON type | Required / nullable | 규칙 |
|---|---|---|---|
| `kind` | string literal | required, non-null | entity별 `cluster | node | pod`. |
| `entityKey` | string | required, non-null | non-blank, snapshot 전체 Cluster/Node/Pod 사이에서 globally unique. 동일 live object에는 안정적. display name 금지. |
| `displayName` | string | required, non-null | non-blank 사용자 표시 이름. identity로 사용하지 않음. |
| `health` | enum string | required, non-null | `healthy | neutral | degraded | unhealthy | unknown`. |
| `healthReason` | string | required, non-null | non-blank, 사용자에게 안전한 canonical reason. raw provider error/secret 금지. |
| `metrics` | object map | required, non-null | key는 metric ID, value는 `MetricValue`. 모든 `areaMetrics` 항목을 명시적으로 포함. |

`entityKey`는 opaque다. Client가 prefix, namespace, 이름을 parsing하지 않는다. 같은 이름이라도 resource UID가 달라진 재생성 object는 새 `entityKey`를 사용한다.

### 5.5 Entity별 field

| Entity | 추가 field | JSON type | Required / nullable | 규칙 |
|---|---|---|---|---|
| Cluster | `clusterUid` | string | required, non-null | non-blank, snapshot의 cluster 사이에서 unique, workspace 안에서 안정적. |
| Cluster | `environmentLabel` | string | required, non-null | non-blank canonical environment label. cloud provider 이름으로 UI를 분기하는 field가 아님. |
| Cluster | `nodes` | array | required, non-null | 0개 이상 Node. |
| Node | `resourceUid` | string | required, non-null | non-blank, snapshot의 모든 Node/Pod 사이에서 unique. |
| Node | `pods` | array | required, non-null | 0개 이상 Pod. Pod가 0개인 Node도 반드시 유지. |
| Pod | `resourceUid` | string | required, non-null | non-blank, snapshot의 모든 Node/Pod 사이에서 unique. |
| Pod | `namespace` | string | required, non-null | non-blank namespace identity/display value. |
| Pod | `phase` | string | required, non-null | non-blank canonical phase. 현재 wire는 enum을 고정하지 않으므로 frontend가 임의 상태 집합으로 거부하지 않음. |

Cluster/Node/Pod 배열은 identity가 아니다. Backend는 semantic snapshot이 같을 때 안정적인 배열 순서를 유지해 불필요한 animation reorder를 만들지 않는다.

### 5.6 `MetricValue`

JSON number를 사용하지 않는다. 모든 수치는 decimal string이다.

| `state` | `valueDecimal` | `unitId` | `reason` | 의미 |
|---|---|---|---|---|
| `value` | required string, `> 0` | required non-blank | 보내지 않음 | 실제 양수 값. |
| `zero` | 정확히 string `"0"` | required non-blank | 보내지 않음 | 관측된 정확한 0. |
| `missing` | 정확히 `null` | required non-blank | required non-blank | source가 아직 값을 제공하지 못함. |
| `forbidden` | 정확히 `null` | required non-blank | required non-blank | 권한 정책상 값을 제공할 수 없음. |
| `unsupported` | 정확히 `null` | required non-blank | required non-blank | 대상/capability가 metric을 지원하지 않음. |

Decimal grammar:

```regex
^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$
```

추가 규칙:

- `value`는 `0`, `0.0`, `0.00`을 거부한다. 0은 반드시 `zero` variant를 사용한다.
- sign, exponent, comma, leading zero, whitespace, `.5`, `NaN`, `Infinity`를 보내지 않는다.
- descriptor와 entity value의 `unitId`는 exact match여야 한다.
- unavailable을 0으로 변환하지 않는다.
- extra metric key는 현재 parser가 보존할 수 있지만 `areaMetrics`에 없으면 UI 면적 catalog가 발견하지 않는다. 이 bootstrap response에는 catalog에 없는 metric을 보내지 않는 것을 원칙으로 한다.

### 5.7 `completeness`

| Variant | JSON shape | 규칙 |
|---|---|---|
| complete | `{ "state": "complete" }` | authorized scope와 선언된 metric을 해당 observation cut에서 완전하게 조립. |
| partial | `{ "state": "partial", "reasons": [string, ...] }` | `reasons` 최소 1개, 각 항목 non-blank, 사용자에게 안전하고 조치 가능한 설명. |

Partial은 HTTP error가 아니다. 안전한 일부 데이터가 있으면 `200` partial을 반환한다. 전체 workspace 접근 권한이 없으면 data를 넣은 partial이 아니라 `403`이다.

현재 hierarchy DTO는 restricted placeholder를 정의하지 않는다. 권한 없는 resource identity, name, namespace, UID, hidden count를 placeholder나 reason에 노출하지 않는다. Authorized universe에서 제거하고 필요한 경우 cardinality-free partial reason만 제공한다.

### 5.8 `freshness`

Freshness는 snapshot에 required인 독립 상태 축이다.

공통 field:

| Field | JSON type | Required / nullable | 규칙 |
|---|---|---|---|
| `state` | enum string | required, non-null | `fresh | stale | unknown`. |
| `receivedAt` | RFC 3339 string | required, non-null | Server가 이 response를 조립한 UTC canonical timestamp. |
| `staleAfterMs` | JSON integer | required, non-null | 0 이상 JavaScript safe integer millisecond. 해당 hierarchy source 정책 TTL. |

Variant field:

| State | `observedAt` | `ageMs` | `reason` |
|---|---|---|---|
| `fresh` | required RFC 3339 timestamp | required 0 이상 safe integer ms | 정확히 `null` |
| `stale` | required RFC 3339 timestamp | required 0 이상 safe integer ms | required `StatusReason` object |
| `unknown` | 정확히 `null` | 정확히 `null` | required `StatusReason` object |

`StatusReason`:

| Field | JSON type | Required / nullable | 규칙 |
|---|---|---|---|
| `code` | string | required, non-null | non-blank provider-neutral machine code. UI 분기의 authority. |
| `messageKey` | string | required, non-null | non-blank product localization key. |
| `detail` | string 또는 null | required, nullable | 안전하게 redacted된 추가 설명. Raw provider payload/secret/hidden identity 금지. |

Freshness 계산 불변조건:

1. `fresh`/`stale`에서 `ageMs = receivedAt - freshness.observedAt`를 server가 integer millisecond로 계산한다.
2. `fresh`는 `ageMs <= staleAfterMs`다.
3. `stale`은 `ageMs > staleAfterMs`다.
4. `unknown`은 신뢰 가능한 source observation timestamp를 만들 수 없을 때만 사용하며 `observedAt`/`ageMs`가 둘 다 null이다.
5. 여러 source를 합친 bootstrap snapshot에서 `freshness.observedAt`은 포함된 필수 source observation 중 가장 오래된 시각을 사용한다. 따라서 `ageMs`는 snapshot의 worst included age다.
6. Top-level `observedAt`은 hierarchy projection cut commit 시각이고 `receivedAt`보다 늦을 수 없다. 이 순서는 `unknown`에서도 검증한다.
7. `fresh`/`stale`에서 `freshness.observedAt`은 source observation 시각이며 `freshness.observedAt <= observedAt <= receivedAt`이어야 한다.
8. `receivedAt`과 `ageMs`만 매 요청마다 달라졌다는 이유로 topology identity/revision을 churn시키지 않는다. Freshness state, source cut, topology/metric/health/completeness가 의미 있게 변하면 `snapshotRevision`을 갱신한다.

Sync, health, freshness, completeness는 서로 직교한다. 예를 들어 향후 binding overlay가 synchronized여도 hierarchy health가 unhealthy이고 snapshot freshness가 stale일 수 있다. Bootstrap DTO는 sync를 아직 포함하지 않지만 health에서 freshness를 추론하거나 stale을 unhealthy로 변환하지 않는다. `partial + fresh`, `complete + stale`, `partial + unknown`도 모두 유효하다.

Stale variant 예시:

```json
{
  "state": "stale",
  "receivedAt": "2026-07-11T10:30:20Z",
  "staleAfterMs": 15000,
  "observedAt": "2026-07-11T10:30:00Z",
  "ageMs": 20000,
  "reason": {
    "code": "source_observation_stale",
    "messageKey": "topology.freshness.source_stale",
    "detail": "The newest complete source observation is older than the configured freshness policy"
  }
}
```

## 6. Cross-field 불변조건

Backend는 response를 보내기 전에 아래를 모두 만족시킨다. 하나라도 위반하면 frontend는 전체 response를 `schema_incompatible`로 거부한다.

1. `workspaceId`는 요청 path의 decoded workspace ID와 exact match한다.
2. `dataOrigin.kind`는 `live`다.
3. `dataOrigin.adapterId`는 configured frontend adapter ID `http-topology-hierarchy/v1`과 exact match한다.
4. `areaMetrics`는 최소 1개이고 모든 `metricId`가 unique다.
5. 모든 `areaMetrics.order`가 unique여서 catalog 정렬에 동률이 없다.
6. `defaultAreaMetricId`는 한 descriptor를 참조한다.
7. 모든 Cluster/Node/Pod `entityKey`는 snapshot 전체에서 unique다.
8. 모든 `clusterUid`는 Cluster 사이에서 unique다.
9. 모든 Node/Pod `resourceUid`는 두 kind를 합친 집합에서 unique다.
10. 모든 entity는 모든 `areaMetrics` descriptor에 대한 `MetricValue`를 명시적으로 가진다.
11. 각 metric value의 `unitId`는 해당 descriptor의 `unitId`와 exact match한다.
12. `value`/`zero`/unavailable variant의 decimal/null/reason 조합은 §5.6과 일치한다.
13. clusters, descendants, parent metrics, health, revision, observed time, completeness, freshness는 하나의 atomic observation cut을 설명한다.
14. Parent metric은 backend-provided 값이다. Frontend가 child를 합산하지 않으며 parent와 child 합이 같다고 가정하지 않는다.
15. Authorized descendant가 누락되었거나 source cut이 불완전하면 완전한 aggregate처럼 표시하지 말고 `partial`을 반환한다.
16. `snapshotRevision`은 opaque semantic revision이다. display order만 불안정하게 바뀌어 revision churn을 만들지 않는다.
17. provider-specific field, provider DTO, provider error body를 success object에 추가하지 않는다. Unknown field가 현재 parser에서 제거될 수 있어도 canonical 계약이 아니며 향후 거부될 수 있다.
18. `fresh`/`stale`의 `ageMs`, `staleAfterMs`, timestamp order와 state threshold가 §5.8 계산식과 일치한다.
19. `unknown` freshness는 `observedAt=null`, `ageMs=null`, non-null safe reason을 함께 가진다.
20. Health, completeness, freshness를 서로 변환하지 않는다. 어느 한 축의 값이 다른 축의 enum을 결정하지 않는다.

## 7. 성공 예시

```json
{
  "data": {
    "schemaVersion": "topology-hierarchy/v1",
    "workspaceId": "workspace-1",
    "snapshotRevision": "hierarchy-revision-000042",
    "observedAt": "2026-07-11T10:20:30.125Z",
    "dataOrigin": {
      "kind": "live",
      "adapterId": "http-topology-hierarchy/v1"
    },
    "areaMetrics": [
      {
        "metricId": "cpu.usage.cores",
        "label": "CPU 사용 코어",
        "unitId": "core",
        "additive": true,
        "order": 10
      }
    ],
    "defaultAreaMetricId": "cpu.usage.cores",
    "clusters": [
      {
        "kind": "cluster",
        "entityKey": "entity-cluster-01",
        "clusterUid": "cluster-uid-01",
        "displayName": "production-a",
        "environmentLabel": "Production",
        "health": "healthy",
        "healthReason": "All authorized nodes are ready",
        "metrics": {
          "cpu.usage.cores": {
            "state": "value",
            "valueDecimal": "3.75",
            "unitId": "core"
          }
        },
        "nodes": [
          {
            "kind": "node",
            "entityKey": "entity-node-01",
            "resourceUid": "resource-node-uid-01",
            "displayName": "worker-01",
            "health": "healthy",
            "healthReason": "Node is ready",
            "metrics": {
              "cpu.usage.cores": {
                "state": "value",
                "valueDecimal": "1.25",
                "unitId": "core"
              }
            },
            "pods": [
              {
                "kind": "pod",
                "entityKey": "entity-pod-01",
                "resourceUid": "resource-pod-uid-01",
                "displayName": "orders-api-7d9c8f7d8f-abcd1",
                "namespace": "orders",
                "phase": "Running",
                "health": "healthy",
                "healthReason": "Pod is ready",
                "metrics": {
                  "cpu.usage.cores": {
                    "state": "value",
                    "valueDecimal": "0.42",
                    "unitId": "core"
                  }
                }
              }
            ]
          }
        ]
      }
    ],
    "completeness": {
      "state": "complete"
    },
    "freshness": {
      "state": "fresh",
      "receivedAt": "2026-07-11T10:20:31.125Z",
      "staleAfterMs": 15000,
      "observedAt": "2026-07-11T10:20:30.125Z",
      "ageMs": 1000,
      "reason": null
    }
  }
}
```

## 8. Empty, zero, missing, partial 예시

다음은 유효한 partial response다. Cluster는 존재하지만 Node가 0개이고, CPU는 실제 0, memory는 미관측이다.

```json
{
  "data": {
    "schemaVersion": "topology-hierarchy/v1",
    "workspaceId": "workspace-1",
    "snapshotRevision": "hierarchy-revision-000043",
    "observedAt": "2026-07-11T10:21:00+09:00",
    "dataOrigin": {
      "kind": "live",
      "adapterId": "http-topology-hierarchy/v1"
    },
    "areaMetrics": [
      {
        "metricId": "cpu.usage.cores",
        "label": "CPU 사용 코어",
        "unitId": "core",
        "additive": true,
        "order": 10
      },
      {
        "metricId": "memory.usage.bytes",
        "label": "메모리 사용량",
        "unitId": "byte",
        "additive": true,
        "order": 20
      }
    ],
    "defaultAreaMetricId": "cpu.usage.cores",
    "clusters": [
      {
        "kind": "cluster",
        "entityKey": "entity-cluster-empty",
        "clusterUid": "cluster-uid-empty",
        "displayName": "empty-cluster",
        "environmentLabel": "Development",
        "health": "unknown",
        "healthReason": "No authorized node has been observed",
        "metrics": {
          "cpu.usage.cores": {
            "state": "zero",
            "valueDecimal": "0",
            "unitId": "core"
          },
          "memory.usage.bytes": {
            "state": "missing",
            "valueDecimal": null,
            "unitId": "byte",
            "reason": "Memory metrics have not been observed for this scope"
          }
        },
        "nodes": []
      }
    ],
    "completeness": {
      "state": "partial",
      "reasons": [
        "One or more authorized metric sources have not completed their observation cut"
      ]
    },
    "freshness": {
      "state": "unknown",
      "receivedAt": "2026-07-11T01:21:01Z",
      "staleAfterMs": 15000,
      "observedAt": null,
      "ageMs": null,
      "reason": {
        "code": "source_observation_time_unknown",
        "messageKey": "topology.freshness.source_time_unknown",
        "detail": "The source did not provide a trustworthy observation timestamp"
      }
    }
  }
}
```

Workspace에 authorized Cluster 자체가 없는 완전한 empty state는 위와 동일한 envelope에서 `clusters: []`, `completeness: { "state": "complete" }`와 별도 canonical `freshness`를 반환한다. `areaMetrics`는 empty일 수 없으므로 최소 한 descriptor는 유지한다.

## 9. Error response와 frontend mapping

### 9.1 권장 canonical problem body

```json
{
  "error": {
    "code": "permission_denied",
    "message": "The caller cannot read this workspace topology",
    "correlationId": "correlation-01",
    "details": null
  }
}
```

| Field | Required / nullable | 규칙 |
|---|---|---|
| `error.code` | required, non-null | non-blank stable backend code. |
| `error.message` | required, non-null | non-blank, secret/provider raw payload가 없는 안전한 진단문. Frontend 사용자 문구의 authority로 사용하지 않음. |
| `error.correlationId` | optional, nullable | non-blank string 또는 `null`. 없으면 response `X-Correlation-ID`를 읽음. |
| `error.details` | optional, nullable 가능 | structured diagnostics. secret, raw provider body, hidden resource identity 금지. |

Frontend는 backend `message`를 그대로 UI에 표시하지 않고 category별 안전한 한국어 copy를 사용한다. `code`와 `correlationId`는 진단/복구용이다.

### 9.2 HTTP status mapping

| HTTP/transport | Frontend category | Gateway code | UI/복구 의미 |
|---|---|---|---|
| fetch rejection/offline | `network` | `network` | 연결 오류. 초기이면 error, refresh이면 마지막 성공 snapshot 유지. |
| `400`, `422` | `invalid_request` | `network` | request/path binding 오류. |
| `401` | `unauthenticated` | `forbidden` | session 만료/재인증. |
| `403` | `permission_denied` | `forbidden` | workspace topology 권한 없음. |
| `404` | `not_found` | `network` | workspace 또는 snapshot 없음. Provider 미설치로 추정하지 않음. |
| `409` | `conflict` | `network` | 상태 변경, 최신 snapshot 재조회. |
| `412` | `precondition_failed` | `network` | 기준이 오래됨, 최신 snapshot 재조회. |
| `429` | `rate_limited` | `network` | `Retry-After` 보존. |
| `502`, `503`, `504` | `source_unavailable` | `network` | topology source 일시 unavailable. |
| 기타 `5xx` | `server_error` | `network` | server 처리 실패. |
| 기타 non-2xx | `http_error` | `network` | 일반 HTTP 실패. |
| success status + non-JSON media type | `invalid_response` | `invalid_payload` | `unexpected_content_type`. |
| success status + malformed JSON | `invalid_response` | `invalid_payload` | `invalid_json`. |
| success status + schema/invariant 위반 | `invalid_response` | `invalid_payload` | `schema_incompatible`와 validation issue. |
| AbortSignal cancellation | `AbortError` 그대로 | 해당 없음 | 사용자 오류를 표시하지 않음. |

`429`에는 `Retry-After`를 필수로 반환한다. 일시적 `503`에도 권장한다. 값은 delta seconds 또는 HTTP-date다.

## 10. UI 상태와 응답 의미

| 상황 | Backend 응답 | 현재 UI 동작 |
|---|---|---|
| 최초 요청 중 | 아직 response 없음 | loading Empty/Spinner. 임의 entity/count 없음. |
| 완전 empty | `200`, `clusters: []`, complete | 유효한 empty hierarchy. Fake tile 생성 안 함. |
| 일부 source/권한 scope 누락 | `200`, safe data + partial reasons | 부분 스냅샷 badge, 제공된 entity 유지. |
| metric 정확한 0 | `state=zero` | 0을 missing과 구분하고 residual 구조 영역에 보존. |
| metric 미관측/금지/미지원 | 해당 discriminated variant | 0으로 합치지 않고 entity 구조를 보존. |
| snapshot fresh | `freshness.state=fresh` | completeness/health와 독립적으로 fresh 상태 표시. |
| snapshot stale | `freshness.state=stale` + reason | 마지막 geometry와 metric 유지 + stale badge/reason. Health를 unhealthy로 바꾸지 않음. |
| freshness unknown | `freshness.state=unknown` + reason | 데이터가 있으면 유지 + 관측 시각 불명 표시. Empty/error로 바꾸지 않음. |
| 사용자 refresh 중 | 새 GET 진행 | 마지막 성공 snapshot 유지 + refreshing indicator. |
| refresh 실패 | error status/network failure | 마지막 성공 snapshot 유지 + refresh warning. |
| 최초 요청 실패 | error status/network failure | panel error + 명시적 retry. |
| request abort | 연결 종료 | 오류 표시 안 함, obsolete response commit 안 함. |
| schema 위반 | HTTP가 200이어도 invalid response | 전체 새 response 거부, 이전 성공 snapshot이 있으면 유지. |

Backend response는 §5.8의 canonical freshness를 반드시 제공하며 frontend는 이를 검증한 뒤 completeness·health와 독립적으로 표시한다. Bootstrap은 snapshot 전체 freshness까지만 소유하고 per-source/per-metric coverage는 Full Topology 계약에서 확장한다.

## 11. 인증, workspace binding, redaction

Backend MUST:

1. 인증된 actor/session을 먼저 확인한다.
2. Path의 `workspaceId`가 actor에게 허용된 workspace인지 검사한다.
3. workspace + authorization/entitlement scope 안에서만 cluster/resource/metric universe를 조립한다.
4. 응답 `data.workspaceId`를 요청 workspace와 exact match시킨다.
5. 같은 display cluster name이 다른 workspace에 있어도 cache/fanout을 섞지 않는다.
6. hidden workspace/resource/namespace/UID/count를 partial reason 또는 metrics에서 누설하지 않는다.
7. Secret value, token, certificate, raw annotation/label/provider payload를 응답하지 않는다.

Path ID는 authorization 증명이 아니다. `workspaceId`만 알면 조회할 수 있는 endpoint를 만들지 않는다.

현재 endpoint는 read-only GET이다. Management cluster 여부나 provider 이름에 따라 response shape를 분기하지 않는다. 권한과 제공 가능성은 authorized result, metric variant, completeness, freshness로 표현한다.

## 12. Abort, cache, freshness, latency

### 12.1 Request lifecycle

- Component mount와 수동 refresh마다 `getSnapshot(signal)`이 실행된다.
- 이전 effect가 종료되면 browser가 `AbortController.abort()`를 호출한다.
- Adapter는 `fetch`에 동일 signal을 전달한다.
- Abort는 `TopologyHttpError`로 바꾸지 않는다.
- 현재 자동 polling과 stream은 없다.
- Browser request option은 `cache: "no-store"`다.

Backend는 client disconnect/cancel을 가능한 범위에서 downstream collection 취소에 전파하되, 이미 commit된 shared projection을 훼손하지 않는다.

### 12.2 Cache

- 민감한 workspace payload이므로 response에 `Cache-Control: no-store`를 권장한다.
- Backend가 내부 projection/cache를 사용하면 key에 최소 workspace identity와 authorization/entitlement revision을 포함한다.
- display name, provider name, frontend adapter ID만으로 cache scope를 만들지 않는다.
- Cached projection을 반환해도 `observedAt`, `snapshotRevision`, `completeness`, `freshness`는 실제 cached cut을 정직하게 설명해야 한다.
- Client는 ETag/If-None-Match/304를 현재 사용하지 않는다. `304`를 contract에 추가하지 않는다.

### 12.3 Latency와 freshness 목표

완성 제품의 graph initial snapshot budget을 bootstrap에도 적용한다.

| 항목 | 목표/규칙 |
|---|---|
| GET response p95 | 1,500ms 이하 목표 |
| source가 정상일 때 observation age | response 조립 시점 기준 5초 이내 목표 |
| hard client timeout | 현재 없음. 사용자 navigation/refresh ownership에 따른 Abort만 있음. |
| collection deadline 초과 | 안전한 atomic partial을 만들 수 있으면 `200 partial`; 만들 수 없으면 `503`과 선택적 `Retry-After`. |

목표 초과 자체가 schema error는 아니다. 그러나 오래된 cut을 현재값처럼 보이게 하지 않는다. Source observation age가 `staleAfterMs`를 초과하면 `freshness.state=stale`과 안전한 reason을 반환한다. Completeness는 별도로 계산하므로 source 집합이 모두 존재하면 `complete + stale`이 될 수 있다.

이 endpoint는 workspace의 전체 authorized hierarchy를 한 response로 받으며 pagination이 없다. Payload가 bootstrap budget을 지속적으로 넘으면 임의 page/query를 추가하지 말고 Full Topology의 bounded snapshot + expansion + stream으로 전환한다.

## 13. CORS 계약

Frontend와 API가 same-origin이면 CORS header가 필요 없다. Cross-origin이면 다음을 구성한다.

| Header/동작 | 요구사항 |
|---|---|
| `Access-Control-Allow-Origin` | 허용된 frontend origin exact value. Credential 사용 시 `*` 금지. |
| `Access-Control-Allow-Methods` | `GET, OPTIONS` 포함. |
| `Access-Control-Allow-Headers` | `Accept, X-Request-ID`; bearer injection을 쓰면 `Authorization` 포함. |
| `Access-Control-Allow-Credentials` | `credentials=include` cookie 구성이면 `true`. |
| `Access-Control-Expose-Headers` | `X-Correlation-ID, Retry-After`. Adapter가 browser에서 읽을 수 있어야 함. |
| `Vary` | Origin별 응답이면 `Origin` 포함. |

Preflight `OPTIONS`에 인증 challenge body를 반환하지 말고 허용 정책에 따라 정상 응답한다. 실제 `GET`에서 인증과 workspace authorization을 수행한다.

## 14. Synthetic 금지와 production failure 정책

- Production entry는 `createLiveTopologyGateway()`만 사용한다.
- 필수 환경 변수가 없거나 잘못되면 `unconfigured` live error를 표시한다.
- Network/HTTP/schema failure 시 synthetic adapter로 자동 fallback하지 않는다.
- Backend는 `dataOrigin.kind="synthetic"`, sample cluster, 임의 metric을 live endpoint에서 반환하지 않는다.
- Synthetic data는 별도 `demoComposition`과 `/demo.html`에서만 사용하며 화면에 `DEMO DATA`가 지속 표시된다.

Live 장애를 fake 정상 화면으로 바꾸는 것은 contract 위반이다.

## 15. Backend 구현 acceptance checklist

### Request와 binding

- [ ] GET path가 accepted OpenAPI 또는 `VITE_TOPOLOGY_HIERARCHY_PATH_TEMPLATE`와 일치한다.
- [ ] Query와 body 없이 요청 가능하다.
- [ ] Encoded slash/space가 포함된 workspace ID를 한 segment로 decode한다.
- [ ] 인증 actor와 workspace membership/entitlement를 검증한다.
- [ ] `Accept`와 `X-Request-ID`를 허용하고 correlation에 연결한다.

### Success schema

- [ ] Success는 empty 포함 항상 `200` JSON envelope `{ data: ... }`다.
- [ ] `schemaVersion`, `workspaceId`, live `dataOrigin`이 exact match한다.
- [ ] `observedAt`이 timezone을 포함한 RFC 3339다.
- [ ] area metric catalog가 non-empty이고 metric ID와 `order`가 각각 unique다.
- [ ] default metric이 catalog를 참조한다.
- [ ] 모든 entity가 모든 area metric 상태를 명시한다.
- [ ] Decimal을 JSON number가 아니라 canonical string으로 반환한다.
- [ ] 0과 missing/forbidden/unsupported를 구분한다.
- [ ] Entity/cluster/resource identity uniqueness와 stability를 만족한다.
- [ ] 한 response가 한 atomic cut이고 revision/completeness/freshness가 그 cut을 설명한다.
- [ ] Freshness의 `receivedAt`, `staleAfterMs`, variant field와 StatusReason이 §5.8을 만족한다.
- [ ] `ageMs` 계산과 fresh/stale threshold 경계가 정확하다.
- [ ] Health/completeness/freshness가 서로 독립이다.
- [ ] Provider-specific field와 raw provider error가 없다.

### Error, security, operations

- [ ] 401/403/404/409/412/422/429/502/503/504/5xx를 의미에 맞게 사용한다.
- [ ] 429에 `Retry-After`가 있다.
- [ ] Error body가 canonical problem shape이며 secret/hidden identity가 없다.
- [ ] Cross-origin이면 credential/CORS/exposed header가 정확하다.
- [ ] Response/cache가 workspace + entitlement 사이에서 격리된다.
- [ ] Empty/partial을 error나 fake resource로 변환하지 않는다.
- [ ] Full Topology transport와 동시에 hierarchy transport를 실행하지 않는다.

### Frontend acceptance

- [ ] 아래 adapter tests가 통과한다.
- [ ] 실제 endpoint curl response를 success/partial fixture와 대조한다.
- [ ] Initial, empty, partial, zero, missing, forbidden, unsupported, fresh, stale, freshness unknown, 403, 429, invalid JSON을 검증한다.
- [ ] Refresh failure 때 마지막 성공 snapshot이 유지된다.
- [ ] Abort된 response가 UI state를 덮어쓰지 않는다.

## 16. Curl 검증 예시

### 16.1 Bearer/session API 예시

`WORKSPACE_SEGMENT`는 이미 RFC 3986 percent-encoded된 한 path segment다.

```bash
BASE_URL='https://api.example.test'
WORKSPACE_SEGMENT='workspace%2Ftest%20team'
ACCESS_TOKEN='<replace-with-short-lived-test-token>'

curl --include --fail-with-body \
  --request GET \
  --header 'Accept: application/json' \
  --header 'X-Request-ID: topology-contract-check-001' \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  "${BASE_URL}/api/v1/workspaces/${WORKSPACE_SEGMENT}/topology/hierarchy-snapshots/current"
```

Cookie session을 쓰면 `Authorization` 대신 검증 환경의 cookie jar를 사용한다. 실제 credential을 문서, `.env`, shell history, fixture에 저장하지 않는다.

### 16.2 확인할 response header

```text
HTTP/1.1 200
Content-Type: application/json
Cache-Control: no-store
X-Correlation-ID: <opaque-id>   # 선택적이지만 권장
```

## 17. Frontend contract test 명령

Repository root에서:

```bash
cd frontend

npm test -- \
  src/features/topology/adapters/HttpTopologyHierarchyGateway.test.ts \
  src/composition/liveComposition.test.ts \
  src/features/topology/engineProjection.test.ts

npm run typecheck
npm run lint:architecture
npm run build
```

전체 frontend gate:

```bash
cd frontend
npm run check
```

현재 adapter test는 injected fetch로 다음을 고정 검증한다.

- encoded workspace URL, method, credentials, `cache=no-store`, AbortSignal.
- `Accept`, `Authorization`, `X-Request-ID` header.
- valid atomic snapshot parsing.
- default metric cross-field violation 거부.
- duplicate metric order 거부.
- freshness variant와 timestamp/age/threshold 불변조건 검증.
- 403 안전한 error mapping과 backend message 비노출.
- 429 `Retry-After` 보존.
- AbortError pass-through.
- fetch rejection의 network mapping.

Backend implementation은 이 semantic contract와 accepted OpenAPI를 만족하면 된다. Backend framework, DB table, collector process 이름을 frontend DTO에 노출하지 않는다.
