# 프론트엔드 실행 계획 v2 (2026-07-10)

v1은 현재 `frontend/`를 "구조적 교정판"으로 평가했으나, 계약 대조와 로직 감사를 추가로
수행한 결과 **구조는 건강하지만 논리 층위에 A급 결함이 다수** 확인됐다. v2는 그 결함
전수 목록과 수정 순서를 계획의 중심에 둔다. 정본 우선순위는 `frontend/AUDIT.md` > 실제
`frontend/src/**` 코드 > `docs/fd/*`이며, `docs/spec/frontend/*` 일부는 삭제된 pre-reset
구조를 설명하는 낡은 문서다.

> 이 문서는 실행 계획이며 프론트 완료 보고가 아니다. 실제 상태는 frontend 작업공간의
> `AUDIT.md`와 테스트 결과를 우선한다.

## 1. 실패 원인 진단 (누적)

과거 반복의 실패 원인 3가지에, 현재 교정판이 반복 중인 2가지를 추가한다.

1. **목업 레이어가 "완성처럼 보이는 중간 상태"를 허용했다.** (`local-api`와 과거 API 선택기 삭제 완료)
2. **기존 콘솔 클론 + 이중 토큰 시스템.** (38파일 삭제, 단일 토큰으로 통합 완료)
3. **계약이 수기 타입으로 단언될 뿐 검증되지 않는다.** openapi 코드젠 미도입
   (`frontend/src/generated` 없음). 이번 감사에서 이 결함이 실제 런타임 오류로 확인됐다(§2 C군).
4. **[신규] 실시간 캐시 패치 레이어가 REST 쿼리 계층과 다른 형태·다른 키로 쓴다.**
   `live.ts`가 어댑터를 우회한 raw 필드를, 노드 식별 없이 prefix 매칭된 모든 캐시에 upsert
   한다(§2 L군). "구조가 좋다"는 평가와 무관하게 데이터 정합성이 깨진다.
5. **[신규] 어댑터가 백엔드 상태를 조용히 뭉갠다.** `failed`→`idle`, 카운터 리셋→0,
   raw step 통과 등 — UI가 나중에 의존하는 상태가 어댑터 단계에서 소실된다(§2 A군).

## 2. 확인된 결함 전수 목록

심각도: **A** = 기능 파손/틀린 데이터 표시, **B** = 엣지 케이스 오염, **C** = 위생/성능.

### C군 — FE·BE 계약 불일치 (필드 단위 대조로 확인)

| # | 심각도 | 결함 | 위치 (FE / BE) |
|---|---|---|---|
| C1 | A | 클러스터 요약 인시던트: FE `incident.id`, BE `incident_id` → React key undefined + `/incidents/undefined` 404 | `fleet/api.ts:66-72`, `ClusterDetailView.tsx:1369-1377` / `responses.py:549-558` |
| C2 | A | pod 히트맵·타임라인의 correlation_id 링크가 `GET /dashboard/rca/incidents/{id}`에서 404 (BE는 `incident_id` 컬럼만 조회) | `adapt.ts:290`, `ClusterDetailView.tsx:540` / `dashboard/repository.py:354-375` |
| C3 | A | FE `usage.restarts_total` vs BE `restart_total` → 재시작 누적 pill이 항상 '없음' | `ClusterDetailView.tsx:1351` / `responses.py:561-571` |
| C4 | A | 카탈로그 설치: BE 무조건 501, FE는 존재하지 않는 `{install:{install_id}}` 성공 계약을 코딩 | `CatalogView.tsx:20-26` / `catalog/router.py:60-82` |
| C5 | A | `AuthSessionResponse`에 `email` 없음 → 사이드바 사용자 칩 영구 미표시 | `console/ui.tsx:149-154` / `responses.py:32-36` |
| C6 | A | `LiveSnapshot.namespaces` 분기는 BE가 절대 보내지 않는 형태 → hot-pod 강조·라이브 phase 차트 영구 비활성(폴백이 은폐) | `types.ts:135`, `live.ts:169` / `contracts/realtime.py:110-113` |
| C7 | A | ≤1 값을 ×100하는 percent 휴리스틱, BE는 이미 percent 반환 → 0.8% CPU가 80%로 표시. 같은 지표에 단위 규약 3종 혼재 | `cluster/api.ts:323-327`, `fleet/api.ts:113-116`, `ClusterDetailView.tsx:1085-1087` |
| C8 | B | 잠재 타입 거짓말: `workloads` array(실제 dict-by-health), `recent_events`(실제 `warning_events`), `connection_status` 리터럴 세트 불일치, `last_seen`(실제 `last_seen_at`, 어댑터로 은폐) | `fleet/api.ts`, `types.ts:5` |
| C9 | C | DELETE /clusters 204 무본문인데 FE는 응답 본문 타입 선언(하드코딩 kubectl 폴백으로 은폐) | `cluster/api.ts:64-69` / `target/router.py:1198` |

