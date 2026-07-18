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
- 개발 proxy의 upstream은 `VITE_BACKEND_ORIGIN`으로 주입한다. 실측 기본값은
  `npm run dev:aws`가 주입하는 AWS 배포이며, AWS 게이트가 닫혔을 때만 기본 `npm run dev`의
  로컬 backend를 폴백으로 사용한다. 제품 코드와 `vite.config.ts` 기본값에 개인 origin을
  하드코딩하지 않는다.
- 상태 변경 HTTP 요청은 공통 client가 CSRF header를 부착한다.
- 외부 JSON은 항상 `unknown`에서 시작해 Zod 검증을 통과한 값만 제품 상태에 들어간다.
- synthetic, fixture, replay, fake count, 가짜 리소스 이름, 자동 live-to-demo fallback은 금지한다.
- 실제 계약이 없거나 권한이 없으면 해당 기능은 숨기거나 명시적 blocked/error 상태로 처리한다.
  임의 데이터로 성공 상태를 만들지 않는다.
- provider 이름으로 화면을 분기하지 않는다. 기능 노출은 canonical capability와 권한으로 결정한다.

### 1.1 실측 백엔드 정본과 로컬 폴백

- 화면 실측, 시각 회귀, 인수 스크린샷의 기본 백엔드는 AWS 배포
  `https://k8s.woonyong.org`다. 개발자는 `npm run dev:aws`로 origin을 환경변수에 주입한다.
- AWS 착수 게이트는 `GET /api/auth/session`의 HTTP 200 또는 정상적인 비로그인 401이다.
  연결 실패나 비계약 응답은 mock, fake session, synthetic data로 우회하지 않는다.
- AWS가 게이트를 통과하지 못할 때만 로컬 `http://127.0.0.1:8000`을 폴백으로 사용한다.
  로컬 폴백으로 만든 검증 증거에는 시각, 원인, 재검증 필요 여부를 progress에 기록한다.
- Vite 기본값은 오픈소스 개발용 로컬 origin을 유지한다. AWS 개인 도메인은 `dev:aws`와
  `.env.example`의 예시 외에 `vite.config.ts` 기본값이나 제품 TypeScript 코드에 넣지 않는다.
- HTTPS upstream은 Vite proxy의 `changeOrigin`, 인증서 검증, cookie domain rewrite를 사용한다.
  프론트 코드에서 `service_session` 또는 `Secure`·`Domain` 속성을 조작하지 않는다. 실제 로그인
  응답에서 쿠키 유실이 관측될 때만 proxy 설정으로 교정하고 관측 근거를 함께 남긴다.
- 자격증명, session cookie, CSRF 값, kubeconfig, Cloudflare·AWS token은 문서, fixture,
  screenshot metadata, `.env.example`, 커밋에 저장하지 않는다. 실제 `.env*`는 root `.gitignore`로
  제외한다.

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
- `game-server`, `management-server` 같은 관측 이름은 예시일 뿐 TypeScript union, fallback, 기본 성공값으로
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

### 7.1 텍스트 밀도 규칙

제품의 모든 화면은 다음 규칙을 함께 지킨다. 정보가 많다는 이유로 같은 의미를 제목, 설명, 배지,
카드 캡션에 반복하지 않는다.

1. **위치 라벨은 화면당 한 번만 표시한다.** 현재 화면명은 사이드바 navigation이 소유한다.
   상단바와 본문에 같은 route 이름, `workspace`, `home`, `overview` 제목을 다시 노출하지 않는다.
   문서 구조에 필요한 heading은 `sr-only`로 유지할 수 있다.
2. **설명은 상태가 설명을 요구할 때만 표시한다.** 정상 데이터 화면에 사용법·데이터 출처·제외 기준을
   상주시키지 않는다. empty, error, partial, permission 상태 또는 keyboard 접근 가능한 도움말에서만
   다음 행동에 필요한 설명을 제공한다.
3. **카드 제목은 하나만 쓴다.** 영문 eyebrow와 한글 제목처럼 같은 의미의 이중 캡션을 금지한다.
   Kubernetes Kind처럼 제품 의미가 다른 고유 명칭은 번역용 보조 캡션으로 취급하지 않는다.
4. **배지는 상태 변화가 있을 때만 쓴다.** 정상 상태에서 `LIVE`, `실 API`, `snapshot`, 자동 갱신 주기를
   홍보하는 배지를 두지 않는다. stale, disconnected, paused, partial, pending처럼 사용자의 판단이나
   행동이 달라지는 상태만 배지·status로 표시한다.
