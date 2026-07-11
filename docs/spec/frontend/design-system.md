---
title: Product UI Design System Contract
status: planned-design-system-contract
owner: frontend-platform
version: product-design-system/v1
last_verified: 2026-07-11
---

# Product UI Design System Contract

## 0. 권한과 범위

이 문서는 제품 전체 UI의 시각 언어, semantic token, component variant, 상호작용, motion, layout, 접근성 검증을 정리한 구현 예정 계약이다. 현재 repo의 실제 코드와 통과한 테스트가 source of truth이며, 아래 token/component/policy가 현 코드에 없으면 구현 완료가 아니라 후속 작업 기준으로만 읽는다.

제품의 목표 톤은 외부 기준 저장소의 벤치마크 최소선처럼 중립적인 surface, 얇고 정확한 경계, 절제된 radius와 shadow, 명확한 typography hierarchy, 조용한 상태 전환을 일관되게 사용하는 것이다. 그러나 외부 기준 저장소의 source, class name, route, layout 구현을 복제하지 않는다. 제품이 소유한 semantic token과 local component API만 runtime 구현 대상으로 둔다.

- 참고 원칙: 외부 기준 저장소의 semantic CSS variable과 background/foreground pair.
- 참고 조합: 외부 기준 저장소의 작은 primitive를 조합하는 방식.
- 참고 구현: 외부 기준 저장소는 접근 가능한 local-source component의 검토 자료로만 사용한다.
- 위 자료의 현재 값, preset, DOM 구조는 제품 구현을 자동으로 바꾸지 않는다. upstream 변경도 제품 UI를 자동으로 바꾸지 않는다.
- upstream component를 도입할 때만 정확한 revision, origin URL, license를 기록하고 local contract에 맞춰 검토한다. 예제 페이지 source를 통째로 복사하지 않는다.

적용 범위:

- application shell, sidebar, topbar, page, card, form, overlay, feedback.
- Home, Resources, Issues, Timeline, GitOps, Settings를 포함한 모든 feature surface.
- light, dark, high-contrast theme.
- DOM, SVG, Canvas, WebGL renderer에 전달되는 resolved visual policy.
- mouse, touch, pen, keyboard, screen reader, reduced motion, forced colors.

비범위:

- topology의 canonical entity/relation/data contract는 `topology-engine.md`가 소유한다.
- topology의 layout geometry와 focus-Sankey sequence는 `topology-visual-motion-tokens.md`가 소유한다.
- API와 operation state는 `product-data-contract.md`가 소유한다.
- 외부 provider의 brand system은 제품 theme를 덮어쓸 수 없다.

## 1. 단일 소유권과 우선순위

### 1.1 Runtime 소유 위치

| 책임 | 유일한 소유 위치 | 소비 규칙 |
|---|---|---|
| raw color, shadow, font, spacing, radius, CSS motion literal | `references/ui-layer-lab/src/product/styles/tokens.css` | 다른 product CSS/TS/TSX에서 raw literal 금지 |
| TypeScript motion duration과 easing literal | `references/ui-layer-lab/src/product/shared/motion.ts` | feature는 public motion recipe만 소비 |
| theme 선택과 resolved token object | `references/ui-layer-lab/src/product/ProductApp.tsx`, `references/ui-layer-lab/src/product/styles/tokens.css` | product root가 theme를 선택하고 shell과 renderer에 동일 policy 주입 |
| 접근 가능한 UI primitive, variant, 반복 조합 | `references/ui-layer-lab/src/product/shared/ui/` | feature가 primitive를 재정의하지 않고 shared public API만 소비 |
| feature layout과 domain binding | `references/ui-layer-lab/src/product/features/<feature>/` | semantic token과 shared component만 소비 |
| Home treemap과 focus renderer | `references/ui-layer-lab/src/product/features/home/` | global token을 입력받고 topology 상태/관계 예외만 확장 |

위 경로가 현재 runtime 기준 위치다. 동일 책임을 임시로 다른 파일에 복제하지 않는다.

### 1.2 계약 우선순위

1. 이 문서가 global surface, component, interaction, theme 의미를 소유한다.
2. `topology-visual-motion-tokens.md`는 topology geometry, relation plane, focus-Sankey 전환만 확장한다.
3. feature spec은 1~2의 token과 primitive를 조합하며 새 global visual primitive를 만들지 않는다.

충돌 규칙:

- topology 문서의 `canvas`, `surface`, `text`, `border`, `focus`는 이 문서의 대응 semantic token을 alias한다. 별도 hex를 소유하지 않는다.
- topology의 health/relation accent는 §3.3의 명시된 예외다.
- feature 문서의 color, radius, shadow, duration literal은 무효다. 반드시 token 이름으로 승격한 뒤 사용한다.
- provider, cluster, namespace, resource kind가 theme 또는 component variant를 결정하지 않는다. canonical 상태와 capability만 결정한다.

## 2. 시각 문법

모든 제품 화면은 다음 문법을 공유한다.

1. 배경은 중립색이고 정보 계층은 surface 차이, 1px border, spacing으로 만든다.
2. card는 기본적으로 shadow가 없으며 floating overlay만 shadow를 가진다.
3. gradient, glass blur, glow, 과도한 saturation은 기본 UI에서 사용하지 않는다.
4. 한 화면의 강조색 면적을 늘려 우선순위를 만들지 않는다. typography, 위치, whitespace, action variant를 먼저 사용한다.
5. primary action은 한 dialog 또는 한 panel에 원칙적으로 하나다.
6. 상태는 색만으로 전달하지 않는다. icon/shape, text label, pattern 중 하나 이상을 함께 사용한다.
7. hover는 새로운 장식을 추가하지 않고 `accent`, border, text emphasis 중 필요한 것만 바꾼다.
8. 선택과 focus는 다르다. 선택은 persistent state, focus ring은 현재 입력 위치다.
9. 단순 data panel은 card를 중첩하지 않는다. section, separator, inset surface를 사용한다.
10. 모든 화면의 동일 명사는 동일 component, variant, spacing, motion을 사용한다.