### L군 — 실시간 레이어(live.ts) 논리 오류

| # | 심각도 | 결함 | 위치 |
|---|---|---|---|
| L1 | A | pod delta를 prefix `setQueriesData(['clusters',id,'nodes'])`로 **모든 노드의** pods-summary에 upsert. delta 키에 노드 정보가 없고 미발견 시 무조건 삽입 → 실시간 이벤트마다 pod가 전 노드 타일에 출현 | `live.ts:275-305` |
| L2 | A | 캐시 패치가 `adaptPodHeatmapSummary`를 우회해 raw 필드를 삽입 → `id`/`health` 없는 행, drawer `find(p=>p.id===...)` 실패 | `live.ts:301-304` vs `cluster/api.ts:112` |
| L3 | A | 실시간 재시작 차트가 누적 카운터(`reduce` 합)와 구간 delta(`restart_delta`)를 같은 `history.restarts` 시리즈에 혼합. `clusterId===null` 포인트를 모든 클러스터에 계상 | `live.ts:42,191-195`, `MetricsView.tsx:195-197` |
| L4 | B | `seq` 파싱만 하고 미사용 → 순서 역전 시 삭제된 pod 부활(Map 병합이 최신 수신 기준) | `live.ts:89,216,224` |
| L5 | B | 재연결/워크스페이스 전환 시 `pendingDeltas` 미정리 → 이전 연결의 delta가 새 캐시에 유입. 재연결 snapshot은 replace만 방출 → 끊긴 사이 삭제된 pod가 30초 폴링까지 잔류 | `live.ts:113-124,172-187` |
| L6 | B | rAF flush: queryClient null이면 재스케줄 없이 방치, 백그라운드 탭에서 rAF 미발화 → delta 무한 적체 후 늦은 stale write | `live.ts:236` |
| L7 | B | 로그아웃/콘솔 unmount 시 `stopLive` 미호출 → WS가 영구 재연결 지속(시도 상한 없음) | `console/ui.tsx:102-106`, `live.ts:139-143` |
| L8 | B | flush 시 fleet summary·`agg` 키 미invalidate → 홈과 상세가 최대 30초 불일치 | `live.ts:252-253` |

### A군 — 어댑터/파생 상태 논리 오류

| # | 심각도 | 결함 | 위치 |
|---|---|---|---|
| A1 | A | `adaptRunStep` 조건 우선순위 버그(`\|\|`가 `&&`보다 먼저 평가되지 않음): message/details 없는 정상 step이 정규화를 우회 → 소문자 raw name으로 통과, 대문자 매칭하는 모든 소비자에서 단계 매칭 실패 | `adapt.ts:234`, `WorkflowGraphView.tsx:141`, `RepoDetailView.tsx:204` |
| A2 | A | AI 대화 status를 `waiting ? waiting : idle`로 붕괴 → `failed` 검사가 데드 코드, 실패 대화가 '완료'로 표시 | `adapt.ts:339`, `ChatView.tsx:605,667` |
| A3 | B | `sampled_at` null 폴백이 `index+1` → 혼합 배치에서 x축에 1과 1.75e12 공존, 차트 붕괴 | `usageSeries.ts:46-49`, `homeCharts.ts:61-64` |
| A4 | B | `pod_phases`에서 `CrashLoopBackOff`를 읽음(k8s phase가 아니라 container waiting reason) → '재시작 오류' stat 영구 0, `Unknown` phase는 비정상 집계에서 제외 | `MetricsView.tsx:388`, `ClusterDetailView.tsx:111` |
| A5 | B | naive ISO(`Z` 없음)를 `new Date()`로 로컬 파싱 → "n분 전"이 UTC offset만큼 왜곡. `ReleaseFlowView`는 `Z` 제거 후 UTC를 로컬처럼 표시 | `format.ts:3,15`, `ReleaseFlowView.tsx:2604` |
| A6 | B | `podCount: workload.ready \|\| workload.desired` — ready 0(정상 값)이 desired로 대체 → 전면 다운된 배포의 scale 모달이 거짓 표시 | `ClusterDetailView.tsx:421` |

