---
title: 프론트엔드 기획 문서 전수 분석 보고서
status: audit-complete
date: 2026-07-14
scope: 12개 기획 문서 + references/ui-layer-lab/src/product 구현 코드 381파일
axes: 논리적 모순 / 디자인 시스템 실현 가능성 / UX 전문가 검토 / 중복·하드코딩 검출
---

# 프론트엔드 기획 문서 전수 분석 보고서

분석 대상: VP-015, VP-016, radar-parity-map, codex-directive, codex-progress,
api-needs, api-integration-workorder, reference-contract-map, reference-feature-inventory,
reference-porting-contract, product-data-contract, final-questions +
`references/ui-layer-lab/src/product/` 코드 381파일

---

## 축 1. 논리적 모순

### 1-1. 상세 패널 URL 파라미터 — 문서와 코드 완전 불일치

- **위치**: VP-015 §5.2 vs `filterUrlCodec.ts`
- **문제**: VP-015는 `?detail=<kind>/<ns>/<name>` 형식을 확정했다. 그러나 실제 코드
  `filterUrlCodec.ts`는 완전히 다른 구조를 사용한다: `?resource=<name>&resourceKind=<kind>&tab=<tab>&full=<bool>&node=<id>`.
  슬래시 구분자 기반 단일 파라미터가 아니라 개별 쿼리 파라미터 5개로 분리되어 있다.
  `parseProductDetailQuery` 함수가 이 구조를 파싱하며, 심지어 레거시 `kind` 파라미터
  호환까지 처리하고 있어서 이미 깊이 뿌리 박힌 구현이다.
- **심각도**: **critical**
- **제안**: 둘 중 하나를 정본으로 선택해야 한다. 코드의 다중 파라미터 방식이 이미 테스트를
  포함해 안착했으므로, VP-015 §5.2의 URL 규격을 코드에 맞추어 갱신하는 것이 현실적이다.
  단, `?detail=` 단일 파라미터 방식이 더 간결하다면 코드를 마이그레이션할 수도 있지만
  비용이 크다.

### 1-2. 상세 패널 구현 — "전체화면 덮기"와 Sheet 컴포넌트의 충돌

- **위치**: VP-015 §5.2 (확정) vs `ResourceDetailSheet.tsx`
- **문제**: VP-015는 "열면 곧바로 전체화면으로 목록을 덮는다. 480px 중간 상태 없음.
  드래그 리사이즈 없음. 상태는 닫힘/열림 둘뿐"이라고 확정했다. 그러나 실제 코드는
  shadcn `Sheet` 컴포넌트(`side="right"`)를 사용하며, `full` prop에 따라
  `w-full max-w-none`(전체 폭) 또는 `sm:max-w-2xl`(제한 폭, 약 672px)로 전환한다.
  즉 **코드에 2단계 폭이 존재**한다. 이는 VP-015가 명시적으로 폐기한 "3단계" 패턴의
  잔재다. 또한 Sheet는 오버레이 패턴이지 "목록을 덮는" 전체화면 교체가 아니다.
- **심각도**: **critical**
- **제안**: VP-015 확정에 따라 `ResourceDetailSheet`를 전체화면 오버레이로 재작성해야
  한다. `full` prop을 제거하고, 열림 시 항상 콘텐츠 영역 전체를 차지하도록 변경한다.
  사이드바를 56px 레일로 축소하는 연동 로직도 추가해야 한다.

### 1-3. VP-015가 codex-directive allowlist에 없다

- **위치**: codex-directive §1 allowlist vs VP-015 frontmatter
- **문제**: codex-directive §1은 9개 문서만 활성 allowlist로 지정한다. VP-015와 VP-016은
  이 목록에 **포함되어 있지 않다**. codex-directive는 "allowlist 밖 문서를 참조한
  구현은 게이트 위반"이라고 명시한다. 그러나 VP-015는 "화면 골격의 최상위 정본.
  충돌하면 이 문서가 이긴다"라고 선언한다. 두 문서가 상반된 정본 주장을 한다.
- **심각도**: **critical**
- **제안**: codex-directive는 2026-07-11에 작성됐고 VP-015/016은 2026-07-14에 작성됐다.
  시간순으로 VP-015가 후행한다. codex-directive의 allowlist를 갱신하여 VP-015, VP-016,
  radar-parity-map을 추가해야 한다. 또는 codex-directive에 "이후 spec-approved 문서는
  자동 편입"이라는 조항을 추가한다.

### 1-4. 유령파드(ghost pod) — 낙관적 vs 비낙관적 충돌

