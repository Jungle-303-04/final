---
title: Home Treemap and Resources API Integration Guide
status: existing-backend-integration-guide
owner: frontend-platform
version: inventory-read-model/current
last_verified: 2026-07-11
---

# Home 트리맵과 Resources 실제 API 연동 가이드

## 0. 결론

이 문서는 새 topology API를 설계하는 문서가 아니다. 현재 백엔드에 실제로 등록된 session, cluster, fleet, inventory read API를 `references/ui-layer-lab/src/product/`에 연결하는 작업 지침이다.

다음 결정을 정본으로 사용한다.

1. 제품 코드는 `references/ui-layer-lab/src/product/` 안에서만 작성한다. 삭제 대상인 `frontend/`는 읽거나 복구하거나 다시 만들지 않는다.
2. `Topology` 메뉴와 별도 topology route는 없다. Home의 중심 화면이 클러스터 선택기, node frame, pod treemap이다.
3. Home의 node와 pod는 각각 아래 실제 endpoint에서 읽는다.

   ```text
   GET /api/clusters/{cluster_id}/inventory/resources?resource_type=node
   GET /api/clusters/{cluster_id}/inventory/resources?resource_type=pod
   ```

4. Resources는 목록 화면이다. 상세는 route 이동이 아니라 선택한 행 아래에서 인라인으로 펼친다. 이 화면은 Home 완료 gate를 통과한 뒤 시작한다.
5. Resources가 연결할 실제 endpoint는 다음 세 종류다.

   ```text
   GET /api/clusters/{cluster_id}/inventory/services
   GET /api/clusters/{cluster_id}/inventory/workloads
   GET /api/clusters/{cluster_id}/inventory/resource-detail
   ```

6. 브라우저 요청은 항상 same-origin `/api/...`, `credentials: "include"`를 사용한다. 모든 JSON은 `unknown`으로 읽은 뒤 Zod로 검증한다.
7. synthetic dataset, fixture fallback, sample cluster, 누락값 보간을 production runtime에 넣지 않는다.
8. 실제 등록 클러스터 선택지는 서버의 `GET /api/clusters` 응답에서 만든다. `cluster-1`과 `kubernetes-ops`가 실제 환경에 존재하더라도 응답에 없는 항목을 클라이언트가 만들어 내면 안 된다.
9. 로컬 백엔드가 없으면 기존 Vite proxy의 target만 `https://k8s.woonyong.org`로 지정한다. 그래도 실제 API를 읽을 수 없으면 화면을 fake data로 완성하지 않고 차단 사유를 보고한다.

과거 문서의 legacy hierarchy snapshot endpoint, 전용 gateway, synthetic dataset, 삭제된 별도 frontend entry와 환경 변수는 전부 폐기한다. CPU 사용량을 treemap 면적으로 쓰던 규칙도 폐기한다.

## 1. 정본과 적용 우선순위

### 1.1 코드 정본

API path와 DTO를 추측하지 말고 다음 파일을 직접 대조한다.

| 책임 | 정본 |
| --- | --- |
| 제품 코드 경계, 데이터와 보안 규칙 | [`references/ui-layer-lab/AGENTS.md`](../../../references/ui-layer-lab/AGENTS.md) |
| 현재 제품 runtime 구조 | [`references/ui-layer-lab/PRODUCT_FRONTEND.md`](../../../references/ui-layer-lab/PRODUCT_FRONTEND.md) |
| gateway path 상수 | [`src/packages/contracts/gateway/routes.py`](../../../src/packages/contracts/gateway/routes.py) |
| request DTO | [`src/packages/contracts/gateway/requests.py`](../../../src/packages/contracts/gateway/requests.py) |
| response DTO | [`src/packages/contracts/gateway/responses.py`](../../../src/packages/contracts/gateway/responses.py) |
| inventory query, 권한, limit, response 조립 | [`src/domains/inventory/router.py`](../../../src/domains/inventory/router.py) |
| session route | [`src/domains/identity/router.py`](../../../src/domains/identity/router.py) |
| cluster list route | [`src/domains/target/router.py`](../../../src/domains/target/router.py) |
| fleet route | [`src/domains/dashboard/fleet_router.py`](../../../src/domains/dashboard/fleet_router.py) |
| browser `/api` prefix 처리 | [`src/services/gateway/api-gateway/gateway.py`](../../../src/services/gateway/api-gateway/gateway.py) |
| 현재 공통 HTTP client | [`references/ui-layer-lab/src/product/api/client.ts`](../../../references/ui-layer-lab/src/product/api/client.ts) |
| 현재 auth API | [`references/ui-layer-lab/src/product/api/auth.ts`](../../../references/ui-layer-lab/src/product/api/auth.ts) |
| 현재 fleet API | [`references/ui-layer-lab/src/product/api/fleet.ts`](../../../references/ui-layer-lab/src/product/api/fleet.ts) |
| 현재 runtime schema | [`references/ui-layer-lab/src/product/api/schemas.ts`](../../../references/ui-layer-lab/src/product/api/schemas.ts) |
| local proxy | [`references/ui-layer-lab/vite.config.ts`](../../../references/ui-layer-lab/vite.config.ts) |

Gateway router의 실제 path는 `/auth/session`, `/clusters`, `/fleet/summary`처럼 `/api` 없이 선언돼 있다. Gateway middleware가 browser의 `/api/...`에서 `/api`를 제거한 뒤 router에 넘긴다. 따라서 frontend 함수는 반드시 `/api/...`를 사용한다.

### 1.2 UI 정본

