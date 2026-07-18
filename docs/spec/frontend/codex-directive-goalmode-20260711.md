---
title: 골모드 최종 지시서 — 완성까지 무중단 실행 (검토자 → Codex)
status: active-directive (유일 최상위 — 이 문서와 충돌하는 모든 이전 지시·문서보다 우선)
date: 2026-07-11
verified_against: HEAD d61623c11 — §1 문서 정리 진행 확인(topology-engine-claude.md 삭제,
  토큰 문서 축소, reference-porting-contract.md 이관, 화면 코드 미착수)
mode: goal — §2 최종 질문 1회 후 완성까지 중단 없이 실행
---

# 골모드 최종 지시서

## 0. 목표 정의 (이것이 "완성"이다)

외부 기준 저장소(로컬 :9280 실행 인스턴스 + 소스)의 **기능·레이아웃·상호작용·이벤트와
동등**하게 동작하고, **우리 백엔드 API 계약**으로 구동되며, **RCA·복구·AI 채팅이 통합**된
제품이 `src/product`에 존재하고, 아래 §7 인수 조건을 전부 통과한 상태.
디자인은 전부 **벤치마크 최소선**으로 표현된다.

## 1. 문서 위생 — 꼬임 방지 (최우선 수행)

**활성 문서 allowlist** (골모드 중 참조 가능한 문서의 전부):

1. 이 지시서
2. `reference-porting-contract.md` (이관된 데이터·identity·zod 규칙)
3. `reference-feature-inventory.md` (P1 산출물)
4. `reference-contract-map.md` (P2 산출물)
5. `final-questions.md` (§2 산출물)
6. `codex-progress-20260711.md` (진행 증거, append-only)
7. `product-data-contract.md` (API 의미 — 단, 이 지시서와 충돌 시 이 지시서 우선)
8. `api-integration-workorder-20260711.md` (병렬 API 작업자용 정본 — §6b)
9. `api-needs.md` (Codex→API 작업자 요청 큐)

그 외 `docs/spec/frontend/*` 전부(브리핑, 24h 지시서, reference-pivot 지시서,
topology-engine.md 헌법, 토큰/프로토콜 문서 포함)는 같은 디렉터리에서 archived 상태로
전환하고 frontmatter에 `status: archived — 현재 작업에 참조 금지`를 단다.
**allowlist 밖 문서를 참조한 구현은 게이트 위반이다.** 유지 가치가 있는 조각(프로토콜의
Zod·idempotency 규칙 등)은 참조가 필요해지는 시점에 `reference-porting-contract.md`로
**이관 후** 사용한다 — archive를 직접 읽고 구현하지 않는다.

## 2. 최종 질문 라운드 (정확히 1회, 그 후 질문 중단)

P1·P2 완료 직후, 구현 착수 전에 `final-questions.md`에 **남은 결정 요청 전부**를 한 번에
작성한다(형식: 결정 요청/선택지/자체 권고). 이 파일 커밋 후 24시간 내 검토자 답변이 없거나
질문이 없으면 §3의 **기본 결정 규칙**으로 자체 해소하고 진행한다. 이후 골모드 중 새로운
모호함이 나오면 멈추지 말고 기본 결정 규칙을 적용한 뒤 progress에 `자체결정: <내용/근거>`로
기록한다. **중단 허용 조건은 단 둘**: (a) 백엔드 세션/자격증명 부재로 실측 자체가 불가,
(b) 파괴적 작업(데이터 삭제, 원격 리소스 변경)이 필요한 경우 — 이때만 blocked 보고.

## 3. 기본 결정 규칙 (구멍 제로의 실체 — 모든 모호함은 이 표로 닫힌다)

| 상황 | 결정 |
|---|---|
| 참조 기능의 백엔드 계약이 우리에게 없음 | UI에 미노출(disabled도 금지) + P2에 `BE-Gap-n` 등재 + progress 기록 |
| 계약은 있으나 형태 불일치 | `src/product/api` 어댑터로 변환 — 화면 코드에서 변환 금지 |
| 참조의 실시간(SSE) | 우리 WS(`/api/live/browser`) 우선, 해당 데이터가 WS에 없으면 30s 폴링 — 가짜 실시간 금지 |
| UI 컴포넌트 선택 모호 | 벤치마크 최소선의 가장 근접한 프리미티브와 공식 예제 패턴 우선. 커스텀 제작은 해당 기준에 부재할 때만 |
| 차트 | 벤치마크 최소선 Charts 단일 |
| 권한 부족/403 | 일급 상태로 렌더(숨기지 않음), 401은 세션 게이트 |
| 명명 충돌(참조 용어 vs 우리 도메인) | 우리 백엔드 도메인 용어 우선 |
| 수치·목록이 백엔드에 없음 | null/unavailable 렌더 — 하드코딩·추정 절대 금지 |
| 이전 문서와 충돌 | 이 지시서 §3·§4가 이김, archive 문서는 무효 |

## 4. 100% 매핑 요건 (P1·P2 완전성 규칙)

- **P1 전수표**: 참조의 전 라우트·화면·구성요소·상호작용(클릭/키보드/실시간 갱신)·
  UI가 호출하는 전 API(메서드·경로·요청/응답 형태). 근거는 실행 인스턴스 관찰 + 소스 확인
  **이중**으로 단다.