- **위치**: VP-016 S13 vs codex-directive §3 vs final-questions.md
- **문제**: VP-016 S13은 "낙관적 고스트 파드"를 핵심 장면으로 정의한다 — "제출 즉시
  물리 뷰에 점선 유령 파드가 뜬다." 그러나 codex-directive §3 기본 결정 규칙은
  "receipt 기반 비낙관 처리"를 명시하고, final-questions.md도 "receipt 기반 비낙관 처리;
  possibly-sent POST 자동 재전송 금지"를 확정 구현 기본값으로 기록했다. 유령파드는
  본질적으로 낙관적 UI 패턴(서버 확인 전에 결과를 예측하여 표시)이므로 비낙관 규칙과
  직접 충돌한다.
- **심각도**: **major**
- **제안**: "비낙관"의 범위를 정밀하게 재정의해야 한다. 가능한 해석: (1) "비낙관"은
  **데이터 상태를 확정 처리하지 않는다**는 의미이고, 유령파드는 "예정(pending)"이라는
  별도 상태로 표시하는 것이므로 모순이 아니다. 이 해석을 채택한다면 codex-directive
  또는 VP-016에 명시적으로 "유령파드는 비낙관 패턴의 예외가 아니라 pending 상태의
  시각적 표현"이라고 기록해야 한다. (2) 유령파드를 폐기하고 `submitted` 이벤트 수신
  후에만 파드를 표시한다. 제품의 데모 임팩트를 고려하면 (1)이 합리적이다.

### 1-5. VP-017 모션 규격 — 문서는 존재하나 제품 코드 반영 대기

- **위치**: VP-015 §4.6, VP-016 S0/S4/S6/S9/S13
- **문제**: VP-015는 "정확한 수치는 VP-017 모션 규격에 있다"고 반복 참조하고,
  VP-016 S0은 VP-017 전체를 구현하는 슬라이스다. 현재
  `docs/spec/frontend/vp-017-motion-spec.md`는 존재한다. 다만 감사 범위인
  `references/ui-layer-lab/src/product`에는 VP-017의 `useCameraMorph`, `useStagger`,
  모션 토큰 계층이 반영되어 있지 않다. 현재 repo의 `frontend/src/shared/flow`에는
  `@xyflow/react`와 `elkjs` 공통 그래프 계층이 이미 있으므로, 남은 간극은 의존성 설치가
  아니라 제품 화면 슬라이스 반영이다.
- **심각도**: **major**
- **제안**: VP-017을 정본으로 삼아 제품 코드에 모션 계층을 착륙시킨다. CSS 토큰
  (`--motion-layout`, `--ease-spring`, `--stagger-node`, `--stagger-pod` 등), 훅 API
  (`useCameraMorph`, `useStagger`), reduced-motion 대응을 한 모듈에서 제공하고,
  화면 컴포넌트는 이 모듈만 사용하게 한다.

### 1-6. 사이드바 폭 수치 불일치

- **위치**: VP-015 §5.1 vs `tokens.css`
- **문제**: VP-015는 사이드바 펼침 상태를 **200px**, 레일을 **56px**로 명시한다.
  `tokens.css`는 `--product-sidebar-width: 11rem`(=176px)과
  `--product-sidebar-width-collapsed: 3.5rem`(=56px)을 정의한다. 레일은 일치하지만
  펼침 상태가 **200px vs 176px으로 24px 차이**난다.
- **심각도**: **minor**
- **제안**: 둘 중 하나를 정본으로 확정한다. 176px(11rem)은 shadcn sidebar의 기본값에
  가깝고 이미 코드에 안착했으므로, VP-015를 176px(또는 "11rem")으로 정정하는 것이
  현실적이다.

### 1-7. Radar 버전 불일치

- **위치**: radar-parity-map frontmatter vs reference-feature-inventory §1
- **문제**: radar-parity-map은 "v1.5.7, 643 commits"를 소스로 명시한다.
  reference-feature-inventory는 "런타임 버전 1.8.1"을 관찰 기반으로 기록한다.
  같은 Radar를 서로 다른 버전으로 분석한 셈이다.
- **심각도**: **major**
- **제안**: 어느 버전이 현재 기준인지 통일해야 한다. radar-parity-map은 소스를 직접
  클론해 분석했고, feature-inventory는 실행 인스턴스를 관찰했다. 실행 인스턴스가
  1.8.1이면 소스도 해당 태그/커밋으로 재확인해야 한다. API가 두 버전 사이에 바뀌었을
  가능성이 있으며, 이 경우 매핑이 어긋난다.

### 1-8. 클러스터 목록 API 필드 — 스키마와 스펙의 불일치