- 색, 치수, density, z-order는 [topology visual/motion tokens](topology-visual-motion-tokens.md)가 정본이다.
- 인터랙션 모델과 focus sequence는 [topology engine Claude handoff](topology-engine-claude.md)가 정본이다.
- API 계층은 layout, animation, ribbon geometry를 소유하지 않는다. 검증된 backend resource를 UI projection에 넘기는 데까지만 책임진다.

## 2. 이번 작업의 경계와 순서

### 2.1 Home 완료 전 허용되는 작업

Home이 다음 gate를 통과하기 전에는 Resources 인라인 상세 구현을 시작하지 않는다.

1. session 확인
2. 접근 가능한 cluster 목록 조회
3. 선택한 cluster의 node와 pod inventory를 실제 API에서 병렬 조회
4. pod당 면적 1인 packed treemap 구성
5. health 전체 fill, namespace 3px strip, 사용량 하단 bar 적용
6. focus completeness assert와 지정된 motion sequence 통과
7. `cluster-1`을 실제 selector에서 선택해 렌더 확인
8. `npm run check` 통과
9. repository root에 `frontend/`가 없음을 확인

### 2.2 Home 완료 뒤 연결할 Resources

Home gate 이후에만 다음을 연결한다.

- service 목록
- workload 목록
- 선택한 resource의 인라인 detail
- detail 응답에 포함된 related group과 events

별도 detail page, detail route, topology tab을 추가하지 않는다.

## 3. 제품 API 디렉터리 지도

API 관련 코드는 모두 [`references/ui-layer-lab/src/product/api/`](../../../references/ui-layer-lab/src/product/api/) 아래에 둔다.

```text
references/ui-layer-lab/src/product/api/
├── client.ts                 # 기존 공통 fetch, error, credentials, CSRF, Zod 경계
├── auth.ts                   # 기존 getSession/login/logout
├── clusters.ts               # 새 listClusters
├── fleet.ts                  # 기존 getFleetSummary; Home 필수 요청은 아님
├── inventory.ts              # 새 inventory endpoint 함수와 query serializer
├── inventory-schemas.ts      # 새 inventory Zod schema
├── schemas.ts                # 기존 session/fleet schema; cluster schema를 둘 수 있음
└── index.ts                  # 외부 공개 함수와 type만 export
```

위에서 아직 없는 파일은 작업자가 만들 파일을 뜻하므로 링크로 위장하지 않았다.

의존 방향은 다음과 같다.

```text
product pages/features
        |
        v
product/api endpoint functions
        |
        v
product/api/client.ts
        |
        v
same-origin /api
```

Component와 hook에서 직접 `fetch`하지 않는다. API 파일이 page나 feature를 import하지 않는다.

## 4. 공통 transport 계약

### 4.1 `apiRequest`

기존 `apiRequest(path, schema, init)`를 모든 endpoint 함수의 유일한 transport로 사용한다.

| 항목 | 규칙 |
| --- | --- |
| URL | ``/api/${string}`` 타입의 same-origin path |
| credentials | 항상 `include` |
| success body | 먼저 `unknown`, 이후 전달받은 Zod schema로 parse |
| GET body | 없음 |
| state-changing header | `x-service-csrf: same-origin` |
| request accept | `application/json` |
| cancellation | caller의 `AbortSignal`을 같은 `fetch`에 전달 |
| synthetic fallback | 금지 |

현재 client에서 반드시 점검할 부분이 하나 있다. `fetch`가 `AbortError`로 reject되면 이를 `ApiError("network")`로 바꾸지 말고 그대로 다시 throw해야 한다. 취소는 offline/error UI가 아니다.

권장 error 분류는 다음과 같다.

| 원인 | API error kind | UI 의미 |
| --- | --- | --- |
| `401` | `unauthorized` | 로그인 또는 session 만료 |
| `403` | `forbidden` | 인증됐지만 해당 workspace/cluster 권한 없음 |
| `404` | `not-found` | detail 대상 또는 cluster가 현재 없음 |
| `422` | `invalid-request` | query/path 입력이 backend validation을 통과하지 못함 |
| `429` | `rate-limited` | `Retry-After`가 있으면 보존 |
| 기타 non-2xx | `http` | status를 보존한 일반 HTTP 오류 |
| fetch reject | `network` | backend 접근 실패 |
| JSON parse/Zod 실패 | `invalid-payload` | backend contract 불일치 |
| abort | error로 변환하지 않음 | obsolete 요청 종료 |

FastAPI 오류 body는 일반적으로 `{"detail": ...}`이다. `detail`은 string일 수도 있고 object/list일 수도 있으므로 UI가 이를 성공 DTO로 parse하거나 raw object를 그대로 화면에 출력하면 안 된다.

### 4.2 Path와 query 직렬화

다음 규칙을 하나의 작은 helper로 고정한다.

1. `cluster_id`, `kind`, `name` 같은 path/query string은 임의로 이어 붙이지 않는다.
2. path segment는 `encodeURIComponent`를 사용한다.
3. query는 `URLSearchParams`를 사용한다.
4. `undefined`와 `null`인 optional query는 보내지 않는다.
5. boolean은 `true` 또는 `false`, number는 base-10 string으로 보낸다.
6. 빈 namespace를 `namespace=`로 보내지 않는다. cluster-scoped resource는 parameter 자체를 생략한다.
7. client default에 기대어 limit을 숨기지 않는다. Home의 node/pod call은 `limit=1000`을 명시한다.

### 4.3 Runtime schema 원칙

Pydantic `StrictModel`은 top-level extra field를 금지한다. Frontend도 top-level DTO에는 `z.strictObject`를 사용한다.