5. **신선도는 한 곳에서만 표시한다.** 화면 우상단 연결 상태에 마지막 관측 시각을 keyboard 접근 가능한
   tooltip과 accessible name으로 결합한다. 같은 시각이나 cluster 이름을 카드 하단에 반복하지 않는다.
6. **같은 수치는 한 번만 표시한다.** CPU·memory처럼 진행률이 핵심이면 수치를 진행바 행에 병기하고
   별도 stat 타일을 만들지 않는다. 목록 count와 catalog aggregate의 scope가 다르면 나란히 두지 않는다.
7. **단위는 라벨 문맥에 포함한다.** `개`, `회`, `건` 조사를 값마다 반복하지 않고
   `18 · 17 running`, `재시작 3`, `인시던트 2`처럼 짧고 일관된 형태를 사용한다.
8. visual gate는 상주 중복 문구와 금지 배지의 부재, 320px·200% text reflow, tooltip keyboard 접근을
   화면별로 검증한다. 스크린샷 재생성만으로 통과 처리하지 않는다.

### 7.2 번역 경계와 locale 규칙

제품 UI 문자열의 정본은 `references/ui-layer-lab/src/product/shared/i18n/`의 typed message
catalog다. `MessageKey` literal union과 `en.ts`, `ko.ts`의
`satisfies Record<MessageKey, string>` 검증을 함께 유지해 어느 locale에서도 키 누락을 빌드 전에
차단한다. 외부 i18n 런타임 의존성은 추가하지 않는다.

1. **기본 locale은 영어(`en`)다.** 저장된 사용자 선택이 있으면 이를 가장 먼저 적용하고, 선택이
   없을 때만 `navigator.language`가 `ko` 계열인지 감지한다. 지원하지 않는 locale은 영어로 수렴한다.
   사용자가 toolbar의 언어 설정을 바꾸면 선택을 저장하고 `<html lang>`도 같은 값으로 갱신한다.
2. **서버·Kubernetes 사실은 번역하지 않는다.** resource name, namespace, cluster name, label,
   annotation, probe/event message, status 원문, reason, command output은 plain text 데이터로 그대로
   표시한다. 이 값을 `MessageKey`로 해석하거나 catalog lookup에 사용하지 않는다.
3. **Kubernetes 도메인 명사는 locale과 무관하게 영어를 유지한다.** `Pod`, `Node`, `Container`,
   `Service`, `Deployment`, `Namespace`, `Ready`, `Running`과 Kubernetes Kind는 한국어 catalog에서도
   번역하거나 음역하지 않는다. 주변 UI 문장만 locale에 맞춘다.
4. **오류는 structured code를 먼저 번역한다.** 프론트가 소유한 error/status/detail code는 catalog의
   정확한 키에 매핑한다. 알려진 code가 없을 때는 서버 계약이 사용자 노출을 허용한 plain-text
   detail을 원문으로 표시한다. raw stack, HTML, secret, annotation 전체를 fallback 문구로 노출하지
   않는다.
5. **날짜와 숫자는 활성 locale의 `Intl`을 사용한다.** 화면별 formatter가 `ko-KR` 또는 `en-US`를
   하드코딩하지 않고 i18n controller의 `Intl.DateTimeFormat`·`Intl.NumberFormat` helper를 사용한다.
   API 시간은 ISO-8601 instant로 받고, 단위와 정확도는 canonical DTO 의미를 변경하지 않는다.
6. **문장 조합을 JSX에서 만들지 않는다.** 조사, 복수형, 순서가 locale마다 달라지는 문구는 완전한
   catalog template과 named parameter로 표현한다. backend 값은 parameter로만 넣고 번역 키에
   합성하지 않는다.
7. **접근성 문자열도 catalog 경계에 포함한다.** `aria-label`, tooltip, dialog close label, empty/error
   설명, keyboard shortcut 설명은 보이는 문자열과 같은 locale을 사용한다. 아이콘·색상만 바뀌고
   접근 가능한 이름이 이전 locale에 남는 상태를 금지한다.
8. design guard는 test·catalog 파일과 데이터 바인딩을 제외하고 제품 JSX의 literal 한글 및 catalog
   밖 영문 문장을 실패 처리한다. Kubernetes 단일 도메인 명사와 `className`, route, id, data attribute
   같은 구조 문자열은 사용자 문구로 오인하지 않는다.
9. visual gate는 최소한 동일한 대표 Home·Resources 흐름을 `en`, `ko` 각각 캡처하고, locale 전환 뒤
   URL·선택 범위·서버 데이터 identity가 변하지 않으며 overflow가 새로 생기지 않는지 검증한다.

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