## 3. Semantic color와 theme

### 3.1 Core token pair

CSS 변수 이름은 아래 semantic 이름 앞에 `--ds-`를 붙인다. `*-foreground`는 해당 surface 위의 text/icon만을 의미한다. 색 수치를 이 문서에 복제하지 않는다. light, dark, high-contrast의 실제 값과 theme key parity는 `references/ui-layer-lab/src/product/styles/tokens.css` 한 파일만 소유한다.

| Semantic token | Runtime CSS variable | 의미 |
|---|---|---|
| `background` / `foreground` | `--ds-background` / `--ds-foreground` | app canvas와 기본 text/icon |
| `card` / `card-foreground` | `--ds-card` / `--ds-card-foreground` | bounded content surface와 content |
| `popover` / `popover-foreground` | `--ds-popover` / `--ds-popover-foreground` | floating surface와 content |
| `primary` / `primary-foreground` | `--ds-primary` / `--ds-primary-foreground` | highest-emphasis action과 그 content |
| `secondary` / `secondary-foreground` | `--ds-secondary` / `--ds-secondary-foreground` | lower-emphasis filled control |
| `muted` / `muted-foreground` | `--ds-muted` / `--ds-muted-foreground` | subdued surface와 description/helper |
| `accent` / `accent-foreground` | `--ds-accent` / `--ds-accent-foreground` | hover/current row surface |
| `destructive` / `destructive-foreground` | `--ds-destructive` / `--ds-destructive-foreground` | destructive action과 error emphasis |
| `border` / `input` / `ring` | `--ds-border` / `--ds-input` / `--ds-ring` | divider, control boundary, keyboard focus |
| `surface` / `surface-foreground` | `--ds-surface` / `--ds-surface-foreground` | bounded inset surface |
| `selection` / `selection-foreground` | `--ds-selection` / `--ds-selection-foreground` | persistent selected marker와 content |
| `scrim` | `--ds-scrim` | modal/drawer backdrop |
| `sidebar*` | `--ds-sidebar*` | sidebar surface, content, action, accent, border, ring |

규칙:

- component는 `background` 위에 raw `white/black/zinc`를 선택하지 않는다.
- `muted-foreground`는 정보가 불필요하다는 뜻이 아니다. 필수 label, error, selected value에는 쓰지 않는다.
- `destructive`는 health의 `unhealthy`와 값이 같더라도 의미가 다르므로 서로 alias하지 않는다.
- opacity로 disabled 색을 새로 만들지 않는다. §7.5의 상태 문법과 `muted-foreground`를 함께 사용한다.
- manual `dark:` color branch를 feature에 두지 않는다. theme root의 동일 token key만 교체한다.

### 3.2 Chart token

Chart palette는 아직 runtime token으로 구현되지 않았다. `chart-1..5` 같은 이름이나 색 수치를 구현된 계약처럼 소비하면 안 된다. Metrics chart를 구현할 때 세 theme의 palette, foreground/contrast, high-contrast dash/marker를 product `tokens.css`에 먼저 추가하고 이 절의 상태를 갱신한다.

- metric series는 canonical metric identity를 안정적으로 hash해 token에 배정한다. filter/sort 순서가 바뀌어도 색이 바뀌지 않는다.
- 같은 chart에서 색만으로 series를 구분하지 않는다. legend label과 point/line pattern을 함께 사용한다.
- high contrast에서는 dash/marker shape가 필수다.
- health 색을 일반 metric series palette로 사용하지 않는다.

### 3.3 Topology status accent 예외

제품 chrome은 §3.1의 중립 palette만 사용한다. topology와 상태 badge/alert는 실제 운영 상태를 구분하기 위해 아래 제한된 accent를 사용할 수 있다.

| Canonical 표현 | Runtime token |
|---|---|
| `healthy`, `succeeded` | `--ds-status-success` / `--ds-status-success-foreground` |
| `degraded`, `pending_approval` | `--ds-status-warning` / `--ds-status-warning-foreground` |
| `information`, `running` | `--ds-status-info` / `--ds-status-info-foreground` |
| `unknown`, neutral metadata | `--ds-status-neutral` / `--ds-status-neutral-foreground` |
| `unhealthy`, `failed` | `--ds-destructive` / `--ds-destructive-foreground` |

별도 status soft-surface token은 현재 구현하지 않았다. Badge는 foreground/background pair를 사용하고, Alert는 semantic color를 border/text emphasis에 제한한다. 새 soft token이 필요하면 세 theme 값을 중앙 token source에 먼저 추가한다.

허용:

- 6~8px status marker, icon, text label의 보조색.
- selected topology tile의 2px semantic stroke.
- status Badge/Alert의 제한된 soft surface.
- topology relation line/ribbon과 chart legend.

금지:

- sidebar, topbar, 일반 card 전체를 status 색으로 채우기. Home의 bounded Pod treemap tile은 아래 명시된 예외다.
- cluster/provider별 임의 색.
- health를 CPU/메모리/비용 metric color로 재사용하기.
- accent만 있고 text/icon/pattern이 없는 상태 표현.
- glow, neon shadow, animated pulse를 정상 상태의 상시 장식으로 사용하기.

`pending_approval`은 `degraded`, `running`은 `information`, `failed`는 `unhealthy`, `succeeded`는 `healthy`의 표현 문법을 사용할 수 있으나 canonical 상태 이름은 유지한다. 상태를 health enum으로 변환하지 않는다.

### 3.4 Theme 적용