단, backend의 `JsonMap = dict[str, Any]` field는 open object다. 다음 field는 `z.record(z.string(), z.unknown())`로 받아야 한다.

- `ClusterSummary.settings`
- `InventoryResourceResponse.labels`
- `InventoryResourceResponse.annotations`
- `InventoryResourceResponse.summary`
- `InventoryResourceDetailResponse.identity`
- `InventoryResourceDetailResponse.related`의 key

`unknown` nested value를 사용하기 전에 다시 좁은 Zod schema로 parse한다. `as`, `any`, number/string coercion으로 건너뛰지 않는다.

## 5. 연결 메서드 전체 카탈로그

### 5.1 인증과 session

| TS 함수 | HTTP 계약 | request DTO | response DTO / Zod | 소비자와 필요성 | 상태 profile |
| --- | --- | --- | --- | --- | --- |
| `getSession(signal?)` | `GET /api/auth/session` | 없음 | `AuthSessionResponse` / 기존 `authSessionSchema` | Product boot auth gate. Home 데이터 자체는 아니지만 모든 cluster API보다 먼저 필요 | `AUTH_READ` |
| `login(credentials, signal?)` | `POST /api/auth/login` | `LoginRequest` | `AuthSessionResponse` / 기존 `authSessionSchema` | 기존 login screen | `AUTH_WRITE` |
| `logout(signal?)` | `POST /api/auth/logout` | 없음 | `LogoutResponse` / 기존 `logoutResponseSchema` | 기존 account action | `AUTH_WRITE` |

`LoginRequest`:

| field | contract |
| --- | --- |
| `email` | required string, 최소 1자, backend email pattern 적용 |
| `password` | required string, 최소 8자 |

`AuthSessionResponse`:

| field | type / nullable |
| --- | --- |
| `authenticated` | required boolean, non-null |
| `user_id` | required string, non-null |
| `roles` | required `string[]`, array와 item 모두 non-null |
| `workspace_id` | required string, non-null |

`LogoutResponse.authenticated`는 required boolean이며 현재 성공값은 `false`다.

Cache와 cancel:

| 함수 | cache key | invalidation | cancel |
| --- | --- | --- | --- |
| `getSession` | `["session"]` | login 성공 뒤 replace, logout/401 뒤 clear | app unmount 또는 새 auth attempt에서 abort |
| `login` | cache하지 않음 | 성공 시 session을 response로 replace하고 모든 이전 workspace cache clear | submit 교체 또는 unmount에서 abort |
| `logout` | cache하지 않음 | 성공 또는 confirmed 401 뒤 session, cluster, fleet, inventory, detail cache 전부 clear | unmount에서 abort |

### 5.2 Cluster selector와 fleet

| TS 함수 | HTTP 계약 | request DTO / query | response DTO / Zod | 소비자와 필요성 | 상태 profile |
| --- | --- | --- | --- | --- | --- |
| `listClusters(options?, signal?)` | `GET /api/clusters?limit={int}` | body 없음. `limit` optional integer, backend default 100. Router에는 별도 min/max constraint가 없음 | `ClusterListResponse` / 새 `clusterListSchema` | Home cluster selector에 필수 | `CLUSTER_LIST` |
| `getFleetSummary(signal?)` | `GET /api/fleet/summary` | 없음 | `FleetSummaryResponse` / 기존 `fleetSummarySchema` | Home treemap 렌더에는 불필요. 실제 fleet rollup 소비자가 있을 때만 호출 | `FLEET_OPTIONAL` |

Home boot에서 `listClusters`와 `getFleetSummary`를 둘 다 cluster selector source로 사용하지 않는다. Selector identity는 `ClusterListResponse.clusters[].cluster_id`다. Fleet 응답은 별도 집계 projection이며 node/pod entity universe의 source가 아니다.

`ClusterListResponse`:

| JSON path | type / nullable |
| --- | --- |
| `clusters` | required `ClusterSummary[]`, non-null |
| `clusters[].workspace_id` | required string, non-null |
| `clusters[].cluster_id` | required string, non-null |
| `clusters[].name` | required string, non-null |
| `clusters[].environment` | required string, non-null |
| `clusters[].status` | required string, non-null |
| `clusters[].settings` | required `Record<string, unknown>`, non-null, default `{}` |
| `clusters[].connection_status` | required string, non-null |
| `clusters[].last_agent_id` | required key, `string | null` |
| `clusters[].last_agent_seen_at` | required key, `string | null` |
| `clusters[].node_count` | required integer, non-null |
| `clusters[].pod_count` | required integer, non-null |
| `clusters[].incident_count` | required integer, non-null |
| `clusters[].created_at` | required key, `string | null` |
| `clusters[].updated_at` | required key, `string | null` |

Cluster selector는 `cluster_id`를 value, `name`을 label로 사용한다. `cluster-1`이나 `kubernetes-ops` option을 코드에 직접 추가하지 않는다. 저장된 선택값이 응답 목록에 없으면 첫 접근 가능 cluster를 선택하거나 명시적 empty state를 보여 준다.

`FleetSummaryResponse`는 다음 계약이다.

| JSON path | type / nullable |
| --- | --- |
| `clusters` | required `FleetClusterSummaryItem[]` |
| `clusters[].cluster_id`, `clusters[].name` | required string |
| `clusters[].health` | required string; backend가 문서화한 값은 `healthy | warning | critical | stale | unknown` |
| `clusters[].pods_running`, `pods_total`, `nodes_ready`, `nodes_total` | required integer |
| `clusters[].open_incidents`, `restarts_recent` | required integer |
| `clusters[].cpu_pct`, `mem_pct` | required key, `number | null`; null은 unavailable |
| `clusters[].last_seen_at` | required key, `string | null` |
| `totals.clusters`, `healthy`, `warning`, `critical`, `stale`, `unknown` | required integer |
| `totals.open_incidents`, `pending_approvals`, `running_workflows`, `dead_letters` | required integer |

