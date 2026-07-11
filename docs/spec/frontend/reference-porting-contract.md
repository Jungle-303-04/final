---
title: 외부 기준 저장소 기능 포팅 프론트 계약
status: active-contract
date: 2026-07-11
authority:
  behavior: 외부 기준 저장소 실행 인스턴스와 소스 전수표
  design: 벤치마크 최소선
  transport: product/api live adapters
---

# 외부 기준 저장소 기능 포팅 프론트 계약

## 0. 목적과 정본

이 문서는 철회된 사용자 정의 중앙 뷰와 무관하게 계속 지켜야 하는 프론트 데이터·런타임·
접근성 계약을 한곳에 고정한다. 화면 종류, 정보 구조, 구성 요소, 상호작용, 단축키, 갱신 방식은
`reference-feature-inventory.md`의 외부 기준 저장소 실측 결과가 정본이다. 시각 디자인은 벤치마크 최소선을 따른다.

이 문서는 별도의 사용자 정의 중앙 시각화를 정의하지 않는다. P1·P2가 완료된 현재 중앙 content의
기준은 `reference-feature-inventory.md`와 `reference-contract-map.md`의 Home route다. Home 안에서도
exact 완료 앵커가 있는 API로 만들 수 있는 section만 release하고, 철회된 사용자 정의 중앙 뷰를
제품 요구로 되살리지 않는다.

정본 우선순위는 다음과 같다.

1. `codex-directive-goalmode-20260711.md`
2. 외부 기준 저장소 실행 인스턴스의 관찰 결과와 동일 커밋 소스 확인 결과
3. 이 문서의 뷰-비의존 프론트 계약
4. 실제 백엔드 route 및 response schema
5. `references/ui-layer-lab/src/product/api/**`의 런타임 schema와 live adapter

## 1. 런타임 경계

- 제품 코드는 `references/ui-layer-lab/src/product/`만 소유한다.
- 모든 서버 데이터는 `src/product/api/**`를 통과한다. React component, hook, reducer, store는
  `fetch`, `WebSocket`, `EventSource`를 직접 호출하지 않는다.
- 요청은 same-origin `/api` 경로를 사용하고 `credentials: "include"`를 유지한다.
- 로컬 개발 proxy의 upstream은 `VITE_BACKEND_ORIGIN`으로 주입한다. 로컬 backend에 접근할 수
  없을 때는 `VITE_BACKEND_ORIGIN=https://k8s.woonyong.org`로 실행하며 제품 코드에 origin을
  하드코딩하지 않는다.
- 상태 변경 HTTP 요청은 공통 client가 CSRF header를 부착한다.
- 외부 JSON은 항상 `unknown`에서 시작해 Zod 검증을 통과한 값만 제품 상태에 들어간다.
- synthetic, fixture, replay, fake count, 가짜 리소스 이름, 자동 live-to-demo fallback은 금지한다.
- 실제 계약이 없거나 권한이 없으면 해당 기능은 숨기거나 명시적 blocked/error 상태로 처리한다.
  임의 데이터로 성공 상태를 만들지 않는다.
- provider 이름으로 화면을 분기하지 않는다. 기능 노출은 canonical capability와 권한으로 결정한다.

## 2. 보존된 인벤토리 소비 계약

다음 D1~D5는 현재 구현된 인벤토리 live adapter의 보존 대상이다. 이 표는 특정 화면 배치를
의미하지 않으며, P1에서 관찰한 외부 기준 저장소 기능에 필요한 경우 같은 함수를 재사용한다.

| ID | 메서드와 경로 | 최소 소비 의미 | 기본 갱신 |
|---|---|---|---|
| D1 | `GET /api/clusters/{clusterId}/inventory/resources?resource_type=pod` | Pod 목록, UID, namespace, 이름, 상태, health, summary, 관측 시간 | 활성 화면에서 30초 기준 |
| D2 | `GET /api/clusters/{clusterId}/inventory/resources?resource_type=node` | Node 목록, UID 가능 여부, 이름, 상태, health, summary, 관측 시간 | 활성 화면에서 30초 기준 |
| D3 | `GET /api/clusters/{clusterId}/inventory/services` | Service 목록과 서버가 제공한 selector·summary | 활성 화면에서 30초 기준 |
| D4 | `GET /api/clusters/{clusterId}/inventory/workloads` | Workload 목록, 종류, 상태, 서버가 제공한 selector·summary | 활성 화면에서 30초 기준 |
| D5 | `GET /api/clusters/{clusterId}/inventory/resource-detail` | 선택 리소스, 서버 계산 related collection, event collection | 사용자가 상세를 요청할 때 |

현재 TypeScript 진입점은 다음과 같다.

