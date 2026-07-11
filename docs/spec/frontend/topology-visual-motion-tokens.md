---
title: Topology Visual and Motion Token Contract
status: planned-numeric-contract
owner: frontend-platform
version: topology-visual-motion/v1
last_verified: 2026-07-11
---

# Topology Visual / Motion Token Contract

## 0. 권한과 literal 규칙

`topology-engine-claude.md`는 interaction model과 전환 단계·순서를 설명하고, 이 문서는 색·치수·density·z-order 및 duration/easing/geometry literal을 추적한다. 단계의 의미·gate와 token 값이 함께 바뀌면 두 문서와 코드/테스트를 같은 변경에서 동기화한다.

이 문서는 topology visual/motion의 구현 예정 numeric contract다. 현재 repo의 실제 코드와 통과한 테스트가 source of truth이며, 아래 token과 policy가 현 코드에 없거나 값이 다르면 구현 완료가 아니라 후속 작업 기준으로만 읽는다. 실측으로 값을 바꿀 때도 versioned policy와 회귀 기준, 구현, 테스트를 같은 변경에서 동기화한다.

모든 수치와 시각 의미는 `TopologyVisualMotionPolicy/v1` 한 곳에서 소유한다. React component, renderer branch, CSS selector에 값·색상·duration literal을 중복하지 않는다.

- CSS raw color는 `product/styles/tokens.css`만 소유한다.
- Canvas/SVG/WebGL은 DOM과 같은 resolved theme policy object를 주입받는다.
- runtime geometry는 typed CSS custom property 또는 renderer buffer로만 전달한다.
- theme/renderer/motion 변화는 query hash, entity identity, layout revision의 의미를 바꾸지 않는다.

v0 presentation의 초기 상태는 `map`이고, map cube의 기본 activation 결과는 `focus-sankey`다. `rail`과 `butterfly`는 capability-gated secondary presentation이다. horizontal `fold` drag gesture는 **v1 이후** 범위이며 v0에서는 listener, progress state, control을 만들지 않는다. 활성 presentation은 하나뿐이며 provider 이름이나 viewport 조건으로 support를 추정하지 않고 주입된 presentation capability와 이 문서의 applicability 조건을 함께 판정한다.

## 1. Color contract

### 1.1 Surface와 text

| Token | Light | Dark | High contrast |
|---|---:|---:|---:|
| canvas | `#F3F6F7` | `#080D11` | `#000000` |
| surface | `#FFFFFF` | `#0D151B` | `#000000` |
| surfaceRaised | `#FFFFFF` | `#142029` | `#0A0A0A` |
| surfaceInset | `#E9EFF1` | `#091217` | `#000000` |
| surfaceOverlay | `#F8FBFC` | `#17252E` | `#0A0A0A` |
| text | `#122027` | `#EAF2F4` | `#FFFFFF` |
| textSoft | `#465A64` | `#B4C3C8` | `#FFFFFF` |
| textMuted | `#5D717B` | `#8DA0A8` | `#E6E6E6` |
| textInverse | `#FFFFFF` | `#071310` | `#000000` |
| border | `#C7D3D8` | `#2B414D` | `#FFFFFF` |
| borderStrong | `#718791` | `#5E7480` | `#FFFFFF` |
| focusRing | `#006B5F` | `#78E6C5` | `#00FFFF` |
| selectionFill | `#D8F3EB` | `#153D34` | `#001C1C` |
| selectionStroke | `#006B5F` | `#78E6C5` | `#00FFFF` |
| hoverWash | `#E5ECEF` | `#192832` | `#1A1A1A` |
| scrim | `#0B182066` | `#000000B3` | `#000000CC` |
| shadow | `#10242F26` | `#00000080` | `#00000000` |
| foldShadow | `#12202733` | `#00000080` | `#00000000` |
| foldHighlight | `#FFFFFFB3` | `#D8F8F233` | `#00000000` |

`border`는 장식 전용이다. input/focus/selection/status boundary는 `borderStrong` 이상을 사용한다.

### 1.2 Health

| Health | Light fill / stroke | Dark fill / stroke | High contrast fill / stroke |
|---|---|---|---|
| healthy | `#DDF6EC` / `#087A62` | `#12382F` / `#67DEB5` | `#00261C` / `#00FF9C` |
| neutral | `#E8EEF0` / `#526873` | `#1D2C33` / `#A9BAC1` | `#111111` / `#FFFFFF` |
| degraded | `#FFF0CE` / `#9A5B00` | `#3A2B11` / `#F2BE5C` | `#2A2200` / `#FFD400` |
| unhealthy | `#FDE5E2` / `#B42318` | `#411F22` / `#FF8178` | `#2A0000` / `#FF4D4D` |
| unknown | `#EBEDF0` / `#626A73` | `#252D33` / `#91A4AD` | `#171717` / `#C0C0C0` |

Home treemap의 pod tile은 해당 health의 **fill을 타일 전체 면에** 적용하고 같은 행의 stroke를 경계에 적용한다. health를 얇은 좌측 strip으로 축약하는 표현은 금지한다. 좌측 3px strip은 namespace 안정 색인 `namespaceStableFill` 전용이며 health channel과 공유하지 않는다.

