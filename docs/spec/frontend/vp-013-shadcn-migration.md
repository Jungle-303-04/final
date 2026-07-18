---
title: VP-013 — shadcn/ui 전면 도입 · 디자인 시스템 단일화 (기획 정본)
status: spec-approved
date: 2026-07-14
owner: 프론트 Codex (구현) / 우녕 (기획 확정) / 클로드 (검토)
governing: vp-010(필터 IA), vp-012(Resources 4층)
priority: P0 — dev 흡수 직후 최우선. 다른 트랙보다 앞선다.
---

# VP-013 — shadcn/ui 전면 도입

## 0. 결정 (우녕, 2026-07-14)

**앱의 모든 UI를 shadcn/ui 단일 소스로 통일한다. 예외는 없다.**

"차트도 포함"이 아니라 **전부**다. 버튼·카드·메뉴·다이얼로그·시트·탭·표·폼·토스트·
툴팁·배지·스켈레톤·브레드크럼·차트·아이콘·토큰·모션까지 **하나의 소스**에서 나온다.
지금 화면마다 다른 컴포넌트를 쓰고 있는 상태를 끝낸다.

**"우리가 만든 UI 컴포넌트"라는 카테고리를 없앤다.** 제품 고유 컴포넌트(StatCard,
StatusChip, EmptyState 등)도 직접 만들지 않고 **shadcn primitive를 조합해서** 만든다.
새 primitive를 손으로 짜는 일은 없다.

현재 프론트는 shadcn이 아니다. 실측 근거:
- `frontend/components.json` 부재
- `package.json`에 `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`,
  `lucide-react` 전무
- `src/ui/index.tsx` = 971줄 수제 UI 키트 (Button/Card/Modal/Drawer/Dropdown/Tabs/
  Toast/Tooltip/ConfirmDialog 등 30개 컴포넌트를 한 파일에 직접 구현)
- `src/ui/charts.tsx` = 216줄 수제 차트 (Sparkline/TimeSeriesChart) + `@nivo/*` 병존
- 아이콘 라이브러리 없음. 인라인 `<svg>`를 파일마다 손으로 작성

**목표 상태: 컴포넌트 한 벌, 차트 한 벌, 아이콘 한 벌, 토큰 한 벌.**

## 1. 대상 스택

| 층 | 도입 | 제거 |
|---|---|---|
| 컴포넌트 | shadcn/ui (Radix + cva + Tailwind v4) | `src/ui/index.tsx` 30개 수제 컴포넌트 |
| 클래스 병합 | `cn()` (clsx + tailwind-merge) | `cx()` |
| 아이콘 | `lucide-react` | 전 파일 인라인 `<svg>` |
| 차트 | **recharts** (shadcn `chart` 컴포넌트) | `@nivo/core`, `@nivo/line`, `@nivo/treemap`, `src/ui/charts.tsx` |
| 모션 | `motion` v11 **유지** (Radix `data-state` + `layout`/`Reorder`와 병용) | — |
| 그래프 | `@xyflow/react` **유지** | 레이아웃 엔진 이중화 해소 (§7) |

### 1.1 차트를 recharts로 가는 이유

현재 차트 구현이 **이미 두 벌**(nivo + 수제 charts.tsx)이다. 여기에 shadcn chart를
"추가"하면 세 벌이 된다. 그래서 **추가가 아니라 교체**한다: recharts 하나만 남기고
nivo와 `charts.tsx`를 삭제한다.

교체 대응:
| 기존 | recharts 대응 |
|---|---|
| `charts.tsx` `Sparkline` | `<LineChart>` + `<Line dot={false}>` 축·그리드·툴팁 제거 (스파크라인 프리셋 컴포넌트로 래핑) |
| `charts.tsx` `TimeSeriesChart` | shadcn `ChartContainer` + `<AreaChart>`/`<LineChart>` |
| `@nivo/line` | 위와 동일 |
| `@nivo/treemap` | recharts `<Treemap>` |

