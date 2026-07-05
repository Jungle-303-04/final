# 04. 디자인 시스템

[← 문서 지도](README.md) · [아키텍처](03-architecture.md)

Plural 콘솔의 다크 무드를 참조한 자체 토큰(D3, D9).
구현 위치: `shared/tokens.css`(토큰), `shared/ui/`(컴포넌트), `shared/motion/`(모션).

## 토큰 (CSS 변수 — 단일 출처)

```css
:root {
  /* 표면 — 어두운 단계 5개 (Plural 무드: 잉크 블루 그레이) */
  --surface-0: #0e1015;   /* 앱 배경 */
  --surface-1: #171a21;   /* 카드/사이드바 */
  --surface-2: #1f232d;   /* 상승 요소(팝오버, 호버) */
  --surface-3: #2a2f3c;   /* 활성/선택 */
  --border:    #2f3441;
  --border-focus: #4a6cf7;

  /* 텍스트 */
  --text-1: #e8eaf0;  --text-2: #9aa1b2;  --text-3: #626a7d;

  /* 브랜드/의미 색 — 상태 뱃지·히트맵과 공유 */
  --brand:   #4a6cf7;
  --ok:      #3ecf8e;   /* healthy / succeeded */
  --warn:    #f5b83d;   /* degraded / waiting */
  --danger:  #f0554e;   /* failed / critical */
  --info:    #58a6ff;   /* running / info */
  --neutral: #626a7d;   /* unknown / pending */

  /* 히트맵 스케일 (건강도 0~1 보간용 양끝) — fleet-heatmap 전용 */
  --heat-good: #1d7a53;  --heat-mid: #8a6d1f;  --heat-bad: #a13732;

  /* 타이포 */
  --font-sans: "Pretendard Variable", Inter, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --fs-xs: 11px; --fs-sm: 12.5px; --fs-md: 14px; --fs-lg: 16px;
  --fs-xl: 20px; --fs-2xl: 28px;

  /* 간격/모서리/그림자 — 4px 그리드 */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px;
  --shadow-1: 0 1px 2px rgb(0 0 0 / .4);
  --shadow-2: 0 8px 24px rgb(0 0 0 / .45);

  /* 모션 */
  --ease-out: cubic-bezier(.16,1,.3,1);      /* 진입 */
  --ease-in-out: cubic-bezier(.65,0,.35,1);  /* 이동 */
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 350ms;
}
```

규칙: 컴포넌트/뷰에서 hex 직접 사용 금지 — 토큰 변수만.

## 상태 어휘 → 색 매핑 (단일 출처 `shared/ui/status.ts`)

백엔드 enum 전체를 5색으로 정규화. 뷰는 이 매핑만 사용.

| 색 | WorkflowRunStatus | 클러스터/팟 | approval | command |
|---|---|---|---|---|
| ok | SUCCEEDED | healthy/Running | granted | completed |
| info | STARTED·RENDERING·DIFFING·APPLYING·ROLLOUT_WAITING | progressing | — | running/leased |
| warn | POLICY_CHECKING·WAITING_FOR_APPROVAL | degraded/Pending | requested | queued |
| danger | FAILED | unhealthy/CrashLoopBackOff | rejected | failed |
| neutral | (없음) | unknown | not_required | expired |

## 모션 원칙 ("다이나믹 UI" 요구의 구현 규칙)

1. **의미 있는 모션만**: 진입(무엇이 생겼나), 전이(어디로 갔나), 피드백(무엇이 반응했나). 장식 루프 애니메이션 금지
2. 프리미티브 5개만 사용 (`shared/motion/`, frontend-demo 이식):
   - `<FadeSlideIn dir delay>` — 카드/패널 진입 (y 8px, --dur-base, --ease-out)
   - `<Stagger gap=40ms>` — 리스트 순차 등장 (최대 8개까지만 지연)
   - `<CountUp value>` — KPI 숫자 (AnimatedNumber 이식)
   - `<PressScale>` — 버튼/타일 눌림 (scale .97)
   - `<LayoutMorph layoutId>` — 히트맵 타일→상세 전환 (motion layoutId 공유)