`namespaceStableFill`은 UTF-8 namespace의 FNV-1a hash를 `hue = hash mod 360`으로 투영한다. light는 `oklch(0.50 0.09 hue)`, dark는 `oklch(0.65 0.09 hue)`를 쓰고, hue가 health palette hue의 ±20°이면 +40°를 적용해 다시 판정한다. high contrast/forced-colors에서는 `CanvasText`와 namespace text label을 함께 사용한다. namespace 색은 면적, health, relation 의미를 대신하지 않는다.

### 1.3 Relation plane

| Relation | Light | Dark | High contrast | 보조 문법 |
|---|---:|---:|---:|---|
| placement | `#526D7A` | `#8CA1AA` | `#FFFFFF` | solid, parent marker |
| configured | `#526D7A` | `#8CA1AA` | `#FFFFFF` | `6 4` dash, hollow arrow |
| effective | `#006EAD` | `#62B9F2` | `#00C8FF` | solid, filled arrow |
| observed | `#00785E` | `#61E0B6` | `#00FF9C` | ribbon, gradient arrow |
| ownership | `#6746A5` | `#B9A2FF` | `#D09CFF` | owner bracket, dependent arrow |
| dependency | `#8A5C00` | `#E4B968` | `#FFD400` | `2 4` dash, plug marker |
| storage | `#206C84` | `#65C3D7` | `#00FFFF` | `8 3` dash, storage marker |
| policy | `#9B3D73` | `#F09AC2` | `#FF80C8` | `1 3` dash, shield marker |
| GitOps provenance | `#5B5FC7` | `#A8B0FF` | `#A6B3FF` | `10 3 2 3`, revision marker |
| restricted/drop | `#B42318` | `#FF8178` | `#FF4D4D` | crosshatch/chevron |

Provider/Kind가 relation color를 결정하지 않는다. semantic plane만 palette key다.

### 1.4 Contrast

- 일반 text 4.5:1, large text 3:1.
- 상태/선/focus/control boundary 등 의미 있는 non-text graphic 3:1.
- High contrast 일반 text 7:1, graphic 4.5:1.
- focus ring은 2px solid + 2px offset이며 양쪽 인접 색 각각과 3:1.
- alpha 적용 뒤 실제 composited pixel로 contrast를 검사한다.
- `forced-colors: active`는 `Canvas`, `CanvasText`, `ButtonText`, `Highlight`, `HighlightText`로 override한다.
- 색만으로 상태를 전달하지 않고 shape/pattern/icon/text를 함께 쓴다.

## 2. Pattern descriptor

Pattern은 URL/CSS string이 아니라 renderer-neutral `PatternDescriptor`다.

| 상태 | 정확한 pattern |
|---|---|
| stale | 8×8px dot grid, radius 1px, stale ink 75%, animation 없음 |
| partial | 45° hatch, stroke 1px, pitch 8px, ink 75%, border `6 3` |
| missing | 135° hatch, stroke 1px, pitch 6px, ink 75%, surfaceInset base, `?` 또는 em dash |
| restricted | ±45° crosshatch, stroke 1.5px, pitch 6px, ink 85%, lock glyph; identity/count 숨김 |
| dropped/rejected edge | 6px chevron + 6px gap, 1.5px restricted stroke |
| zero | hatch 없음; structural shelf와 literal `0` |

High contrast는 stroke 2px, dot radius 1.5px, pitch 6px, opacity 100%다. 우선순위는 `restricted > missing > partial`; stale dot은 partial hatch와 합성 가능하며 restricted는 다른 pattern을 억제한다.

## 3. Dimension, target, typography

모든 값은 CSS px다.

| 항목 | 값 |
|---|---:|
| spacing quantum | 4 |
| compact / medium / wide / xwide map padding | 8 / 12 / 16 / 20 |
| frame gap / nested child gap | 8 / 2 |
| frame border / radius / header | 1 / 8 / 28 |
| frame inner inset | 4 |
| tile border / radius / selected border | 1 / 4 / 2 |
| packed pod tile minimum / gap | 14×14 / 2 |
| namespace stability strip width | 3 |
| focus ring / offset | 2 / 2 |
| status marker / summary marker | 6 / 8 |
| relation port / edge-to-node clearance | 6 / 6 |
| routing lane gap / minimum bend radius | 8 / 12 |
| rail row height / radius / gap | 40 / 6 / 8 |
| rail group gap / header | 16 / 28 |
| query/lens control height | 44 |
| persistent inspector | 384; min 320, max 440 |
| medium overlay inspector | 360 |
| mouse/keyboard minimum target | 24×24 |
| touch minimum target | 44×44 |

Tile이 44×44보다 작으면 touch 첫 tap은 56×56 target lens를 열고 두 번째 tap이 activation이다. 작은 Canvas tile도 keyboard accessibility mirror와 검색/list에서 접근 가능해야 한다.

Typography:

- tile name: 12/16px, weight 600.
- summary name: 13/18px, weight 600.
- tile absolute value: 11/14px mono, weight 500, tabular figures.
- frame/rail label: 12/16px, weight 600.
- inspector body: 13/20px.
- name/metric value는 각각 한 줄 ellipsis다. exact value는 tooltip/inspector에 유지한다.

## 4. Container mode와 rail