`hasSparklinePoints` 같은 **데이터 유무 판정 헬퍼는 반드시 보존**한다 — 데이터 없을 때
0으로 그리지 않는 BE-Gap 규율(VP-012 §4)의 집행 지점이다.

## 2. 토큰 매핑 — 최우선, 가장 위험

`src/ui/theme.css`는 이미 Tailwind v4 `@theme inline`으로 자체 토큰을 정의한다.
**shadcn과 이름은 같고 의미가 다른 토큰이 있다.**

| 우리 현재 | 우리 의미 | shadcn 동명 토큰의 의미 | 충돌 |
|---|---|---|---|
| `--color-primary` | 본문 텍스트 색 (`--ui-text-primary`) | primary **버튼 채움색** | **정면 충돌** |
| `--color-accent` | 강조 색 | hover/muted 배경 | **정면 충돌** |
| `--color-surface` / `--color-raised` | 표면 단계 | `--card` / `--popover` | 이름만 다름 |
| `--color-border` | 테두리 | `--border` | 호환 |

이 상태로 shadcn을 얹으면 `bg-primary`가 화면마다 다른 색이 되고 **컴파일 에러는 나지
않는다.** 조용히 망가지는 종류의 충돌이므로 다른 어떤 작업보다 먼저 처리한다.

**절차 (원자적 커밋 1개):**
1. 기존 `--color-primary` → `--color-text-primary`, `--color-secondary` →
   `--color-text-secondary`, `--color-muted` → `--color-text-muted`로 리네임.
   전역 치환(`text-primary` 클래스 사용처 전부).
2. shadcn 규격 토큰(`--background --foreground --card --card-foreground --popover
   --popover-foreground --primary --primary-foreground --secondary --muted --accent
   --destructive --border --input --ring --radius`)을 신설하고,
   **값은 기존 `--ui-*` 원본을 참조**한다. 새 색을 발명하지 않는다.
3. 라이트/다크 양쪽 정의. 기존 `@custom-variant dark (&:where(.dark, .dark *))` 유지.
4. `docs/spec/frontend/theme-first-paint-evidence-*.md`가 증명한 **first-paint 플래시
   없음** 특성을 회귀시키지 않는다. 리네임 후 동일 증거를 재촬영해 첨부한다.

**검증**: 리네임 커밋 직후 전 화면 스크린샷 라이트/다크 각 1회. 색이 바뀐 곳이 있으면
매핑이 틀린 것이다.

## 3. 컴포넌트 대응표

| `src/ui/index.tsx` | shadcn | 비고 |
|---|---|---|
| `Button`, `IconButton` | `button` | `IconButton` = `size="icon"` |
| `Card`, `StatCard` | `card` | `StatCard`는 `card` 위 제품 컴포넌트로 재작성 |
| `Dropdown`, `MenuItem` | `dropdown-menu` | |
| `Modal`, `ConfirmDialog` | `dialog`, `alert-dialog` | |
| `Drawer` | `sheet` | |
| `Tabs` | `tabs` | |
| `Badge`, `StatusChip` | `badge` | `StatusChip`은 `badge` 위 제품 컴포넌트 |
| `Tooltip` | `tooltip` | |
| `Table` | `table` | |
| `Field`, `Input`, `Select`, `Textarea`, `Checkbox` | `form`, `input`, `select`, `textarea`, `checkbox`, `label` | |
| `ToastProvider`, `useToast`, `ToastViewport` | `sonner` | |
| `Skeleton` | `skeleton` | |
| `Collapsible` | `collapsible` | |
| `Breadcrumb` | `breadcrumb` | |
| `EmptyState`, `PageHeader`, `KeyValueList`, `CodeBlock`, `InlineSpinner` | **대응 없음** | 제품 고유. shadcn 토큰·primitives 위에 재작성하고 `src/components/` 로 이동 |

`src/ui/index.tsx`는 최종적으로 **삭제**한다. 이관 중에는 남기되 §6 금지 규칙을 적용한다.

