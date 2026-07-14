---
title: VP-017 — 모션 규격 (SLG 다이나믹)
status: spec-approved
date: 2026-07-14
owner: 단독 세션 (구현) / 우녕 (확정)
governing: VP-015 §4.6 · §5.2~§5.4의 수치 정본. 충돌하면 이 문서가 이긴다.
---

# VP-017 — 모션 규격

> "게임 UI라고 생각해. SLG 게임에서 표현하는 다이나믹한 상태창 같아야 한다는 거지." — 우녕

이 문서는 **취향이 아니라 계약**이다. 여기 적힌 수치를 그대로 쓴다.
"적당히 부드럽게"는 구현자마다 달라지고, 달라지면 일관성이 깨진다.

---

## 0. 왜 모션이 기능인가

Opsia의 화면은 **필터가 곧 줌**이다 (VP-015 §0).
줌 전환을 정적 리렌더로 처리하면 사용자는 **"내가 어디로 이동했는지"를 모른다.**
클러스터 격자에서 서버 뷰로 화면이 그냥 바뀌면, 그건 **다른 페이지처럼 보인다.**

**모션이 공간 관계를 가르친다.** 클러스터 카드 안의 작은 블록이 **커져서 서버 카드가 되면**,
사용자는 설명 없이 "내가 저 클러스터 안으로 들어왔다"를 안다.

그래서 모션은 장식이 아니라 **§0 통찰의 구현체**다. 빼면 통찰이 전달되지 않는다.

---

## 1. 토큰 (`theme.css` — 정본은 여기 한 곳)

```css
:root {
  /* duration */
  --motion-instant:  120ms;  /* hover, 포커스, 색 변화 */
  --motion-quick:    180ms;  /* 칩 추가/삭제, 배지 */
  --motion-pop:      340ms;  /* 파드 등장 */
  --motion-layout:   320ms;  /* 패널 슬라이드, 노드 착지 */
  --motion-camera:   420ms;  /* 줌 레벨 전환 전체 */
  --motion-value:    500ms;  /* 수치 막대(CPU/MEM) 보간 */

  /* easing */
  --ease-out:     cubic-bezier(0.16, 1, 0.30, 1);      /* 감속. 대부분 여기 */
  --ease-in-out:  cubic-bezier(0.65, 0, 0.35, 1);      /* 왕복 */
  --ease-spring:  cubic-bezier(0.34, 1.20, 0.50, 1);   /* 살짝 오버슈트. 착지용 */
  --ease-pop:     cubic-bezier(0.34, 1.40, 0.50, 1);   /* 강한 오버슈트. 파드 등장 전용 */

  /* stagger */
  --stagger-node: 70ms;   /* 서버/클러스터 카드 사이 */
  --stagger-pod:  32ms;   /* 파드 사이 */
  --stagger-row:  18ms;   /* 표 행 사이 */
  --stagger-max:  520ms;  /* 누적 딜레이 상한. 넘으면 0으로 클램프 */
}
```

**`--stagger-max` 규칙이 중요하다.** 파드 50개에 32ms씩 주면 마지막 파드가 1.6초 뒤에 뜬다.
그건 다이나믹이 아니라 **느린 것**이다.

```ts
const delay = Math.min(index * STAGGER_POD, STAGGER_MAX);
```
**상한에 걸린 것들은 함께 등장한다.** 처음 16개가 순차적으로 튀고, 나머지는 같이 착지한다.
파드는 서버당 12개가 상한이므로(VP-015 §4.3) 실제로는 12 × 32 = 384ms — 상한 안이다.

---

## 2. 파드 등장 — `pop`

```css
@keyframes pod-pop {
  0%   { transform: scale(0.30); opacity: 0; }
  60%  { transform: scale(1.14); opacity: 1; }
  100% { transform: scale(1.00); opacity: 1; }
}
.pod {
  animation: pod-pop var(--motion-pop) var(--ease-pop) backwards;
  animation-delay: var(--pod-delay);   /* 인라인으로 주입 */
  transition: transform var(--motion-instant) var(--ease-out),
              opacity   var(--motion-quick)   var(--ease-out),
              background-color var(--motion-value) var(--ease-out);
}
.pod:hover { transform: scale(1.25); z-index: 1; }
```

