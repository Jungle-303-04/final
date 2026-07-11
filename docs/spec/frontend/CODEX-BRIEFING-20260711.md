---
title: 프론트 작업 조율 브리핑 (Claude 검토자 → Codex 구현자)
status: active-directive
date: 2026-07-11
verified_against: HEAD e20376321 (2026-07-11 관측) — 본문 주장은 전부 커밋/파일 근거를 병기한다
---

# 코덱스 브리핑 — 2026-07-11 (검증 기반 v2)

## 0. 사용법과 참조 순서

너(Codex)는 이 파일을 읽고 §3 보고서를 `docs/spec/frontend/coordination/codex-plan-report-20260711.md`
에 작성한다. 보고서 커밋 전에는 새 화면 구현을 시작하지 않는다(진행 중 커밋의 마무리는 허용).
기존 문서와 내용이 다르면 실제 코드·통과한 테스트·관련 spec을 다시 확인하고, 확인 결과를 보고서 Q6에 기록한다.

참조 순서: 이 브리핑의 보고서 범위 > `topology-engine-claude.md`(Home 인터랙션) >
`topology-visual-motion-tokens.md`(수치) > `topology-message-action-schema.md`(프로토콜) >
`product-data-contract.md`(API 의미) > `topology-engine.md`(장기 헌법). 실제 구현 완료 여부는 코드와 테스트를 기준으로 확인한다.

## 1. 검증 완료 — 잘 된 것 (재작업 금지)

검토자가 HEAD에서 직접 확인했다. 아래는 지시가 아니라 **확인 기록**이며 되돌리지 않는다.

| 항목 | 증거 |
|---|---|
| 구 `frontend/` 완전 제거 | 커밋 `e20376321` |
| 실 클러스터 inventory API 계층(zod 스키마·url 헬퍼·한도 상수) | 커밋 `8dbcfde9c`, `src/product/api/inventory.ts`, `inventory-schemas.ts` |
| Vite `/api` proxy 존재 | `references/ui-layer-lab/vite.config.ts:85` |
| focus 모션 토큰 반영(focusMorph 720ms·24ms stagger cap 300·ribbonDraw 560ms·connectorStagger 110ms·labelReveal 80%) | `topology-visual-motion-tokens.md:353-358` |
| fold gesture v0 전면 금지(listener/control 미생성) 마킹 | 같은 문서 `:24`, `:173`, `§8` |
| face-결합 리본 두께 예외 + cardinality 라벨 의무 | `topology-engine.md:1652`, tokens `:250`, `:564` |
| Home 완료 게이트 전 타 화면 착수 금지 | `topology-engine-claude.md` §0.2 |

## 2. 신규 확정 결정 (이번 브리핑의 실질 지시)

### 2.1 IA 최종 (2026-07-11 사용자 확정) — `topology-engine-claude.md` §2.1에 반영됨

| 메뉴 | 내용 | 데이터 원천 | 시점 |
|---|---|---|---|
| Home | **클러스터-first**: cluster selector + 미연결 시 기존 등록 위저드(provider catalog→preflight→register→bootstrap→connection-status) + 연결 후 treemap·focus | inventory D1~D5, target 등록 API | 지금(v0) |
| Resources | 목록 + **제자리 인라인 확장** 상세(별도 페이지/drawer 금지). Container 상세는 pod 행 확장에만 | inventory resources/resource-detail/events | Home 게이트 후 |
| Issues | 인시던트 + RCA 내러티브(원인·근거·부족 증거·복구 후보) | dashboard/rca | Home 게이트 후 |
| Timeline | 통합 서사: K8s warning 이벤트+인시던트 생명주기+명령/승인+릴리스 런 | events·rca timeline·commands·approvals·release-runs (BE-7 전에는 클라이언트 병합 허용, 병합 규칙 문서화 조건) | Home 게이트 후 |
| GitOps | 자체 release flow(레포 바인딩→렌더/검증→safe PR→추적). Argo/Flux 관찰 아님 | applications·release-plans·release-runs | Home 게이트 후 |
| Helm | 조회 → 후속 쓰기(values 에디터·upgrade/rollback은 승인 경유 command) | **BE-5/BE-6 완료 후에만** — 그 전에는 메뉴 자체 미생성 | BE-5 후 |
| Settings | 기존 org/access/alerts | 기존 API | 유지 |

- `Topology` 탭 금지(홈이 담당). `Traffic` 탭 **영구 금지** — configured/effective 사슬은
  홈 왼쪽 focus 전개가 담당, observed 유량 소스가 생길 때만 재논의.
- `Audit` = v1 이후 백로그(BE-8). `Cost`·`Checks`·`Image FS` 계획 없음.
- capability 없는 메뉴는 disabled로도 만들지 않는다.
- 현재 `src/product`에 라우터/사이드바가 없음을 확인했다(2026-07-11 관측 — features는
  auth·fleet뿐). 라우팅 도입 시 위 표가 유일한 기준이다.

### 2.2 외부 기준 저장소 레이아웃 차용 경계

헌법의 "외부 기준 저장소"는 레이아웃 참고용이다. 제품명·브랜드·코드는 문서에 고정하지 않고, 필요한 경우 라이선스 절차를 별도 확인한다.