| 계약 | 구현 파일 | 함수 |
|---|---|---|
| D1·D2 | `references/ui-layer-lab/src/product/api/inventory.ts` | `listInventoryResources` |
| D3 | 같은 파일 | `listInventoryServices` |
| D4 | 같은 파일 | `listInventoryWorkloads` |
| D5 | 같은 파일 | `getInventoryResourceDetail` |
| 공통 HTTP | `references/ui-layer-lab/src/product/api/client.ts` | `apiRequest` |
| 런타임 검증 | `references/ui-layer-lab/src/product/api/inventory-schemas.ts` | `inventoryResource*Schema` |

화면이 D1~D5를 사용할 때 다음을 지킨다.

- Service→Pod 또는 Workload→Pod 관계를 selector 문자열로 브라우저에서 재계산하지 않는다.
- 관계와 event는 D5의 서버 계산 결과만 사실로 사용한다.
- `related` collection의 누락과 빈 배열을 구분한다. 계약이 요청된 collection을 보장하면 빈 배열은
  정상적인 "관계 없음"이고, payload 누락은 `invalid-payload`다.
- 현재 목록 limit을 전체 개수로 오인하지 않는다. cursor, `has_more`, `total`, truncation metadata가
  없는 계약에서는 한도 초과 완전성을 주장하지 않고 백엔드 갭으로 기록한다.

## 3. Zod와 오류 계약

### 3.1 검증 규칙

- endpoint별 최상위 envelope와 canonical resource 필드는 `z.strictObject`로 검증한다.
- 확장 가능한 Kubernetes projection인 `labels`, `annotations`, `summary`, `identity`는 백엔드
  계약이 허용한 위치에서만 `z.record(z.string(), z.unknown())`을 사용한다.
- `raw` Kubernetes object를 브라우저 계약에 추가하지 않는다.
- feature는 open record를 직접 표시하거나 계산하지 않는다. 필요한 필드를 별도 feature schema로
  한 번 더 좁힌 뒤 사용한다.
- 필수 identity가 nullable인 wire 계약은 feature 경계에서 `refine`한다. 예를 들어 Pod UID가
  필요한 기능은 `uid !== null`을 검증하며 `inventory_key`로 조용히 대체하지 않는다.

### 3.2 오류 의미

공통 client 오류 종류는 다음 의미를 유지한다.

| 오류 | UI 의미 |
|---|---|
| `unauthorized` | 로그인 또는 세션 복구 필요. 다른 데이터로 대체 금지 |
| `forbidden` | 현재 사용자·클러스터 권한 없음. 빈 상태로 위장 금지 |
| `not-found` | 대상이 삭제됐거나 현재 scope에서 없음 |
| `invalid-request` | 요청 계약 위반. 입력과 서버 detail을 안전하게 표시 |
| `rate-limited` | `retryAfter`를 존중하고 제한된 재시도 제공 |
| `network` | 연결 끊김. 마지막 유효 데이터가 있으면 stale/disconnected와 함께 유지 |
| `invalid-payload` | 서버 응답 계약 불일치. 새 payload는 commit하지 않음 |
| `http` | 그 밖의 서버 실패. 상태 코드와 안전한 detail을 보존 |

HTTP 200이어도 JSON parse 또는 Zod 검증이 실패하면 성공으로 처리하지 않는다.

## 4. 엔티티 식별자

### 4.1 원칙

- display name, 배열 index, 화면 위치는 identity가 아니다.
- ID는 cluster boundary를 포함하고 같은 이름으로 재생성된 Kubernetes 리소스를 구분해야 한다.
- API가 UID를 제공하면 canonical key는 `kind:{clusterId}/{uid}` 형식의 안정된 조합을 사용한다.
- 서버 UID는 opaque string으로 취급한다. 클라이언트가 구조를 파싱하거나 재생성하지 않는다.

### 4.2 현재 제한과 명시적 fallback

- Pod는 UID가 필요한 기능에서 `pod:{clusterId}/{uid}`를 사용한다.
- 현재 node/service/workload 응답이 UID를 제공하지 않는 경우에만
  `{kind}:{clusterId}/{namespace-or-empty}/{name}` fallback을 사용할 수 있다.
- fallback은 동명 재생성을 구분하지 못하는 알려진 제한이다. 이를 성공적인 안정 ID로 문서화하지
  않으며, 해당 기능이 정확한 enter/exit 또는 history identity를 요구하면 backend gap으로 막는다.
- 합성 group이나 화면 전용 projection ID를 서버 entity ID로 저장하지 않는다.

## 5. 클러스터 식별과 선택

- 선택 가능한 cluster ID와 표시 이름의 유일한 권위는 `GET /api/clusters`의 현재 세션 응답이다.
- `cluster-1`, `kubernetes-ops` 같은 관측 이름은 예시일 뿐 TypeScript union, fallback, 기본 성공값으로
  하드코딩하지 않는다.
- 선택 cluster는 URL `?cluster=`에 보존한다.
- URL의 ID가 현재 사용자에게 보이지 않으면 첫 cluster로 자동 교정하지 않고 명시적 접근 불가 상태를
  표시한다.