- app root의 `data-theme` 값은 `light | dark | high-contrast`다.
- 사용자에게 노출하는 theme control은 `light ↔ dark` 두 상태만 순환하고 이 선택만 저장한다. 저장값이 없을 때만 system light/dark를 따른다.
- `high-contrast`는 수동 순환의 세 번째 theme가 아니다. `prefers-contrast: more` 또는 `forced-colors: active`가 요청할 때만 접근성 policy로 우선 적용한다.
- `forced-colors: active`에서는 `Canvas`, `CanvasText`, `ButtonText`, `Highlight`, `HighlightText` system color를 사용하고 그림자와 decorative image를 제거한다.
- theme 변경은 entity identity, layout revision, query, filter, selection을 초기화하지 않는다.
- Canvas/SVG/WebGL은 DOM CSS를 추측하지 않고 theme controller가 만든 `ResolvedProductTheme`를 주입받는다.
- 세 theme는 동일한 spacing, geometry, information hierarchy를 공유한다.

접근성 최소 기준:

- 일반 text 4.5:1, large text 3:1.
- 의미 있는 control boundary, status marker, graph edge, focus ring 3:1.
- high contrast 일반 text 7:1, 의미 있는 graphic 4.5:1.
- alpha 색은 실제 합성된 결과로 검사한다.

## 4. Foundation token

### 4.1 Spacing

기본 단위는 4px이다. 현재 runtime spacing scale은 아래 변수만 제공하며 실제 수치는 product `tokens.css`가 소유한다.

| Runtime token | 용도 |
|---|---|
| `--ds-space-0-5` | icon optical correction만 |
| `--ds-space-1` | tight inline gap |
| `--ds-space-1-5` | compact control inset |
| `--ds-space-2` | icon-label, compact stack |
| `--ds-space-3` | field/card internal gap |
| `--ds-space-4` | section/card compact padding |
| `--ds-space-5` | default card/section padding |
| `--ds-space-6` | major section gap |

- flex/grid child spacing은 `gap`을 사용한다. sibling margin과 `space-*` utility를 조합하지 않는다.
- 2px는 border 정렬과 topology nested gap처럼 시각적으로 검증된 경우만 쓴다.
- 임의 `13px`, `18px`, `22px` spacing은 금지다. 필요한 값은 token review를 거친다.
- runtime layout 좌표는 design spacing이 아니라 engine geometry이므로 별도 typed data다.

### 4.2 Density와 target

Density는 정보 밀도 설정이며 viewport 별칭이 아니다. 한 page 안에서 table만 compact, form은 default처럼 목적에 따라 선택할 수 있지만 같은 component의 높이를 직접 덮어쓰지 않는다.

| Density | Runtime control token |
|---|---|
| `compact` | `--ds-control-height-sm` |
| `default` | `--ds-control-height` |
| `comfortable` | `--ds-control-height-lg` |

row, card padding, stack gap은 별도 density token으로 구현되지 않았다. component가 현재 spacing token을 조합하며, 반복되는 독립 의미가 확인되기 전 임의 density 수치를 만들지 않는다.

- mouse/keyboard 최소 interactive target은 24×24px다.
- `pointer: coarse`에서 최소 target은 44×44px다. visible control이 작으면 투명 hit area를 늘리되 target끼리 겹치지 않는다.
- destructive, primary, icon-only control은 28px 미만으로 만들지 않는다.
- text field, select, button은 같은 density에서 같은 block-size다.
- dense topology tile은 accessibility mirror/list와 search 경로를 반드시 제공한다.

### 4.3 Radius와 border

| Runtime token | 용도 |
|---|---|
| `--ds-radius-xs` | tiny marker, code chip |
| `--ds-radius-sm` | compact control과 topology tile |
| `--ds-radius-md` | button, input, menu item group |
| `--ds-radius-lg` | compact card와 popover base |
| `--ds-radius-xl` | product Card, modal/drawer surface |
| `--ds-radius-full` | badge, status pill, avatar |

- 기본 border는 1px `border`다.
- selected topology tile과 validation emphasis만 2px를 허용한다.
- 같은 surface 안에서 child radius는 parent radius보다 크지 않다.
- 일반 dashboard card에 pill radius를 사용하지 않는다.

### 4.4 Elevation

| Runtime token | 적용 |
|---|---|
| `none` | card/page 기본 |
| `--ds-shadow-xs` | bounded control과 낮은 surface 분리 |
| `--ds-shadow-sm` | popover/menu/tooltip |
| `--ds-shadow-md` | dialog/sheet/overlay |

theme별 shadow color와 high-contrast의 shadow 제거는 product `styles/tokens.css`가 소유한다.

- elevation은 surface + border + shadow 세 요소를 모두 강하게 사용하지 않는다.
- sticky topbar/sidebar는 border로 분리하고 기본 shadow를 쓰지 않는다.
- hover에서 card shadow를 키우지 않는다. clickable card는 border/accent로만 반응한다.

### 4.5 Typography

Font family:

- sans: `Geist Variable`, `Pretendard`, system sans-serif.
- mono: `Geist Mono`, `SFMono-Regular`, `Consolas`, monospace.
- font loading 실패 시 layout shift를 줄이는 metric-compatible fallback을 사용한다.

| Runtime token | 용도 |
|---|---|
| `--ds-text-xs` | timestamp, helper, metadata |
| `--ds-text-compact` | dense table/tile body |
| `--ds-text-sm` | 기본 UI text와 control |
| `--ds-text-base` | card title |
| `--ds-text-lg` | section/page title |
| `--ds-text-xl` | 주요 overview heading |
| `--ds-leading-none/tight/normal/control` | component 문맥별 line-height |

- 본문과 control은 14px 미만으로 축소하지 않는다. metadata만 12~13px를 허용한다.
- Korean label에 uppercase, 과도한 letter spacing을 적용하지 않는다.
- metric/cost/count는 `font-variant-numeric: tabular-nums`를 사용한다.
- hierarchy는 size보다 weight와 spacing을 우선한다. 한 panel에서 4단계 이상의 title hierarchy를 만들지 않는다.
- exact ID/revision은 mono, display name은 sans다.
- truncation은 한 줄에서만 사용하며 전체 값은 tooltip, inspector 또는 accessible name에 유지한다.