| 가져온다 | 가져오지 않는다 |
|---|---|
| 셸: 사이드바 + 상단 검색/컨텍스트 바 + 우측 상세 패턴 | 중앙 ELK 토폴로지 그래프(우리 treemap+focus로 대체) |
| 리소스 상세 섹션 구성(상태/메타/이벤트/관계/YAML) | capability 없는 메뉴 전부(§2.1) |
| 목록→인라인 확장, 키보드 문법, "보존된 Timeline" 컨셉 | 시각 스타일·색·브랜드·로고·스크린샷(우리 토큰 유지) |
| — | 코드 직접 복사(이식 시 헌법 라이선스 절차 필수) |

### 2.3 AI 삽입 3지점 (AI 전용 탭 신설 금지)

1. Home attention 요소(인시던트 배지·요약 스트립) → 클릭 시 RCA 내러티브.
2. Resources 인라인 확장 마지막 섹션 "AI 분석" — 그 리소스 scope의 RCA/복구 상태.
   데이터 없으면 섹션을 렌더하지 않는다.
3. 채팅 = 전역 드로어(기존 conversation API), 열릴 때 현재 선택 컨텍스트 자동 첨부,
   status 리터럴(`failed` 포함) 전체 보존.

### 2.4 백엔드 협의 대장 (프론트 선행 구현 금지 항목)

| # | 내용 | 프론트 의존 |
|---|---|---|
| BE-1 | pod request 수집 | 없음(Home 면적 균등 고정 — 계약 확정) |
| BE-2 | node/service/workload uid | identity 한계 해소 |
| BE-3 | EndpointSlice targetRef + **Ingress 수집** | 홈 왼쪽 전개의 Ingress 단계, effective 실선 |
| BE-4 | incident correlation 폴백 조회 | 인시던트 배지 링크 |
| BE-5 | Helm target-side summarizer(+헌법 Secret 예외 조항 추가 필요) | Helm 조회 |
| BE-6 | helm.upgrade/rollback/values command 타입(승인 플로우 경유) | Helm 쓰기·에디터 |
| BE-7 | Timeline 통합 조회 API(선택) | Timeline 단순화 |
| BE-8 | Audit 규칙 엔진(inventory 스캔, RCA rule 검증기 동계열) | Audit(백로그) |

### 2.5 유효 지시 재확인 (이미 문서화된 것 — 위반 시 게이트 실패)

1. synthetic/replay gateway·가짜 리소스 이름 금지, 개발·검증은 `cluster-1` 고정
   (`topology-engine-claude.md` §1 반영 확인).
2. focus는 **클릭 → resource-detail fetch 완료 → morph**(120ms 초과 시 pending 표시).
3. zod: 최상위 필수 필드 엄격 + `summary`/`raw` passthrough — 서버 필드 추가에 견딜 것.
4. health = 타일 전체 fill, 좌측 3px 스트립은 namespace 전용, 면적 균등 1.
5. SVG 그라디언트는 `getComputedStyle` 토큰 주입(design guard 문서화 예외), raw hex 금지.
6. 완전성 assert(`열+1=맵`) + 열 한도 초과 시 "나머지 {n}개" 집계 블록.
7. proxy 사용 시 `changeOrigin`+`cookieDomainRewrite`로 세션 쿠키 보존 —
   401 루프 발생 시 우회 코드를 넣지 말고 blocked 보고.

## 3. 요구 보고서 (신규 화면 구현 착수 전 제출)

경로: `docs/spec/frontend/coordination/codex-plan-report-20260711.md`. 형식: 질문 번호
그대로, 모든 주장에 파일경로(:라인)/커밋 해시, 실행 결과는 명령+출력 요약, 모르면 "모름".

- **Q1 게이트 상태**: `npm run check` 각 항목의 현재 결과와 `visual-product` 실행 여부.
- **Q2 실측 증거**: proxy 경유로 `cluster-1` 실데이터 렌더를 확인했는가 — 스크린샷 경로
  또는 미확인 사유. 로그인 세션(쿠키)이 proxy에서 유지되는지 확인 결과.
- **Q3 Home 구현 설계**: (a) treemap 레이아웃 함수 위치·알고리즘·tie-break,
  (b) focus 시퀀스 구현 방식 — fetch-then-morph와 pending 규칙 포함,
  (c) 완전성 assert 삽입 위치, (d) health fill·리본 토큰 주입 방식,
  (e) 사용할 토큰명이 `topology-visual-motion-tokens.md`의 정의와 1:1인지.
- **Q4 IA 계획**: 라우터/사이드바 도입 설계가 §2.1 표와 일치하는지, Home의 클러스터-first
  (미연결 온보딩 → 등록 위저드) 화면 흐름 설계.
- **Q5 향후 2주 계획**: 단계별 산출물·소비 API·완료 게이트·예상일. Home 게이트 규칙 반영 명시.
- **Q6 충돌·리스크·결정 요청**: 이 브리핑과 기존 문서의 충돌, 스스로 모호한 지점,
  결정 필요 항목은 `결정 요청: <질문> / 선택지 / 자체 권고` 형식.

## 4. 이후 절차

보고서 커밋 후 검토자가 `coordination/`에 단계별 상세 지시서(+Q6 결정)를 추가한다.
검토자는 지시 전 반드시 HEAD 변경분을 재검증한다(이 브리핑도 그 절차로 작성됐다).