### U군 — UI 상태/흐름 논리 오류

| # | 심각도 | 결함 | 위치 |
|---|---|---|---|
| U1 | A | `useNotices`의 read 계산 useMemo가 seen-state를 의존성에서 누락 → '모두 읽음' 후에도 뱃지가 다음 폴링(10~60초)까지 잔존 | `notifications/api.ts:209-222` |
| U2 | A | `PendingView` 자동 로그인: `login` 객체가 렌더마다 재생성돼 effect가 매 렌더 재발화 → 5초 간격이 연속 연타로 변질(429 유발), 401마다 전역 핸들러 가동 | `PendingView.tsx:29-53` |
| U3 | B | 401 전역 핸들러 루프 가능성: `/auth/session` 자체가 401을 반환하면 invalidate→refetch→401 무한 반복, 가드/디바운스 없음 | `providers.tsx:11-14`, `api.ts:47`, `guards.tsx:54-59` |
| U4 | B | ChatView: 매칭된 mutation error가 컴포저를 설정 안내로 대체하는데 retry가 mutation error를 reset하지 않음 → 이탈 없이는 복구 불가 | `ChatView.tsx:144-160,614-631` |
| U5 | B | 라우트 기반 pod drawer가 필터된 목록에서 조회 → `?q` 필터나 pod 소멸 시 URL은 남고 drawer만 조용히 닫힘(토폴로지 drawer는 '팟 상세 없음' 처리, 라우트 쪽만 누락) | `ClusterDetailView.tsx:101-106` |
| U6 | B | 읽음 비교가 타임스탬프 포맷 미정규화 문자열 사전순 비교 → offset 포맷/naive 문자열에서 오판정 | `notifications/api.ts:220` |
| U7 | B | pod 타일 size가 percent/mcores/MiB를 한 정규화에 혼합 → 상대 크기 무의미 | `ClusterDetailView.tsx:1421` |
| U8 | B | `RequireAdmin`이 초기 세션 쿼리와 경합 → 새로고침 시 잠금 화면 플래시 | `guards.tsx:25-26,60-64`, `auth/api.ts:102-105` |
| U9 | B | timeout `Promise.race`의 패자 fetch가 unhandledrejection 발생. `if (body)` falsy 검사로 0/false/'' 본문 소실(잠재) | `api.ts:32,37,94-100` |
| U10 | C | `getBlob` 오류 문자열 mojibake · Breadcrumb이 raw `<a href>`(전체 리로드) · `safePrRun`이 최신 아닌 첫 매칭 · 빈 `incident_id` React key · graph뷰 승인 훅이 release 쿼리 invalidate 누락 | `api.ts:73`, `ui/index.tsx:781`, `RepoDetailView.tsx:27`, `HomePage.tsx:302`, `WorkflowGraphView.tsx:320-341` |

### D군 — v1에서 확인된 잔여 결함 (유지)

D1 codegen 미도입(→ C군의 근본 원인), D3 `ReleaseFlowView` 토큰 시스템 이탈,
D4 `restartDeltaSeries` 3중 중복, D5 `HomePage` 레이어링 이탈, D6 `smoke.py` 전면 낡음
(+ruff 위반), D7 namespace 안정 색 작업 필요, D8 ⌘K 팔레트 작업 필요, D9 `@nivo/treemap` 미사용
의존성, D10 낡은 spec/fd 문서.

### 백엔드 협의 필요 항목 (프론트 단독으로 완결 불가)

- C2: 인시던트 상세 API가 correlation_id 조회를 지원하거나, FE가 correlation 링크를 만들지
  않아야 한다. **권장: BE가 `incident_id` 우선, 실패 시 correlation 매칭 폴백 조회 지원.**