Viewport가 아니라 topology root container inline-size를 기준으로 한다.

| Mode | 범위 | 계약 |
|---|---:|---|
| compact | `<720` | gesture/graphical rail 금지, explicit lens control, focused-chain list, bottom inspector |
| medium | `720–1119` | 한쪽 rail `clamp(240px,38cqi,320px)`, center 최소 360px |
| wide | `1120–1599` | single rail `clamp(260px,24cqi,360px)`; butterfly rail 각각 `clamp(220px,20cqi,300px)` |
| xwide | `≥1600` | butterfly rail 각각 `clamp(260px,18cqi,340px)`, persistent inspector 가능 |

- rail/center gutter는 16px.
- butterfly는 inspector 제외 map inline-size ≥1120px이고 center ≥480px일 때만 가능하다.
- persistent inspector는 384px + 16px gutter를 제외한 뒤에도 위 조건이 유지될 때만 쓴다.
- container block-size <560px이면 inspector는 overlay, structural shelf는 collapsed다.
- bottom structural shelf는 collapsed 32px, expanded `min(192px,28cqb)`, row 36px다.
- Zero/No data/Unavailable/Unscheduled/Residual은 area rail이 아니라 structural shelf다.
- rail card inline-size는 160–320px다.

### 4.1 Presentation capability와 우선순위

| Presentation | v0 support | 진입 | capability/applicability |
|---|---|---|---|
| map | required | topology 진입·focus 종료 | 항상 enabled |
| focus-sankey | required, primary | map cube click/Enter | 항상 enabled; compact는 동일 논리의 list fallback |
| rail | optional, secondary | explicit lens control | `rail=true`일 때만; false면 control 숨김 |
| fold gesture | v1 이후, v0 금지 | v1 이후 rail endpoint 사이 horizontal drag | v0에서는 `foldGesture=false`; listener/progress/control 없음 |
| butterfly | optional, secondary | explicit control | `butterfly=true`와 §4 size 조건을 모두 만족 |

Capability가 catalog에는 있지만 현재 runtime·input·container 조건 때문에 applicable하지 않으면 control은 disabled이고 이유를 표시한다. capability 자체가 false인 실험 기능은 v0 surface에서 숨긴다. capability 판정은 provider 이름 branch가 아니라 injected presentation policy 하나에서 온다. v0의 focus-sankey와 rail/butterfly는 상호 배타적이며, secondary presentation에서 focus를 요청하면 먼저 map geometry로 순간 이동하지 않고 현재 rect에서 focus target으로 직접 retarget한다. fold gesture는 v1 전까지 capability catalog와 v0 UI 모두에 노출하지 않는다.

### 4.2 Focus-Sankey geometry와 전체 항목 불변조건

Focus source는 inline-start, 전체 target column은 inline-end에 둔다. LTR의 물리적 좌우는 RTL에서 mirror하지만 source/target relation 방향은 바꾸지 않는다. 이 문서 밖의 86px/118px cube, 3px/5px radius, 56px density breakpoint 같은 값은 사용하지 않는다.

- source cube는 frame radius 8px, 최소 block-size 44px, rail card inline-size 160–320px를 사용한다.
- target cube는 rail row height/radius/gap 40/6/8px를 사용하고, health group 사이는 16px, group header는 28px다.
- source/target column과 connector canvas 사이 gutter는 16px다.
- target label과 density는 §3과 §5를 그대로 사용한다. focus 전용 density threshold를 만들지 않는다.
- target column이 container block-size를 넘으면 논리 collection은 유지한 채 vertical virtualization/scroll을 사용한다. DOM mount 수를 완전성 기준으로 사용하지 않는다.
- compact에서는 sticky source summary 뒤에 health group별 `관련 항목`과 `관련 없음` list를 렌더한다. graphical face connector만 생략하고 아래 집합 불변조건, 순서, count, keyboard 결과는 동일하다.

한 committed map frame의 focus 가능한 고유 `entityKey` 집합을 `U`, source를 `s`라 한다. `U`에는 현재 access/redaction/LOD가 허용한 resource와 명시적 projection item이 들어가며, chrome과 identity 없는 장식 frame은 들어가지 않는다. LOD aggregate는 member 수만큼 부풀리지 않고 하나의 item이다. partial frame이면 `U`에 대한 아래 등식은 여전히 exact이고 화면은 별도로 partial/completeness를 표시한다.

```text
A = { x in U - {s} | active relation set에 s와 x가 인접함 }
N = (U - {s}) - A
G = A를 canonical health level로 partition한 non-empty group 집합
right = concat(G의 member, N)

unique(right) = true
right ∩ {s} = ∅
union(G members) = A
G_i ∩ G_j = ∅  (i != j)
right.length + 1 = U.size
```

인접성은 canonical edge의 방향을 보존하되 표시 membership 계산에서 source 또는 target 어느 쪽에 `s`가 있어도 성립한다. 한 item에 여러 relation/evidence가 있어도 `A`에는 한 번만 들어가며 해당 relation key 전부를 member detail에 보존한다. hidden peer를 추론해 `U`, `A`, count에 추가하지 않는다. 정책이 허용한 restricted placeholder는 하나의 고유 item이며 health `unknown`으로 처리한다.

