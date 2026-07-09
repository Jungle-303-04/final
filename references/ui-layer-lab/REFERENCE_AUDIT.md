# UI Layer Lab Reference Audit

작성일: 2026-07-09

## 결론

이 프로젝트의 목표는 더 많은 예제 수집이 아니라 **UI layer product reference lab**이다. 따라서 레퍼런스 사이트의 코드를 그대로 복사하지 않고, 다음 원칙을 우리 도메인인 AI overlay, Git 작업 상태, 로그, 드릴다운, 플로우 빌더, 차트에 맞게 재구성한다.

- shadcn/ui처럼 토큰 기반 디자인 시스템, 복사 가능한 코드, 미리보기와 코드의 명확한 분리.
- React Flow처럼 노드, 엣지, 인터랙션, 레이아웃, 스타일, 접근성, 성능 범주가 분명한 정보 설계.
- Motion처럼 hover, press, drag, layout, enter/exit, stagger, scroll/progress, reduced motion을 전환 유형별로 설명하고 검증.
- Mantine, Chakra, MUI, HeroUI, Park UI, PrimeReact처럼 테마 provider, typography scale, component API, light/dark, 접근성을 일관되게 적용.
- Radix, React Aria, Ark UI, Ariakit, Headless UI처럼 keyboard/focus/aria 동작을 프리미티브 수준에서 다룸.
- Recharts, visx, D3처럼 차트는 시각 장식이 아니라 data, scale, tooltip, legend, responsive behavior를 한 묶음으로 설계.

## 레퍼런스 벤치마크 매트릭스