- C5: 세션 응답에 `email` 추가 또는 FE 사용자 칩 사양 축소. **권장: BE 필드 추가(1줄).**
- C4: 카탈로그 설치 runner 연결 전까지 **FE는 설치 버튼을 disabled + '준비 중' 상태로 렌더**
  (존재하지 않는 성공 계약 삭제).
- C6: hot-pod·rollout_phase는 BE가 실제로 보내는 `live.summary` 계약으로 FE를 재작성
  (죽은 `namespaces` 분기 삭제).

## 3. 불변 원칙

v1과 동일하되 두 항목을 추가한다.

1. 하드코딩·목업·샘플 수치 금지. 값이 없으면 `null` 기반 unavailable 상태 렌더. 기본값으로
   임의 수치를 채우지 않는다. `?? 0`, `\|\|` 폴백으로 정당한 0을 삼키지 않는다(`== null`만 허용).
2. 네트워크는 `shared/lib/api.ts` 단일 관문. 뷰 직접 fetch 금지.
3. 색·간격·모션은 `ui/theme.css` 토큰과 `ui/motion.ts`만. raw hex·feature 내 `.css`·inline
   style 금지(문서화된 예외만).
4. 모든 쿼리 화면은 loading/error(+retry)/empty/성공 4상태 필수. **error 상태는 반드시 복구
   경로(재시도로 mutation reset 포함)를 가진다(U4 재발 금지).**
5. **캐시에 쓰는 모든 경로(REST queryFn, WS 패치)는 동일한 어댑터를 통과한 동일한 형태만
   쓴다. `setQueryData` 키는 `useQuery` 키와 상수로 공유한다(L1·L2 재발 금지).**
6. 레이아웃 이동 금지(고정 track/aspect-ratio), reduced-motion·키보드 focus 지원.
7. `/console/*`은 리다이렉트 외 코드 금지.
8. 매 커밋 `tsc --noEmit` + `scripts/frontend-check.sh` 통과, 한국어 conventional commit.

## 4. 실행 계획

수정 순서는 "계약 정본화 → 계약 오류 → 실시간 레이어 → 상태 로직 → 통일성 → 누락 기능 →
테스트 → 문서"다. 각 단계는 독립 커밋 가능하고 게이트를 통과해야 진행한다.

### 0단계 — 기준선 고정 (0.5일)

`npm run typecheck && npm run build && npm test` 통과 확인. 실제 세션/Agent 인증 백엔드로 주요 화면
8종 1440/1024/390 순회, 스크린샷 기준선 갱신. 게이트: 빌드 0 오류, 콘솔 오류 0, overflow 0.

### 1단계 — 계약 자동화 (1~2일)

- `@hey-api/openapi-ts` 도입, `GET /api/openapi.json` → `src/generated/api/`(수정 금지),
  `npm run codegen` + CI "codegen 재실행 diff 0" 검사.
- 도메인별 점진 치환(fleet → clusters/inventory → incidents/rca → metrics → auth/org →
  applications/release → ai → wizard). 치환 과정에서 C1·C3·C8·C9는 컴파일 오류로 강제
  수정된다 — 이것이 codegen을 최우선에 두는 이유다.
- WS는 codegen 밖이므로 `contracts/realtime.py`와 zod 가드를 1:1 대조. C6의 죽은
  `namespaces` 분기를 삭제하고 `live.summary`(`hot_pods`, `rollout_phase`) 기반으로 재작성.
- 게이트: 치환 도메인 수기 타입 0, `tsc` 통과, Bruno aws-test 응답으로 정상 렌더.

### 2단계 — 계약 오류 수정 (C군 잔여, 0.5~1일)

- C2: BE 협의(위 협의 항목). 합의 전까지 FE는 `incident_id` 없는 항목의 상세 링크를 만들지
  않고 비활성 배지로 렌더.
- C4: 설치 버튼 disabled + 준비 중 상태. 가짜 성공 타입 삭제.
- C5: BE `email` 추가(1줄) 또는 칩 제거 — BE 추가 권장.
- C7: 단위 규약 단일화 — **BE는 percent를 보낸다**를 정본으로 하고 ×100 휴리스틱 전부 제거,
  `cpu_ratio`(비율)만 명시적으로 ×100. 어댑터 단위 테스트로 0.8%/80% 케이스 고정.