Health group 순서는 `unhealthy → degraded → unknown → neutral → healthy`, group 내부는 canonical label sort key 뒤 `entityKey` 순이다. `N`은 base map의 logical inline-start→inline-end, block-start→block-end, `entityKey` 순서를 유지한다. health 변경이 group membership을 바꾸면 map에서는 geometry를 유지하지만 focus-sankey에서는 presentation layout revision을 올려 현재 rect에서 retarget한다.

## 5. Tile density

Worker가 CSS px rect와 실제 text measurement를 함께 만족할 때만 상위 density를 선택한다.

| Density | 최소 width | 최소 height | 최소 area | 내용 |
|---|---:|---:|---:|---|
| marker | 0 | 0 | 0 | 상태 shape/color만 |
| name | 72 | 28 | 2,016 | 이름 한 줄 |
| name-value | 104 | 48 | 4,992 | 이름 + absolute value |
| summary | 160 | 76 | 12,160 | marker + 이름 + absolute value |

- padding은 marker 0, name 6, name-value 8, summary 10px.
- measured text가 `width - 2×padding`에 맞지 않으면 한 단계 낮춘다.
- morph 중 target label/density는 `labelReveal` 전까지 숨기고 cube-local `focusMorph` progress 80%에서 등장시킨다. 별도 70% threshold나 component-local duration을 만들지 않는다.
- rect 한 변 <2px 또는 area <4px²이면 부풀리지 않고 같은 parent의 `Subpixel remainder` projection으로 정확히 합산한다. 원 member는 zoom/LOD expansion으로 조회 가능해야 한다.

## 6. Relation과 ribbon

### 6.1 비정량 canonical edge

비정량 edge:

- placement: 1px solid.
- configured: 1.25px, `6 4`.
- effective: 1.75px solid.
- ownership: 1.5px fixed.
- dependency: 1.25px, `2 4`.
- storage/policy/GitOps: 1.5px, §1 dash.
- normal composited opacity ≥0.82.
- stale은 opacity를 낮춰 대비를 잃지 않고 `2 4` freshness overlay + animation stop으로 표시한다.
- hover/selection은 semantic width를 바꾸지 않고 4px outer halo를 추가한다.
- pointer hit width는 `max(8px, renderedWidth + 6px)`다.
- cubic routing tension 0.42, node clearance 6px다.

### 6.2 Focus face connector

`focus-face-connector`는 canonical edge의 width encoding이 아니라 health group과 source cube의 세로 face를 잇는 presentation geometry다. ribbon 형태로 렌더해도 `observed-flow-ribbon`과 타입, palette role, legend, motion channel을 공유하지 않는다.

- non-empty health group 하나가 connector 하나이고 connector 하나가 정확히 ribbon-shaped band 하나다. member별 분기, 중앙점 결합, 같은 group의 중복 ribbon을 금지한다.
- target face는 group 첫 target cube의 block-start부터 마지막 cube의 block-end까지다. source face는 target group face 높이 비율로 segment를 나눈다.
- source segment는 source face 전체를 gap/overlap 없이 정확히 partition한다. 비율 입력은 settled target group의 block-start부터 block-end까지의 face block-size이며, member 수는 접근성 label의 `memberCount`에만 쓴다. CSS pixel 반올림 residual은 fractional remainder가 가장 큰 group에 먼저 배정하고 tie는 health order 뒤 group key 순으로 끊는다.
- target group이 `g`개이면 source segment와 focus face connector도 정확히 `g`개다. 관련 item이 0개이면 둘 다 0개다. 관련 없는 `N`에는 connector가 없다.
- band 두께는 양쪽 결합 face의 기하적 결과이며 traffic, request rate, byte rate, latency, weight가 아니다. label/accessible name에 `관련 {memberCount}개 · 집합 크기`를 표시한다.
- fill은 source health token에서 target group health token으로 향하는 static gradient이고 relation plane icon/pattern을 member label에 보존한다. `observed` palette token을 사용하지 않는다.
- particle, moving dash, speed, latency duration, emission cadence를 적용하지 않는다.
- focus-sankey v0에서는 quantitative observed-flow ribbon layer를 동시에 겹치지 않는다. observed 값은 member detail/inspector에 표시하며, 정량 flow spatial encoding은 capability가 있는 observed rail lens에서 연다.

### 6.3 Observed flow ribbon

`observed-flow-ribbon`은 같은 metric/unit/window cohort의 positive finite 값만 사용한다.

```text
d0 = Q05(values), d1 = Q95(values)       // Hyndman–Fan type 7
t  = clamp((ln(v)-ln(d0))/(ln(d1)-ln(d0)), 0, 1)
width = 1.5 + 14.5*t                     // 1.5–16px
```

- `d1/d0 < 1.001` 또는 edge 하나면 6px 고정.
- zero는 static effective line, missing은 width cohort에서 제외.
- Q05 아래/Q95 위 clipping count를 legend에 표시.
- selected edge는 width가 아니라 halo로 강조.
- ribbon opacity 0.82, selected 0.95.
- direction gradient는 source 72% opacity → target 100%, arrowhead 6px.
- ownership/dependency와 `focus-face-connector`에는 이 quantitative scale을 적용하지 않는다.