Fleet의 `health="stale"`는 backend가 계산한 cluster health다. HTTP cache가 오래됐다는 뜻으로 재해석하지 않는다.

Cache와 cancel:

| 함수 | cache key | invalidation | cancel |
| --- | --- | --- | --- |
| `listClusters` | `["clusters", workspaceId, limit ?? 100]` | login/logout/workspace 변경, 명시적 cluster refresh | app unmount 또는 auth scope 변경에서 abort |
| `getFleetSummary` | `["fleet-summary", workspaceId]` | login/logout/workspace 변경, fleet refresh | 소비자 unmount 또는 새 refresh에서 abort |

### 5.3 Home node/pod inventory

Home에는 endpoint 함수를 하나 만들고 query만 다르게 두 번 호출한다.

```ts
listInventoryResources(
  clusterId,
  {
    resourceType: "node" | "pod",
    namespace?: string,
    includeDeleted?: boolean,
    limit?: number,
  },
  signal?,
)
```

| TS 함수 | HTTP 계약 | request DTO / query | response DTO / Zod | 소비자와 필요성 | 상태 profile |
| --- | --- | --- | --- | --- | --- |
| `listInventoryResources(clusterId, query, signal?)` | `GET /api/clusters/{cluster_id}/inventory/resources` | body 없음. Backend query: `resource_type?: string`, `namespace?: string`, `include_deleted=false`, `limit=200` with `1..1000`. Frontend Home wrapper는 `resourceType`을 `node | pod`로 좁힘 | `InventoryResourceListResponse` / 새 `inventoryResourceListSchema` | Home node frame와 pod tile의 유일한 resource source | `HOME_INVENTORY_PAIR` |

Home call은 다음 두 개다.

```text
GET /api/clusters/cluster-1/inventory/resources?resource_type=node&include_deleted=false&limit=1000
GET /api/clusters/cluster-1/inventory/resources?resource_type=pod&include_deleted=false&limit=1000
```

위 예시의 `cluster-1`은 QA 대상 실제 cluster다. Runtime URL은 selector에서 받은 `cluster_id`로 만든다.

두 요청은 같은 `AbortController.signal`로 병렬 시작한다. 두 response가 모두 Zod 검증을 통과하고 `response.cluster_id === selectedClusterId`일 때만 새 Home projection을 commit한다.

Cache와 cancel:

| call | cache key | invalidation | cancel |
| --- | --- | --- | --- |
| node list | `["inventory-resources", workspaceId, clusterId, "node", namespace ?? null, false, 1000]` | cluster refresh, session/workspace 변경 | cluster 변경, refresh 교체, unmount |
| pod list | `["inventory-resources", workspaceId, clusterId, "pod", namespace ?? null, false, 1000]` | node list와 같은 refresh bundle로 함께 invalidate | node list와 같은 controller 사용 |

Node만 성공하거나 pod만 성공한 bundle을 complete treemap으로 commit하지 않는다. Initial load에서는 "일부 inventory를 읽지 못함" 상태를 표시하고, background refresh에서는 마지막으로 성공한 node+pod pair를 유지하면서 refresh 오류를 표시한다. 성공한 한쪽을 synthetic 반대편과 합치면 안 된다.

### 5.4 Resources 목록과 인라인 detail

이 절의 함수는 문서로 먼저 확정하지만 Home gate 이전에는 UI 연결을 시작하지 않는다.

| TS 함수 | HTTP 계약 | request DTO / query | response DTO / Zod | 소비자와 필요성 | 상태 profile |
| --- | --- | --- | --- | --- | --- |
| `listInventoryServices(clusterId, options?, signal?)` | `GET /api/clusters/{cluster_id}/inventory/services` | body 없음. `namespace?: string`, `limit=200`, `1..1000` | `InventoryResourceListResponse` / `inventoryResourceListSchema` | Resources service list | `RESOURCE_LIST` |
| `listInventoryWorkloads(clusterId, options?, signal?)` | `GET /api/clusters/{cluster_id}/inventory/workloads` | body 없음. `namespace?: string`, `limit=200`, `1..1000` | `InventoryResourceListResponse` / `inventoryResourceListSchema` | Resources workload list | `RESOURCE_LIST` |
| `getInventoryResourceDetail(clusterId, identity, options?, signal?)` | `GET /api/clusters/{cluster_id}/inventory/resource-detail` | body 없음. Required: `resource_type` 1..80, `kind` 1..120, `name` 1..253. Optional: `namespace` max 253, `related_limit=100` with `1..1000`, `event_limit=50` with `1..200` | `InventoryResourceDetailResponse` / 새 `inventoryResourceDetailSchema` | 선택 행 바로 아래 인라인 expansion | `RESOURCE_DETAIL` |

Detail identity는 목록 row에서 그대로 전달한다.

```ts
{
  resourceType: row.resource_type,
  kind: row.kind,
  namespace: row.namespace,
  name: row.name,
}
```

Node처럼 `namespace === null`인 resource는 `namespace` query를 생략한다. 문자열 `"null"`이나 빈 string으로 보내지 않는다.

Cache와 cancel:

| 함수 | cache key | invalidation | cancel |
| --- | --- | --- | --- |
| `listInventoryServices` | `["inventory-services", workspaceId, clusterId, namespace ?? null, limit ?? 200]` | cluster/session 변경, service list refresh | filter/cluster 변경, unmount |
| `listInventoryWorkloads` | `["inventory-workloads", workspaceId, clusterId, namespace ?? null, limit ?? 200]` | cluster/session 변경, workload list refresh | filter/cluster 변경, unmount |
| `getInventoryResourceDetail` | `["inventory-resource-detail", workspaceId, clusterId, resourceType, kind, namespace ?? null, name, relatedLimit ?? 100, eventLimit ?? 50]` | 해당 cluster list refresh, row identity 변경, session 변경 | row collapse, 다른 row expand, cluster 변경 |

동시에 여러 row detail을 허용하더라도 각 row는 자기 controller를 가져야 한다. 한 row를 접을 때 다른 row request를 취소하면 안 된다.

## 6. Inventory response DTO 정본

### 6.1 `InventoryResourceResponse`

Node, pod, service, workload, related resource, event는 모두 같은 DTO를 사용한다.

| field | type / nullable | 사용 규칙 |
| --- | --- | --- |
| `inventory_key` | required string, non-null | UI entity와 React key의 우선 identity |
| `snapshot_id` | required string, non-null | 관측 출처 표시 가능. 전체 response의 atomic revision으로 간주하지 않음 |
| `workspace_id` | required string, non-null | session scope 교차 검증용 |
| `cluster_id` | required string, non-null | selected cluster 교차 검증용 |
| `resource_type` | required string, non-null | backend 값 그대로 |
| `api_version` | required string, non-null | 표시 가능, enum 가정 금지 |
| `kind` | required string, non-null | detail query에 그대로 전달 |
| `namespace` | required key, `string | null` | cluster-scoped resource는 null |
| `name` | required string, non-null | display와 detail query |
| `uid` | required key, `string | null` | nullable이므로 React key로 단독 사용 금지 |
| `resource_version` | required key, `string | null` | nullable |
| `status` | required string, non-null | backend 문자열. client enum으로 축소하지 않음 |
| `health` | required string, non-null | backend 문자열. 알 수 없는 값은 UI unknown으로 map |
| `labels` | required `Record<string, unknown>`, non-null | nested 사용 전 별도 parse |
| `annotations` | required `Record<string, unknown>`, non-null | raw 표시 금지 |
| `summary` | required `Record<string, unknown>`, non-null | nested 사용 전 별도 parse |
| `observed_at` | required key, `string | null` | backend가 format enum을 보장하지 않으므로 Zod `datetime()` 강제 금지 |
| `first_seen_at` | required key, `string | null` | nullable |
| `last_seen_at` | required key, `string | null` | nullable |
| `deleted_at` | required key, `string | null` | Home은 `include_deleted=false` |
| `created_at` | required key, `string | null` | nullable |
| `updated_at` | required key, `string | null` | nullable |

`raw` Kubernetes object는 browser response에서 제거된다. Schema나 UI가 `raw`를 기대하면 안 된다.

### 6.2 `InventoryResourceListResponse`

| field | type / nullable |
| --- | --- |
| `cluster_id` | required string, non-null |
| `resource_type` | required key, `string | null` |
| `resources` | required `InventoryResourceResponse[]`, non-null |

`resources: []`는 정상 empty다. `resource_type`이 null일 수 있다는 DTO 계약을 유지한다. Home의 typed call은 node response에서 `"node"`, pod response에서 `"pod"`인지 추가 refine할 수 있지만 null을 임의 값으로 고치면 안 된다.

### 6.3 `InventoryResourceDetailResponse`

| field | type / nullable | 규칙 |
| --- | --- | --- |
| `cluster_id` | required string, non-null | selected cluster와 exact match 확인 |
| `identity` | required `Record<string, unknown>`, non-null | router는 resource_type, kind, namespace, name을 넣지만 DTO 자체는 JsonMap |
| `resource` | required `InventoryResourceResponse`, non-null | 펼친 원본 row |
| `related` | required `Record<string, InventoryResourceResponse[]>`, non-null, default `{}` | group key를 client enum으로 고정하지 않음 |
| `events` | required `InventoryResourceResponse[]`, non-null, default `[]` | 없으면 정상 empty |

Resource가 없으면 backend는 `404`와 `detail="inventory resource not found"`를 반환한다. 이를 전체 Resources page 오류로 올리지 말고 해당 inline expansion 안에서 처리한다.

## 7. `summary` nested field의 안전한 사용

Gateway response 계약은 `summary` 내부 field를 정적으로 보장하지 않는다. 현재 Kubernetes snapshot producer가 넣는 field를 사용하려면 별도 narrow parser를 둔다.

Home에 필요한 최소 parser 예:

```ts
const podTreemapSummarySchema = z.object({
  node_name: z.string().nullable().optional(),
  cpu_mcores: z.number().nullable().optional(),
}).passthrough();
```

규칙:

1. `summary.node_name`이 non-empty string이면 동일한 `node.name`과 연결한다.
2. missing, null, empty, 또는 존재하지 않는 node name이면 pod를 버리거나 가짜 node를 만들지 않는다. 실제 pod를 "node 배치 정보 없음" 상태로 보존한다.
3. `summary.cpu_mcores`가 finite number이면 하단 usage bar와 tooltip에만 사용한다.
4. explicit `0`은 실제 0이다.
5. missing, null, non-number는 unavailable이다. 0으로 바꾸지 않는다.
6. `cpu_mcores`는 면적 계산에 사용하지 않는다. 각 pod tile weight는 항상 1이다.
7. `health`는 top-level `resource.health`를 사용한다. `status`, `phase`, `cpu_mcores`로 client가 새 health를 계산하지 않는다.
8. namespace 안정 색의 입력은 top-level `resource.namespace`다. null이면 namespace를 발명하지 않는다.

