---
title: Topology Visual and Motion Token Contract
status: authoritative-contract
owner: frontend-platform
version: topology-visual-motion/v1
last_verified: 2026-07-11
---

# Topology Visual / Motion Token Contract

## 0. 권한과 literal 규칙

이 문서는 topology visual/motion의 authoritative numeric contract다. 현재 코드에 아래 token과 policy가 없거나 값이 다르면 구현 gap이며, 임시 CSS·renderer literal·기존 화면이 이 수치를 덮어쓸 수 없다.

모든 수치와 시각 의미는 `TopologyVisualMotionPolicy/v1` 한 곳에서 소유한다. React component, renderer branch, CSS selector에 값·색상·duration literal을 중복하지 않는다.

- CSS raw color는 `product/styles/tokens.css`만 소유한다.
- Canvas/SVG/WebGL은 DOM과 같은 resolved theme policy object를 주입받는다.
- runtime geometry는 typed CSS custom property 또는 renderer buffer로만 전달한다.
- theme/renderer/motion 변화는 query hash, entity identity, layout revision의 의미를 바꾸지 않는다.

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
- morph 중 source density를 70% progress까지 유지하고 target density를 100ms crossfade한다.
- rect 한 변 <2px 또는 area <4px²이면 부풀리지 않고 같은 parent의 `Subpixel remainder` projection으로 정확히 합산한다. 원 member는 zoom/LOD expansion으로 조회 가능해야 한다.

## 6. Relation과 ribbon

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

Observed ribbon은 같은 metric/unit/window cohort의 positive finite 값만 사용한다.

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
- ownership/dependency에는 ribbon quantitative scale을 적용하지 않는다.

## 7. Particle

Emission role이 선언된 fresh observed rate만 particle을 가진다.

```text
e = flow-rate cohort의 Q05/Q95 log normalization
particlesPerSecond = 0.75 + 5.25*e       // edge당 0.75–6/s
```

- Canvas global emission cap 120/s, active cap 240.
- WebGL global emission cap 600/s, active cap 1,200.
- 초과하면 모든 cadence를 비례 축소한다. 0.25/s 미만 edge는 static ribbon만 유지하고 focused chain은 최소 0.75/s를 우선 배정한다.
- 일반 particle은 6×3px capsule, dropped/rejected는 5×5px diamond다.
- relationKey+frameId로 phase를 deterministic seed한다.

실제 latency가 있으면:

```text
travelMs = clamp(600, 2400, 450 + 450*log10(1 + latencyMs))
```

Latency가 없으면 1,200ms 고정이고 tooltip은 `방향만 표현 · 이동 시간은 지연 시간이 아님`을 표시한다. stale 전환 시 신규 emission을 즉시 중단하고 기존 particle을 120ms fade-out한다. rate가 없거나 reduced motion이면 particle은 0개다.

## 8. Fold gesture와 semantic progress

`p`는 single-side lens 전환에만 쓴다.

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

## 9. Fold geometry와 transition sequence

- drag frame은 captured endpoint rect의 screen-space x/y/w/h/radius를 선형 보간하고 worker를 호출하지 않는다.
- child는 interpolated parent clip을 유지한다.
- target-only relation entity는 연결 placement entity의 weighted barycenter에서 8×8px/opacity 0으로 시작한다. 연결 대상이 없으면 catalog group rail anchor에서 시작한다.
- fold seam band는 desktop 32px, touch 24px.
- shadow/highlight opacity는 `sin(π×abs(p)) × 0.18 / 0.10`; endpoint/center에서 0.
- high contrast/reduced motion은 seam shading을 끈다.
- edge는 움직이는 node를 따라다니지 않고 endpoint settle 이후 unfold한다.

Placement → relation:

1. `0..D`: tile/frame/rail geometry morph, relation/particle opacity 0.
2. `D..D+200ms`: line/ribbon source→target `pathLength 0→1`.
3. `D+100..D+200ms`: marker/edge label opacity 0→1.
4. `D+200ms`: fresh observed particle emission 시작.
5. `D+200..D+320ms`: particle opacity 0→1.

총 최대 640ms다.

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

Motion tokens:

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
- enter/delete 최대 80ms opacity만.
- smooth scroll 금지.
- 실행 중 preference가 바뀌면 animation을 취소하고 committed lens/scope target으로 즉시 정렬.
- focus/live announcement/hit target/URL/event 결과는 일반 mode와 동일.

## 12. Z-order

CSS와 renderer layer enum을 동일하게 유지한다.

| Layer | z |
|---|---:|
| canvas/background | 0 |
| atmosphere/grid | 10 |
| group/frame surface | 20 |
| relation/ribbon | 30 |
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
- active particle >240 또는 Canvas draw p95 >8ms이고 capability가 있으면 WebGL. 불가하면 emission을 줄이고 static ribbon은 유지.

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
3. `p=-1,-.75,-.5,-.25,0,.25,.5,.75,1` visual regression.
4. RTL logicalDx와 p sign property test.
5. fake clock으로 각 sequence 시작/끝 검증.
6. `tile settle 전 line=0`, `line unfold 전 particle=0` invariant.
7. reduced motion에서 spatial transform/particle/infinite animation 0건.
8. renderer handoff 전후 같은 entityKey/rect/focus/hit result.
9. density threshold ±1px regression.
10. component/CSS/renderer literal scan: 모든 값이 policy/theme 밖에 0건.
11. theme/renderer/motion 변경이 query hash/layout identity/metric cohort를 바꾸지 않음.
12. 390/768/1440과 container modes에서 rail/center/inspector min-size 유지.

## 15. 닫힌 시각적 모순

- `p`는 양쪽 relation을 동시에 표현하지 못하므로 butterfly를 별도 endpoint geometry/control로 분리한다.
- drag 중 worker 재계산을 하지 않고 captured source/target rect만 보간한다.
- transition은 언제나 `tile settle → line unfold → particle`이며 edge가 움직이는 tile을 뒤쫓지 않는다.
- quantitative ribbon/particle은 observed rate에만 적용하고 ownership/configured relation을 유량처럼 표현하지 않는다.
- stale/partial/restricted/zero/missing은 색·opacity 하나가 아니라 독립 pattern과 label로 구분한다.