## 7. Particle

Emission role이 선언된 fresh observed rate만 particle을 가진다.

```text
e = flow-rate cohort의 Q05/Q95 log normalization
particlesPerSecond = 0.75 + 5.25*e       // edge당 0.75–6/s
```

- Canvas global emission cap 120/s, active cap 240.
- WebGL global emission cap 600/s, active cap 1,200.
- 초과하면 모든 cadence를 비례 축소한다. 0.25/s 미만 edge는 static `observed-flow-ribbon`만 유지하고 focused chain은 최소 0.75/s를 우선 배정한다.
- 일반 particle은 6×3px capsule, dropped/rejected는 5×5px diamond다.
- relationKey+frameId로 phase를 deterministic seed한다.

실제 latency가 있으면:

```text
travelMs = clamp(600, 2400, 450 + 450*log10(1 + latencyMs))
```

Latency가 없으면 1,200ms 고정이고 tooltip은 `방향만 표현 · 이동 시간은 지연 시간이 아님`을 표시한다. stale 전환 시 신규 emission을 즉시 중단하고 기존 particle을 120ms fade-out한다. rate가 없거나 reduced motion이면 particle은 0개다.

## 8. Secondary rail/fold gesture와 semantic progress — v1 이후

**이 절은 v1 이후 설계 기록이며 현재 v0 구현이 금지된다.** v0에서는 `foldGesture=false`이고 gesture listener, pointer capture, progress state, control을 만들지 않는다. v1에서 별도 승인된 `rail=true && foldGesture=true` secondary presentation에만 아래 규칙을 적용한다. focus-sankey 진입/복귀와 cube activation에는 `p`를 사용하지 않는다. `p`는 single-side rail lens 전환에만 쓴다.

- `p=0`: placement.
- `p=+1`: network, logical inline-start.
- `p=-1`: ownership/GitOps, logical inline-end.
- `logicalDx = (dir === "ltr" ? 1 : -1) × physicalDx`.
- RTL은 physical direction만 반전하고 semantic sign은 유지한다.
- butterfly는 별도 endpoint geometry/control이며 `p`로 표현하지 않는다. butterfly에서 horizontal fold drag를 시작하지 않는다.

Gesture travel:

- medium: `clamp(200px,42cqi,360px)`.
- wide: `clamp(240px,36cqi,440px)`.
- xwide: `clamp(260px,32cqi,480px)`.

Activation:

- mouse slop 4px, pen 6px, touch 10px.
- `|logicalDx| ≥ 1.25×|dy|`일 때만 horizontal axis lock.
- vertical이 먼저 이기면 cancel하고 native scroll을 허용.
- `touch-action: pan-y`; axis lock 뒤 pointer capture.
- control/input/inspector scroll area에서 gesture 시작 금지.
- compact/reduced motion에서는 gesture를 등록하지 않는다.

Overscroll:

```text
raw = pStart + logicalDx / travel
display = sign(raw) *
  (1 + 0.08*(1-exp(-(abs(raw)-1)/0.18)))   // |raw|>1
```

Endpoint geometry는 1에서 고정하고 scene rubber-band translation은 최대 12px다. committed p는 `[-1,1]`다.

Release velocity는 최근 80ms sample의 least-squares slope다.

- `|velocity| ≥ 0.9 p/s`이고 displacement ≥0.12면 velocity 방향 한 semantic stop만 이동.
- 그 외 `p≥0.5 → +1`, `p≤-0.5 → -1`, 나머지는 0.
- +1에서 한 flick로 -1 또는 반대 방향으로 건너뛰지 않는다.
- Escape/pointercancel은 pointerdown 상태로 160ms 복귀.

```text
snapDuration = clamp(140ms, 320ms, 120ms + 200ms*abs(targetP-currentP))
ease = cubic-bezier(0.2,0.8,0.2,1)
```

## 9. Focus-Sankey와 v1 이후 secondary Fold transition sequence

### 9.1 Focus-Sankey motion tokens

이 토큰은 focus-sankey에만 적용한다. 아래의 generic `morph=320ms`, `lineUnfold=200ms`, `stagger=12ms`가 focus 값으로 대체되거나 반대로 focus 값이 scope/rail 또는 v1 이후 fold에 번지면 contract 위반이다.

| Token | 값 | 의미 |
|---|---:|---|
| `ribbonErase` | 150ms | 기존 ribbon/connector를 완전히 소거한 뒤 morph를 시작 |
| `focusMorph` | 720ms; map x순 24ms/cube stagger, 누적 delay cap 300ms | 각 cube의 map↔focus x/y/w/h/radius 동시 보간 |
| `labelReveal` | cube-local `focusMorph` progress 80% | source/target label 등장 gate |
| `ribbonDraw` | 560ms; 마지막 cube settle 뒤 60ms 정지 후 시작 | settled geometry에서 `focus-face-connector` band 하나의 source→target reveal |
| `connectorStagger` | 110ms / non-empty health connector | severity order connector 시작 간격 |
| `focusMorphEase` | `cubic-bezier(0.3,0.7,0,1)` | 감속 지배 spatial morph |
| `ribbonDrawEase` | `cubic-bezier(0.33,1,0.68,1)` | connector reveal |