3. 실시간 값 변화: 색 전이는 CSS transition(--dur-slow), 수치는 CountUp — 깜빡임 금지
4. `prefers-reduced-motion` 시 모든 프리미티브가 즉시 상태로 폴백 (프리미티브 내부에서 일괄 처리)
5. 페이지 전환: 라우트 레벨 FadeSlideIn 1개 — 라우트마다 다른 전환 금지

## 공용 컴포넌트 인벤토리 (`shared/ui/`)

뷰 문서는 이 목록의 이름만 사용한다(README 불변 규칙 2). Radix 기반은 표기.

| 컴포넌트 | props 계약(요약) | 기반 |
|---|---|---|
| `Button` | variant: primary·secondary·ghost·danger / size: sm·md / loading | — |
| `IconButton` | icon, label(aria) | — |
| `Card` | title?, actions?, padding | — |
| `StatBox` | label, value(CountUp), delta?, tone | — |
| `Badge` | tone(status.ts 5색), dot? | — |
| `Table` = `ResourceTable<T>` | columns[], rows, onRowClick, empty, virtual? | @tanstack/react-table |
| `Drawer` = `EntityDrawer<T>` | open, title, tabs?, width | radix Dialog |
| `Modal` | title, footer, size | radix Dialog |
| `Tabs` | items[{key,label,badge?}] | radix Tabs |
| `Select` / `MultiSelect` | options, value, onChange | radix Select |
| `Input` / `TextArea` / `PasswordInput` | label, error, hint | — |
| `Form` | schema(zod), defaultValues, onSubmit | react-hook-form |
| `Stepper` | steps[{key,label,valid}], current | — |
| `Tooltip` | content, side | radix Tooltip |
| `DropdownMenu` | items[{label,icon,danger?,onSelect}] | radix DropdownMenu |
| `Toast` (전역 큐) | tone, title, description?, action? | radix Toast |
| `Skeleton` | lines? / shape: text·card·table | — |
| `EmptyState` | icon, title, description, action? | — |
| `QueryBoundary` | query, children(data), skeleton? | — |
| `CodeBlock` | code, lang(yaml·json·diff), copy | highlight.js |
| `DiffView` | before, after | react-diff-viewer-continued |
| `SearchInput` | value, onChange, shortcut="/" | — |
| `CommandPalette` | actions[], recent | cmdk |
| `Breadcrumbs` | items[{label,to}] | — |
| `Avatar` / `AvatarGroup` | name → 색 해시 | — |
| `KeyValue` | pairs — 메타데이터 표시 | — |
| `Sparkline` | points, tone | @nivo/line (mini) |
| `TreemapChart` | nodes{id,label,value,score}, onTileClick, layoutId | @nivo/treemap |
| `TimeSeriesChart` | series[], window, live? | @nivo/line |
| `LogLines` | lines, follow? | virtua |

추가가 필요하면: 이 표에 행 추가 → 뷰 문서에서 참조 (역순 금지).

## 레이아웃 (AppShell)

```text
┌────────┬──────────────────────────────────────────────┐
│        │ Topbar: Breadcrumbs · 검색(⌘K) · Live● · 알림 · Avatar │
│ Side   ├──────────────────────────────────────────────┤
│ bar    │                                              │
│ 64/240 │              라우트 아웃렛                    │
│ px     │        (max-width 1440, 패딩 --sp-6)          │
│        │                                              │
└────────┴──────────────────────────────────────────────┘
```

- Sidebar: 접힘 64px(아이콘) ↔ 240px, zustand `uiStore.sidebarOpen`, LayoutMorph 로 부드럽게
- 사이드바 항목·순서는 [05-routes-ia.md](05-routes-ia.md)가 정본
- 반응형: 1024px 미만 사이드바 오버레이 모드. 모바일 최적화는 범위 외