- **P2 매핑표**: P1의 모든 API 행에 대해 `참조 endpoint ↔ 우리 endpoint(routes.py 근거)
  ↔ 판정`. 판정은 `직결/어댑터/BE-Gap` 셋뿐. **"미정" 행 0개**가 완전성 조건이며,
  `P1 API 행 수 = P2 행 수`를 표 머리에 명시해 증명한다.
- **컴포넌트 매핑표**(P2에 포함): 참조 UI 요소 → 벤치마크 최소선 컴포넌트 대응 전수. 대응 불가
  항목은 "커스텀 사유"를 명시한다.
- **RCA 통합 매핑**(P2에 필수 포함 — 참조에 없는 우리 고유 축, 이번 지시로 범위 편입):

| 삽입 지점 | 우리 endpoint (검증자 확인 완료) |
|---|---|
| Issues 메뉴(전용 화면): 인시던트 목록·상세 | `GET /dashboard/rca/timeline`, `GET /dashboard/rca/incidents/{id}` |
| 복구 계획: 상세 내 "복구 조치" 섹션 | `GET /rca/recovery-plans/by-correlation/{correlation_id}`, `POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select` |
| 증거 트레일 | `GET /evidence?correlation_id=` |
| 리소스 상세: scope된 "AI 분석" 섹션(데이터 없으면 섹션 미렌더) | 위 RCA 계열 correlation 조회 |
| 전역 AI 채팅 드로어(현재 선택 컨텍스트 자동 첨부, status 리터럴 전체 보존) | `/ai/conversations*` |

RCA는 별도 앱처럼 붙이지 말고 참조 IA에 자연 삽입한다: 메뉴 추가는 Issues 하나,
나머지는 기존 화면의 섹션·배지·드로어다.

## 5. UI 일관성 (벤치마크 최소선 단일 정본)

- 제품 소유 UI 생성물만 사용(`src/product` 내 설치). lab/vendor import 금지 유지.
- 테마·색·타이포·간격은 벤치마크 최소선 표준 CSS 변수 체계 — 병렬 토큰 체계 신설 금지.
- 커스텀 스타일 일회성 금지: 벤치마크 최소선 프리미티브 조합으로 표현 불가할 때만, 사유를
  컴포넌트 매핑표에 기록.
- 다크/라이트는 벤치마크 최소선 표준 방식. 접근성(키보드·focus·reduced-motion·대비)은 archived 상태의
  게이트 원칙을 `reference-porting-contract.md`로 이관해 유지.

## 6. 실행 순서 (골모드)

1. §1 문서 위생 → 2. P1 → 3. P2(+컴포넌트·RCA 매핑) → 4. §2 최종 질문 →
5. 벤치마크 최소선 스캐폴드(라우터·셸) → 6. 화면별 포팅(직결 비율 높은 순) + RCA 통합 →
7. §7 인수. 각 커밋 `npm run check` 통과, 화면마다 progress에
`화면명/커밋/게이트 로그/참조 동등성 체크리스트` append.

## 6b. 병렬 API 작업 연동 (사람 개발자와의 분업 — 필수 준수)

`api-integration-workorder-20260711.md`에 따라 별도 개발자가 `src/product/api/**`의
endpoint 함수·스키마를 병렬로 먼저 구축한다. 규칙:

1. **소유 경계**: `src/product/api/**`의 endpoint 함수·스키마 신설은 그 개발자 소유다.
   Codex는 progress 파일의 `API 완성:` 목록에 오른 함수만 소비한다.
2. **필요한 함수가 아직 없으면**: 직접 만들지 말고 `docs/spec/frontend/api-needs.md`에
   요청 행(`함수명 / routes.py 상수 / 필요한 화면 / 요청 시각`)을 append하고, 그동안
   해당 화면의 다른 부분 또는 다음 화면을 진행한다(대기로 멈추지 않는다).
3. **24시간 경과 미처리 요청만** Codex가 직접 구현할 수 있다 — 이때 workorder의
   7단계 레시피·다섯 계명을 동일하게 따르고 progress에 대행 사실을 기록한다.
4. 같은 파일 동시 수정 금지. `client.ts`·`url.ts`는 양쪽 모두 수정 금지.
5. 어댑터(형태 변환) 계층은 Codex 소유로 남는다 — endpoint 함수(전송)와 분리한다.

## 7. 인수 조건 (전부 충족 시에만 "완성" 선언)

1. P2 매핑표 미정 0행, `P1=P2` 행 수 일치 증명 존재.
2. 포팅된 전 화면이 우리 실 API(game-server, 실 세션)로 렌더 — 화면별 스크린샷 경로 기록.
3. 참조 인스턴스와 나란히 동일 조작 → 동등 결과 체크리스트 전 항목 통과(BE-Gap 제외 명시).
4. RCA 5개 삽입 지점 전부 실데이터 동작(복구 플랜 없는 인시던트는 "미생성" 정직 표기).
5. 하드코딩·synthetic·가짜 이름·DEMO 라벨 스캔 0건.
6. 벤치마크 최소선 외 UI 라이브러리 0건, 컴포넌트 매핑표와 실코드 일치.
7. `npm run check` + visual gate 통과, 콘솔 오류 0.
8. Apache-2.0/MIT 고지(`THIRD_PARTY_NOTICES`, 수정 고지) 완비, 참조 제품 브랜드 문자열 0건.
9. allowlist 밖 문서 참조 흔적 0건, archived 상태 전환 완료.
10. progress 파일에 전 과정의 커밋·게이트·자체결정 기록 완결.