`focusMorph` stagger의 정렬 key는 base rect의 logical inline 좌표, block 좌표, `entityKey` 순이며 배열 index나 random delay를 사용하지 않는다. 각 cube의 duration은 720ms이고 `delay=min(rank×24ms,300ms)`다. connector 시작 gate는 고정 clock이 아니라 실제 마지막 cube의 settled signal과 그 뒤 60ms 정지다.

`ribbonErase`가 끝나고 focus geometry가 시작된 시점부터 마지막 cube settle까지의 upper bound는 `720ms + 300ms = 1,020ms`와 최대 1 animation frame이다. connector completion은 이 morph budget에 포함하지 않는다. group 수를 `G`라 할 때 마지막 cube settle부터 마지막 connector completion까지는 `G=0`이면 0ms, 그 외 `60ms + 560ms + (G-1)×110ms`와 최대 1 animation frame이며 health group은 최대 5개다.

Map → focus-sankey:

1. focus layout 전체와 §4.2 집합/face invariant가 통과하기 전에는 transition을 commit하지 않는다. 120ms를 넘으면 source cube에 cancellable pending indicator를 표시한다.
2. 기존 relation/observed-flow/focus ribbon layer를 `ribbonErase=150ms`로 완전히 소거한다. 소거가 끝나기 전에는 cube morph를 시작하지 않으며 새 focus face connector는 0개다.
3. 소거 완료 뒤 모든 `U` cube를 현재 presentation rect에서 target rect로 `focusMorph`한다. source와 관련/비관련 cube 모두 object identity를 유지하고, 비관련 cube의 최종 opacity만 0.30이다.
4. source/target label은 각 cube-local morph progress가 `labelReveal=80%`에 도달할 때 등장한다. label은 geometry보다 먼저 target 위치로 점프하지 않는다.
5. 마지막 cube가 settle하면 60ms 정지한 뒤 non-empty health group 순서로 connector reveal을 시작한다. connector마다 `ribbonDraw=560ms`, 시작 간격은 `connectorStagger=110ms`이며 source face에서 target group face 방향으로 clip/path를 연다. fade-in만으로 방향을 대체하지 않는다.
6. 마지막 connector가 끝난 뒤 focus completion을 한 번 announce한다. connector가 0개이면 cube settle이 completion이다.

Focus-sankey → map:

1. face connector를 `ribbonErase=150ms`로 완전히 제거한다. connector reveal을 역재생하지 않는다.
2. connector opacity가 0이 된 뒤 현재 rect에서 map rect로 cube를 `focusMorph`한다. 공간 stagger는 focus 진입과 같은 canonical base-map order를 사용한다.
3. map label/density는 cube-local `labelReveal=80%`에 등장하고 마지막 cube settle 뒤 mode completion을 commit한다.

Interruption과 realtime:

- 사용자가 다른 target을 activation하면 기존 connector draw를 취소하고 `ribbonErase=150ms`로 제거하며, 각 cube의 현재 interpolated rect를 새 `focusMorph`의 source로 캡처한다. map rect로 순간 복귀하거나 처음 rect에서 재시작하지 않는다.
- Escape/back은 같은 규칙으로 현재 rect에서 map target으로 retarget한다.
- stream delta는 canonical reducer에 계속 적용한다. transition이 캡처한 `U`와 geometry만 settle까지 유지하고, 최신 frame의 membership/health/relation 변경은 완료 직후 한 번 coalesce해 현재 rect에서 새 focus layout으로 retarget한다. data event 자체를 폐기하거나 transport 적용을 지연하지 않는다.
- transition 중 source가 삭제되면 interaction-disabled tombstone으로 exit 160ms를 완료한 뒤 최신 frame의 map으로 복귀한다. 이름이 같은 다른 UID를 source로 대체하지 않는다.
- 새 connector는 언제나 새 target geometry가 settle한 뒤 그 geometry로 다시 계산한다. 움직이는 cube를 connector endpoint가 뒤쫓지 않는다.

### 9.2 Secondary fold geometry와 sequence — v1 이후, v0 구현 금지

이 절의 geometry, duration, gesture sequence는 v1 이후 참고값이다. v0 product code, event union, capability UI, test expectation에 이 절을 구현하거나 노출하지 않는다.

- drag frame은 captured endpoint rect의 screen-space x/y/w/h/radius를 선형 보간하고 worker를 호출하지 않는다.
- child는 interpolated parent clip을 유지한다.
- target-only relation entity는 연결 placement entity의 weighted barycenter에서 8×8px/opacity 0으로 시작한다. 연결 대상이 없으면 catalog group rail anchor에서 시작한다.
- fold seam band는 desktop 32px, touch 24px.
- shadow/highlight opacity는 `sin(π×abs(p)) × 0.18 / 0.10`; endpoint/center에서 0.
- high contrast/reduced motion은 seam shading을 끈다.
- edge는 움직이는 node를 따라다니지 않고 endpoint settle 이후 unfold한다.

Placement → relation:

1. `0..D`: tile/frame/rail geometry morph, relation/particle opacity 0.
2. `D..D+200ms`: line/observed-flow ribbon source→target `pathLength 0→1`.
3. `D+100..D+200ms`: marker/edge label opacity 0→1.
4. `D+200ms`: fresh observed particle emission 시작.
5. `D+200..D+320ms`: particle opacity 0→1.

