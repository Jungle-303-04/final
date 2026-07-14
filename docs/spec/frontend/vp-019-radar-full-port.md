---
title: VP-019 — Radar 전면 이식 + 우리 기획 덧입히기 (정본)
status: spec-approved
date: 2026-07-14
owner: 우녕 (확정) / 조율 세션 (실측·기록)
reference: skyhook-io/radar v1.5.7 (Apache-2.0) — `references/radar-upstream/`
governing: 이식 범위·방법의 정본. VP-010~018은 이 위에 얹히는 **차별화 레이어**다.
---

# VP-019 — Radar 전면 이식

## 0. 세 개의 정본 — 헷갈리지 말 것 ★

> "기존 기획을 엎으라는 게 아니야. 기존 기획에서 Radar에서 가져올 수 있는 모든 항목과 내용을
>  전부 가져오고, 기존 기획으로 일부 수정·추가하는 거야. 디자인은 레퍼런스 디자인이어야 하고." — 우녕

**층이 셋이다. 각 층의 정본이 다르다. 이걸 섞으면 매번 헤맨다.**

| 층 | 정본 | 무엇을 결정하나 |
|---|---|---|
| **기능·구조·라벨** | **Radar** (`references/radar-upstream/`) | 어떤 화면·컴포넌트·컬럼·kind 렌더러·감사 체크·라벨 텍스트가 있는가. **가져올 수 있는 건 전부 가져온다.** |
| **디자인** | **shadcn/ui** (`ui.shadcn.com`) | 색·간격·타이포·radius·primitive·문법(`cn`/`cva`/`data-slot`). **Radar의 시각 언어는 버린다.** |
| **차별화** | **VP-010~018** (우리 기획) | 필터=줌 · 3층 골격 · 파드 3채널 인코딩 · 상세 3상태 · SLG 모션 · 3-way diff · RCA · 고스트 파드 · 두 모드 쓰기 |

**한 문장:** **Radar의 살을 가져와, shadcn의 옷을 입히고, 우리 기획의 뼈에 붙인다.**

**금지 (모순의 근원):**
- Radar의 **IA(정보구조)를 그대로 베끼는 것** — 우리는 필터=줌이고 Radar는 메뉴 나열이다
- Radar의 **색·간격·클래스를 그대로 쓰는 것** — 디자인은 shadcn이다
- Radar에 있다고 **우리 기획에 없는 화면을 만드는 것** — Cost, Local Terminal 등
- Radar에 없다고 **우리 기획의 화면을 빼는 것** — AI 채팅, 3-way 경고, 고스트 파드

---

## 1. Radar 실측 인벤토리

**원본(v1.5.7): Go 628파일 + web 342파일 + `packages/k8s-ui` 492파일.**
현재 `references/radar-upstream/` 에는 **k8s-ui 492 중 268만** 있다. **224개가 없다** (VP-018 §11).

### 1.1 Radar 메뉴 (`web/src/components/nav`, 실측)

```
Home · Resources · Issues · Topology · Applications · Timeline ·
Live Traffic · Helm · GitOps · Checks · Cost          + Settings(하단)
```

### 1.2 Radar 화면별 자산 (`web/src/components/`, 파일 수)

```
resources 130 · cost 17 · helm 15 · home 13 · dock 9 · diagnose 8 · execution 8 · timeline 8 ·
logs 7 · resource 7 · traffic 7 · gitops 6 · rightsizing 6 · compare 3 · shared 3 · audit 2 ·
portforward 2 · settings 2 · applications 1 · issues 1 · workload 1 · curl 1 · resource-drawer 1
+ ContextSwitcher · NamespaceSwitcher · UserMenu · ConnectionErrorView · DebugOverlay
```

**우리가 몰랐던 화면 다섯 개:** `diagnose` · `execution` · `rightsizing` · `portforward` · `curl`

### 1.3 Radar 재사용 UI 라이브러리 (`packages/k8s-ui/src/`, 492파일)