- **위치**: VP-016 S1 (BQ-069) vs `schemas.ts` FleetClusterSummarySchema
- **문제**: VP-016 S1은 BQ-069를 `{id, name, provider, connection_status,
  server_count, pod_count, app_count, open_incidents, last_seen_at}`로 정의한다.
  실제 코드 `schemas.ts`의 `fleetClusterSummarySchema`는 `{cluster_id, name, health,
  pods_running, pods_total, nodes_ready, nodes_total, open_incidents, restarts_recent,
  cpu_pct, mem_pct, last_seen_at}`로 정의한다. **provider** 필드가 코드에 없고,
  **connection_status** 대신 **health**가 있고, **server_count** 대신 **nodes_ready/
  nodes_total**이 있고, **app_count**가 코드에 없으며, 코드에만 **cpu_pct/mem_pct/
  restarts_recent**가 있다.
- **심각도**: **major**
- **제안**: 코드의 스키마는 실제 백엔드 응답에 맞춰 작성됐을 가능성이 높다. VP-016의
  BQ-069 정의를 코드 스키마 기준으로 갱신하거나, 두 스키마 중 어떤 것이 "클러스터 카드"에
  필요한 최소 필드인지 재검토해야 한다. 특히 `provider` 필드는 VP-015 §6.1의 "provider
  로고" 요구사항에 필수인데 코드에 없으므로 추가해야 한다.

### 1-9. VP-016 S6 제목의 자기모순

- **위치**: VP-016 §2, S6 헤더
- **문제**: S6 항목의 제목은 "상세 = **전체화면 덮기** (2상태)"이지만, 본문 첫 줄에
  "이전 계획(3단계 패널)은 폐기됐다"고 적혀 있다. 그런데 VP-016 §1 슬라이스 목록에서
  S6의 한 줄 설명은 여전히 "상세 패널 3단계"라고 적혀 있다. 같은 문서 안에서
  목록(§1)과 상세(§2)가 모순된다.
- **심각도**: **minor**
- **제안**: §1의 S6 설명을 "상세 = 전체화면 덮기 (2상태)"로 일치시킨다.

### 1-10. 필터 API 경로 불일치

- **위치**: VP-015 §3.3 vs VP-016 S3 vs radar-parity-map §8 vs 코드
- **문제**: VP-015는 `GET /filter-facets`(BQ-073)를 정의한다. radar-parity-map §8은
  같은 BQ-073을 기록한다. 그러나 코드의 `resource-filters.ts`는
  `RESOURCES_FILTER_FACETS_PATH`와 `RESOURCE_LABEL_FACETS_PATH`라는 별도 경로 상수를
  사용하며, facet과 label을 **분리된 엔드포인트**로 호출한다. 단일 `/filter-facets`가
  아니라 최소 2개 엔드포인트다. 또한 radar-parity-map은 `/api/topology`(슬래시 api 포함)
  형태를 쓰고, VP-015는 `/topology`(api 없음) 형태를 쓴다.
- **심각도**: **major**
- **제안**: API 경로의 정본을 `api-integration-workorder`와 실제 `url.ts` 상수로 통일하고,
  VP-015/016의 예시 경로를 "개념적 설명"으로 명시하거나 실제 경로로 갱신한다.

### 1-11. 확정 방향 일관성 검증 결과

- **"상세패널=전체화면 덮기"**: VP-015 §5.2에 확정. VP-016 S6에 반영. 그러나 제품 코드에는
  아직 Sheet 사이드 패널 구조가 남아 있다. → 불일치
- **"필터=줌 SLG 스타일"**: VP-015 §0, §4.6에 확정. VP-016 S4, S9에 반영.
  감사 범위 제품 코드에는 물리 뷰와 VP-017 모션 계층 반영이 대기 중이다. → 반영 예정
- **"유령파드 패턴"**: VP-016 S13에 확정. **codex-directive 비낙관 규칙과 충돌**
  (1-4 참조). 제품 코드 반영이 대기 중이다. → 모순

---

## 축 2. 디자인 시스템 실현 가능성

### 2-1. SLG 다이나믹 줌 — shadcn으로 불가, 전체 커스텀 필요

- **위치**: VP-015 §4.6, VP-016 S0/S4
- **문제**: "카메라가 내려가는 것처럼" 보이는 줌 전환, 예고(foreshadow) 블록이 커지며
  서버 카드가 되는 FLIP 모프, 파드 scale 0.3→1.14→1.0 오버슈트, 70ms/32ms 스태거 —
  이 모든 것은 shadcn/ui의 범위를 **완전히 벗어난다**. shadcn은 정적 UI 프리미티브
  (Button, Card, Sheet 등)를 제공하며, 애니메이션 시스템을 포함하지 않는다.