- cluster switch 시 이전 요청을 `AbortSignal`로 취소하고 request generation을 증가시킨다.
- offline, pending, stale, expired cluster도 selector에서 임의 제거하지 않는다. 상태와 capability가
  허용하는 외부 기준 저장소 동등 surface만 제공한다.

## 6. REST 갱신과 동시성

1. 같은 화면 frame을 이루는 병렬 요청은 동일한 `clusterId`, filter, request generation을 사용한다.
2. 이전 generation의 늦은 응답은 최신 선택이나 frame을 덮지 못한다.
3. 모든 응답은 JSON parse와 Zod 검증 후에만 commit한다.
4. initial load의 일부 실패는 성공한 일부를 완전한 화면으로 위장하지 않는다.
5. background refresh의 일부 실패는 마지막 유효 frame을 유지하고 partial/error/freshness를 별도 표시한다.
6. `document.visibilityState !== "visible"`이면 불필요한 polling을 중지하고, visible 복귀 시 즉시 재조회한다.
7. 사용자 refresh는 진행 중 요청을 중복 누적하지 않는다. 취소 후 새 generation으로 재시작하거나 같은
   in-flight promise를 공유한다.
8. 화면을 떠나거나 scope가 바뀌면 관련 요청과 stream subscription을 정리한다.
9. retry는 멱등 조회에만 제한된 backoff와 jitter로 적용한다. 401, 403, invalid-payload에는 자동 retry하지 않는다.
10. 외부 기준 저장소의 SSE 동작을 우리 WS 또는 polling으로 치환할 때도 사용자에게 보이는 순서, 재연결, freshness
    의미를 보존하며 P1·P2에 근거를 기록한다.

## 7. 접근성·모션 게이트

이 절은 자체 디자인 토큰이 아니다. 벤치마크 최소선 theme와 component를 검증하는 최소 품질 기준이다.

- 일반 텍스트 대비는 WCAG 4.5:1 이상, 큰 텍스트와 의미 있는 비텍스트 그래픽·포커스 표시는 3:1
  이상이어야 한다.
- 색만으로 상태, 선택, 심각도, 연결 여부를 전달하지 않는다. 텍스트, 아이콘, 패턴 중 하나를 함께 쓴다.
- 외부 기준 저장소에서 마우스로 가능한 모든 핵심 동작은 키보드로도 가능해야 한다.
- focus 순서는 DOM과 시각 순서가 일치해야 하며, visible focus ring을 제거하지 않는다.
- tooltip에만 있는 정보는 keyboard focus와 assistive text에서도 제공한다.
- `prefers-reduced-motion: reduce`에서는 공간 이동, stagger, parallax, particle, smooth scrolling을
  제거하거나 즉시 전환한다. 정보·상태·결과·조작 가능성은 기본 모션과 동일해야 한다.
- reduced-motion 설정의 런타임 변경을 반영한다.
- forced-colors 환경에서 의미 있는 border, focus, selection, status가 사라지지 않게 system color와
  텍스트 단서를 제공한다.
- component 안에 raw hex, 임의 duration, 병렬 색 체계를 만들지 않는다. 벤치마크 최소선의 CSS variable과
  제품 소유 semantic alias만 사용한다.

## 8. 외부 기준 저장소 포팅과 라이선스

- P1은 실행 인스턴스 관찰과 소스 확인만 수행하며 제품 코드 이식은 하지 않는다.
- 외부 기준 저장소 코드 또는 구조를 실제로 이식할 때 Apache-2.0 LICENSE와 NOTICE 요구를 먼저 확인한다.
- `THIRD_PARTY_NOTICES`에는 저장소 URL, 기준 commit, 원본 파일, 대상 파일, 변경 요약을 기록한다.
- 외부 기준 저장소 이름, 로고, 상표 문자열을 제품에 이식하지 않는다.
- 벤치마크 최소선 생성물은 제품 소유 경로에서만 사용하고 MIT 고지를 유지한다.

## 9. 릴리스 검증

- live adapter와 runtime schema는 같은 contract test에서 성공·빈 값·401·403·404·429·5xx·
  invalid JSON·invalid payload·abort를 검증한다.
- cluster switch race, late response, partial refresh, visibility pause/resume를 fake clock과 deterministic
  schedule로 검증한다.
- 화면별 loading, empty, partial, stale, disconnected, forbidden 상태가 누락되지 않았는지 확인한다.
- keyboard-only, visible focus, reduced-motion, contrast gate를 자동·수동으로 모두 확인한다.
- production dependency graph와 번들에 synthetic adapter 또는 fake dataset이 들어가지 않았음을 검사한다.
- 각 포팅 화면은 실제 API 데이터로 외부 기준 저장소와 동일 조작 결과를 확인하고 진행 기록에 근거를 남긴다.