```
components/  resources 211(renderers 136) · ui 48 · gitops 23 · timeline 20 · topology 13 ·
             compare 13 · logs 11 · dock 10 · charts 10 · applications 9 · issues 9 ·
             audit 6 · checks 5 · shared 8 · workload 3 · cluster-switcher 2 ·
             namespace-switcher 2 · scope-pill 2
filter-state/ 3   ← VP-010 필터 엔진의 정본
utils/ 30 · types/ · hooks/ · theme/ · perf/ · assets/
```

---

## 2. 화면 대조 — 가져옴 / 수정 / 대체 / 제외

| Radar 화면 | 판정 | 우리 것 |
|---|---|---|
| **Home** (13) | **가져옴 + 확장** | 위젯 조합 대시보드 (VP-011). Radar Home 카드를 **위젯으로** 편입 |
| **Resources** (130 + k8s-ui 211) | **가져옴 + 대체** | 3층 골격(VP-015 §2). **108개 kind 렌더러·컬럼·라벨은 그대로.** IA만 우리 것 |
| **Issues** (1 + k8s-ui 9) | **가져옴 + 확장** | + RCA·증거·복구 PR (우리 차별화) |
| **Topology** | **흡수** | 별도 메뉴 아님. Resources 2층 그래프 (VP-015 §4). **물리 뷰는 우리가 재작성** |
| **Applications** (1 + k8s-ui 9) | **가져옴 + 확장** | + Git 드리프트 (VP-014 §1) |
| **Timeline** (8 + k8s-ui 20) | **흡수** | 별도 메뉴 아님. Resources 시간 스크럽. **TimelineStrip·scrubber-math 그대로** |
| **Live Traffic** (7) | **흡수** | Resources 관계 뷰 (VP-015 §4.4). 트래픽 수치는 계약 있을 때만 |
| **Helm** (15) | **가져옴 (읽기 전용)** | 설치·업그레이드는 **PR로만** (단일 writer 불변식) |
| **GitOps** (6 + k8s-ui 23) | **가져옴 + 2탭** | `[변경]` 우리 것(PR·승인·**3-way 경고**) + `[동기화 상태]` Radar 것 |
| **Checks** (k8s-ui 5 + audit) | **가져옴** | 31개 감사 체크 · 4단계 심각도. 출구는 **수정 PR** |
| **Cost** (17) | **제외** | OpenCost 의존. 제품 범위 밖 |
| **Settings** (2) | **가져옴 + 확장** | + 워크스페이스·정책(즉시/승인)·멤버 |
| **`diagnose`** (8) | **가져옴 → Issues에 편입** | 리소스 진단. 우리 RCA의 **입력**으로 쓴다 |
| **`execution`** (8) | **가져옴 → GitOps에 편입** | 워크플로 실행 이력 |
| **`rightsizing`** (6) | **가져옴 → 상세 메트릭 탭** | requests/limits 권고. **적용은 PR로만** |
| **`portforward`** (2) | **가져옴 → 하단 독 탭** | 계약 있을 때만 (BE-Gap) |
| **`curl`** (1) | **가져옴 → 하단 독 탭** | 클러스터 안에서 HTTP 호출 |
| **`compare`** (3 + k8s-ui 13) | **가져옴** | 리비전 비교. **3-way diff의 뷰어로 재사용** |
| **`dock`** (9 + k8s-ui 10) | **가져옴** | 하단 독. **`LocalTerminalTab` 만 제외** (웹이라 로컬 셸 불가) |
| **`ContextSwitcher`** | **가져옴** | 클러스터 전환 |
| **`NamespaceSwitcher`** | **가져옴 → 필터 칩으로** | 별도 컨트롤 아님. 1층 검색의 네임스페이스 칩 |
| **`UserMenu`** | **가져옴 + 확장** | + 워크스페이스 전환 · 테마 (VP-018 §2.2) |
| **`DebugOverlay`** | **가져옴 (dev만)** | 프로덕션 빌드에서 제외 |
| **— (Radar에 없음)** | **우리만** | **AI 채팅** · **3-way 경고** · **고스트 파드 진행** · **클러스터 연결 위자드** · **필터=줌** · **SLG 모션** |

---

## 3. 이식 방법 — **토큰 어댑터 한 장** (VP-018 §11.4)