- **심각도**: **major** (구현 가능하지만 공수가 크다)
- **제안**: VP-016 S0이 이미 올바른 접근을 정의했다. 현재 repo 구조에 맞춘 제품 모션
  계층에 `useCameraMorph.ts`, `useStagger.ts`, 모션 토큰을 만들고 이것을 모든 컴포넌트가
  사용한다. 이는 shadcn "위에" 얹는 별도 모션 계층이다. 구현 시 고려할 점:
  (a) FLIP 애니메이션은 `requestAnimationFrame` + `Web Animations API`로 구현하되,
  React 18의 동시성 모드와 충돌하지 않도록 `useLayoutEffect`와 `flushSync`를
  신중히 사용해야 한다.
  (b) CSS `@keyframes`가 아닌 JS 기반 스프링 함수가 필요하다.
  (c) `prefers-reduced-motion: reduce` 시 모든 것을 끄는 미디어 쿼리는 `foundation.css`에
  이미 있으나, JS 훅에서도 이를 존중해야 한다.

### 2-2. 유령파드 — 완전 커스텀 컴포넌트

- **위치**: VP-016 S13
- **문제**: "점선 유령 파드(숨쉬듯 opacity 왕복) → applied 시 실선 + 채움 페이드 인 →
  실패 시 빨갛게 흔들리고 사라짐." 이 3상태 전이는 어떤 기존 컴포넌트로도 조합할 수
  없다. SVG 또는 Canvas 위에 직접 그려야 하며, React Flow의 커스텀 노드로 구현하는
  것이 적합하다.
- **심각도**: **minor** (커스텀이 필연적이고 VP-016이 이미 인지)
- **제안**: React Flow 커스텀 노드로 `GhostPodNode`를 만들고, `status` prop에 따라
  `pending`(점선+breathing) / `applied`(실선+채움) / `failed`(빨강+shake) 세 상태를
  CSS 변수와 data-attribute로 전환한다.

### 2-3. 트레이스 워터폴 — 완전 커스텀 컴포넌트

- **위치**: VP-016 S13
- **문제**: "막대 폭 = 실제 시간"인 워터폴 다이어그램. Chrome DevTools Network 탭의
  타이밍 바와 유사하다. shadcn에 이런 컴포넌트는 없다.
- **심각도**: **minor**
- **제안**: SVG 기반 `TraceWaterfall` 컴포넌트를 만든다. 데이터 형태는
  `Array<{label, startMs, endMs, status}>`. 줌/스크롤은 불필요(단계 6~8개로 고정).
  shadcn `Accordion` 안에 넣어 "레일 클릭 시 펼침"을 구현하면 된다.

### 2-4. 물리 뷰 — React Flow + shadcn 통합 방법

- **위치**: VP-015 §4, VP-016 S4
- **문제**: React Flow는 자체 스타일 시스템을 갖고 있다. shadcn 토큰과 통합하려면
  React Flow의 커스텀 노드 안에서 shadcn 프리미티브를 사용해야 한다. 이것이 가능한지.
- **심각도**: **minor** (가능하지만 주의 필요)
- **제안**: React Flow의 `nodeTypes`에 커스텀 렌더러를 등록하면 임의의 React 컴포넌트를
  노드로 그릴 수 있다. 서버 카드는 shadcn `Card` 기반, CPU 막대는 shadcn `Progress` 기반,
  파드는 `div` + CSS 변수로 구현 가능하다. React Flow의 기본 테마 CSS를 제거하고
  우리 `tokens.css` 변수만 사용하도록 한다. ELK 레이아웃은 Web Worker에서 실행하여
  메인 스레드 블로킹을 방지한다(Radar도 `layout.worker.ts`를 사용).

### 2-5. 시간 스크럽(TimelineStrip) — 완전 커스텀

- **위치**: radar-parity-map §3-1, VP-016 S11
- **문제**: 히스토그램 + 드래그 가능한 윈도우 밴드 + 범위 선택기. shadcn에 없다.
  Radar에서 이식할 수 있으나 우리 토큰으로 재스타일링해야 한다.
- **심각도**: **minor**
- **제안**: Radar의 `scrubber-math.ts`(순수 함수, React 무관)를 이식하고, 렌더링은
  SVG + shadcn `Button` 조합으로 재작성한다. 인시던트 마커와 재생 버튼은 우리 추가분.

### 2-6. 커스텀이 필요한 전체 목록 정리

