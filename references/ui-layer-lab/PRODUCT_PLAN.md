# 제품 프론트엔드 제로베이스 실행 계획 (2026-07-11)

정본은 `AGENTS.md`(경계·디자인 시스템·데이터/보안·필수 워크플로)와
`PRODUCT_FRONTEND.md`(제품 프레임·첫 슬라이스 수용 기준)다. 이 계획은 두 문서를 바꾸지
않고, 그 위에 슬라이스 순서·백엔드 계약 매핑·이전 구현 감사에서 도출한 추가 규칙을 얹는다.

`../../frontend/` 구현은 AGENTS.md 규칙대로 복구·열람·복사하지 않는다. 다만 폐기 전 수행한
계약·로직 감사에서 얻은 **교훈**은 코드가 아니라 규칙(§2)으로만 가져온다.

## 1. 현재 상태

첫 슬라이스(fleet control room)가 `src/product/`에 구현되어 있고 계약을 준수한다.

- `api/client.ts`: 단일 전송 관문 — 모든 응답 zod `safeParse`, `invalid-payload` 오류 종별,
  CSRF `x-service-csrf`, `credentials:"include"`, retry-after 파싱. 유지.
- `app/useProductData.ts`: `loading | unauthenticated | offline | ready | fleet-error` 명시
  상태 머신. timeline은 실패해도 fleet을 막지 않는 부분 실패 모델. 유지.
- `features/auth/LoginScreen.tsx`, `features/fleet/FleetPage.tsx`, shared 프리미티브 4종,
  `styles/{tokens,foundation,fleet}.css`.
- 게이트: `npm run check`(typecheck+lint+design guard+shadcn guard+build),
  `npm run visual-product`, `check:design`(제품 경계·토큰 가드).

미구현: fleet 이후의 모든 슬라이스, WS live 연결, 라우팅 구조(현재 `/product` 단일 화면).

## 2. 추가 규칙 — 이전 구현 감사에서 도출 (AGENTS.md 보강 제안)

이전 `frontend/`는 구조가 아니라 아래 논리 층위에서 침몰했다. 같은 API를 소비하는 이상
동일 함정이 재현되므로, 슬라이스 시작 전에 규칙으로 고정한다.

1. **실시간 캐시 규칙.** WS 메시지(`hello|snapshot|live.summary|resource.delta|ping`,
   `src/packages/contracts/realtime.py` 정본)는 zod로 검증하고 미지 타입은 폐기한다.
   `seq` 단조 증가 가드로 역전·중복을 버린다. WS 데이터가 화면 상태에 쓰일 때는 REST와
   **동일한 스키마·정규화 경로**를 통과한다. 식별자가 부족한 delta(노드 미상 pod 등)로
   목록에 삽입하지 않는다 — 갱신만 하거나 재조회를 유발한다. 로그아웃/화면 이탈 시 연결을
   명시적으로 종료하고, 재연결 시 보류 큐를 비우며, snapshot 수신 전 delta를 적용하지
   않는다. 누적 카운터와 구간 delta를 한 시리즈에 섞지 않는다.
2. **단위 규약.** 백엔드 `*_pct`는 이미 percent다. 값 크기로 단위를 추측하는 휴리스틱
   (≤1이면 ×100 등)을 금지한다. ratio→percent 변환은 `*_ratio` 필드에만 명시적으로 한다.
   서로 다른 단위(pct/mcores/MiB)를 하나의 정규화·크기 계산에 섞지 않는다.
3. **시간 규약.** 타임스탬프 파싱·표시는 단일 유틸로만 한다. timezone 표기 없는 ISO
   문자열은 UTC로 해석한다. 시간 비교는 문자열 사전순이 아니라 epoch로 한다.
4. **상태 리터럴 보존.** 어댑터/스키마가 백엔드 status 세트를 축소하지 않는다
   (`failed`→`idle` 류 금지). zod enum에 전체 리터럴을 명시하고, 미지 값은 명시적
   `unknown` 분기로 처리한다. UI가 의존하는 상태는 스키마에 존재해야 한다.