| 레퍼런스 | 관찰한 강점 | 우리 앱에 적용할 원칙 | 구현 금지선 |
| --- | --- | --- | --- |
| [shadcn/ui Components](https://ui.shadcn.com/docs/components), [Theming](https://ui.shadcn.com/docs/theming), [Dark Mode](https://ui.shadcn.com/docs/dark-mode), [Charts](https://ui.shadcn.com/docs/components/chart) | components, blocks, charts, command search, code visibility, token override, `.dark` theme 구조 | Preview/Code 카드, category sidebar, theme toggle, copyable source, tokenized color/spacing/type/code panel | 예제 수만 늘리는 긴 리스트. 코드 보기 전에 raw source를 전부 가져오는 구조 |
| [React Flow Examples](https://reactflow.dev/examples), [Dark Mode](https://reactflow.dev/examples/styling/dark-mode) | nodes, edges, interactions, layout, styling, dark mode, copy-paste examples | Flow Builder 카테고리를 node/edge/interaction/inspector로 재조직. colorMode와 app theme 동기화 | 무의미한 노드 라벨, 영어 label 방치, viewport/selection 검증 없는 그래프 |
| [Motion Transitions](https://motion.dev/docs/react-transitions), [Stagger](https://motion.dev/docs/stagger) | duration/easing/spring/delay/stagger, gestures, layout, reduced motion | `src/styles/motion.css`와 `src/motion/`에 토큰과 공통 class를 둔다 | 이름만 animated인 예제, 클릭 전후 변화가 보이지 않는 예제 |
| [MUI Theming](https://mui.com/material-ui/customization/theming/), [MUI Dark Mode](https://mui.com/material-ui/customization/dark-mode/), [MUI Typography](https://mui.com/material-ui/react-typography/) | theme provider, palette mode, typography scale | title/body/caption/button/code scale을 CSS 변수로 고정 | 예제마다 임의 font-size/line-height 사용 |
| [Mantine Theme Object](https://mantine.dev/theming/theme-object/), [Color Schemes](https://mantine.dev/theming/color-schemes/) | colors, fonts, spacing, radius가 theme object에 저장됨 | `tokens.css`에 color/font/spacing/radius/elevation를 명시하고 light/dark 양쪽에 값 제공 | dark-only 색상 하드코딩 |
| [Chakra Dark Mode](https://chakra-ui.com/docs/styling/dark-mode), [Chakra Theme](https://v2.chakra-ui.com/docs/styled-system/theme) | ColorModeProvider, theme object, type scale, breakpoints | theme 상태를 localStorage와 `prefers-color-scheme`에 연결 | Toaster나 chart만 dark 고정 |
| [HeroUI Theming](https://www.heroui.com/docs/react/getting-started/theming), [HeroUI Dark Mode](https://heroui.com/en/docs/react/getting-started/dark-mode) | CSS variables, `data-theme`, `.light/.dark` sync | `html[data-theme]` 기반 light/dark. app shell 배경/텍스트도 token 사용 | 내부 카드만 바뀌고 body는 바뀌지 않는 테마 |
| [Park UI Theming](https://park-ui.com/docs/theming) | systematic sizing/variants, Radix color scale per mode | size variant와 status color를 token으로 제한 | 상태마다 임의 색상 추가 |
| [PrimeReact Accessibility](https://v11.primereact.org/docs/overview/gettingstarted/introduction), [PrimeReact Theming](https://v9.primereact.org/theming/) | 컴포넌트별 접근성 문서, theme editor | 각 대표 예제에 keyboard/aria 검증 항목을 둔다 | 접근성 동작을 수동 확인만 하는 방식 |
| [Radix Primitives](https://www.radix-ui.com/primitives), [Radix Accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility) | WAI-ARIA, keyboard navigation, focus management | dialog, popover, tabs, accordion, command에서 Escape/focus restore/roving focus를 확인 | `aria-label="Close"` 같은 영어/부정확한 label 방치 |
| [React Aria](https://react-aria.adobe.com/) | accessible drag/drop, keyboard multi-selection, form validation, table resizing | 드릴다운/테이블/선택 UI에 키보드 선택과 focus 상태를 포함 | 클릭 전용 row/button |
| [Ark UI](https://ark-ui.com/), [Ark Accordion](https://ark-ui.com/docs/components/accordion), [Ark Collapsible](https://ark-ui.com/docs/components/collapsible) | headless accessible components, keyboard table, CSS animation variables, inert hidden content | accordion/collapsible는 숨긴 영역 interactive element inert 처리까지 설계 | height만 0으로 줄이고 focus 가능한 상태 방치 |
| [Ariakit](https://ariakit.com/) | accessible low-level primitives and copyable styled examples | wrapper primitive보다 behavior contract를 먼저 명시 | 디자인만 있고 keyboard behavior 없는 custom widget |
| [Headless UI Dialog](https://headlessui.com/react/dialog) | renderless dialog, focus/keyboard behavior, transition API | overlay/drawer/dialog 대표 예제는 focus trap, Escape, backdrop, restore 검증 포함 | 단순 absolute panel |
| [Recharts](https://recharts.org/), [visx](https://visx.airbnb.tech/), [D3](https://d3js.org/what-is-d3) | Recharts는 reusable chart component, visx는 low-level React visualization primitives, D3는 scale/axis/shape 같은 low-level toolbox | 제품용 통합 차트 패턴: chart card, tooltip, legend, metric toggle, responsive container, theme colors | chart-area-variant 파일을 계속 늘리는 방식 |

## 우리 앱 목표 재정의

이 앱은 “세상의 모든 UI 예제 목록”이 아니다. 목표는 다음이다.

> 복잡한 제품 UI 위에 올라가는 command, AI overlay, job progress, drilldown, graph, chart, motion pattern을 복사 가능한 대표 예제로 제공하는 reference lab.

성공 기준:

- 첫 화면에서 완성된 디자인 시스템처럼 보인다.
- light/dark theme가 모든 surface, code, chart, toast, React Flow에 적용된다.
- 예제는 카테고리별 고유 패턴 + 옵션 토글 + 상태 전환 설명 + 코드로 구성된다.
- raw source는 코드 보기를 눌렀을 때만 import한다.
- 핵심 예제는 keyboard/focus/aria/motion/reduced-motion까지 자동 검증한다.
- 500개 파일은 모두 화면에 노출한다. catalog는 노출 제한이 아니라 수동 품질 metadata와 통합 후보 기록에만 사용한다.

## 대표 카테고리 구조

| 카테고리 | 대표 패턴 | 통합할 기존 예제군 | 필수 모션 |
| --- | --- | --- | --- |
| Overlay & Command | command palette, command preview, staged confirm, top layer overlay | command search/filter/shortcut/recent/preview 계열 | open/close, result replace, selected preview, conflict reveal |
| AI Interaction Layer | composer dock, assistant drawer, streaming message, tool result, source pinning | ai overlay/chat/tool/citation/context 계열 | composer enter, streaming, expand/collapse, source pin |
| Job / Progress / Logs | Git pull/push runner, stage timeline, retry/failure, log tail, artifact state | job progress/timeline/runner/log 계열 | progress fill, milestone swap, retry transition, log tail append |
| Drilldown & Navigation | workflow > job > step > log, breadcrumb, column browser, split panel | drilldown/tree/table/timeline 계열 | depth slide, breadcrumb restore, detail panel swap, resize |
| Flow Builder / React Flow | workflow nodes, edge status, inspector, minimap, validation | React Flow node/edge/interaction 계열 | node status transition, edge pulse, inspector enter, selection feedback |
| Data Visualization | product chart card, metric toggle, legend toggle, tooltip/focus | chart area/bar/line/pie/radar/radial 계열 | metric transition, legend on/off, tooltip/focus. 초기 빈 그래프 금지 |
| Motion Patterns | motion system gallery, reduced motion, list reorder, drawer/dialog, skeleton-to-content | animated 66개 | hover/press/enter/exit/stagger/layout/progress/reorder |
| Component Primitives | button, badge, field, tabs, accordion, table, empty, skeleton, tooltip | component-* 계열 | tokenized hover/focus/press/reveal |

## 구조 재조직 초안

```text
src/
  App.tsx                       # 상태 조합만 담당
  components/
    AppShell.tsx
    SidebarNav.tsx
    SearchBar.tsx
    ThemeToggle.tsx
    ExampleSection.tsx
    LazyPreview.tsx
    CodePanel.tsx
    CategorySummary.tsx
  components/primitives/
    Badge.tsx
    Button.tsx
    MetricCard.tsx
    Panel.tsx
    SegmentedControl.tsx
    StatusPill.tsx
  examples/
    catalog.ts                  # 화면에 노출할 대표 예제 id 명시
    metadata.ts                 # category, title, description, motion intent
    registry.ts                 # import map + 정렬 + 검색용 index만 담당
    shared/
      chartTheme.ts
      demoData.ts
      labels.ts
      motionText.ts
      status.ts
  motion/
    tokens.ts
    useReducedMotion.ts
  styles/
    index.css
    tokens.css
    base.css
    layout.css
    viewer.css
    primitives.css
    motion.css
    examples.css
    charts.css
    flow.css
  tests/
    smoke.mjs
```

첫 안정화 패스에서는 `registry.ts`가 모든 `.example.tsx` 파일을 노출하도록 유지한다. `catalog.ts`는 수동 설명, 검색어, 통합 후보 metadata를 보강하는 용도로만 쓰고, 중복은 같은 패턴을 숨기지 말고 실제 예제 품질을 통합하거나 `variantGroups`에 기록한다.

## Theme / Token 설계 초안

```css
:root {
  --font-sans: Inter, Pretendard, ui-sans-serif, system-ui, sans-serif;
  --font-mono: "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace;

  --text-xs: 12px;
  --text-sm: 14px;
  --text-md: 16px;
  --text-lg: 18px;
  --text-xl: 24px;
  --text-2xl: 32px;
  --line-tight: 1.2;
  --line-base: 1.55;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
}

[data-theme="dark"] {
  --color-bg: #09090b;
  --color-surface: #111113;
  --color-panel: #18181b;
  --color-border: #27272a;
  --color-text: #fafafa;
  --color-muted: #a1a1aa;
}

[data-theme="light"] {
  --color-bg: #ffffff;
  --color-surface: #f7f7f8;
  --color-panel: #ffffff;
  --color-border: #e4e4e7;
  --color-text: #09090b;
  --color-muted: #52525b;
}
```

테마 동작 기준:

- 초기값은 `localStorage.ui-layer-lab-theme`가 있으면 사용하고, 없으면 `prefers-color-scheme`를 따른다.
- `document.documentElement.dataset.theme`를 `light | dark`로 설정한다.
- Sonner `Toaster`, Recharts colors, React Flow `colorMode`, code panel, focus ring 모두 같은 theme 상태를 따른다.

## Motion System 초안

```css
:root {
  --motion-duration-fast: 120ms;
  --motion-duration-base: 200ms;
  --motion-duration-slow: 320ms;
  --motion-ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --motion-ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1);
  --motion-ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --motion-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --motion-stagger-gap: 45ms;
  --motion-distance-sm: 4px;
  --motion-distance-md: 10px;
  --motion-distance-lg: 18px;
}

.motion-pressable {
  transition:
    transform var(--motion-duration-fast) var(--motion-ease-standard),
    background-color var(--motion-duration-fast) var(--motion-ease-standard),
    border-color var(--motion-duration-fast) var(--motion-ease-standard);
}

.motion-pressable:active {
  transform: translateY(1px) scale(0.99);
}

.motion-panel {
  animation: motion-panel-enter var(--motion-duration-base) var(--motion-ease-emphasized) both;
}

.motion-progress-fill {
  transition: width var(--motion-duration-slow) var(--motion-ease-emphasized);
}

.motion-list-item {
  transition:
    transform var(--motion-duration-base) var(--motion-ease-emphasized),
    opacity var(--motion-duration-base) var(--motion-ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
  }
}
```

UI 패턴별 모션 계약:

- Hover: border/text/background만 미세하게 바꾸고 layout shift 금지.
- Press: 1px translate 또는 0.99 scale 이하. 버튼 크기 변화 금지.
- Enter/Exit: overlay, dialog, drawer는 opacity + y/scale. focus 이동과 함께 발생.
- Loading: skeleton shimmer는 content size를 고정하고 reduced motion에서는 static pulse.
- Progress: width 또는 stroke-dashoffset만 변경. 부모 레이아웃 변화 금지.
- Route/Tab: panel 교체는 opacity + small y. height는 고정 또는 measured reveal.
- Drawer/Dialog: backdrop fade, panel slide, Escape/backdrop/focus restore 검증.
- Toast: stack collapse는 transform 기반. text overflow 금지.
- Accordion/Collapsible: hidden content 안의 interactive element focus 금지.
- List Reorder: DOM 순서와 visual order가 일치. focus 유지.
- Flow Node: node status badge와 edge pulse가 의미를 전달. reduced motion에서는 static stroke.

## Animated 예제 감사표

현재 registry 규칙 기준 animated 계열은 `animated-*`, `*skeleton*`, `scroll-fade`가 포함되어 **66개**다. 사용자/감사자 언급의 64개보다 2개가 많은 이유는 `shimmer-skeleton`, `component-skeleton-loading-state`가 카테고리 규칙상 animated로 들어가기 때문이다.

판정 요약:

- 유지: 7개
- 재작성: 17개
- 통합: 40개
- 삭제: 2개

| 파일 | 판정 | 통합/대상 패턴 | 이유 |
| --- | --- | --- | --- |
| 16-animated-overlay | 재작성 | Overlay & Command | overlay 개념은 핵심이지만 focus restore, Escape, 한글 aria 보강 필요 |
| 17-animated-progress | 재작성 | Job / Progress / Logs | progress 핵심. 단계/실패/재시도와 함께 통합 필요 |
| 18-animated-timeline | 통합 | Job / Progress / Logs | timeline 단독보다 job milestone 안에 흡수 |
| 26-shimmer-skeleton | 통합 | Motion Patterns | skeleton-to-content 대표 예제로 통합 |
| 27-scroll-fade | 유지 | Motion Patterns | 스크롤 가능한 로그/코드 영역에 필요한 기본 패턴 |
| 52-animated-tabs | 재작성 | Component Primitives | 영어 문구 제거, selected indicator와 panel transition 보강 |
| 53-animated-accordion | 재작성 | Component Primitives | 영어 문구 제거, keyboard/focus/inert 기준 필요 |
| 54-animated-layout-switch | 통합 | Motion Patterns | layout 전환 대표 예제로 흡수 |
| 76-animated-stagger-list | 유지 | Motion Patterns | 순차 등장 패턴으로 유지하되 token 적용 |
| 77-animated-toast-stack | 재작성 | Job / Progress / Logs | toast stack은 유지하되 Sonner 상태와 연결 |
| 78-animated-resize-panel | 재작성 | Drilldown & Navigation | split resize 대표 예제로 고도화 |
| 103-animated-kanban-card | 통합 | Motion Patterns | list reorder/drag 대표 예제에 흡수 |
| 104-animated-number-counter | 통합 | Job / Progress / Logs | progress metric 안에 통합 |
| 105-animated-focus-ring | 유지 | Component Primitives | focus visibility 품질 게이트로 유지 |
| 128-animated-filter-list | 통합 | Overlay & Command | 검색 결과 교체 모션으로 통합 |
| 129-animated-command-bar | 통합 | Overlay & Command | command open/close 대표 예제에 흡수 |
| 130-animated-swipe-list | 재작성 | Motion Patterns | swipe/exit 대표 예제로 재작성 |
| 153-animated-route-transition | 재작성 | Drilldown & Navigation | route/tab 전환 대표 예제로 유지 |
| 154-animated-collapsible-log | 통합 | Job / Progress / Logs | log drawer/accordion에 통합 |
| 155-animated-sortable-list | 통합 | Motion Patterns | priority reorder 대표 예제에 통합 |
| 181-animated-scroll-progress | 유지 | Motion Patterns | scroll-linked toolbar 기준 패턴 |
| 182-animated-shared-indicator | 통합 | Component Primitives | tabs selected indicator로 통합 |
| 183-animated-drag-card | 통합 | Motion Patterns | drag threshold card에 통합 |
| 184-animated-skeleton-to-content | 재작성 | Motion Patterns | skeleton 대표 예제로 유지하되 reduced motion 적용 |
| 185-animated-view-transition-tabs | 통합 | Component Primitives | tabs/route transition으로 통합 |
| 211-animated-exit-list | 통합 | Motion Patterns | swipe/list reorder에 통합 |
| 212-animated-parallax-panel | 삭제 | 없음 | 제품 UI 이해보다 장식성이 강함 |
| 213-animated-step-morph | 통합 | Job / Progress / Logs | job stage state morph로 통합 |
| 214-animated-countdown-ring | 통합 | Job / Progress / Logs | SLA/progress 카드에 통합 |
| 215-animated-reorder-grid | 통합 | Motion Patterns | reorder 대표 예제에 통합 |
| 241-animated-hover-lift | 유지 | Component Primitives | hover/press token 검증용 |
| 242-animated-stepper-connector | 통합 | Job / Progress / Logs | job stepper에 통합 |
| 243-animated-density-panel | 통합 | Component Primitives | density option으로 통합 |
| 244-animated-attention-pulse | 유지 | Component Primitives | 상태 강조 기준으로 유지, 과한 반복 금지 |
| 245-animated-loading-dots | 통합 | AI Interaction Layer | AI streaming 상태에 통합 |
| 271-animated-status-ribbon | 통합 | Job / Progress / Logs | status pill/ribbon primitive로 통합 |
| 272-animated-optimistic-row | 유지 | Component Primitives | optimistic state 전환 대표로 유지 |
| 273-animated-resizable-split-view | 재작성 | Drilldown & Navigation | split panel resize 품질 패턴으로 재작성 |
| 274-animated-path-trace | 통합 | Flow Builder / React Flow | edge status/pulse로 통합 |
| 275-animated-command-menu-enter-exit | 재작성 | Overlay & Command | command 대표 예제로 재작성 |
| 301-animated-command-spring-row | 통합 | Overlay & Command | selected preview row로 통합 |
| 302-animated-height-reveal | 통합 | Component Primitives | accordion/tool result reveal로 통합 |
| 303-animated-queue-reorder | 통합 | Job / Progress / Logs | job priority queue로 통합 |
| 304-animated-progress-checkpoints | 통합 | Job / Progress / Logs | progress 대표 예제에 통합 |
| 305-animated-overlay-anchor | 통합 | Overlay & Command | popover anchor map과 통합 |
| 331-animated-swipe-command-card | 통합 | Motion Patterns | swipe-list에 통합 |
| 332-animated-stack-collapse | 통합 | Job / Progress / Logs | toast/job stack collapse로 통합 |
| 333-animated-status-marquee | 삭제 | 없음 | 상태 이해보다 장식성이 강하고 reduced motion 부담 |
| 334-animated-modal-focus-trap | 재작성 | Overlay & Command | 접근성 핵심 예제로 재작성 |
| 335-animated-grid-density-slider | 통합 | Component Primitives | density panel로 통합 |
| 361-animated-sidebar-peek | 통합 | AI Interaction Layer | sidecar/drawer snap에 통합 |
| 362-animated-step-toast-preview | 통합 | Job / Progress / Logs | toast/job stage sync에 통합 |
| 363-animated-cell-focus-ring | 통합 | Data Visualization | heatmap roving focus에 통합 |
| 364-animated-inline-status-pill | 통합 | Component Primitives | status pill primitive로 통합 |
| 365-animated-drawer-snap-points | 재작성 | AI Interaction Layer | drawer 대표 모션으로 재작성 |
| 391-animated-popover-anchor-map | 통합 | Overlay & Command | overlay anchor 대표 예제에 통합 |
| 392-animated-command-search-skeleton | 재작성 | Overlay & Command | command async search 대표 예제로 재작성 |
| 393-animated-route-swipe-tabs | 통합 | Drilldown & Navigation | route transition에 통합 |
| 394-animated-checklist-reveal | 통합 | Job / Progress / Logs | job checklist/progress에 통합 |
| 395-animated-progress-segment-fill | 통합 | Job / Progress / Logs | progress 대표 예제에 통합 |
| 431-animated-hover-command-preview | 재작성 | Overlay & Command | command selected preview 대표 예제로 재작성 |
| 432-animated-scroll-linked-toolbar | 통합 | Motion Patterns | scroll progress에 통합 |
| 433-animated-priority-reorder-list | 재작성 | Motion Patterns | list reorder 대표 예제로 재작성 |
| 434-animated-modal-stack-depth | 통합 | Overlay & Command | modal/dialog stack 대표 예제에 통합 |
| 435-animated-drag-threshold-card | 재작성 | Motion Patterns | drag threshold 대표 예제로 재작성 |
| 488-component-skeleton-loading-state | 통합 | Component Primitives | skeleton-to-content와 component primitive에 흡수 |

## 중복 제거 계획

1. `registry.ts`는 모든 예제 파일을 노출한다. `catalog.ts`는 수동 metadata와 통합 후보만 기록한다.
2. 카테고리별 수량 제한을 두지 않는다. 같은 패턴의 변형만 segmented control, tabs, toggle로 한 파일 안에 통합한다.
3. 기존 중복 파일은 registry에서 숨기지 않는다. 통합이 끝난 뒤에만 `variantGroups`로 관계를 기록하거나 삭제 여부를 별도 검토한다.
4. 차트는 값/상태/상호작용이 다른 예제를 유지하고, 단순 스타일 차이만 통합한다.
5. animated는 숫자를 줄이는 대신 실제 모션, reduced motion, 높이 안정성, 버튼 크기 안정성을 만족하도록 재작성한다.

삭제 후보:

- 212-animated-parallax-panel.example.tsx
- 333-animated-status-marquee.example.tsx

우선 재작성 후보:

- 01-command-basic.example.tsx
- 02-ai-quick-input.example.tsx
- 03-assistant-drawer.example.tsx
- 04-job-progress-strip.example.tsx
- 05-job-log-drawer.example.tsx
- 06-workflow-drilldown.example.tsx
- 09-heatmap-drilldown.example.tsx
- 10-react-flow-workflow.example.tsx
- 16-animated-overlay.example.tsx
- 17-animated-progress.example.tsx
- 52-animated-tabs.example.tsx
- 53-animated-accordion.example.tsx
- 275-animated-command-menu-enter-exit.example.tsx
- 334-animated-modal-focus-trap.example.tsx
- 392-animated-command-search-skeleton.example.tsx
- 461-478 chart 계열 중 단순 스타일 중복만 통합

## 한글화 기준

허용 영어:

- 제품/라이브러리/기술명: React, React Flow, shadcn/ui, Sonner, Recharts, Git, GitHub, API, JSON, SLA, AI.
- 명령어/로그 원문: `git pull origin dev`, `npm run build`, `tsc -b`.

수정 대상 영어:

- 사용자 조작 문구: Search, Close, Open, Save, Retry, Run, Cancel, Focus.
- 상태 문구: Running, Failed, Success, Idle, Done, No results found.
- UI label: Dashboard, Repositories, Pages, Settings, Summary, Files.
- toast description/action label.
- React Flow node label이 도메인 설명 없이 Input/Output/Source/Target으로만 있는 경우.

검사 방식:

```bash
rg -n '\"[^\"]*[A-Za-z][^\"]*\"|>[A-Za-z][^<]*<' src/examples src/components
```

이 결과를 allowlist와 비교하는 smoke 검사를 추가한다.

## 자동 검증 계획

`tests/smoke.mjs`를 추가하고 `npm run smoke`로 실행한다.

검증 조합:

- viewport: desktop `1440x1000`, mobile `390x844`
- theme: dark, light
- motion: normal, `prefers-reduced-motion: reduce`

검증 항목:

- 첫 화면에 실제 대표 예제가 보이고 placeholder만 보이지 않는다.
- theme toggle 후 `html[data-theme]`, body background, code panel, chart, React Flow가 함께 바뀐다.
- 카테고리 선택, 검색, 코드 보기 toggle이 동작한다.
- raw source는 코드 보기 클릭 전에는 import되지 않는다.
- command/dialog/drawer는 Escape, backdrop, focus restore가 동작한다.
- 주요 motion 예제는 클릭 전후 computed style 또는 DOM 상태가 실제로 바뀐다.
  - progress width
  - panel opacity/transform
  - drawer/dialog open state
  - list item order/transform
  - skeleton-to-content DOM swap
- reduced motion에서는 transition duration이 1ms 수준으로 줄고 레이아웃은 깨지지 않는다.
- `document.documentElement.scrollWidth <= window.innerWidth`로 가로 overflow가 없다.
- 허용 목록 외 영어 UI 문자열 샘플이 남아 있지 않다.

스크린샷 산출물:

```text
output/playwright/ui-layer-lab-dark-desktop.png
output/playwright/ui-layer-lab-light-desktop.png
output/playwright/ui-layer-lab-dark-mobile.png
output/playwright/ui-layer-lab-light-mobile.png
output/playwright/ui-layer-lab-reduced-motion.png
```

## 다음 구현 순서

1. `catalog.ts`, `metadata.ts`, `registry.ts` 책임 분리. 모든 예제 노출은 유지하고 catalog는 품질 metadata로 제한.
2. `components/`로 `ExampleSection`, `CodePanel`, `LazyPreview`, `SidebarNav`, `SearchBar`, `ThemeToggle` 분리.
3. `styles/`로 token/base/layout/viewer/primitives/motion/charts/flow 분리.
4. theme toggle, localStorage, prefers-color-scheme, Sonner theme 연결.
5. motion token/class와 reduced motion 적용.
6. 대표 예제 우선 한글화와 재작성.
7. Playwright smoke 추가.
8. typecheck/build/smoke 통과 후 중복 파일을 `_legacy/` 이동 또는 삭제.