| 컴포넌트 | shadcn 가능? | 커스텀 수준 |
|---|---|---|
| 서버 카드 (노드) | 부분 (Card 기반) | 중 — 파드 그리드, CPU 막대 커스텀 |
| 파드 셀 (크기 고정, 채움색, 배지) | 불가 | 높음 — div + CSS 변수 |
| 유령파드 | 불가 | 높음 — 3상태 전이 애니메이션 |
| FLIP 카메라 모프 | 불가 | 높음 — 순수 JS 훅 |
| 스태거 착지 | 불가 | 중 — CSS @keyframes + JS 딜레이 |
| TimelineStrip | 불가 | 높음 — SVG + 드래그 |
| 트레이스 워터폴 | 불가 | 중 — SVG 막대 |
| 단계 레일 (6칸 체크포인트) | 부분 (Progress 기반) | 중 — 커스텀 체크포인트 |
| 하단 독 | 부분 (Tabs 기반) | 중 — 리사이즈, 독 셸 |
| 관계 뷰 그래프 | 불가 (React Flow) | 높음 — 노드/엣지 렌더러 |
| 태그형 검색 | 대체로 가능 (Command) | 중 — 칩 그룹, 타입 구분 |

---

## 축 3. UX 전문가 검토

### 3-1. 물리 뷰 3층 구조의 정보 밀도

- **위치**: VP-015 §2 공용 3층 골격
- **문제**: 한 화면에 1층(검색+칩+카운트), 2층(320px 그래프 — 서버 카드×N, 파드×12),
  3층(표+스파크라인)이 동시에 표시된다. 1080p(1920×1080) 기준으로 사이드바 176px을
  빼면 콘텐츠 영역은 1744px × 1080px. 1층(~60px) + 2층(320px) + 3층(나머지 ~700px)은
  가능하지만 **매우 빽빽하다**. 여기에 하단 독이 열리면 3층이 쪼그라든다.
- **심각도**: **minor**
- **제안**: 이미 2층 접기(`⌃` 버튼, `graph=0`)가 설계되어 있다. 추가로:
  (a) 3층 표의 기본 높이를 화면 높이 40%로 제한하고 스크롤하는 것을 고려한다.
  (b) 2층과 3층 사이에 드래그 구분선을 넣어 사용자가 비율을 조절할 수 있게 한다.
  (c) 하단 독이 열릴 때 2층을 자동으로 접는 옵션도 검토한다.

### 3-2. 자동 뷰 전환(물리→관계)의 인지 부하

- **위치**: VP-015 §4.4
- **문제**: 앱 칩을 추가하면 물리 뷰가 자동으로 관계 뷰로 바뀐다. 6초 후 사라지는
  힌트와 되돌리기 버튼이 있지만, **처음 사용하는 사람**에게는 "내가 안 바꿨는데
  화면이 바뀌었다"는 경험이 된다.
- **심각도**: **minor**
- **제안**: VP-015가 이미 좋은 해결책을 정의했다(힌트 + 수동 핀 고정). 추가로:
  (a) 6초는 첫 사용 시 짧을 수 있다. 첫 3회는 10초, 이후 6초로 점진 감소를 고려한다.
  (b) 힌트가 사라져도 토글 버튼의 활성 상태(●)로 현재 뷰를 알 수 있게 한다.

### 3-3. J/K 네비게이션의 발견 가능성 부족

- **위치**: VP-015 §5.2
- **문제**: 상세 패널이 전체화면이므로 목록을 동시에 볼 수 없고, J/K로 다음/이전
  항목을 이동하는 것이 유일한 대안이다. 그러나 J/K는 Vim 규약으로 대부분의 DevOps
  엔지니어가 알더라도 **UI에 아무런 힌트가 없다**.
- **심각도**: **major**
- **제안**: (a) 상세 패널 상단에 `← 이전 (K) · 3/47 · 다음 (J) →` 형태의 네비게이션
  바를 추가한다. 클릭으로도 이동 가능하게 하면 키보드를 모르는 사용자도 사용할 수
  있다. (b) 첫 상세 열림 시 "J/K로 이동할 수 있습니다" 원타임 힌트를 표시한다.

### 3-4. 전체화면 상세에서의 맥락 손실

- **위치**: VP-015 §5.2
- **문제**: 상세가 목록을 완전히 덮으므로, 사용자가 **여러 리소스를 비교**하려면
  J/K로 왔다 갔다 해야 한다. 이전 항목의 수치를 기억해야 비교가 가능하다.
- **심각도**: **minor**
- **제안**: (a) 상세 패널 내에서 "비교 모드"를 나중에 추가할 여지를 남긴다.
  (b) 상세 패널 하단에 이전 항목의 핵심 수치(CPU, 상태)를 작게 표시하는 "비교 힌트"
  영역을 고려한다. (c) 당장은 J/K + 네비게이션 바로 충분하지만, 사용자 테스트 후
  결정한다.

### 3-5. AI 패널과 상세 패널 동시 열림 시 좁은 화면 처리