### 4.6 Icon

- 제품 icon library는 composition root에서 하나를 선택한다. 같은 의미에 서로 다른 icon set을 섞지 않는다.
- 기본 glyph box는 `--ds-icon-size`, compact/large는 각각 `--ds-icon-size-sm`/`--ds-icon-size-lg`를 사용한다.
- icon은 `currentColor`를 사용하며 component가 크기와 색을 소유한다.
- feature는 button 내부 icon에 독자 size/color를 지정하지 않는다.
- icon-only button은 visible tooltip과 `aria-label`이 모두 필요하다.
- decorative icon은 `aria-hidden="true"`; 상태를 전달하는 icon은 text label과 묶는다.
- provider logo는 metadata이며 primary navigation icon이나 상태 icon을 대체하지 않는다.

## 5. Product layout

### 5.1 Shell dimension

| Token | 값 |
|---|---:|
| `shell-sidebar-expanded` | 256px |
| `shell-sidebar-collapsed` | 56px |
| `shell-topbar-height` | 56px |
| `shell-inspector-default` | 320px |
| `shell-content-max` | 1440px |
| `shell-page-gutter-compact` | 16px |
| `shell-page-gutter-default` | 24px |
| `shell-page-gutter-wide` | 32px |

Shell viewport 규칙:

| 범위 | Sidebar | Topbar | Inspector |
|---|---|---|---|
| `<640px` | modal sidebar, 기본 닫힘 | compact breadcrumb + essential actions | bottom inspector |
| `640–1023px` | modal sidebar, 기본 닫힘 | title + search + utilities | bottom inspector |
| `≥1024px` | 256px/56px 사용자 토글 | full 56px | 320px persistent 가능 |

이 breakpoint는 application shell만 소유한다. topology renderer의 container mode와 LOD는 자신의 container inline-size 계약을 사용하며 viewport breakpoint를 재사용하지 않는다.

### 5.2 Sidebar

- sidebar는 `aside > nav` landmark이며 page main보다 DOM에서 앞선다. skip link를 제공한다.
- expanded 상태는 icon + label, collapsed 상태는 icon + tooltip이다. collapsed에서 text를 폭 0으로 찌그러뜨리지 않고 mount/visibility policy로 처리한다.
- active page는 `sidebar-accent`, `sidebar-accent-foreground`, `aria-current="page"`를 사용한다.
- group label은 navigation item보다 낮은 hierarchy이고 sticky가 아니다.
- count badge는 실제 gateway data만 표시한다. loading 중 임의 count를 넣지 않는다.
- toggle은 한 action만 발생시키고 state를 저장한다. resize가 사용자 선택을 덮어쓰지 않는다.
- compact Sheet는 open 시 focus를 첫 navigation target으로 옮기고 close 후 trigger로 복귀한다.
- sidebar surface에는 topology health 또는 provider 색을 사용하지 않는다.

### 5.3 Topbar

- topbar는 `background`, 1px bottom `border`, shadow 없음이다.
- inline-start: sidebar toggle과 breadcrumb/page identity.
- center: global search/command trigger. 공간이 부족하면 button으로 축약한다.
- inline-end: connection/freshness, notifications, theme, user menu 등 global action.
- page-local filter와 metric selector는 topbar가 아니라 page context bar에 둔다.
- topbar control은 default density를 쓰고 모두 동일 높이다.
- sticky/fixed topbar는 safe-area inset과 focus scroll margin을 보장한다.
- connection indicator는 색 점만 쓰지 않고 text/accessible label을 함께 제공한다.

### 5.4 Page와 context bar

- document title, route heading, breadcrumb는 동일한 canonical display name을 사용한다.
- overview/list/detail page는 `shell-content-max` 안에서 page gutter를 사용한다.
- topology/large graph canvas는 full-bleed가 가능하지만 context bar와 canvas boundary는 유지한다.
- page header 순서: breadcrumb → title/description → primary action → filter/context.
- filter 변경은 URL 또는 typed view state에 반영하며 theme/layout state와 섞지 않는다.
- context bar는 44px 이상, neutral surface, bottom border를 사용한다. pill을 나열해 navigation을 대신하지 않는다.

### 5.5 Card

Card composition은 `CardHeader`, `CardTitle`, 선택적 `CardDescription`/`CardAction`, `CardContent`, 선택적 `CardFooter` 순서를 사용한다.

- surface `card`, text `card-foreground`, 1px `border`, `--ds-radius-xl`, `--ds-shadow-xs`.
- 현재 Card의 default padding/gap은 `--ds-space-5`다. compact/comfortable Card variant는 아직 runtime API가 아니므로 feature CSS로 위조하지 않는다.
- header/content/footer 사이 간격은 spacing token을 사용한다.
- card 안에 동일 radius/border card를 반복하지 않는다. subsection과 separator를 사용한다.
- card 전체가 이동 action이면 semantic link/button 구조를 사용한다. `div onClick`은 금지다.
- card 안의 독립 button click은 card navigation을 발생시키지 않는다.
- selected card는 `selection` stroke와 `aria-selected` 또는 해당 widget pattern을 사용한다.
- hover만으로 내용을 노출하지 않는다.
- empty/loading/error는 card 높이를 임의 고정하지 않고 같은 content region 안에서 상태 component로 교체한다.
- AspectRatio primitive는 media preview에만 사용한다. topology 면적/metric geometry를 CSS aspect ratio로 위조하지 않는다.

## 6. Component contract

### 6.1 Primitive 우선순위

새 UI를 만들 때 다음 순서를 지킨다.

1. `references/ui-layer-lab/src/product/shared/ui/`의 기존 primitive와 variant 확인.
2. 두 개 이상 feature에서 반복되면 같은 design-system public API의 product composition으로 승격.
3. domain 의미만 feature component에 둔다.
4. renderer가 필요한 geometry만 topology renderer에 둔다.