- 게이트: 각 수정에 단위 테스트, 실 백엔드로 해당 화면 확인.

### 3단계 — 실시간 레이어 재설계 (L군, 1~2일)

`live.ts`는 부분 수정이 아니라 쓰기 경로를 재설계한다.

- 패치 대상 키를 prefix 매칭이 아닌 **정확한 키 상수**로 제한하고, 키 상수를
  `features/*/api.ts`와 공유 모듈로 일원화(L1).
- delta 키에 노드 식별이 없으므로 pods-summary에는 **upsert하지 않는다** — 존재하는 행만
  갱신(update-only)하고, 미발견 pod는 해당 쿼리 invalidate로 처리(L1).
- 모든 캐시 쓰기는 REST와 같은 어댑터를 통과시킨다(L2).
- `seq` 단조 증가 가드: 역전·중복 delta 폐기, gap 감지 시 snapshot 요청 대기(L3·L4).
- `startLive`/`stopLive`에서 pending 큐·히스토리 초기화, 로그아웃·unmount 시 `stopLive`
  호출, 재연결 시도 상한 + 백그라운드 탭은 `visibilitychange`에서 flush(L5·L6·L7).
- 히스토리 시리즈는 delta 전용으로 통일(누적 합 저장 제거), `clusterId null` 포인트는
  클러스터별 시리즈에서 제외(L3).
- flush 시 fleet/agg 키 invalidate 추가(L8).
- 게이트: WS 패치 로직 단위 테스트(mock 메시지 시퀀스: 순서 역전, 재연결, 워크스페이스
  전환), 실 백엔드에서 heatmap 5분 관찰 시 유령 pod 0.

### 4단계 — 상태·어댑터 로직 수정 (A군·U군, 1~2일)

- A1: `adaptRunStep` 조건 괄호 수정 + 모든 step 정규화 통과. 워크플로우 화면 회귀 확인.
- A2: 대화 status 리터럴 전체(`waiting|failed|...`)를 유지하도록 어댑터 수정, 실패 UI 활성.
- A3: `sampled_at` null 샘플은 차트에서 제외(가짜 x값 생성 금지).
- A4: CrashLoopBackOff stat은 BE가 제공하는 실제 필드 기준으로 재정의(없으면 unavailable),
  `Unknown` phase를 비정상 집계에 포함.
- A5: 시간 파싱 유틸 단일화 — naive 문자열은 UTC로 해석(`Z` 보정), 전 화면 공통 적용.
- A6/U9: `\|\|`·`if (body)` 류 falsy 버그를 `== null` 검사로 교정(정당한 0 보존 원칙).
- U1: seen-state를 useMemo 의존성에 포함(useSyncExternalStore 스냅샷 사용).
- U2: PendingView를 렌더-독립 타이머(ref 기반)로 재작성, 시도 상한·백오프 추가.
- U3: `/auth/session` 요청 자체는 `onUnauthorized`를 발화하지 않도록 예외 처리 + 디바운스.
- U4: 재시도 버튼이 mutation `reset()`을 호출하도록 수정.
- U5: 라우트 drawer도 '팟 상세 없음' 상태 렌더(토폴로지 drawer와 동일 처리).
- U6: 알림 타임스탬프를 epoch로 정규화 후 비교.
- U7: pod 타일 size는 단일 지표(cpu_pct)만 사용, 없으면 균등 크기.
- U8: 세션 pending 동안 가드는 스켈레톤 렌더(잠금 화면 플래시 제거).
- U10 + D2·D4·D5: mojibake 상수 통일, Breadcrumb `Link` 치환, `safePrRun` 최신 정렬,
  restartDeltaSeries 단일화, HomePage 훅 이동, graph 승인 훅을 `useApproval`로 통합.
- 게이트: 수정 항목별 단위 테스트(`tests/*.test.mjs`) 추가, 전 화면 콘솔 오류 0.

### 5단계 — 통일성 완결 (1일)

- D3: `ReleaseFlowView.css` 삭제, `ui/` 프리미티브·토큰 클래스로 이관, 3폭 스크린샷 회귀.
- D9: `@nivo/treemap` 제거.
- `frontend-check.sh` 강화: 예외 0 적용 + 의심 리터럴(임의 수치 폴백, `\|\| 0` 패턴) grep 게이트
  + `setQueriesData` prefix 매칭 사용 금지 검사.