**`backwards`가 필수다.** 없으면 딜레이 동안 파드가 최종 크기로 먼저 보였다가 사라진다.

**딜레이 계산:**
```ts
podDelay = nodeIndex * STAGGER_NODE + podIndexWithinNode * STAGGER_POD
```
서버 단위로 물결이 지나간다. 서버 1의 파드가 다 튀고 → 서버 2 → 서버 3.

---

## 3. 노드 착지 — `land`

서버 카드 · 클러스터 카드 · Home 위젯 공통.

```css
@keyframes node-land {
  0%   { transform: translateY(14px) scale(0.94); opacity: 0; }
  100% { transform: translateY(0)    scale(1.00); opacity: 1; }
}
.node {
  animation: node-land var(--motion-layout) var(--ease-spring) backwards;
  animation-delay: var(--node-delay);
  transition: transform var(--motion-instant) var(--ease-out),
              border-color var(--motion-instant) var(--ease-out);
}
.node:hover { transform: translateY(-2px); border-color: var(--border-strong); }
```

---

## 4. 줌 전환 — 카메라 이동 ★

**핵심 요구:** "클러스터 카드 안의 작은 서버 블록이 **커져서** 서버 카드가 된다."

### 4.1 예고 (foreshadow)

클러스터 카드는 **서버 개수만큼 작은 블록을 실제로 그린다.**
```
┌─ prod-eks ────────┐
│ (AWS)             │
│ ▬ ▬ ▬             │   ← 서버 3대. 20×14px 블록. 이게 나중에 서버 카드가 된다.
│ 서버 3 · 파드 47   │
└───────────────────┘
```
**개수가 5를 넘으면 5개 + `+N`.** 블록은 장식이 아니라 **다음 화면의 미리보기**다.

### 4.2 전환 (FLIP)

`@xyflow/react`를 쓰므로 **React 리렌더 후 위치가 바뀌는 것**을 FLIP으로 보간한다.

```
F  (First)  줌인 직전, 클러스터 카드 안 서버 블록들의 DOMRect를 측정한다
L  (Last)   필터 칩 추가 → 서버 뷰 렌더 → 서버 카드들의 DOMRect를 측정한다
I  (Invert) 서버 카드에 transform을 걸어 "블록이 있던 자리·크기"로 되돌려 놓는다
P  (Play)   transform을 제거하고 --motion-camera / --ease-spring 으로 흘려보낸다
```

**id 매칭:** `data-morph-id={`server:${cluster.id}:${index}`}`
클러스터 카드의 블록과 서버 카드가 **같은 `morph-id`를 갖는다.** 이 값으로 짝을 찾는다.
짝이 없는 요소(파드, CPU 막대)는 FLIP 대상이 아니고 **§2·§3의 등장 애니메이션**을 탄다.

```ts
// packages/motion/useCameraMorph.ts  (프레임워크 무관, 순수 DOM + 유닛 테스트)
export function morph(fromRects: Map<string, DOMRect>, root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-morph-id]').forEach((el) => {
    const from = fromRects.get(el.dataset.morphId!);
    if (!from) return;                       // 짝 없음 → 일반 등장
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top  - to.top;
    const sx = from.width  / to.width;
    const sy = from.height / to.height;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.6 },
       { transform: 'none', opacity: 1 }],
      { duration: 420, easing: 'cubic-bezier(0.34,1.20,0.50,1)', fill: 'both' }
    );
  });
}
```

**줌아웃은 같은 함수를 방향만 바꿔 호출한다.** 별도 코드가 아니다.
**`prefers-reduced-motion`이면 `morph()`를 호출하지 않는다.** 그냥 리렌더.

### 4.3 데이터가 늦게 와도 레이아웃은 즉시 착지한다