이 secondary fold sequence의 총 최대는 640ms이며 focus-sankey timing budget이 아니다.

Relation → placement:

1. 0..80ms particle/label fade and stop.
2. 0..120ms line retract.
3. 120..440ms tile morph.

Network ↔ ownership:

1. 0..80ms 기존 particle/line fade.
2. 0..200ms current endpoint → center.
3. 200..440ms center → opposite endpoint.
4. 440..600ms 새 line unfold.
5. 600ms particle 시작, 600..700ms fade-in.

Gesture 시작 시 기존 line/particle은 80ms 안에 사라지고 tile은 pointer를 즉시 따른다. 새 intent가 오면 현재 interpolated rect를 새 시작점으로 retarget한다.

Generic/scope/secondary motion tokens:

| Token | 값 |
|---|---:|
| feedback | 80ms |
| fast | 120ms |
| exit | 160ms |
| base | 180ms |
| enter | 200ms |
| morph | 320ms |
| scope | 360ms |
| lineUnfold | 200ms |
| particleFade | 120ms |
| stagger | 12ms, 최대 8개 / 84ms |
| standard ease | `cubic-bezier(0.2,0,0,1)` |
| emphasized ease | `cubic-bezier(0.2,0.8,0.2,1)` |
| enter ease | `cubic-bezier(0,0,0.2,1)` |
| exit ease | `cubic-bezier(0.4,0,1,1)` |

## 10. Scope zoom

Target child layout 준비 전에는 확대하지 않는다. 120ms를 넘으면 선택 tile 안에 cancellable pending indicator를 표시한다. 준비 완료 시점을 Z=0으로 한다.

Drill-in:

1. Z 0..100ms: 기존 relation/particle retract/fade.
2. Z 0..360ms: 선택 frame을 map content rect로 확대; target padding compact 8px, 그 외 16px.
3. Z 0..160ms: sibling opacity 1→0, scale 1→0.985.
4. Z 220..440ms: child tile opacity 0→1, scale 0.98→1; 12ms stagger, 최대 8개.
5. Z 440..620ms: 유지 relation lens line unfold; observed particle은 620ms부터.

Drill-out:

1. 0..100ms child relation/label fade.
2. 80..400ms selected frame collapse.
3. 260..440ms sibling fade-in.
4. density text는 geometry progress 70%에서 100ms crossfade.

동일 resource는 같은 entityKey/layoutId를 사용하고 중단 시 현재 rect에서 retarget한다. background update는 자동 fit을 발생시키지 않는다.

## 11. Reduced motion

`prefers-reduced-motion: reduce` 또는 product setting이 켜지면:

- horizontal fold gesture 비활성화, explicit lens control만 제공.
- geometry/camera/scale animation 0ms.
- lens/scope는 최대 80ms opacity crossfade만 허용.
- particle, moving dash, pulse, seam, parallax, stagger, count-up 0.
- relation은 즉시 static width/dash/arrow/pattern.
- map↔focus-sankey는 같은 `U/A/N/G`와 right-column 순서를 즉시 commit한다. `ribbonErase`, `focusMorph`와 그 stagger, `labelReveal`, `ribbonDraw`, `connectorStagger`는 모두 즉시 완료한다.
- graphical mode의 `focus-face-connector`는 완성된 static face band로 즉시 표시하고 compact fallback은 동일 grouped list를 사용한다. connector count, member count, face partition, accessible label은 일반 motion과 같다.
- enter/delete 최대 80ms opacity만.
- smooth scroll 금지.
- 실행 중 preference가 바뀌면 animation을 취소하고 committed presentation/lens/scope target으로 즉시 정렬. 진행 중 focus connector는 최종 static geometry로 교체한다.
- focus/live announcement/hit target/URL/event 결과는 일반 mode와 동일.

## 12. Z-order

CSS와 renderer layer enum을 동일하게 유지한다.

| Layer | z |
|---|---:|
| canvas/background | 0 |
| atmosphere/grid | 10 |
| group/frame surface | 20 |
| canonical relation / focus face connector | 30 |
| observed flow ribbon / particle | 32 |
| tile body | 40 |
| tile label/status | 50 |
| hover/selection/focus | 60 |
| fold seam | 70 |
| rail header/map chrome | 80 |
| query/context strip | 90 |
| inspector/drawer | 100 |
| tooltip | 110 |
| menu/popover | 120 |
| modal scrim | 130 |
| modal | 140 |
| toast/live connection status | 150 |
| DEMO/REPLAY origin marker | 160 |

Edge는 node port에서 clip되어 tile body/label을 덮지 않는다. Fold seam은 항상 `pointer-events:none`이다.

## 13. DOM / Canvas / SVG / WebGL handoff

Tile mode:

- DOM primary: visible tile ≤600, relation ≤800, rolling render p95 ≤10ms.
- 조건 하나가 1초 window에서 3회 연속 초과하면 Canvas primary.
- DOM 복귀: tile ≤420, relation ≤560, p95 ≤7ms가 5초 지속.
- Canvas scene hard limit: visible entity 8,000, relation 12,000. 초과하면 drop하지 않고 server LOD를 요구.
- DPR render buffer는 `min(devicePixelRatio,2)`.