현재 구현 여부는 `references/ui-layer-lab/src/product/shared/ui/`의 실제 export와 `npm run check`가 결정한다. 문서에 이름이 있다는 이유로 아직 없는 primitive를 import하거나 feature-local 대체물로 위조하지 않는다.

Native control 소유권:

- 재사용 control은 `product/shared/ui`가 소유하고, feature는 public component를 소비한다.
- app shell scrim은 보이는 제품 control이 아니라 modal navigation을 닫는 full-screen semantic overlay이며 다른 action을 겸하지 않는다.
- Home treemap의 geometry tile은 absolute runtime geometry, stable entity identity, native keyboard activation을 한 DOM node에 결합할 수 있는 renderer 예외다. 일반 toolbar/header action에 이 예외를 확장하지 않는다.
- 예외와 API boundary는 `references/ui-layer-lab/scripts/product-design-guard.mjs`가 검사한다. 새 예외는 이 계약과 guard를 같은 변경에서 수정하지 않으면 추가할 수 없다.

### 6.2 Variant 의미

| Component | Variant | 의미 | 금지 |
|---|---|---|---|
| Button | `default` | 현재 surface의 primary action | 한 panel에 여러 default |
| Button | `secondary` | 비파괴 보조 action | primary 대신 반복 사용 |
| Button | `outline` | toolbar/filter 등 낮은 강조 | selected state 위조 |
| Button | `ghost` | nav/row/icon의 contextual action | border가 필요한 form submit |
| Button | `destructive` | irreversible/high-risk action | 일반 error navigation |
| Button | `link` | 문장 안 navigation | button command |
| Badge | `secondary` | metadata/category | health 표현 |
| Badge | `outline` | neutral state/count | clickable filter 위조 |
| Badge | `status` | §3.3 canonical 상태 | 임의 색 prop |
| Alert | `default` | 정보/notice | toast 대체 |
| Alert | `destructive` | blocking error/danger | 모든 warning |
| Card | `default` | bounded information | clickable div |
| Card | `interactive` | semantic link/button card | nested command propagation |
| Input | `default` | user-editable field | search command button |
| ToggleGroup | `single` | 2~5개 mutually exclusive view/metric option | button loop로 active 구현 |

variant는 appearance prop가 아니라 의미 계약이다. `variant="green"`, `kind="aws"`, `color="#..."` 같은 API는 금지한다.

### 6.3 공통 상태 matrix

| 상태 | 시각 | semantic/ARIA | event |
|---|---|---|---|
| rest | 기본 token | native role/name | 없음 |
| hover | `accent` 또는 border emphasis | semantic 변화 없음 | command 없음 |
| pressed | 선택적 subtle inset/foreground | button native active | release 전 command 없음 |
| focus-visible | 2px `ring`, 2px offset | DOM focus 유지 | command 없음 |
| selected/current | persistent selection/accent | `aria-selected`, `aria-pressed`, `aria-current` 중 widget에 맞는 하나 | selection intent 1회 |
| disabled | muted content, cursor default | §7.5 규칙 | command 0회 |
| loading | label 유지 + Spinner 또는 Skeleton | `aria-busy="true"` | 중복 command 0회 |
| invalid | destructive boundary + message | `aria-invalid`, `aria-describedby` | submit 차단 또는 server validation |
| stale | 기존 data 유지 + freshness label | stale reason 노출 | refresh는 명시 action |
| partial | 관측 data + partial notice | completeness text | 지원 action만 허용 |

### 6.4 Form

- related controls는 Field/FieldGroup/FieldSet 구조를 사용한다.
- visible label은 placeholder로 대체하지 않는다.
- validation error는 field 바로 뒤에 놓고 `aria-describedby`로 연결한다.
- 2~7개 option은 RadioGroup 또는 ToggleGroup을 사용한다. option이 많거나 검색이 필요하면 Select/Combobox다.
- form submit은 Enter 동작을 보존하고 button click handler와 별도 command를 중복 발행하지 않는다.
- server error는 field error와 form-level Alert로 분리한다.
- read-only value는 disabled input이 아니라 text/description 또는 readOnly control을 사용한다.

### 6.5 Overlay와 feedback

- modal confirmation은 Dialog/AlertDialog, side detail은 Sheet, compact bottom detail은 Drawer다.
- 모든 Dialog/Sheet/Drawer는 accessible title을 가진다. 시각적으로 숨겨도 DOM에는 존재한다.
- overlay open 시 focus trap, Escape close, close 후 trigger focus 복귀를 보장한다.
- destructive operation은 consequence와 target identity를 confirmation에 명시한다.
- initial content loading은 Skeleton, control command는 Spinner, determinate operation은 Progress다.
- empty는 Empty, persistent problem은 Alert, transient acknowledgement는 Toast를 사용한다.
- Toast는 유일한 실패 설명이 될 수 없다. 실패 detail과 recovery CTA는 화면 상태/operation panel에도 남는다.
- background refresh는 기존 data를 Skeleton으로 덮지 않는다.

## 7. Interaction과 event

### 7.1 한 사용자 의도 = 한 canonical event

모든 component는 사용자 의도 하나당 application layer에 canonical event를 정확히 한 번 전달한다.

```text
DOM input → component intent → application command/query → state transition
```

- `pointerup`, `click`, `keydown` 각각에서 같은 command를 발행하지 않는다.
- 일반 activation은 semantic element의 `click` 하나로 수렴한다. browser가 Enter/Space를 click으로 합성하도록 둔다.
- drag, resize, pan처럼 click으로 표현할 수 없는 gesture만 pointer event를 직접 사용한다.
- child action은 parent navigation으로 bubble되어 두 intent를 만들지 않는다.
- mutation command는 idempotency key를 가진 operation request 한 건으로 발행한다.
- UI event 이름에 provider 이름을 포함하지 않는다.

### 7.2 Pointer