- **위치**: VP-015 §5.5
- **문제**: 896px 미만에서 AI를 열면 상세가 자동으로 닫히고 토스트가 뜬다.
  이는 합리적이지만, **1024px 근처 화면**(많은 노트북)에서는 상세(480px) + AI(420px)
  + 레일(56px) = 956px으로 간신히 들어가고, 상세가 480px 최소 폭으로 매우 좁아진다.
- **심각도**: **minor**
- **제안**: 1024px 이하에서는 AI 폭을 360px(최소)으로 자동 축소하거나, 상세와 AI를
  탭으로 전환하는 모드를 추가한다.

### 3-6. 에러/빈 상태 처리 일관성 — 양호

- **위치**: 전 코드
- **문제**: `ProductStateScreen`이 loading/forbidden/error를 일관되게 처리한다.
  `HomeFailureScreen`, `ResourceDetailSheet`의 에러 처리도 `ApiError.kind`에 따라
  적절히 분기한다. `reference-porting-contract` §3.2의 오류 의미 테이블이 잘 반영됐다.
- **심각도**: 해당 없음 (양호)
- **제안**: 유지. 다만 `ProductStateScreen`에 `offline` 상태 (`network` 에러 시)를 추가로
  고려한다. 현재 i18n `en.ts`에 `state.offline.body`가 있지만 사용 여부를 확인해야 한다.

### 3-7. 키보드 접근성 — 부분적 구현

- **위치**: 코드 전반
- **문제**: `foundation.css`에 `forced-colors`와 `prefers-reduced-motion` 미디어 쿼리가
  있고, `ProductShell.tsx`에 skip-to-content 링크가 있다. `sheet.tsx`에 `closeLabel`
  prop이 있다. `ResourcesPage.keyboard.test.tsx`가 존재한다. 기반은 갖춰져 있으나,
  VP-015 §5.2가 요구하는 **포커스 트랩**(상세 열림 시)과 **Esc 시 원래 행 포커스 복귀**는
  코드에서 확인되지 않는다.
- **심각도**: **major**
- **제안**: (a) 상세 패널 열림 시 `Sheet`의 포커스 트랩이 shadcn에 기본 포함되어 있는지
  확인한다(Radix Dialog 기반이면 자동). (b) 닫힘 시 `onOpenChange` 콜백에서 원래 행의
  DOM 요소에 `.focus()`를 호출하는 로직을 추가한다. (c) J/K 이동 시에도 포커스가
  적절히 관리되는지 테스트한다.

---

## 축 4. 중복/하드코딩 검출

### 4-1. 매직 넘버 — 문서에만 있고 코드 상수화 안 됨

- **위치**: VP-015 전체 vs `tokens.css`
- **문제**: VP-015에 정의된 수치가 CSS 변수나 코드 상수로 선언되지 않았다:

| 수치 | 용도 | 코드 상수 존재? |
|---|---|---|
| 320px | 2층 그래프 고정 높이 | 없음 |
| 12개 | 서버당 최대 파드 수 | 없음 |
| 420px | AI 패널 기본 폭 | 없음 |
| 360~640px | AI 패널 리사이즈 범위 | 없음 |
| 480px | 상세 패널 최소 폭 | 없음 |
| 896px | AI+상세 동시 열림 최소 뷰포트 | 없음 |
| 200px (or 176px) | 사이드바 펼침 폭 | `--product-sidebar-width: 11rem` |
| 56px | 사이드바 레일 폭 | `--product-sidebar-width-collapsed: 3.5rem` |
| 14px | 착지 오프셋 | 없음 |
| 70ms / 32ms | 노드/파드 스태거 딜레이 | 없음 |
| 320ms | 패널 전이 시간 | 없음 |
| 300ms | AI 패널 슬라이드 시간 | 없음 |
| 6초 | 자동 전환 힌트 표시 시간 | 없음 |
| 120ms | 파드 hover 확대 시간 | 없음 |
| 500ms | CPU 막대 스프링 전이 | 없음 |

- **심각도**: **major**
- **제안**: VP-017 기준으로 이 모든 수치를 CSS 변수(`--motion-*`, `--layout-*`)와
  JS 상수(`LAYOUT_CONSTANTS`)로 선언하고, 코드에서 이 상수만 참조하도록 한다.
  하드코딩된 숫자를 컴포넌트에 직접 쓰면 나중에 조율할 때 전수 검색이 필요하다.

### 4-2. 클러스터 ID/선택의 이중 관리