## 4. 모션 — shadcn과 motion의 역할 분담

- **Radix가 상태를 준다**: `data-state="open|closed"`, `data-side`, `Presence`가 닫힘
  애니메이션이 끝날 때까지 DOM을 유지한다. 수제 구현에서 가장 취약했던 부분이다.
- **motion이 움직임을 준다**: `layout` prop(위치·크기 FLIP), `Reorder.Group/Item`(실시간
  재배치), 스프링 감속.
- 기존 `src/ui/motion.ts`의 프리셋(`fadeInUp`, `scaleIn`, `collapse`, `drawerSlide`,
  `listStagger` …)은 **토큰으로 승격**해 유지한다. 값을 컴포넌트에 하드코딩하지 않는다.
- `useReducedMotion()`을 전역 적용한다.

**모션 토큰 (정본):**
| 토큰 | 값 | 용도 |
|---|---|---|
| `--motion-fast` | 120ms | hover, 포커스 |
| `--motion-base` | 200ms | 오버레이, 팝오버, 패널 |
| `--motion-layout` | 260ms | 리플로우, 순서 이동, 크기 변경 |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | 등장 |
| `--ease-in-out` | `cubic-bezier(.4,0,.2,1)` | 이동 |

VP-012 시간 스크럽 바(200ms ease)도 이 토큰을 쓴다.

**애니메이션 금지 구역**: 데이터 값 변경(카운트업 금지 — 즉시 갱신), 목록 최초 로드
stagger. 모니터링 도구에서 값은 즉시·정직하게 바뀌어야 한다.

## 4.5 작업 방식 전환 — dev 단일 트렁크 + AWS 상시 배포 (우녕 확정)

**VP-013보다도 먼저 처리한다. 순서가 곧 지시다.**

1. **현재 lane을 dev에 착륙시킨다.** 미커밋·미착륙 작업을 전부 origin/dev로 병합.
2. **해당 lane 브랜치를 삭제한다.** origin과 로컬 양쪽. lane을 남겨두지 않는다.
3. **이후 모든 작업은 dev에서 직접 한다.** 장기 lane을 다시 만들지 않는다.
   작업 단위마다 커밋하고 곧바로 origin/dev에 올린다.
4. **dev push = AWS 빌드·배포.** 배포된 결과를 보면서 작업한다.

**전제 조건 (백엔드, 이것부터 착륙해야 4번을 켤 수 있다):**
- migration 실행 경로 (기존 `create_all` DB의 안전한 baseline 포함)
- `DEV_AUTH_BYPASS=0` 강제 및 렌더·live 양쪽 자동 검증
- dev push CI: 전체 게이트 → 이미지 빌드 → ECR push → migration Job → rollout → smoke
- GitHub deployment 실행에 배포 SHA, 이미지 digest, 접속 URL을 artifact로 보존

이 전제가 착륙하기 전에는 **자동 배포 스위치를 켜지 않는다.** 첫 스키마 변경에서 DB가
깨진다. 백엔드는 이 전제를 **P0로 즉시** 처리하고, 활성화 증거를 deployment 실행에 남긴다.

**dev 트렁크 규율 (lane이 없어졌으므로 새로 필요):**
- 커밋 단위는 **작고 초록**이어야 한다. dev가 곧 배포이므로 깨진 커밋 = 깨진 배포다.
- push 전 반드시 로컬 게이트 통과. 실패 시 push 금지.
- 두 세션(프론트·백엔드)이 같은 dev를 쓴다 → **push 전 항상 `git pull --rebase`**.
- 소유 영역 밖 파일 삭제 금지 규칙은 그대로 유효하다.

## 5. 이관 순서