- hover는 preview/affordance만 바꾸며 data fetch나 mutation을 암묵적으로 실행하지 않는다.
- primary activation은 pointer release 후 click에서 확정한다.
- drag는 pointer capture를 사용하고 threshold를 넘기 전에는 click으로 처리한다.
- drag 중 layout worker/query를 연속 호출하지 않는다. captured geometry를 보간하고 commit 시 한 번 요청한다.
- right click/context menu가 유일한 action 경로가 될 수 없다.
- touch에서 hover-only control을 만들지 않는다.
- double click을 필수 조작으로 사용하지 않는다.

### 7.3 Keyboard

- Button/Link/Input 등 native element를 우선한다.
- Enter는 link/button activation, Space는 button/toggle activation을 따른다.
- roving-tabindex composite는 Arrow key, Home, End를 지원하고 Tab stop은 하나만 둔다.
- Escape는 가장 안쪽 overlay/temporary mode만 닫는다.
- topology tile은 Tab 또는 roving focus로 도달 가능하며 Enter로 drill-down/focus를 실행한다.
- keyboard activation과 pointer activation의 결과, event payload, analytics name은 동일하다.
- shortcut은 input/textarea/contenteditable에서 발동하지 않으며 discoverable label을 제공한다.

### 7.4 Focus

- `:focus-visible`에만 2px ring + 2px offset을 사용한다. mouse click에 강제 ring을 숨기기 위해 focus 자체를 제거하지 않는다.
- route 전환 후 main heading 또는 명시된 content anchor로 focus를 옮긴다.
- drill-down 후 새 scope heading에 focus를 옮기고 breadcrumb back 시 이전 tile로 복귀한다.
- virtualized item focus가 unmount되지 않도록 active descendant 또는 pinned row 정책을 사용한다.
- sticky topbar에 가리지 않도록 focus target에 scroll margin을 둔다.
- focus order는 visual/logical order와 같아야 하며 positive `tabIndex`를 사용하지 않는다.

### 7.5 Disabled, hidden, read-only

| 조건 | 표현 | 이유 제공 | command |
|---|---|---|---|
| 사용자에게 의미가 없는 capability | control 숨김 | 필요 없음 | 0 |
| 예상 기능이지만 현재 target에서 unsupported | disabled 또는 `aria-disabled` | visible/tooltip description | 0 |
| permission 없음 | disabled/read-only | permission reason + recovery 가능 시 CTA | 0 |
| management target read-only | control disabled, read-only badge | management policy reason | 0 |
| operation 실행 중 | native disabled + loading | current operation link | 0 additional |

- reason을 keyboard로 확인해야 하면 focus 가능한 `aria-disabled="true"` control을 사용하고 handler 시작에서 command를 차단한다.
- form처럼 주변에 reason이 항상 보이면 native `disabled`를 사용한다.
- Tooltip만이 유일한 reason이면 안 된다. `aria-describedby` 또는 인접 description을 제공한다.
- CSS opacity만 낮추고 event가 살아 있는 가짜 disabled는 금지다.
- read-only는 error가 아니며 current data 탐색, copy, navigation은 유지한다.

### 7.6 Loading과 async mutation

- query initial loading: content shape를 반영한 Skeleton.
- background refresh: 기존 data 유지 + 작은 refresh indicator/freshness 갱신.
- mutation: operation receipt 수신 전 성공 state를 optimistic하게 확정하지 않는다.
- submit 직후 control은 `aria-busy`, disabled, stable width를 유지한다.
- receipt 후 `pending | pending_approval | running | succeeded | failed | cancelled | unsupported`를 canonical status로 표시한다.
- connection이 끊기면 마지막 confirmed state와 disconnected/stale reason을 함께 유지한다. fixture나 임의 값으로 대체하지 않는다.
- Spinner flash 억제를 위한 별도 delay token은 현재 구현하지 않았다. 필요해지면 control 잠금과 시각 지연을 분리한 recipe를 product `shared/motion.ts`에 먼저 추가한다.
- retry는 새로운 idempotency key를 만드는 명시 action이다. possibly-sent command를 자동 재발행하지 않는다.

## 8. Motion

### 8.1 Global motion token

CSS와 TypeScript는 아래 동일 recipe 이름을 공유한다. 실제 수치는 각각 product `styles/tokens.css`와 `shared/motion.ts`가 소유하며 이 문서에 복제하지 않는다.

| Recipe | CSS token / TypeScript API | 용도 |
|---|---|---|
| `micro` | `--ds-motion-duration-micro` / `MOTION_RECIPE.micro` | hover, border, color micro feedback |
| `standard` | `--ds-motion-duration-standard` / `MOTION_RECIPE.standard` | dropdown, tooltip, shell transition |
| `hierarchyMorph` | `--ds-motion-duration-hierarchy` / `MOTION_RECIPE.hierarchyMorph` | Cluster → Node → Pod shared-layout 전환 |
| `zoomableHierarchy` | `--ds-motion-duration-zoom-hierarchy` / `MOTION_RECIPE.zoomableHierarchy` | zoomable treemap scope 전환 |
| `loading` | `--ds-motion-duration-loading` / `MOTION_RECIPE.loading` | Spinner의 반복 주기 |
| `standard easing` | `--ds-motion-ease-standard` / `MOTION_EASING.standard` | reversible chrome motion |
| `emphasized easing` | `--ds-motion-ease-emphasized` / `MOTION_EASING.emphasized` | hierarchy/layout retarget |
| `linear easing` | `--ds-motion-ease-linear` | 실제 progress/flow만 |

규칙:

- page/feature가 숫자 duration 또는 easing을 직접 쓰지 않는다.
- hover에서 translate/scale/bounce를 기본 효과로 사용하지 않는다.
- opacity와 transform을 우선하고 layout-affecting property animation은 제한한다.
- animation은 상태 변화를 설명해야 하며 계속 움직이는 장식이 아니어야 한다.
- loading shimmer는 한 화면에서 과도하게 반복하지 않고 Skeleton token을 사용한다.
- exit가 완료되기 전에 focus와 accessible state는 다음 논리 상태로 수렴해야 한다.

