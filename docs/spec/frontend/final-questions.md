---
title: 골모드 최종 질문 라운드
status: resolved-by-default
date: 2026-07-11
issued_at: 2026-07-11 16:29 KST
default_at: 2026-07-12 16:29 KST
questions: 4
authority: codex-directive-goalmode-20260711.md §2
resolved_at: 2026-07-12 16:29 KST
---

# 골모드 최종 질문 라운드

> 기한까지 별도 답변이 없어 문서에 적힌 자체 권고를 기본값으로 확정했다. Q1은
> `@xyflow/react + elkjs`, Q2는 `@tanstack/react-virtual`, Q3은 backend capability 완료 뒤
> editor·diff·terminal dependency 도입, Q4는 제품 소유 독립 구현이다. 이 결정은 dependency를
> 즉시 설치하라는 뜻이 아니며 해당 화면의 실제 구현 시점에 release gate와 라이선스 검증을 거친다.

이 문서는 P1·P2 이후 남은 결정 요청을 한 번에 모은 **유일한 질문 라운드**다. 답변이 일부만
오면 답하지 않은 항목에는 각 권고안을 적용한다. `2026-07-12 16:29 KST`까지 답변이 없으면 네
항목 모두 권고안으로 확정하고, 이후 새 모호함은 goalmode §3으로 자체 해소한다. 추가 질문
라운드는 만들지 않는다.

이미 확정된 IA, provider-neutral 계약, Backend gap 미노출, synthetic 금지, 실 API 전용,
light/dark, keyboard·reduced-motion, 30초 polling fallback은 다시 묻지 않는다.

## Q1. 대규모 topology graph의 interaction·layout stack

### 결정 요청

노드 선택·다중 선택·pan/zoom·keyboard 대체 목록·동적 node 크기·namespace sub-flow·edge routing을
담당할 graph stack과 라이선스 허용 범위를 선택한다.

### 선택지

1. `@xyflow/react` + `elkjs`: 기능 적합도가 가장 높다. React Flow는 MIT, ELKJS는 EPL-2.0이다.
   ELKJS는 수정하지 않고 worker 경계에서 layout 계산만 수행하며 EPL 고지를
   `THIRD_PARTY_NOTICES`에 포함한다.
2. `@xyflow/react` + `@dagrejs/dagre`: 모두 MIT지만 compound/sub-flow와 외부 연결 edge에서
   알려진 layout 한계가 있어 추가 routing 코드가 필요하다.
3. dependency 없이 자체 SVG/Canvas graph: 제품 접근성·LOD·layout 검증 범위가 크게 늘어난다.

### 자체 권고

**1번.** 외부 기준 화면의 compound topology와 향후 multi-cluster graph를 한 engine으로 유지할 수
있다. EPL-2.0 허용이 불가능하다는 답변이 있을 때만 2번으로 전환한다. 공식 근거:
[React Flow layouting](https://reactflow.dev/learn/layouting/layouting),
[React Flow ELK example](https://reactflow.dev/examples/layout/elkjs).

## Q2. 대규모 표·로그·AI 대화 virtualization

### 결정 요청

현재 설치된 `@tanstack/react-table`에는 windowing이 없다. Resources table, snapshot log, evidence,
AI conversation이 커져도 DOM 수와 frame budget을 제한할 공통 virtualization dependency를 정한다.

### 선택지

1. `@tanstack/react-virtual`을 제품 공통 primitive로 추가하고 table/list/log가 같은
   `VirtualViewport` contract를 사용한다.
2. 화면별 수동 windowing을 구현한다.
3. pagination만 사용하고 virtualization은 성능 문제가 발생한 뒤 추가한다.

### 자체 권고

**1번.** 기존 TanStack table과 결합하기 쉽고 headless라 벤치마크 최소선의 시각 체계를 침범하지
않는다. MIT이며 현재 npm 확인 version은 `3.14.5`다. 공식 근거:
[TanStack React Virtual](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual).

## Q3. editor·diff·terminal dependency 설치 시점

### 결정 요청

P2의 YAML editor/diff와 exec terminal은 현재 Backend gap 때문에 제품에서 미노출이다. 계약이 없는
기능의 무거운 dependency를 지금 설치할지, API capability가 실제 완료된 뒤 설치할지 정한다.

### 선택지

1. 지금은 둘 다 설치하지 않는다. YAML/diff 계약이 완료되면 CodeMirror 6 +
   `@codemirror/merge`, exec transport가 완료되면 `@xterm/xterm`을 각각 도입한다.
2. CodeMirror 6만 먼저 설치하고 xterm은 exec capability까지 연기한다.
3. 두 stack을 모두 선설치하고 API 없이 shell부터 만든다.

### 자체 권고

**1번.** 존재하지 않는 capability의 UI와 production dependency를 만들지 않는 원칙에 맞는다.
선정 후보는 둘 다 MIT이며 현재 npm 확인 version은 `@codemirror/merge 6.12.2`,
`@xterm/xterm 6.0.0`이다. 공식 근거:
[CodeMirror changelog](https://codemirror.net/docs/changelog/),
[xterm.js download guide](https://xtermjs.org/docs/guides/download/).

## Q4. 외부 기준 저장소 코드 이식 범위

### 결정 요청

기능·레이아웃·interaction 동등성을 만들 때 Apache-2.0 원본 코드를 실제로 복사할 수 있는 범위를
정한다. 어느 선택이든 외부 브랜드 문자열·provider 분기·원본 API DTO는 이식하지 않는다.

### 선택지

1. 동작과 구조를 근거로 제품 소유 코드를 독립 구현한다. 실제 원본 파일 복사는 기본적으로 하지
   않고, 불가피한 알고리즘만 파일 단위로 별도 검증 후 이식한다.
2. 재사용 효과가 큰 component/hook을 선별 이식하고 파일별 원본·commit·변경 요약을
   `THIRD_PARTY_NOTICES`에 기록한다.
3. 화면 코드를 광범위하게 이식한 뒤 우리 adapter와 디자인 체계에 맞춰 수정한다.

### 자체 권고

**1번.** provider-neutral canonical state, 제품 소유 primitive, API 소유 경계를 가장 깨끗하게
유지하고 reference brand·DTO 유입 위험을 줄인다. 실제 원본 코드가 들어오는 예외에는 Apache-2.0
LICENSE/NOTICE와 수정 고지를 적용한다.

## 질문과 무관하게 확정된 구현 기본값

| 항목 | 확정값 |
|---|---|
| route 없는 기능 | `BE-Gap-*`로 유지하고 menu·button·empty shell 모두 미렌더 |
| API 소비 | progress의 `API 완성:`에 export 함수별 기록이 생긴 함수만 허용 |
| operation | receipt 기반 비낙관 처리; possibly-sent POST 자동 재전송 금지 |
| realtime | `/api/live/browser` 우선; 포함되지 않은 domain은 visible 상태에서 30초 polling |
| responsive 검증 | desktop `1440×900`, mobile `390×844` 최소 gate |
| 데이터 | 실제 세션·실 API만 허용; fixture·synthetic·fallback 금지 |
| capability | provider 이름이 아니라 backend capability와 permission으로만 노출 |
| API 작업 충돌 | `src/product/api/**` endpoint/schema는 §6b 작업자 소유; Codex adapter는 별도 경계 |