Current producer 구현은 [`src/services/target/cluster-agent/providers/kubernetes_providers.py`](../../../src/services/target/cluster-agent/providers/kubernetes_providers.py)와 [`src/domains/inventory/kubernetes_snapshot.py`](../../../src/domains/inventory/kubernetes_snapshot.py)에서 확인할 수 있다. 그러나 gateway DTO가 여전히 `JsonMap`이므로 위 parser는 optional이어야 한다.

## 8. 메서드별 UI 상태 profile

### 8.1 공통 의미

| 상태 | 의미 |
| --- | --- |
| initial loading | 성공 데이터가 아직 없는 첫 request |
| background loading | 마지막 성공값을 유지한 refresh |
| empty | 성공 response의 collection이 빈 배열 |
| error | network, HTTP, invalid payload |
| stale | backend freshness field가 아니라 refresh 실패 뒤 보존한 마지막 client value. "새로고침 실패"로 명시 |
| partial | backend가 제공한 상태가 아니다. Home node/pod pair 중 일부 request만 성공한 client orchestration 상태 |
| permission | 401과 403을 empty와 구분한 first-class 상태 |

Inventory API에는 top-level `freshness`, `stale`, `partial`, `has_more`, `total` field가 없다. UI가 timestamp TTL이나 array length로 backend 상태를 발명하면 안 된다.

### 8.2 Profile table

| profile | loading | empty | error | stale | partial | permission |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTH_READ` | product auth gate | 해당 없음. 성공 DTO 자체가 필요 | network/invalid payload는 offline/error | session cache를 오래된 인증으로 표시하지 않음 | 없음 | Route 정본은 401을 unauthenticated로 반환. 403이 오면 generic forbidden으로 보존 |
| `AUTH_WRITE` | form submit 진행, 중복 submit 금지 | 해당 없음 | field/rate/network 오류를 form에 표시 | 없음 | 없음 | login 401은 credential failure, logout 401은 local auth clear 여부를 명시적으로 처리 |
| `CLUSTER_LIST` | selector skeleton/disabled | `clusters: []`이면 접근 가능한 cluster 없음. Route는 접근 가능한 ID만 필터링 | Home 본문 대신 retry 가능 오류 | refresh 실패 시 이전 selector 유지 + warning | backend partial 없음 | Route 정본은 session 401. Cluster 권한이 없다는 이유만으로 403을 만들지 않고 empty가 될 수 있음 |
| `FLEET_OPTIONAL` | 실제 fleet consumer만 loading | `clusters: []`와 zero totals는 정상 | Home treemap을 막지 않음 | `clusters[].health="stale"`는 backend value | backend partial 없음 | Route 정본은 session 401이고 접근 가능한 cluster만 포함 |
| `HOME_INVENTORY_PAIR` | node와 pod 둘 다 끝날 때까지 initial loading | 둘 다 `[]`이면 정상 empty. node만 empty/pod 존재 등 불일치는 명시 | initial 한쪽 실패면 treemap commit 금지 | refresh 한쪽 실패면 마지막 성공 pair 유지 | 한쪽만 성공한 새 bundle은 incomplete, complete map으로 표시 금지 | 401 login, 403 selected cluster 접근 거부 |
| `RESOURCE_LIST` | 해당 list 영역 skeleton | `resources: []` 정상 | list 단위 retry | refresh 실패 시 이전 rows 유지 + warning | backend partial 없음 | 403을 empty로 바꾸지 않음 |
| `RESOURCE_DETAIL` | 펼친 row 내부 loading | `related: {}`와 `events: []` 정상 | 404/HTTP/Zod 오류를 row 내부 표시 | refresh 기능이 있다면 이전 detail 유지 + warning | related group 부재를 partial로 부르지 않음 | 403을 row 내부 permission state로 표시 |

## 9. Home projection 규칙

API response에서 Home render model로 바꾸는 순서는 다음과 같다.

```text
listClusters
  -> selected cluster_id
  -> node inventory + pod inventory
  -> Zod validation
  -> selected cluster/workspace cross-check
  -> optional summary narrowing
  -> node frame + pod tile projection
  -> treemap layout