**224개 파일의 클래스를 손으로 고치지 않는다.**

Radar의 `theme-*` 는 **19개짜리 얇은 별칭 레이어**다 (`theme/tailwind-theme.css` 실측).
```css
--color-theme-surface: var(--bg-surface);
--color-theme-text-primary: var(--text-primary);
--color-theme-border: var(--border-default);
…
```
**이 별칭이 가리키는 곳을 우리 shadcn 토큰으로 바꾸면 224개 파일이 전부 우리 색이 된다.**

`shared/ui/radar/radar-theme.css` — **이 파일 하나가 전부다:**

| Radar 별칭 | → shadcn |
|---|---|
| `theme-base` | `var(--background)` |
| `theme-sidebar` | `var(--sidebar)` |
| `theme-surface` | `var(--card)` |
| `theme-elevated` | `var(--popover)` |
| `theme-hover` · `theme-active` | `var(--accent)` |
| `theme-text-primary` | `var(--foreground)` |
| `theme-text-secondary` | `var(--muted-foreground)` |
| `theme-text-tertiary` | `color-mix(in oklch, var(--muted-foreground) 75%, transparent)` |
| `theme-text-quaternary` | `… 55%` |
| `theme-text-disabled` | `… 45%` |
| `theme-border` | `var(--border)` |
| `theme-border-light` | `color-mix(in oklch, var(--border) 60%, transparent)` |
| `theme-border-subtle` | `… 35%` |

**다크/라이트가 자동으로 따라온다** — 우리 `:root`/`.dark` 가 짝을 이루면(VP-018 §6).
**그래서 §6(테마 토큰 짝 맞추기)을 이식보다 먼저 해야 한다.**

### 3.1 손으로 고치는 것은 **딱 셋** (기계적 치환)

1. **팔레트 직접 사용** — `bg-red-500/15` `text-amber-800` `text-emerald-700` 등
   → 시맨틱(`bg-destructive/15` `text-warning` `text-success`)으로.
   grep 패턴: `-(red|amber|emerald|rose|sky|zinc|gray|slate|neutral|stone)-\d`
2. **브랜드 색** — `skyhook-*` · `--color-radar-accent` · `--color-brand-*` → `var(--primary)`
3. **`clsx` → `cn()`** — import 한 줄 치환. 동작 동일 + tailwind-merge 이득

### 3.2 두 문법이 공존한다 — 모순이 아니다

| 위치 | 문법 |
|---|---|
| **`shared/ui/radar/**`** (이식본) | Radar 구조·`theme-*` 별칭 허용. **팔레트 색·`clsx`·브랜드 색은 금지** |
| **그 외 전부** | **shadcn 문법 필수** (VP-018 §10.1-b): `cn()` · `cva` · `data-slot` · 시맨틱 토큰 |

**경계가 폴더 하나로 명확하다.** 회귀 가드: `theme-*` 가 `shared/ui/radar/` **밖**에 나오면 FAIL.
**새 화면은 우리 문법으로 짜고 이식본을 부품으로 쓴다.** 이식본을 지금 다시 쓰느라 시간을 쓰지 않는다.

---

## 4. 이식 순서 (R0~R9) — 상세 페이지가 먼저

> "상세페이지부터 대부분 해당 레퍼런스 전부 가져오고 … 빠르게 합쳐서" — 우녕