5. **falsy 금지.** 존재 검사는 `== null`만 사용한다. `||`·`?? 0`·`if (body)` 류로 정당한
   0/false/빈 문자열을 삼키지 않는다.
6. **링크 무결성.** 응답에 실재하는 식별자로만 라우트를 만든다. 식별자가 없으면 링크 대신
   비활성 상태를 렌더한다(`/incidents/undefined` 류 금지).
7. **폴백의 정직성.** 백엔드가 주지 않는 값을 클라이언트 계산·하드코딩 명령어·추정치로
   대체하지 않는다(AGENTS.md 재확인). 폴백이 결함을 은폐하면 결함이 영구화된다.

## 3. 백엔드 계약 지도

정본: `src/packages/contracts/gateway/routes.py` + `docs/fd/06-api-map.md`. 공개 prefix는
`/api`. 인증은 `service_session` 쿠키, 상태 변경은 CSRF 헤더. `GET /api/openapi.json`
제공 — zod 스키마 작성 시 대조하고, 여력이 되면 codegen→zod 파이프라인을 검토한다(수기
스키마라도 런타임 검증이 있으므로 이전 수기 "타입"과는 위험 등급이 다르다).

백엔드 협의 필요(이전 감사에서 확인, 새 구현에도 동일 적용):

| 항목 | 현상 | 처리 |
|---|---|---|
| 세션 `email` 부재 | `AuthSessionResponse`에 email 없음 | BE 1줄 추가 요청, 그 전까지 이메일 UI 배제 |
| 인시던트 상세 조회 키 | `GET /dashboard/rca/incidents/{id}`가 `incident_id`만 매칭 | correlation 폴백 조회 지원 요청, 그 전까지 correlation-only 항목은 링크 비활성 |
| 카탈로그 설치 | BE 무조건 501 | runner 연결 전까지 설치 버튼 '준비 중' 비활성 |
| 알림 endpoint 부재(G9) | 전용 API 없음 | 승인 대기·타임라인·DLQ 카운트 표면화만, 목록·읽음 상태 조작 금지 (PRODUCT_FRONTEND 명시) |

## 4. 슬라이스 로드맵

수직 슬라이스로 진행한다. 매 슬라이스는 AGENTS.md 필수 워크플로를 따른다: 계약 읽기 →
zod 스키마 → `product/api` 함수 → feature 구현(loading/unauthenticated/offline/forbidden/
empty/stale/populated 상태) → `npm run check` + 3폭(390/768/1440) + 키보드/reduced-motion +
라이트/다크 스크린샷 → 미지원 백엔드 능력 보고. 이 게이트를 통과해야 다음 슬라이스로 간다.

### S0 — 기반 실증 (0.5일)
`npm run check` 통과 확인. 라이브(`https://k8s.woonyong.org`)에 실 로그인해 첫 슬라이스의
7상태(특히 forbidden·stale)를 실측. fleet 스키마를 `/api/openapi.json`과 대조해 드리프트 0 확인.

### S1 — 라우팅 골격 + live 연결 (1일)
- `/product` 단일 화면을 라우터 구조로 확장(이후 슬라이스의 자리). 페이지는 조합만, 전송
  로직 없음(의존 방향 준수).
- `WS /api/live/browser?workspace_id=` 연결: 연결 신선도 표시(PRODUCT_FRONTEND 상단 유틸
  바의 API/live state), `live.summary` bounded 반영. §2.1 규칙 전면 적용. 재연결 백오프·
  시도 상한·이탈 시 종료.
- 게이트에 WS 시퀀스 단위 테스트(순서 역전·재연결·미지 타입) 추가.

### S2 — 클러스터 드릴 (2일)
- `GET /clusters/{id}/summary`, `/clusters/{id}/nodes/summary`,
  `/clusters/{id}/nodes/{node}/pods/summary`.
- 드릴 계층 cluster → node/service/workload → pod (HANDOVER §6.3). 드릴 상태는 URL로
  표현하되, 대상 소멸 시 "리소스 없음" 상태를 렌더(조용한 drawer 소멸 금지).