```

Projection 규칙:

1. Node frame key는 node `inventory_key`다.
2. Pod tile key는 pod `inventory_key`다.
3. Pod tile weight는 모든 pod에 대해 `1`이다.
4. Pod의 top-level `health`를 visual token map에 전달한다. 알 수 없는 string은 `unknown` presentation으로 보낸다.
5. Namespace strip은 namespace string의 안정 hash만 사용한다.
6. Pod-node 연결은 narrow-parse에 성공한 `summary.node_name`과 node `name`의 exact match다.
7. `node.summary.pod_count`가 있어도 pod child array 대신 사용하지 않는다.
8. `snapshot_id`가 같다고 가정하거나 node/pod의 response를 atomic snapshot이라고 부르지 않는다.
9. response `cluster_id`나 각 item `cluster_id`가 선택값과 다르면 invalid payload로 거부한다.
10. item `workspace_id`가 current session workspace와 다르면 invalid payload로 거부한다.
11. 검증된 pod response item을 namespace나 name으로 숨기지 않고 각각 정확히 한 번 투영한다. `pod response item 수 = map pod tile 수`다.
12. Focus도 같은 pod 배열을 재투영한다. Source pod 1개와 오른쪽 열의 pod 수를 합한 값이 map pod tile 수와 같아야 한다.

두 endpoint 사이에는 atomic snapshot endpoint나 shared revision 계약이 없다. 따라서 client가 "한 시점의 원자 topology"라고 주장하면 안 된다. 같은 refresh cycle에서 받은 pair라는 사실만 관리한다.

## 10. Cache, refresh, race 방지

현재 package에는 TanStack Query가 없다. 새 cache library를 도입하지 않아도 아래 identity와 lifecycle은 지켜야 한다.

1. Cache key는 §5의 tuple 전체를 사용한다. Session을 제외한 모든 protected read key에 current `workspaceId`를 포함한다.
2. Cluster가 바뀌면 이전 cluster request를 즉시 abort한다.
3. 이전 response가 늦게 도착해도 selected cluster state를 덮어쓰지 않도록 request generation 또는 selected ID를 commit 직전에 확인한다.
4. Manual Home refresh는 node와 pod key를 하나의 bundle로 invalidate한다.
5. Background refresh 중에는 마지막 성공 treemap을 지우지 않는다.
6. Schema가 실패한 response는 cache에 넣지 않는다.
7. Logout, 401 session 전환, workspace 변경은 모든 workspace-scoped cache를 비운다.
8. Resources list refresh는 같은 cluster의 열린 detail cache를 invalidate한다.
9. `AbortError`는 toast, error panel, offline state를 만들지 않는다.
10. HTTP response에 cache/freshness contract가 없으므로 임의 TTL을 backend freshness처럼 표시하지 않는다.

## 11. Backend 계약상 미지원 또는 주의할 점

다음은 지금 존재하지 않거나 현재 response로 보장되지 않는다.

| 항목 | 현재 상태 | Frontend 행동 |
| --- | --- | --- |
| topology hierarchy endpoint | 없음 | 호출하거나 proxy/mock으로 만들지 않음 |
| node+pod atomic endpoint | 없음 | 병렬 pair로 읽되 atomic snapshot이라고 주장하지 않음 |
| inventory pagination cursor | 없음 | 임의 page query를 만들지 않음 |
| truncation/`has_more`/`total` | 없음 | `limit=1000`을 사용. 1000개를 초과할 수 있으면 완전성 보장 불가를 차단 사유로 보고 |
| inventory freshness state | 없음 | nullable timestamp를 보여 줄 수는 있지만 TTL/stale을 발명하지 않음 |
| inventory partial state | 없음 | 한쪽 request 실패만 client incomplete로 표시 |
| typed `summary.node_name` | gateway DTO에는 없음 | optional narrow parser, 실패 시 unavailable |
| typed pod CPU usage | gateway DTO에는 없음 | optional `cpu_mcores` narrow parser, 실패 시 unavailable |
| restricted/permission metadata in success | 없음 | 403을 first-class permission state로 처리 |
| Cost/Helm/Live Traffic/Checks backend | 이 문서 범위의 실존 capability 없음 | API 함수, 메뉴, disabled item을 만들지 않음 |

특히 `limit=1000`은 pagination이 아니다. Backend가 최대 1000개만 반환하고 response에 잘림 여부를 주지 않으므로, pod가 1000개를 넘는 cluster에서 "맵의 모든 항목" 완전성 assert를 증명할 수 없다. 이런 환경에서는 성공으로 위장하지 말고 backend capability gap을 보고한다.

## 12. 구현 순서 - 처음 작업하는 개발자용

### Step 1 - 작업 위치와 금지 경계 확인

Repository root에서:

```bash
test ! -d frontend
test -f references/ui-layer-lab/AGENTS.md
test -d references/ui-layer-lab/src/product/api
```

첫 명령이 실패하면 제품 코딩을 시작하지 말고 `frontend/` 부활 여부를 먼저 정리한다.

### Step 2 - 공통 client 보강

[`client.ts`](../../../references/ui-layer-lab/src/product/api/client.ts)에서 다음을 확인한다.

- `/api` path type
- `credentials: "include"`
- GET에 body가 없음
- state-changing request의 CSRF header
- response를 `unknown`에서 Zod parse
- 401/403/404/422/429 분류
- AbortError pass-through

### Step 3 - DTO schema 작성

`schemas.ts` 또는 새 `inventory-schemas.ts`에 다음 schema를 작성한다.

1. `clusterSummarySchema`
2. `clusterListSchema`
3. `inventoryResourceSchema`
4. `inventoryResourceListSchema`
5. `inventoryResourceDetailSchema`
6. optional `podTreemapSummarySchema`

Pydantic field 표를 그대로 옮기고 nullable key를 optional로 바꾸지 않는다.

### Step 4 - Cluster method 작성

`clusters.ts`에 `listClusters`를 작성한다.

- `limit`이 있으면 query에 넣는다.
- response `clusters`만 selector option으로 사용한다.
- server response에 없는 cluster option을 추가하지 않는다. `cluster-1`과 `kubernetes-ops`도 response에 있을 때만 사용한다.
- `getFleetSummary`를 selector source로 사용하지 않는다.

### Step 5 - Inventory method 작성

`inventory.ts`에 다음을 먼저 작성한다.

1. path segment/query serializer
2. `listInventoryResources`
3. node와 pod를 같은 controller로 읽는 Home orchestration

Resources용 세 method는 Home gate 통과 뒤 연결한다.

### Step 6 - Home state 연결

권장 state는 최소 다음을 구분한다.

```text
loading
unauthenticated
cluster-empty
inventory-loading
ready
inventory-empty
inventory-incomplete
forbidden
error
refreshing-with-data
refresh-error-with-data
```

State 이름은 구현에 맞게 바꿀 수 있지만 의미를 합치면 안 된다.

### Step 7 - 실제 API 확인

Local backend가 동작하면 기본 설정을 사용한다.

```bash
cd references/ui-layer-lab
npm run dev
```

Local backend가 없으면 기존 Vite proxy target을 remote gateway origin으로 지정한다.

```bash
cd references/ui-layer-lab
VITE_BACKEND_ORIGIN=https://k8s.woonyong.org npm run dev
```

Vite proxy는 browser의 `/api/...` path를 유지한 채 target origin으로 전달한다. Runtime product code에 `https://k8s.woonyong.org/api`를 직접 넣지 않는다.