```
R0  어댑터 + codemod
    radar-theme.css · 팔레트/clsx/브랜드색 치환 · 서브트리 완결(224파일) · NOTICE 갱신
    ※ VP-018 §6(테마 :root/.dark 짝 맞추기)을 여기서 먼저 끝낸다

R1  ui/ 나머지 24  ★
    SearchPillInput ★ · SearchBox · Facet · MultiSelectPicker · SelectMenu · Input
    SortableTh · DistributionBar · SummaryTile · FreshnessControl("N초 전 갱신")
    PageHeader · Collapse · CardSection · FetchResult · RestrictedState · RowActionMenu
    CenteredEmpty · BoardSkeleton · severity-tone · tooltip-position

R2  상세 페이지  ★★  ← 우녕이 "상세페이지부터"라고 한 그것
    shared/DetailShell · resource-drawer · resource(7) · resources/renderers(136 전부)
    ResourceActionsBar · EditableYamlView · ResourceRendererDispatch · ManagedByChip
    → VP-018 §1의 3상태 셸에 이 내용물을 넣는다

R3  filter-state/ 3      filter-state-core.ts (VP-010 엔진 정본)
R4  charts/ 10           AreaChart · MetricsSummary · PrometheusChartsView · SeriesLegend · saturation
R5  timeline/ 16         TimelineStrip ★ · scrubber-math ★ · TimelineSwimlanes · TimelineToolbar
R6  gitops/ 18 + execution/ 8   GitOpsTableView · tree/ · insights/ · RollbackDialog · SyncOptionsDialog
R7  issues/ 9 + diagnose/ 8 + checks/ 5 + audit/ 2 + applications/ 9
R8  compare/ 13 + dock 나머지(portforward · curl) + rightsizing/ 6
R9  topology/ 3 · resources/ 51 · utils/ 30 · types/ 4 · assets/ 2 · helm/ 15 · perf/ 2
```

**각 R은 그 자체로 배포 가능하다** (부품만 늘어난다 — 화면은 안 깨진다).
**R0 → R1 → R2 를 먼저.** 그래야 C1(상세)·C3(검색)이 원본 부품 위에서 만들어진다.

---

## 5. 라벨·용어 — Radar 것을 정본으로 쓴다

**새로 지어내지 않는다.** kind 표시명·컬럼명·감사 체크명·상태 문구는 **Radar 것을 그대로 번역**한다.

```
Pods · Deployments · DaemonSets · StatefulSets · ReplicaSets · Services · Ingresses ·
ConfigMaps · Secrets · Jobs · CronJobs · HPAs …
```
**예외 — 우리 용어가 이기는 것** (VP-015 §4.1):
- `Node` → **서버** (그래프에서만. 표의 컬럼명은 Radar 것)
- `Cluster` → 클러스터 이름 + provider 로고
- `Namespace` → 그리지 않는다. **필터 칩일 뿐이다**

---

## 6. 헷갈리기 쉬운 것 — 못 박는다

| | 판정 |
|---|---|
| **`ui/SearchPillInput.tsx`** | ★ **우리 1층 태그 검색(VP-018 §3)의 정본.** 이걸 가져온다 |
| **`ui/FilterPill.tsx`** (착륙됨) | **우리 검색 칩이 아니다.** 원본 주석: *"toggle pattern, not a combobox"*. `aria-pressed` 토글. 심각도 필터 행 같은 데 쓴다. **혼동 금지** |
| **Radar의 왼쪽 필터 사이드바** | **안 쓴다.** 우리는 1층 통합 태그 검색. **컴포넌트는 가져오되 IA는 우리 것** |
| **`ui/provider-logos/*`** (착륙됨) | `aws.png` `aws-dark.png` `azure.svg` `gcp.png` — **이미 저장소에 있는데 안 쓰고 있다.** VP-018 §5.1이 요구한 그것 |
| **`ui/FreshnessControl.tsx`** | VP-018 §5.2의 **"N초 전 갱신"** 정본 |
| **`dock/LocalTerminalTab`** | **렌더하지 않는다.** 웹이라 로컬 셸 불가 |
| **`cost/`** (17) | **제외.** OpenCost 의존 |
| **Radar `MetricsChart`/`charts/`** | 가져오되 **shadcn `ChartContainer` 를 통과**시킨다. recharts 직접 사용 금지 |
| **Radar의 `theme-*`** | `shared/ui/radar/` **안에서만** 허용. 밖에 나오면 FAIL |

---

## 7. 실시간 — **지금 아예 안 된다.** Radar 방식을 그대로 가져온다 ★

> "실시간 스트리밍도 안 되고 있다. 데이터 갱신이 안 되고 있어, 실시간으로." — 우녕

**현재: 화면이 한 번 불러오고 끝이다.** 폴링도 SSE도 없다. 로그 SSE(BQ-058/059)만 있다.
**운영 도구인데 화면이 안 움직이면 도구가 아니다.**