Edge mode:

- SVG full edge는 visible edge ≤400.
- 초과 시 Canvas, hover/focus/selection edge만 SVG overlay.
- SVG overlay 최대 64 edge; 초과 selection은 aggregate highlight.
- particle은 DOM tile mode에서도 Canvas.
- active particle >240 또는 Canvas draw p95 >8ms이고 capability가 있으면 WebGL. 불가하면 emission을 줄이고 static `observed-flow-ribbon`은 유지.

Handoff:

- 같은 geometry buffer로 120ms crossfade; reduced motion은 즉시 교체.
- hit test는 공유 R-tree 하나만 담당해 renderer가 event를 중복 만들지 않는다.
- source renderer가 50%까지 input owner, 이후 destination이 owner다.
- Canvas/SVG/WebGL은 `aria-hidden`; accessibility mirror가 semantic owner다.
- DOM overlay는 focused/hovered/selected/pinned tile과 frame header만, 최대 200개.
- accessibility mirror는 roving focus 주변 ±50, selected 최대 200, group header를 virtualize하고 전체 탐색은 resource/relation list가 제공한다.
- renderer 전환은 query/layout/selection/focus/URL을 바꾸지 않는다.

## 14. Visual/motion release gates

1. 세 theme의 text/status/edge를 alpha composite 뒤 contrast 검사.
2. forced-colors screenshot.
3. map cube의 기본 activation이 focus-sankey이고 rail/fold capability false일 때 listener/control/progress state가 없는지 검증.
4. 임의 `U`, source, relation multigraph, health에 대해 `right.length+1=U.size`, right unique, `A/N` disjoint·exhaustive, health group partition을 property test.
5. non-empty health group 수 = source face segment 수 = `focus-face-connector` 수 = rendered band 수이고, group 하나당 band가 정확히 하나인지 검증.
6. source face segment가 settled target group block-size 비율과 일치하고 gap/overlap이 0이며 rounded height 합이 source face height와 정확히 같은지 residual/tie와 서로 다른 member-count/block-size 입력을 포함해 검증.
7. focus face connector에 flow width cohort, particle, speed, latency, observed palette가 적용되지 않고 observed-flow ribbon과 runtime discriminant가 다른지 검증.
8. fake clock으로 `ribbonErase=150ms`, `focusMorph=720ms`와 map x순 stagger 24ms/cap 300ms, `labelReveal=80%`, settle 뒤 60ms 정지, `ribbonDraw=560ms`, `connectorStagger=110ms` 및 단계 간 직렬 gate를 검증.
9. focus 진입/복귀/다른 source retarget/stream coalesced retarget 각 중간 frame에서 entityKey가 같고 rect jump가 0인지 검증.
10. reduced motion에서 spatial transform/particle/infinite animation/stagger/draw 0건이며 일반 mode와 `U/A/N/G`, connector count, focus/URL/announcement 결과가 같은지 검증.
11. secondary capability가 enabled일 때만 `p=-1,-.75,-.5,-.25,0,.25,.5,.75,1` visual regression과 RTL logicalDx/p sign property test를 실행.
12. generic transition은 `tile settle 전 line=0`, `line unfold 전 particle=0`; focus transition은 `마지막 cube settle 전 새 connector=0` invariant.
13. renderer handoff 전후 같은 entityKey/rect/focus/hit result.
14. density threshold ±1px regression.
15. component/CSS/renderer literal scan: 모든 값이 policy/theme 밖에 0건.
16. theme/renderer/motion 변경이 query hash/layout identity/metric cohort를 바꾸지 않음.
17. 390/768/1440과 container modes에서 focus source/전체 target collection/compact grouped list 및 secondary rail/center/inspector min-size 유지.
18. partial/LOD/virtualized focus에서도 logical collection 완전성은 유지되고 hidden peer/count가 노출되지 않는지 검증.

## 15. 닫힌 시각적 모순

- v0의 기본 relation interaction은 map cube → focus-sankey이고 rail/butterfly는 capability-gated secondary presentation이다. fold drag gesture는 v1 이후이며 v0 구현·노출을 금지한다.
- focus-sankey는 현재 map의 전체 logical item을 source 하나와 exhaustively partition된 target column으로 재투영하며 virtualization을 누락으로 취급하지 않는다.
- `p`는 focus-sankey에 사용하지 않는다. secondary rail에서 양쪽 relation을 동시에 표현하지 못하므로 butterfly를 별도 endpoint geometry/control로 분리한다.
- drag 중 worker 재계산을 하지 않고 captured source/target rect만 보간한다.
- transition은 언제나 `tile settle → connector/line unfold → observed particle`이며 edge가 움직이는 tile을 뒤쫓지 않는다.
- `focus-face-connector` band 두께는 source/target face 결합의 기하적 결과이고 반드시 cardinality label을 가진다. quantitative ribbon width/particle은 `observed-flow-ribbon`의 observed rate에만 적용하므로 ownership/configured relation이나 face connector를 유량처럼 표현하지 않는다.
- stale/partial/restricted/zero/missing은 색·opacity 하나가 아니라 독립 pattern과 label로 구분한다.