Remote에서도 401이면 실제 login/session을 먼저 해결한다. TLS, network, CORS/proxy, 401/403 때문에 응답을 읽을 수 없으면 synthetic data를 넣지 않고 status와 endpoint를 차단 사유로 보고한다.

### Step 8 - Home gate 검증

Network panel에서 다음을 확인한다.

1. `GET /api/auth/session`
2. `GET /api/clusters`
3. selector에서 `cluster-1` 선택
4. node inventory GET 1회
5. pod inventory GET 1회
6. 모든 request에 browser session cookie가 전송됨
7. response가 Zod를 통과함
8. response `cluster_id`가 `cluster-1`과 같음
9. node/pod tile에 fixture나 fallback marker가 없음
10. cluster 변경 시 이전 request가 abort됨

그 다음:

```bash
cd references/ui-layer-lab
npm run check
cd ../..
test ! -d frontend
```

현재 `npm run check`는 typecheck, lint, product design guard, 외부 기준 저장소 검토 gate, production build를 실행한다.

### Step 9 - Resources 연결

Home gate가 모두 통과한 뒤에만 service/workload list와 inline detail method를 UI에 연결한다.

## 13. Acceptance checklist

### API 계층

- [ ] 모든 request가 `references/ui-layer-lab/src/product/api/`를 통과한다.
- [ ] Direct fetch가 product page/feature에 없다.
- [ ] Same-origin `/api`와 `credentials: "include"`를 사용한다.
- [ ] 모든 success JSON을 `unknown`에서 Zod parse한다.
- [ ] AbortError가 network error로 바뀌지 않는다.
- [ ] 401, 403, 404, 422, 429가 구분된다.
- [ ] Nullable key를 optional 또는 synthetic default로 바꾸지 않는다.
- [ ] `raw` Kubernetes object를 기대하지 않는다.

### Home

- [ ] Cluster selector source는 실제 `GET /api/clusters` 하나다.
- [ ] `cluster-1`을 실제 response option에서 선택한다.
- [ ] Node와 pod는 실제 inventory resource endpoint에서 읽는다.
- [ ] 두 call은 `include_deleted=false&limit=1000`을 명시한다.
- [ ] 한쪽만 성공한 새 pair를 complete treemap으로 commit하지 않는다.
- [ ] Pod tile 면적은 모두 1이다.
- [ ] CPU는 bar/tooltip에만 사용하고 missing/null을 0으로 바꾸지 않는다.
- [ ] Health는 전체 fill, namespace는 좌측 strip 입력으로 분리한다.
- [ ] 가짜 cluster/node/pod를 만들지 않는다.
- [ ] `getFleetSummary`가 Home treemap의 필수 request가 아니다.
- [ ] Pod response item 수와 map tile 수가 같고, focus source 1개 + 오른쪽 열 item 수가 그 수와 같다.

### Resources

- [ ] Home gate 이전에는 시작하지 않는다.
- [ ] Service와 workload 목록은 각각 실제 endpoint를 사용한다.
- [ ] Detail identity는 list row의 resource_type/kind/namespace/name을 그대로 사용한다.
- [ ] Detail은 선택 행 아래에 인라인으로 렌더한다.
- [ ] `related: {}`와 `events: []`를 정상 empty로 처리한다.
- [ ] 404/403 detail 오류가 전체 Resources route를 무너뜨리지 않는다.

### 최종 gate

- [ ] `references/ui-layer-lab`에서 `npm run check` 통과
- [ ] 실제 API로 `cluster-1` Home treemap 렌더
- [ ] Focus completeness assert 통과
- [ ] `frontend/` 디렉터리 부재
- [ ] Production runtime synthetic/fallback 검색 결과 0건

## 14. 의도적으로 연결하지 않는 backend endpoint

다음 endpoint가 backend에 존재하더라도 이번 Home treemap의 source로 연결하지 않는다.

| Endpoint | 이유 |
| --- | --- |
| `GET /api/fleet/summary` | fleet rollup이며 node/pod entity list가 아님 |
| `GET /api/clusters/{cluster_id}` | selector는 list response로 충분함 |
| `GET /api/clusters/{cluster_id}/connection-status` | Home treemap entity source가 아님 |
| `GET /api/clusters/{cluster_id}/summary` | 별도 fleet drilldown projection |
| `GET /api/clusters/{cluster_id}/nodes/summary` | 이번 지시는 inventory resource endpoint를 Home 정본으로 지정함 |
| `GET /api/clusters/{cluster_id}/nodes/{node_name}/pods/summary` | node별 추가 fan-out과 별도 entity projection을 만들므로 사용하지 않음 |
| `GET /api/clusters/{cluster_id}/inventory/summary` | count/last snapshot이며 node/pod list가 아님 |
| `GET /api/clusters/{cluster_id}/inventory/events` | detail response의 events와 별도 화면 요구가 없음 |
| `GET /api/clusters/{cluster_id}/usage` | Home 면적 source가 아니며 이번 최소 API 묶음에 불필요 |

이 표는 endpoint가 가짜라는 뜻이 아니다. Backend에는 존재하지만 이번 정보 구조와 데이터 source 결정에서 호출하지 않는다는 뜻이다.