```
필터 칩 추가 (0ms)
  → 서버 골격 즉시 렌더 (개수는 클러스터 카드에서 이미 알고 있다)
  → 카메라 모프 시작 (420ms)
  → /topology 응답 도착 (예: 700ms)
  → 파드가 pop으로 착지, CPU 막대가 --motion-value로 보간
```
**골격 먼저, 살은 나중에.** 응답을 기다리며 흰 화면을 보여주지 않는다.
**스켈레톤 깜빡임 금지.** 이전 프레임을 유지한 채 전이한다.

---

## 5. 상세 패널 — 전체화면 덮기 (VP-015 §5.2)

```css
.detail {
  position: absolute; inset: 0; left: var(--rail);   /* 레일 오른쪽부터 전부 */
  transform: translateX(100%);
  transition: transform var(--motion-layout) var(--ease-spring),
              left      var(--motion-layout) var(--ease-in-out);
}
.detail[data-open] { transform: translateX(0); }

.sidebar { width: 200px; transition: width var(--motion-layout) var(--ease-in-out); }
.sidebar[data-rail] { width: 56px; }
```

**사이드바 축소와 패널 슬라이드는 같은 320ms에 동시에 일어난다.** 순차가 아니다.
(순차로 하면 640ms가 되고, 느리다고 느낀다.)

**레일 전환 시 메뉴 라벨은 `opacity` 0→1이 아니라 `width: 0` + `overflow: hidden`으로 잘린다.**
페이드시키면 글자가 유령처럼 남는다.

**닫기:** `translateX(100%)` + 사이드바 200px 복귀. 같은 320ms.

**포커스 트랩:** 열리면 패널 안에 포커스를 가둔다. `Esc`로 닫으면 **원래 행에 포커스를 되돌린다.**
(접근성 필수. 이걸 안 하면 키보드 사용자가 길을 잃는다.)

---

## 6. AI 패널 (VP-015 §5.4)

```css
.ai { width: 0; transition: width var(--motion-layout) var(--ease-spring); overflow: hidden; }
.ai[data-open] { width: var(--ai-width, 420px); }
.ai > .inner { width: 420px; }   /* 내용은 고정 폭. 안 찌그러진다 */
```

**`width` 트랜지션이지만 안쪽 콘텐츠는 고정 폭이다.** 안 그러면 여는 동안 텍스트가 리플로우하며 떨린다.
`flex` 형제(상세)는 자동으로 좁아진다 — **별도 애니메이션을 걸지 않는다.** 한 번만 움직인다.

---

## 7. 변경 적용 진행 (VP-015 §7-A) — 프로그레스바가 아닌 세 가지

### 7.1 낙관적 고스트 파드 ★

`replicas 3 → 5`를 제출하면 **즉시** 물리 뷰에 **점선 유령 파드 2개**가 뜬다.

```css
.pod-ghost {
  border: 1.5px dashed var(--border-strong);
  background: transparent;
  animation: ghost-breathe 1.6s var(--ease-in-out) infinite;
}
@keyframes ghost-breathe { 0%,100% { opacity: .35 } 50% { opacity: .75 } }
```

- **`applied` 이벤트 수신** → 유령이 실체가 된다: `dashed → solid`, 채움색 페이드 인 (340ms)
- **실패** → 유령이 **빨갛게 흔들리고 사라진다** (shake 200ms → fade out)
- **사라지는 파드**(scale down)는 반대: 실선 → 점선 → 페이드 아웃

**왜 프로그레스바보다 나은가:** 프로그레스바는 "얼마나 남았나"를 **거짓으로 추정**한다.
유령 파드는 **"무엇이 생길 예정인가"를 정확히 말한다.** 그리고 결과가 그 자리에 그대로 착지한다.

### 7.2 단계 레일 (하단 독 탭 안)

수평 6칸. 프로그레스바가 아니라 **체크포인트**다.

```
✓─────✓─────⟳ · · · ○ · · · ○ · · · ○
검증  커밋  수신    반영   롤아웃  안정화
0.4s  1.2s
```
- 완료된 칸 사이의 연결선은 **실선 + 실제 소요시간 표기**
- 진행 중 칸: 연결선이 **왼쪽에서 오른쪽으로 흐르는 점선** (`stroke-dashoffset` 애니메이션, 1.2s 무한)
- 미래 칸: 점 연결. **채워지지 않는다. 추정하지 않는다.**