### 7.1 Radar의 실시간 (`web/src/hooks/useEventSource.ts` 실측)

```
GET /api/events/stream   (SSE)
  → 토폴로지 스냅샷 + K8s 이벤트를 서버가 밀어준다
```

| 장치 | Radar 실측값 | 왜 |
|---|---|---|
| **클러스터 크기별 동적 스로틀** | 노드 <100 → **500ms** / <300 → **1s** / <500 → **2s** / 그 외 → **3s** | 작은 클러스터는 즉각 반응, 큰 클러스터는 브라우저를 보호 |
| **지수 백오프 재연결** | 초기 **3s** → 최대 **30s** 상한 | 서버가 죽어도 브라우저가 서버를 때리지 않는다 |
| **이벤트 링 버퍼** | `MAX_EVENTS = 100` | 메모리가 무한히 안 자란다 |
| **네임스페이스 서버측 필터** | 큰 클러스터는 `forceNamespaceFilter` 로 SSE 재연결 | 안 보는 걸 안 보낸다 |
| **새로고침 애니메이션** | `useRefreshAnimation` — idle → spinning(최소 400ms) → success(1200ms) → idle | 너무 빨리 끝나도 **사용자가 갱신됐음을 인지**한다 |

**이 다섯 개를 그대로 가져온다. 숫자까지 그대로.** 우리가 다시 튜닝할 이유가 없다.

### 7.2 우리 아키텍처에 맞춘 계약

에이전트가 아웃바운드로 붙고, 중앙이 브라우저에 민다.

| BQ | 계약 | 내용 |
|---|---|---|
| **BQ-081** | **`SSE /events/stream?clusters=&namespaces=`** | 토폴로지 델타 + K8s 이벤트. **§7.1의 동적 스로틀·백오프·링버퍼를 서버/클라이언트 양쪽에 그대로** |
| **BQ-082** | **`SSE /resources/stream?<filters>`** | 표(3층)의 행 상태 변화. 필터와 같은 canonical 쿼리 |
| BQ-058/059 | 로그 SSE | **이미 있음** |
| BQ-077 | 변경 적용 진행 SSE | S13 (미구현) |
| **BQ-080** | **`SSE /ai/chat/stream`** | AI 응답 토큰 스트리밍 (VP-018 §9) |

### 7.3 화면에 어떻게 나타나나 (모순 없이)

| 대상 | 방식 |
|---|---|
| **2층 그래프의 파드 상태·사용률** | **SSE(BQ-081).** 파드가 뜨고 사라지는 게 **실시간으로 보인다** (VP-017 §7.1의 고스트/실체화와 같은 전이) |
| **3층 표의 행** | **SSE(BQ-082).** 값이 바뀌면 **막대만 보간**(500ms), **숫자는 즉시 교체** (VP-017 §8) |
| **클러스터 카드** | SSE가 없으면 **폴링 10초** (fallback) |
| **하단 독 로그** | SSE (이미 있음) |
| **AI 응답** | SSE (BQ-080) |
| **끊겼을 때** | 1층 오른쪽에 **`연결 끊김 · 재연결 중…`**. 지수 백오프. **조용히 멈추지 않는다** |
| **갱신 표시** | `ui/FreshnessControl` — **"3초 전 ↻"**. 수동 새로고침 시 `useRefreshAnimation` |
| **탭이 백그라운드** | SSE를 **끊는다**. 포그라운드 복귀 시 재연결 + 전체 스냅샷 1회 |

**BE-Gap 규율:** BQ-081/082 계약이 아직 없으면 **폴링으로 시작한다**(10s/5s).
**"실시간인 척"하지 않는다.** 폴링이면 "10초마다 갱신"이라고 정직하게 표시한다.

### 7.4 회귀 가드

- 화면에 **갱신 메커니즘이 하나도 없는 리스트**가 있으면 FAIL (SSE도 폴링도 없음)
- SSE 재연결이 **고정 간격**이면 FAIL (지수 백오프 필수)
- 이벤트 버퍼에 **상한이 없으면** FAIL
- 탭이 백그라운드인데 **SSE/폴링이 계속 돌면** FAIL
- 연결이 끊겼는데 **화면이 아무 말도 안 하면** FAIL