| 단계 | 내용 | 커밋 단위 | 게이트 |
|---|---|---|---|
| S0 | shadcn 초기화 — `components.json`, `lib/utils.ts`(`cn`), 의존성 추가(`@radix-ui/*` 필요분, `cva`, `clsx`, `tailwind-merge`, `lucide-react`, `recharts`, `sonner`) | 1커밋 | 빌드·타입체크 |
| S1 | **토큰 리네임 + shadcn 토큰 매핑** (§2) | 1커밋(원자적) | 전 화면 스크린샷 라이트/다크 무변화 |
| S2 | shadcn primitive 설치 (§3 표의 모든 컴포넌트) — 사용처 없이 파일만 | 1커밋 | 빌드 |
| S3 | **차트 전환** — recharts 기반 `Sparkline`/`TimeSeriesChart`/`Treemap` 재작성 → nivo·`charts.tsx` 삭제, `@nivo/*` 의존성 제거 | 1~2커밋 | 기존 차트 사용처 전부 렌더 확인 |
| S4 | **아이콘 전환** — 전 파일 인라인 `<svg>` → `lucide-react` | 1커밋 | 잔여 인라인 `<svg>` 0건(로고 제외) |
| S5 | 화면 단위 이관 — Resources → Issues → Applications → GitOps → Checks → Settings → Clusters | 화면당 1커밋 | 화면당 게이트 |
| S6 | `src/ui/index.tsx` 삭제, `cx()` 제거 | 1커밋 | 전체 게이트 |

**각 단계 후 dev 승격.** S1~S4는 전 화면에 걸치므로 다른 lane과 충돌 위험이 크다 —
**연속으로 빠르게 착륙**시키고, 그 사이 다른 트랙(VP-010/VP-012 구현)은 dev를 자주
흡수한다.

## 6. 금지 사항 (게이트에서 검사)

1. **한 파일에 구·신 컴포넌트 혼용 금지.** 이관은 화면 단위로 통째로.
2. **하드코딩 금지.** 색 hex, 간격 px, 모서리 px, duration ms를 컴포넌트에 직접 쓰지
   않는다. 토큰만.
3. **차트 라이브러리 추가 금지.** recharts 외 어떤 차트도 도입하지 않는다.
   nivo 잔존 import가 하나라도 있으면 S3 미완이다.
4. **인라인 `<svg>` 금지** (제품 로고 제외). lucide만.
5. **shadcn 기본 스타일 그대로 두지 않는다.** 우리 `--ui-*` 값이 반드시 적용돼야 한다.
   "shadcn 기본 회색 앱"이 되면 실패다.
6. **BE-Gap 규율 불변**: 계약 없는 필드를 0/disabled로 렌더하지 않는다. 차트 전환 시
   `hasSparklinePoints` 류의 판정을 반드시 보존한다.
7. **접근성 회귀 금지**: 키보드 내비게이션·포커스 트랩·`aria-*`가 기존보다 나빠지면
   이관 실패로 본다.

## 7. 부수 발견 — 그래프 레이아웃 엔진 이중화

`@dagrejs/dagre`와 `elkjs`가 **둘 다** 설치돼 있고 둘 다 `src/shared/flow/index.tsx`에서
쓰인다. VP-012 3층 물리 뷰 그래프를 만들기 전에 하나로 정리한다.

- 실측 보고 요구: 각 엔진이 **어느 뷰에서 무엇에 쓰이는지**, 하나로 통합 가능한지.
- 판단 후 하나를 제거한다. 이 항목은 S5 이후 별도 트랙으로 처리하며 VP-013을 막지 않는다.

## 8. 검토 (클로드)

각 단계 착륙 시 origin/dev 기준으로 검토한다. 검토 대상:
- S1: 토큰 매핑표와 실제 `theme.css` 일치 여부, 스크린샷 무변화
- S3: nivo 잔존 import 0, 데이터 없음 판정 보존
- S4: 인라인 svg 잔존 0
- S5: 화면별 혼용 0, 하드코딩 0
- 전 구간: 접근성 회귀, 모션 토큰 사용

검토 결과는 해당 commit의 CI 결과와 deployment artifact에 기록한다.