### 8.2 Topology 의미 motion 예외

Home focus interaction의 ribbon erase, cube morph, label reveal, settle, ribbon draw, connector stagger는 `topology-visual-motion-tokens.md`의 확정 recipe를 product 중앙 token source에 같은 이름으로 구현한다. feature가 별도 숫자 timing을 선언하면 계약 위반이다.

- topology transition은 entity key continuity를 보존한다. fade-out 후 unrelated node를 생성하는 방식은 금지다.
- focus sequence가 구현되면 morph, ribbon, stagger, settle을 각각 측정하며 하나의 총 duration으로 뭉개지 않는다.
- traffic speed animation은 observed metric이 있을 때만 사용한다. relation 존재를 traffic으로 위조하지 않는다.
- sidebar/topbar/card가 topology duration을 재사용하지 않는다.

### 8.3 Reduced motion

`prefers-reduced-motion: reduce`일 때:

- global enter/exit는 중앙 reduced-motion CSS policy로 사실상 즉시 수렴시키고 semantic state는 동일하게 유지한다.
- sidebar는 즉시 target width/overlay state로 수렴한다.
- topology는 source/target의 final geometry를 즉시 배치하고 connector를 정적으로 표시한다.
- stagger, ribbon draw, flowing particle, shimmer, auto-pan, parallax를 제거한다.
- loading/operation progress는 text, Spinner의 정적 대체 또는 Progress value로 전달한다.
- reduced motion을 이유로 data, relation, control, focus restoration을 제거하지 않는다.

## 9. Topology UI 통합 규칙

Home treemap과 focus relation은 별도 `Topology` navigation page가 아니다. shell, context bar, control, inspector, tooltip, dialog는 이 문서의 component와 theme를 그대로 사용한다.

- topology canvas background = `background` 또는 bounded frame의 `card`.
- cluster/node/pod frame 기본 = `card`, `card-foreground`, `border`.
- hover = `accent`; selected = `selection`; keyboard focus = `ring`.
- Home의 bounded Pod treemap은 health를 tile 전체 fill로 표시한다. fill/foreground/border pair는 중앙 topology health token을 사용하고 text, marker 또는 pattern을 함께 제공한다. 3px inline-start strip은 health가 아니라 namespace 안정 색 전용이다.
- Home Pod tile의 면적 가중치는 모두 `1`이다. CPU·memory 등 사용량은 면적을 바꾸지 않고 tile 하단 bar와 tooltip에만 표시하며, 측정값이 없으면 unavailable로 남긴다.
- packed layout은 실제 container pixel 좌표를 사용하고 최소 tile 14×14px, gap 2px를 지킨다. 거대한 빈 tile 또는 header가 정량 면적을 차지하면 layout defect다.
- zero/no-data/unavailable/restricted는 사라지지 않고 구조 shelf/pattern/text로 표현한다.
- relation plane과 observed traffic의 renderer color는 `topology-visual-motion-tokens.md`의 typed semantic token이 소유하되 global surface raw color를 재선언하지 않는다.
- inspector는 product Card/Sheet/Drawer composition을 사용한다.
- zoom/drill-down breadcrumb와 back focus는 §7.4를 따른다.
- density가 label을 숨기면 tooltip만 믿지 않고 keyboard mirror/search/list를 제공한다.
- provider logo/색으로 node kind나 cluster identity를 표현하지 않는다.

## 10. Reuse, import, upstream 도입

### 10.1 Import boundary

허용 방향:

```text
product/styles/tokens.css + product/shared/motion.ts
  ↓
product/shared/ui public API
  ↓
product/features
  ↓
product pages/app root
```

- `references/ui-layer-lab/src/product/shared/ui/`는 feature/domain type을 import하지 않는다.
- feature는 다른 feature의 private component 또는 CSS를 deep import하지 않는다.
- alias는 project TypeScript config의 실제 alias를 사용한다. `../../../../components` 경로를 복제하지 않는다.
- conditional class는 product shared utility로 조합하며 string interpolation variant를 새로 만들지 않는다.
- color/size/variant map은 component module 한 곳에서 typed object 또는 variant utility로 소유한다.
- CSS module/global selector로 다른 component 내부 DOM을 덮어쓰지 않는다.
- feature page는 `.button`, `.card`, `.badge`, `.dialog` 같은 global class를 정의하지 않는다.

### 10.2 외부 기준 저장소 component 도입

외부 기준 저장소는 package theme를 소비하는 방식이 아니라 검토 가능한 source component를 local product library로 도입하는 참고 방식이다.

1. 현재 project runner와 CLI의 `info`로 framework/base/icon/alias를 확인한다.
2. component docs와 registry diff를 먼저 검토한다.
3. 필요한 primitive만 local `references/ui-layer-lab/src/product/shared/ui/`에 추가하고 public API로 export한다.
4. import, base primitive, icon library, accessibility name, theme token을 이 계약에 맞춘다.
5. upstream provenance/revision/license와 product modification을 기록한다.
6. component state matrix와 theme visual test가 통과한 뒤 사용한다.
7. upstream update는 자동 overwrite하지 않고 dry-run/diff 후 product change로 review한다.

금지:

- 외부 기준 저장소의 docs/site route, page shell, example block를 통째로 복제.
- remote CDN/source import.
- registry component를 검토 없이 overwrite.
- upstream raw color/class를 feature에 그대로 흩뿌리기.
- source origin을 숨긴 vendoring.
- 외부 기준 저장소 preset 이름으로 runtime theme를 분기.

## 11. 품질 gate

### 11.1 Static architecture gate

다음 검사 중 하나라도 실패하면 merge/release할 수 없다.

`references/ui-layer-lab/scripts/product-design-guard.mjs`가 직접 차단하는 항목:

- runtime product dependency graph의 fixture/demo module 유입 0건.
- adapter boundary 밖의 `fetch` 0건.
- provider 이름 기반 UI branch/literal 0건.
- product `styles/tokens.css` 외 CSS/TS/TSX의 hex, `rgb`, `hsl`, `oklch` raw color 0건.
- feature의 CSS/TypeScript raw motion literal 0건.
- inline style은 typed runtime geometry CSS custom property 전달 외 0건.

TypeScript/build/component 접근성 test와 review gate가 담당하는 항목:

- feature에 manual light/dark/high-contrast color branch 0건.
- interactive `div/span onClick` 0건.
- icon-only control의 accessible name 누락 0건.
- Dialog/Sheet/Drawer title 누락 0건.
- product component/view의 synthetic count 또는 fake data literal 0건.
- theme별 token key parity 100%, unresolved CSS variable 0건.
- TypeScript strict, exact optional property, unchecked indexed access 기준 통과.

### 11.2 Component contract test

모든 public component는 같은 test matrix를 가진다.

- rest, hover, focus-visible, pressed/selected, disabled, loading, invalid.
- light, dark, high contrast, forced colors.
- default와 지원 density.
- mouse, keyboard, touch/coarse pointer.
- Korean long label, English label, long ID, empty value.
- accessible name, role, state, description, focus order.
- event dispatch count: 한 activation에 canonical intent 정확히 1회.
- disabled/loading activation에 command 0회.
- reduced motion final state와 focus restoration.

### 11.3 Screen visual gate

최소 viewport matrix:

| 이름 | viewport | 필수 확인 |
|---|---:|---|
| phone | 360×800 | sidebar Sheet, no horizontal overflow, 44px touch target |
| tablet | 768×1024 | rail/sidebar transition, context bar wrapping |
| desktop | 1280×800 | expanded/collapsed sidebar, overlay inspector |
| wide | 1600×1000 | content max/full-bleed canvas, persistent inspector |

각 viewport에서:

- initial loading, background refresh, empty, permission denied, partial, stale, disconnected.
- read-only management, unsupported capability, pending approval, running, succeeded, failed.
- light/dark/high contrast screenshot regression.
- overlay stacking, scroll lock, safe-area, focus visibility.
- topology Cluster → Node → Pod drill-down과 back focus.
- 200% text zoom과 browser zoom에서 정보/operation 손실 없음.

### 11.4 Accessibility와 contrast gate

- automated accessibility scan에 critical/serious violation 0건.
- keyboard-only로 모든 visible action 실행 가능.
- focus trap/return, skip link, landmark, heading order 검증.
- §3 contrast 수치 자동 검증.
- status/metric은 grayscale 또는 color-blind simulation에서도 text/pattern으로 구분.
- screen reader가 loading, operation progress, error recovery를 중복 없이 읽음.
- live region은 확정된 상태 변화만 announce하고 streaming metric tick을 계속 읽지 않음.

### 11.5 Motion과 성능 gate

- reduced motion에서 non-essential animation 0건.
- chrome interaction은 입력 후 다음 frame 안에 시각 feedback을 시작한다.
- simple hover/focus/theme transition이 main thread long task를 만들지 않는다.
- topology motion budget과 frame budget은 `topology-visual-motion-tokens.md`의 측정 기준을 통과한다.
- background streaming update가 open menu/dialog의 focus와 geometry를 흔들지 않는다.
- animation 중 entity identity, selected state, accessible name이 바뀌지 않는다.

## 12. 변경 절차와 release 판정

Token/component 변경은 다음을 한 변경 단위에서 함께 수행한다.

1. 이 문서의 의미 또는 numeric token 변경.
2. product `styles/tokens.css`, 필요 시 `shared/motion.ts`와 resolved renderer policy 변경.
3. 영향을 받는 primitive/pattern 변경.
4. 세 theme component matrix와 screen visual snapshot 갱신.
5. contrast, keyboard, reduced motion, event-count test 실행.
6. migration note와 의도한 visual diff 기록.

새 token 승인 조건:

- 기존 semantic token으로 표현할 수 없는 독립 의미가 있다.
- 두 개 이상의 소비 surface가 있거나 renderer boundary에 반드시 필요하다.
- light/dark/high-contrast 값과 foreground/contrast가 함께 정의됐다.
- 이름에 화면, provider, 임시 구현 세부가 없다.
- 삭제/migration 경로가 명확하다.

release 완료를 주장하려면:

- 모든 production route가 이 component/token graph만 소비해야 한다.
- 이전 shell/theme CSS의 raw literal과 중복 component가 제거돼야 한다.
- runtime product는 실제 API만 사용하고 fixture/synthetic/demo dataset을 import하지 않아야 한다.
- API 접근 불가 시 loading을 가짜 성공 화면으로 바꾸지 않고 차단 원인을 표시해야 한다.
- §11 gate 결과가 CI artifact로 남아야 한다.

## 13. 구현 검토 체크리스트

- [ ] 화면이 neutral surface, border, typography, spacing으로 hierarchy를 만드는가?
- [ ] global chrome에 topology/provider accent가 새지 않았는가?
- [ ] 모든 raw color/radius/timing이 단일 token owner에 있는가?
- [ ] 같은 action이 Button variant와 event name을 재사용하는가?
- [ ] hover, focus, selected, disabled, loading이 서로 구분되는가?
- [ ] keyboard와 pointer가 동일 canonical intent를 정확히 한 번 만드는가?
- [ ] disabled/read-only/unsupported 이유를 keyboard와 screen reader로 알 수 있는가?
- [ ] background refresh가 existing data를 지우지 않는가?
- [ ] reduced motion에서도 최종 geometry, relation, 상태가 모두 보이는가?
- [ ] 세 theme가 같은 geometry와 information hierarchy를 유지하는가?
- [ ] sidebar/topbar/card가 모든 route에서 같은 composition을 쓰는가?
- [ ] 외부 기준 저장소 reference를 복제한 것이 아니라 product-owned component로 검토·기록했는가?