- **위치**: `ClusterScopeProvider.tsx` vs `filterUrlCodec.ts`
- **문제**: 클러스터 선택이 두 곳에서 관리된다:
  (a) `ClusterScopeProvider` — 전역 클러스터 범위 컨텍스트. `clusterScopeContract.ts`에
  정의된 계약. API 호출 시 `clusterId`를 주입한다.
  (b) `filterUrlCodec.ts`의 `state.common.clusters` — URL 기반 필터로 클러스터를 선택한다.
  VP-015 §0의 "필터가 곧 줌"에 따르면 클러스터 선택도 **필터의 일부**여야 한다.
  그러나 현재 코드는 `ClusterScopeProvider`가 단일 클러스터를 선택하고(드롭다운),
  필터 시스템은 이와 별개로 다중 클러스터를 OR로 필터한다. **두 시스템의 동기화
  규칙이 불명확하다.**
- **심각도**: **major**
- **제안**: VP-015의 설계 의도대로 "필터 칩의 클러스터 = 현재 클러스터 범위"가 되어야
  한다. `ClusterScopeProvider`를 `UnifiedFilterProvider`에 통합하거나, 적어도 둘의
  동기화 규칙을 문서화해야 한다. `api-needs.md` §4의 `BE-Gap-ApplicationsClusterScope`가
  이 문제의 백엔드 측면이다.

### 4-3. 상태 표현의 용어 분산

- **위치**: 코드 전반
- **문제**: "상태"를 표현하는 개념이 여러 이름으로 산재한다:

| 코드 위치 | 필드/타입 | 값 |
|---|---|---|
| `schemas.ts` | `FleetHealth` | healthy/warning/critical/stale/unknown |
| `cluster-schemas.ts` | `ClusterAgentStatus` | (별도 타입) |
| `cluster-connection-schemas.ts` | `ClusterConnectionStatus` | (별도 타입) |
| VP-015 §4.2 | 파드 상태 | CrashLoop/Pending/재시작 반복 |
| VP-015 §4.2 | 파드 사용률 | 0~60% 회색/60~80% 앰버/80%+ 빨강 |
| VP-016 S1 | `connection_status` | (VP 고유) |
| product-data-contract §2 | `HealthStatus` | (별도 체계) |
| product-data-contract §2 | `SyncStatus` | (별도 체계) |

같은 "건강한가?"라는 질문에 대해 5개 이상의 타입이 존재한다.

- **심각도**: **minor** (각각 다른 맥락에서 사용되므로 반드시 중복은 아님)
- **제안**: product-data-contract §2의 `HealthStatus`와 `SyncStatus`를 정본으로 삼고,
  각 스키마 파일이 이를 참조하도록 통일한다. 적어도 "이 타입은 저 타입과 어떻게
  다른가"를 한 곳에 정리해야 한다.

### 4-4. 파드 사용률 색상 임계값 — 코드에 정의 없음

- **위치**: VP-015 §4.2 vs `tokens.css`
- **문제**: VP-015는 파드 채움색을 "0~60% 회색 / 60~80% 앰버 / 80%+ 빨강"으로 정의한다.
  `tokens.css`에는 `--status-healthy`, `--status-warning`, `--status-stale`,
  `--status-unknown`은 있지만, **사용률 기반 색상 변수가 없다**. 60%, 80% 임계값도
  상수로 정의되어 있지 않다.
- **심각도**: **major**
- **제안**: `tokens.css`에 `--color-usage-low`, `--color-usage-medium`,
  `--color-usage-high`를 추가하고, JS 상수에 `USAGE_THRESHOLD_MEDIUM = 0.6`,
  `USAGE_THRESHOLD_HIGH = 0.8`을 선언한다.

### 4-5. API barrel 파일의 과도한 크기

- **위치**: `api/index.ts`
- **문제**: `index.ts`는 200개 이상의 export를 한 파일에서 재수출한다.
  `api-needs.md` §1.13도 "index.ts 병목"을 명시적으로 언급했고, §1.15에서
  도메인별 barrel 분리를 승인했다. 실제로 `barrels/ai.ts`, `barrels/catalog.ts` 등
  6개 barrel이 이미 생성됐다.
- **심각도**: **minor** (개선 진행 중)
- **제안**: 현재 6개 barrel로 분리가 시작됐지만 아직 `index.ts`가 모두 재수출한다.
  각 화면이 barrel을 직접 import하도록 전환하고, `index.ts`는 barrel의 재수출만
  남긴다. 최종적으로 `index.ts`를 제거하고 직접 barrel import를 표준으로 한다.

### 4-6. Synthetic/fixture 데이터 — 제품 코드에는 없음 (양호)