---

## 8. **Radar에 있는 기능은 전부 지원한다** (우녕 확정)

> "논리적 모순이 없고, 기획 기능에 중복이 아니거나 흡수한 게 아니라면,
>  여기 있는 모든 기능은 우리도 지원해야 하고 모든 UI와 UX 기능 모두 있어야 한다. 다 가져와." — 우녕

**기본값은 "가져온다"다.** 안 가져오려면 **아래 세 사유 중 하나를 대야 한다.**

| 제외 사유 | 해당 항목 |
|---|---|
| **① 중복** — 우리 기획에 이미 있다 | Radar `NamespaceSwitcher` → 우리 1층 필터 칩 / Radar 왼쪽 필터 사이드바 → 우리 1층 태그 검색 |
| **② 흡수** — 별도 메뉴가 아니라 다른 화면 안으로 | `Topology` `Timeline` `Live Traffic` → Resources 2층 / `diagnose` → Issues / `execution` → GitOps / `rightsizing` → 상세 메트릭 탭 / `portforward` `curl` → 하단 독 |
| **③ 논리적 모순** — 우리 불변식과 충돌 | `Cost`(OpenCost 의존, 범위 밖) / `dock/LocalTerminalTab`(웹이라 로컬 셸 불가) / Helm **직접 설치**(단일 writer 위반 → **PR로만**) |

**그 외에는 전부 만든다. "나중에"는 사유가 아니다.**
못 만드는 이유가 **백엔드 계약 부재**라면 → **BQ를 등록하고 계약부터 만든다.** 화면을 조용히 빼지 않는다.

### 8.1 Radar 기능 전수 체크리스트 (세션이 이 표를 채운다)

`docs/auto/radar-coverage.md` 를 만들고 **Radar의 모든 화면·컴포넌트·단축키·액션**을 행으로 넣는다.
각 행의 상태는 **`이식됨` / `흡수됨(→어디)` / `중복(→우리 것)` / `제외(사유)` / `미착수`** 중 하나다.

**`미착수`가 하나라도 남아 있으면 이식은 끝난 게 아니다.**

포함해야 할 것 (빠뜨리기 쉬운 것들):
- **키보드 단축키 전부** (`useKeyboardShortcuts`) — Radar의 단축키 표를 그대로
- **즐겨찾기 / 최근 리소스** (`useFavorites` · `useRecentResources`)
- **컬럼 커스터마이즈** (`utils/custom-columns.ts`)
- **일괄 워크로드 액션** (`utils/bulk-workload-actions.ts`) — **단, 쓰기는 PR로만**
- **RBAC 배지 · 권한 폭발 반경** (`utils/rbac-badges.ts` · `rbac-blast-radius.ts`)
- **리소스 비교** (`compare/`)
- **Git provider URL 링크** (`utils/git-provider-urls.ts`)
- **YAML 편집·검증** (`EditableYamlView` · `utils/yaml.ts` · `validators.ts`)
- **강제 삭제 확인 다이얼로그** (`ForceDeleteConfirmDialog`)
- **연결 오류 화면** (`ConnectionErrorView`)
- **빈 상태 / 제한 상태 / 스켈레톤** (`EmptyState` · `RestrictedState` · `BoardSkeleton`)
- **툴팁 위치 계산** (`tooltip-position.ts`)
- **뷰 트랜지션** (`utils/view-transition.ts`)

---

## 9. 라이선스 (필수)

Radar = **Apache-2.0**. 우리 저장소는 **public**이다.
1. `references/radar-upstream/` 고정 커밋 서브트리 — **완결시킨다** (지금 224파일 누락)
2. 루트 `NOTICE` — 원저작자(Skyhook) · Apache-2.0 · 출처 URL · 수정 사실
3. 이식 파일 상단에 **원본 헤더 보존 + Opsia 수정 표기**
4. **`provider-logos` 는 상표다.** nominative use임을 `NOTICE` 에 별도 명시
5. shadcn/ui = **MIT**. 별도 NOTICE 의무 없음 (그래도 README에 출처를 적는다)