- 게이트: `frontend-check.sh` 예외 0 통과.

### 6단계 — 누락 기능 (1~2일)

- D7: `stableColor(name)` — 해시→oklch 고정 hue, 토큰화된 채도·명도. namespace 색은 좌측
  스트립/라벨만, health 색과 분리. Service 선택 대상 pod/node 강조는 별도 outline 토큰
  (HANDOVER §6.5·6.6).
- D8: `cmdk` 팔레트 — 1차 범위는 라우트 이동 + 클러스터/인시던트 검색. ui-layer-lab 예제는
  참고만, 코드 복사 금지.
- 게이트: reduced-motion·키보드 검증, 스크린샷 회귀 0.

### 7단계 — 테스트 재건 (1~2일)

- D6: `smoke.py` 전면 재작성(현 라우트 기준: `/` 히트맵, `/clusters/:id` 드릴, `/incidents`,
  `/metrics` preset run, `/ai`, `/settings/*`). 데모 문자열·하드코딩 비밀번호 제거(env),
  축약 문법 해소로 `ruff check .` 클린(HANDOVER §10.9 종결).
- 3~4단계에서 수정한 각 A급 버그에 회귀 테스트 명시적 추가(WS 시퀀스, adaptRunStep,
  대화 status, 알림 read, percent 단위).
- 공통 어서션: 콘솔 오류 0, overflow 0, 3폭 스크린샷.
- 게이트: smoke 전 항목 PASS, `ruff check .` 저장소 전체 클린.

### 8단계 — 문서 정합 + 종결 검증 (1일)

- D10: 낡은 `docs/spec/frontend/*`를 `status: superseded` 마킹 + 정본 링크. `docs/fd/04`,
  `views/fleet-heatmap.md` 현 구현 기준 갱신. `AUDIT.md`에 본 계획 수행 내역 기록.
- 종결 게이트 일괄: typecheck · build · test · frontend-check · codegen diff 0 · smoke ·
  e2e · ruff 클린. 라이브에서 실 로그인 후 전 화면 순회, `live.summary` 수신·히트맵 실시간
  갱신·유령 pod 없음 5분 관찰.
- "버그 0" 선언이 아니라 자동 테스트·계약·라이브 상태·스크린샷 증거가 같은 commit을
  가리킬 때만 종결한다(HANDOVER §11).

## 5. 재발 방지 게이트 요약

| 위험 | 차단 장치 |
|---|---|
| FE/BE 계약 드리프트 | openapi-ts codegen + CI diff 0 + WS zod 가드(계약 정본 1:1) |
| 캐시 형태/키 불일치 | 키 상수 공유 모듈 + WS 쓰기도 동일 어댑터 경유 + prefix `setQueriesData` 금지 검사 |
| falsy 폴백이 0을 삼킴 | `== null` 규약 + 의심 리터럴 grep 게이트 + 단위 테스트 |
| 상태 소실(failed→idle 류) | 어댑터가 상태 리터럴을 축소하지 않는다는 규약 + 리터럴 세트 테스트 |
| 목업/하드코딩 유입 | 목업 레이어 부재 유지 + null→unavailable 규약 |
| 디자인 불일치 | 단일 토큰 + frontend-check 예외 0 |
| 조용한 런타임 오류 | strict TS + 4상태(+복구 경로) 규약 + smoke 콘솔 오류 0 |
| 문서發 재실패 | superseded 마킹 + 정본 우선순위 명시 |

## 6. 일정 요약

0단계 0.5일 → 1단계 1~2일 → 2단계 0.5~1일 → 3단계 1~2일 → 4단계 1~2일 → 5단계 1일 →
6단계 1~2일 → 7단계 1~2일 → 8단계 1일. 총 **약 8~12 작업일**. 1~4단계(계약·실시간·로직)가
"오류 없음"의 본체이고, 5~6단계가 "통일성", 7~8단계가 증거 확보다. 6단계(누락 기능)는
일정 압박 시 후순위로 미룰 수 있으나 1~4단계는 순서 변경 불가.