- **위치**: `references/ui-layer-lab/src/product/` 전체
- **문제**: `reference-porting-contract` §1이 금지하는 synthetic/fixture 데이터가
  제품 코드(비테스트)에 있는지 확인했다. `live.ts`에 "Tokens and synthetic fallback
  data are intentionally not accepted here"라는 주석이 있어 **명시적으로 거부**하고
  있다. `en.ts`에도 "No synthetic state is substituted"라는 오프라인 메시지가 있다.
  테스트 파일(`*.test.ts`, `*.testSupport.ts`)의 fixture 사용은 정상적이다.
- **심각도**: 해당 없음 (양호)
- **제안**: 유지. 좋은 관행이다.

### 4-7. 색상값의 중앙 관리 — 양호하나 확장 필요

- **위치**: `tokens.css`
- **문제**: 모든 색상이 CSS 변수로 정의되고, light/dark 테마가 `:root`와 `.dark`로
  분리되어 있다. `oklch` 색 공간을 일관되게 사용한다. 하드코딩된 hex 값은 없다.
  그러나 VP-015 §4.2의 파드 사용률 색상(4-4 참조)과 VP-015 §4.6의 모션 토큰(4-1 참조)은
  아직 추가되지 않았다.
- **심각도**: **minor**
- **제안**: 위의 4-1, 4-4 제안을 반영하여 `tokens.css`를 확장한다.

### 4-8. React Flow/ELK — 제품 코드 범위 반영 대기

- **위치**: `references/ui-layer-lab/src/product` vs `frontend/src/shared/flow`
- **문제**: VP-015 §4, final-questions Q1에서 `@xyflow/react + elkjs`를 확정했다.
  현재 repo의 `frontend/package.json`에는 `@xyflow/react`, `elkjs`가 있고
  `frontend/src/shared/flow/index.tsx`가 ELK 자동 배치와 React Flow 래퍼를 제공한다.
  반면 감사 범위인 `references/ui-layer-lab/src/product`에는 이 공통 그래프 계층을
  소비하는 물리 뷰 구현이 없다. `ResourcesGraphShell.tsx`는 그래프 자리에 머문다.
- **심각도**: **major** (코어 기능 제품 반영 대기)
- **제안**: VP-016 S4의 전제 조건인 S0(모션 기반)부터 시작하되, 의존성 설치가 아니라
  기존 `frontend/src/shared/flow` 패턴을 제품 화면 슬라이스에 연결하는 작업으로 본다.
  라이선스와 release gate는 화면 구현 시점에 다시 확인한다.

---

## 요약 — 심각도별 집계

| 심각도 | 건수 | 주요 항목 |
|---|---|---|
| **critical** | 3 | 상세 URL 포맷 불일치, 상세 패널 Sheet vs 전체화면, VP-015 allowlist 누락 |
| **major** | 11 | 유령파드-비낙관 충돌, VP-017 문서-제품 코드 간극, Radar 버전 혼재, API 필드 불일치, 필터 API 경로, 매직넘버 미상수화, 클러스터 이중관리, 파드 색상 미정의, 물리 뷰 제품 반영 대기, 키보드 접근성 미완, J/K 발견성 부족 |
| **minor** | 10 | 사이드바 폭 차이, S6 제목 자기모순, SLG 모션 커스텀 필요, 유령파드·워터폴 커스텀, 정보 밀도, 자동 전환 인지부하, 맥락 손실, 좁은 화면 AI, 상태 용어 분산, barrel 과대 |

---

## 우선 행동 항목 (권장 순서)

1. **codex-directive allowlist 갱신** — VP-015, VP-016, radar-parity-map 추가 (critical, 5분)
2. **VP-015 §5.2 URL 포맷을 코드 기준으로 갱신** — `?resource=&resourceKind=` 형태로 (critical, 30분)
3. **ResourceDetailSheet를 전체화면 오버레이로 재작성** — Sheet side panel → 전체화면 교체 (critical, 반나절)
4. **VP-017 모션 규격 제품 코드 반영** — 모션 토큰 + 훅 + reduced-motion (major, 반나절)
5. **유령파드-비낙관 규칙 충돌 해소** — 용어 재정의 또는 패턴 조정 (major, 1시간)
6. **Radar 기준 버전 통일** — 1.5.7 vs 1.8.1 확인 (major, 1시간)
7. **BQ-069 스키마 통일** — VP-016 vs 코드 필드 정리, provider 필드 추가 (major, 2시간)
8. **매직넘버를 CSS/JS 상수로 추출** — `tokens.css` + `LAYOUT_CONSTANTS.ts` (major, 반나절)
9. **클러스터 선택 이중관리 정리** — ClusterScope와 Filter 동기화 규칙 문서화 (major, 2시간)
10. **J/K 네비게이션 UI 힌트 추가** — 상세 패널 상단 네비게이션 바 (major, 2시간)