- 밀도 높은 상태 필드 유지 — 카드 더미 금지(PRODUCT_FRONTEND 구성 원칙).
- namespace 안정 색: 이름 해시 → 고정 hue, `tokens.css` 채도·명도만 사용. health 색과
  분리된 표면(라벨/스트립)에만.

### S3 — 리소스/서비스 상세 (1~2일)
- `/clusters/{id}/inventory/{resources,workloads,services,events,summary}`,
  `inventory/resource-detail`, `/clusters/{id}/usage`.
- Kubernetes Service는 selector 기반 별도 리소스로 모델링 — 선택 대상 pod/node 강조,
  namespace와 혼동 금지(HANDOVER §6.6).
- 검색/namespace/health 필터.

### S4 — 인시던트/RCA/복구 (2일)
- `GET /dashboard/rca/timeline`, `GET /dashboard/rca/incidents/{id}`, `/evidence`,
  `/rca-reports`(keyset cursor 페이지네이션), recovery plan 조회/action select.
- scope별 상세: 그 리소스에 한정된 이벤트·AI 분석·RCA/recovery 상태(HANDOVER §6.4).
- `incident_id` 없는 항목은 링크 생성 금지(§2.6, BE 협의 항목).

### S5 — 메트릭 (1~2일)
- usage 시계열, `POST /metrics/validate`(PromQL dry-run), metric-query-presets CRUD/run,
  metric-widgets CRUD, `GET /commands/{id}` 폴링(terminal 상태에서 중지).
- 실제 query 등록→검증→실행이 핵심 기능(HANDOVER §6.7). 차트는 실측만, `sampled_at` null
  샘플은 제외.

### S6 — 위저드 2종 (2일)
- cluster: provider catalog → preflight → register → bootstrap command → connection-status
  폴링 → connected(HANDOVER §6.9). agent token 원문은 1회 응답만 — 재노출 UI 금지.
- repo: probe → branches → manifests → validate → binding(HANDOVER §6.8).

### S7 — 애플리케이션/릴리스/워크플로/승인 (2일)
- `/applications*`, `/release-plans*`, `/release-runs*`(13종 필터), 승인 grant/reject.
- 실행 중 workflow는 React Flow animated edge, 배치는 auto-layout(고정 좌표 금지).

### S8 — AI 채팅 (1일)
- `/ai/conversations*` — 생성/추가는 accepted envelope, 조회는 폴링(스트리밍 WS 없음, G8).
- 대화 삭제, loading/error/empty/retry(HANDOVER §6.10). status 리터럴 전체 보존(§2.4) —
  실패는 실패로 표시.

### S9 — 설정/운영 (1~2일)
- orgs/groups/users/access, alert channels(실제 test 발송), dead-letters 목록/replay.
- admin 가드는 세션 확정 전 스켈레톤(잠금 화면 플래시 금지).

### S10 — E2E와 종결 (1~2일)
- Playwright: 실 로그인 E2E, 쓰기 플로우는 mutate 게이트 뒤에. 콘솔 오류 0·overflow 0
  어서션, 3폭 스크린샷. 이전 `frontend/tests/smoke.py`를 대체하는 신규 스모크로
  HANDOVER §10.9(`ruff check .` 클린)를 종결.
- 라이브에서 전 화면 순회 + WS 5분 관찰(유령 리소스 0).
- 종결 조건: 자동 테스트·계약·라이브 상태·스크린샷 증거가 같은 commit을 가리킬 때
  (HANDOVER §11). "버그 0" 선언으로 대신하지 않는다.

## 5. 일정

S0 0.5일 → S1 1일 → S2 2일 → S3 1~2일 → S4 2일 → S5 1~2일 → S6 2일 → S7 2일 → S8 1일 →
S9 1~2일 → S10 1~2일. 총 **약 15~19 작업일**. S2~S4가 제품 가치의 중심이므로 일정 압박 시
S6(위저드)·S9(설정)를 후순위로 미룬다. S1(실시간 규칙)은 S2 이후로 미루지 않는다 —
실시간 레이어를 나중에 끼워 넣는 것이 이전 구현 L군 결함의 발생 경로였다.