```css
@keyframes rail-flow { to { stroke-dashoffset: -12; } }
.rail-active { stroke-dasharray: 3 3; animation: rail-flow 1.2s linear infinite; }
```

### 7.3 트레이스 워터폴 (단계 레일 클릭 시 펼침)

**실제 소요시간을 가로 막대로.** APM 트레이스와 같은 표현.
```
검증        ▬▬                          0.4s
Git 커밋      ▬▬▬▬▬▬                    1.2s
Git 수신             ▬                  0.3s   ← 웹훅. 여기가 빠르면 "즉시"가 증명된다
클러스터 반영          ▬▬▬▬              0.9s
롤아웃                     ▬▬▬▬▬▬▬▬▬▬▬  4.1s   ← 여기가 대부분이다
안정화                                 ▬  0.2s
```
**막대 폭 = 실제 시간.** 추정 없음. 끝난 뒤에만 그린다.
사용자는 **"어디가 느린지"를 배운다.** (BE-Gap: 백엔드가 단계 소요시간을 안 주면 워터폴을 그리지 않는다.)

### 7.4 진행 배지

```
                    ⟳ 3/6    ✦
```
`⟳`는 1.4s 등속 회전(`linear`). **AI 버튼(`✦`)은 절대 자리를 옮기지 않는다.** 배지가 왼쪽에 추가될 뿐.

---

## 8. 값 변화 — 숫자는 카운트업하지 않는다

| 대상 | 처리 |
|---|---|
| **막대**(CPU/MEM/사용률) | `width` / `background-color`를 `--motion-value`(500ms)로 보간 |
| **숫자 텍스트** | **즉시 교체.** 카운트업 애니메이션 금지 |
| **스파크라인** | 새 점을 왼쪽으로 밀며 추가 (`--motion-value`) |

**왜 숫자는 카운트업 안 하나:** 운영 도구다. `94%`가 `41 → 67 → 94`로 흘러가면
**그 중간 숫자를 사람이 읽고 잘못 판단한다.** 막대는 아날로그라 괜찮지만 숫자는 아니다.

---

## 9. `prefers-reduced-motion: reduce` (필수)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
  }
}
```
추가로 JS에서:
- `morph()` 호출하지 않는다
- 스태거 딜레이를 0으로
- 고스트 파드의 `breathe`를 끄고 **정적 점선**으로 둔다 (여전히 "예정"임은 보인다)

**모션이 꺼져도 정보는 하나도 안 사라진다.** 이게 유일한 합격 기준이다.

---

## 10. 성능 가드 (회귀 테스트)

| 가드 | FAIL 조건 |
|---|---|
| **레이아웃 스래싱** | 애니메이션에 `width`/`height`/`top`/`left`를 쓰는 것. **`transform`/`opacity`만.** (예외: 패널·AI의 `width` — flex 형제를 밀어야 하므로 불가피. `will-change: width` 지정) |
| **동시 애니메이션 수** | 한 프레임에 애니메이션 중인 요소 > 200개 |
| **스태거 상한** | 누적 딜레이 > `--stagger-max` |
| **FPS** | 줌 전환 중 60fps 미달 (개발 모드 계측) |
| **reduced-motion** | 위 §9 적용 안 됨 |

---

## 11. 구현 위치

```
web/src/motion/
  tokens.css            ← §1. theme.css가 import
  useCameraMorph.ts     ← §4.2 FLIP. 순수 DOM. 유닛 테스트 필수
  useStagger.ts         ← §1 상한 클램프
  usePrefersReducedMotion.ts
  __tests__/
    camera-morph.test.ts   ← from/to rect → 기대 transform
    stagger.test.ts        ← 상한 클램프
```

**애니메이션 로직은 컴포넌트에 인라인하지 않는다.** 위 4개 훅에서만 나온다.
그래야 `prefers-reduced-motion` 처리를 한 곳에서 보장할 수 있다.
