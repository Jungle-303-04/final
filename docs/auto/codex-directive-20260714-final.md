---
title: 코덱스 지시서 (통합·최종) — Radar 전면 이식 + 셸 정정 + 실시간
status: active
issued: 2026-07-14
supersedes: codex-goal-directive-20260714.md · codex-directive-vp018-corrections.md
priority: R0~R2 · C1~C10 이 S11 이후 신규 슬라이스보다 **먼저다**
---

# 코덱스 지시서 (통합·최종)

## 0. 정본 문서 (순서대로 읽어라)

| # | 문서 | 무엇의 정본인가 |
|---|---|---|
| 1 | **`docs/spec/frontend/vp-019-radar-full-port.md`** | **이식 범위·방법.** Radar에서 뭘 가져오고 뭘 안 가져오나 |
| 2 | **`docs/spec/frontend/vp-018-shell-corrections.md`** | **셸 정정.** 상세 3상태 · 검색 · 그래프 · AI · 테마 · shadcn 문법 |
| 3 | `docs/spec/frontend/vp-015-global-shell.md` | 골격 (VP-018/019와 충돌하면 **VP-018/019가 이긴다**) |
| 4 | `docs/spec/frontend/vp-017-motion-spec.md` | 모션 수치 (계약이다) |
| 5 | `docs/spec/frontend/vp-016-delivery-plan.md` | 슬라이스 순서 |
| 6 | `docs/spec/frontend/vp-010~014` | 필터 · 홈 위젯 · 3층 · shadcn · 나머지 화면 |
| 7 | `docs/auto/open-decisions-20260714.md` | 미확정 6건 (기본값으로 진행, 격리해 둘 것) |

**읽기 전에 코드를 건드리지 마라. 기억으로 구현하면 전부 다시 만들어야 한다.**

---

## 1. 세 개의 정본 — 이걸 섞으면 매번 헤맨다 ★

| 층 | 정본 | 결정하는 것 |
|---|---|---|
| **기능·구조·라벨** | **Radar** (`references/upstream/`) | 어떤 화면·컴포넌트·컬럼·kind 렌더러·감사 체크·라벨이 있는가. **가져올 수 있는 건 전부 가져온다** |
| **디자인** | **shadcn/ui** | 색·간격·타이포·radius·primitive·문법. **Radar의 시각 언어는 버린다** |
| **차별화** | **VP-010~019** | 필터=줌 · 3층 골격 · 파드 3채널 · 상세 3상태 · SLG 모션 · 3-way diff · RCA · 고스트 파드 · AI |

**한 문장: Radar의 살을 가져와, shadcn의 옷을 입히고, 우리 기획의 뼈에 붙인다.**

**기존 기획을 엎는 게 아니다.** Radar를 바닥에 깔고 그 위에 우리 기획을 **덧입힌다.**

---

## 2. 철회된 이전 지시 (기억으로 만들지 마라)

- ~~"상세는 열리면 곧바로 전체화면 (2상태)"~~ → **3상태다** (닫힘 / 살짝 480 / 전체)
- ~~"전체화면 시 사이드바가 56px 레일로"~~ → **사이드바는 자기 토글로만 접힌다.** `useDetailSidebarRail` **삭제**
- ~~"1층은 절대 안 덮인다"~~ → **자기모순이었다.** 상세 전체화면은 **검색바까지 덮는다.** 셸(사이드바)만 안 덮는다
- ~~"AI = 1단계 애니메이션"~~ → 살짝에서 열면 **2단계**, 전체에서 열면 1단계
- ~~"Radar를 슬라이스마다 조금씩 이식"~~ → **일괄 이식 + 토큰 어댑터 한 장**

---

## 3. R — Radar 전면 이식 (최우선)

### 3.0 지금 상태 (실측 — 추측 아님)

원격 원본을 다시 내려받아 1:1 대조했다.
**`10461f40…`의 `packages/k8s-ui/src` 492파일 전체를 `references/upstream/`에 고정했다.**
과거 v1.5.7 `88bd1e97…`은 실제 268파일이므로 492파일 원본이라는 기록은 폐기한다.

**통째로 없는 것:** `filter-state/`(VP-010 엔진 정본!) · `charts/`(10) · `applications/`(9) ·
`checks/`(5) · `issues/`(9) · `compare/`(13) · `namespace-switcher/`(2) · `scope-pill/`(2) · `perf/`(2)

**반쯤만 온 것:** `timeline/` 20→**4** (TimelineStrip·scrubber-math 없음!) · `ui/` 48→**24**
(**SearchPillInput** · SearchBox · Facet · MultiSelectPicker · SelectMenu · SortableTh ·
DistributionBar · SummaryTile · **FreshnessControl** · PageHeader · Collapse · CardSection ·
FetchResult · RestrictedState · RowActionMenu · CenteredEmpty · BoardSkeleton 없음) ·
`gitops/` 23→**5** · `dock/` 10→**6** · `shared/` 8→**5** (**DetailShell** 없음) ·
`resources/` 211→**160** · `utils/` **30개 누락** · `assets/gitops/` 없음

**이미 있는데 안 쓰는 것:** `ui/provider-logos/` (`aws.png` `aws-dark.png` `azure.svg` `gcp.png`)

### 3.1 방법 — **흡수 코드모드 한 번.** 492파일 클래스를 손으로 고치지 마라

Radar의 `theme-*` 는 **19개짜리 얇은 별칭**이다 (`theme/tailwind-theme.css` 실측).
**흡수 스크립트가 이 별칭을 우리 shadcn 시맨틱 토큰으로 치환한다.**

`shared/ui/radar/radar-theme.css` — **이 파일 하나:**
```
theme-base → var(--background)          theme-text-primary   → var(--foreground)
theme-sidebar → var(--sidebar)          theme-text-secondary → var(--muted-foreground)
theme-surface → var(--card)             theme-text-tertiary  → color-mix(… 75%)
theme-elevated → var(--popover)         theme-text-quaternary→ color-mix(… 55%)
theme-hover/active → var(--accent)      theme-text-disabled  → color-mix(… 45%)
theme-border → var(--border)            theme-border-light   → color-mix(--border 60%)
                                        theme-border-subtle  → color-mix(--border 35%)
```

**다크/라이트가 자동으로 따라온다** — 우리 `:root`/`.dark` 가 짝을 이루면.
**그래서 C6(테마 토큰 짝 맞추기)을 이식보다 먼저 끝내라.**

**손으로 고치는 것은 딱 셋 (codemod로 일괄):**
1. 팔레트 직접 사용 `-(red|amber|emerald|rose|sky|zinc|gray|slate|neutral|stone)-\d`
   → 시맨틱(`bg-destructive/15` `text-warning` `text-success`)
2. 브랜드색 `skyhook-*` · `--color-radar-accent` · `--color-brand-*` → `var(--primary)`
3. `clsx` → `cn()` (import 한 줄)

**두 문법이 공존한다. 모순 아니다:**
- `shared/ui/radar/**` = Radar 구조 · `theme-*` 별칭 허용 (팔레트·clsx·브랜드색은 금지)
- **그 외 전부** = shadcn 문법 필수 (§5)
- **회귀 가드:** `theme-*` 가 `shared/ui/radar/` **밖**에 나오면 FAIL

### 3.2 이식 순서 — **상세 페이지가 먼저**

```
R0  어댑터 + 스냅샷 흡수
    · 완결된 492파일 스냅샷에서 필요한 부품을 우리 구조로 흡수
    · shared/ui/radar/radar-theme.css
    · codemod 3종 (팔레트 · 브랜드색 · clsx→cn)
    · C6(테마 :root/.dark 짝) 을 여기서 먼저
    · NOTICE 갱신 (Apache-2.0 + provider-logos 상표 귀속)

R1  ui/ 나머지 24  ★
    SearchPillInput ★ · SearchBox · Facet · MultiSelectPicker · SelectMenu · Input
    SortableTh · DistributionBar · SummaryTile · FreshnessControl("N초 전 갱신")
    PageHeader · Collapse · CardSection · FetchResult · RestrictedState · RowActionMenu
    CenteredEmpty · BoardSkeleton · severity-tone · tooltip-position

R2  상세 페이지  ★★   ← 우녕이 "상세페이지부터"라고 한 그것
    shared/DetailShell · resource-drawer · resource(7) · resources/renderers(136 전부)
    ResourceActionsBar · EditableYamlView · ResourceRendererDispatch · ManagedByChip
    → VP-018 §1의 3상태 셸에 이 내용물을 넣는다

R3  filter-state/ 3       filter-state-core.ts (VP-010 엔진 정본)
R4  charts/ 10            AreaChart · MetricsSummary · PrometheusChartsView · SeriesLegend · saturation
R5  timeline/ 16          TimelineStrip ★ · scrubber-math ★ · TimelineSwimlanes · TimelineToolbar
R6  gitops/ 18 + execution/ 8
R7  issues/ 9 + diagnose/ 8 + checks/ 5 + audit/ 2 + applications/ 9
R8  compare/ 13 + portforward + curl + rightsizing/ 6
R9  topology/ 3 · resources/ 51 · utils/ 30 · types/ 4 · assets/ 2 · helm/ 15 · perf/ 2
```

**각 R은 그 자체로 배포 가능하다** (부품만 늘어난다. 화면은 안 깨진다).

### 3.3 **Radar에 있는 기능은 전부 지원한다**

**기본값은 "가져온다".** 안 가져오려면 **세 사유 중 하나**를 대야 한다:

| 사유 | 해당 |
|---|---|
| **① 중복** | `NamespaceSwitcher` → 우리 1층 필터 칩 / Radar 왼쪽 필터 사이드바 → 우리 1층 태그 검색 |
| **② 흡수** | `Topology` `Timeline` `Live Traffic` → Resources 2층 / `diagnose` → Issues / `execution` → GitOps / `rightsizing` → 상세 메트릭 탭 / `portforward` `curl` → 하단 독 |
| **③ 논리적 모순** | `Cost`(OpenCost 의존) / `LocalTerminalTab`(웹이라 로컬 셸 불가) / Helm **직접 설치**(단일 writer 위반 → PR로만) |

**그 외에는 전부 만든다. "나중에"는 사유가 아니다.**
백엔드 계약이 없어서 못 만든다면 → **BQ를 등록하고 계약부터 만든다.** 화면을 조용히 빼지 마라.

**`docs/auto/radar-coverage.md` 를 만들어라.** Radar의 **모든 화면·컴포넌트·단축키·액션**이 행이고,
상태는 `이식됨 / 흡수됨(→어디) / 중복(→우리 것) / 제외(사유) / 미착수` 중 하나다.
**`미착수` 가 하나라도 남으면 이식은 끝난 게 아니다.**

빠뜨리기 쉬운 것: **키보드 단축키 전부**(`useKeyboardShortcuts`) · 즐겨찾기(`useFavorites`) ·
최근 리소스(`useRecentResources`) · 컬럼 커스터마이즈(`custom-columns`) ·
일괄 워크로드 액션(`bulk-workload-actions` — **쓰기는 PR로만**) · RBAC 배지·폭발반경 ·
리소스 비교(`compare/`) · Git provider URL · YAML 편집·검증 · 강제삭제 다이얼로그 ·
연결오류 화면 · 빈/제한/스켈레톤 상태 · 툴팁 위치 계산 · 뷰 트랜지션

### 3.4 헷갈리지 말 것

| | 판정 |
|---|---|
| **`ui/SearchPillInput.tsx`** | ★ **우리 1층 태그 검색(C3)의 정본.** 이걸 가져와라 |
| **`ui/FilterPill.tsx`** (착륙됨) | **우리 검색 칩이 아니다.** 원본 주석: *"toggle pattern, not a combobox"*. `aria-pressed` 토글. **혼동 금지** |
| **Radar의 왼쪽 필터 사이드바** | 안 쓴다. **컴포넌트는 가져오되 IA는 우리 것** (1층 통합 태그 검색) |
| **`ui/provider-logos/*`** | **이미 저장소에 있다.** C7이 요구한 그것 |
| **`ui/FreshnessControl.tsx`** | **"N초 전 갱신"** 의 정본 |
| **Radar 라벨 텍스트** (`Pods` `Deployments` …) | **정본으로 쓰고 한국어로 번역만.** 새로 지어내지 마라 |
| **예외 — 우리 용어가 이김** | 그래프에서 `Node` → **서버**. 표의 컬럼명은 Radar 것 |
| **Radar `charts/`** | 가져오되 **shadcn `ChartContainer` 를 통과**시켜라. recharts 직접 사용 금지 |

---

## 4. C — 셸 정정 (R0~R2와 병행)

### C1 · 상세/AI 독립 상태기계 ★ 최우선

**DOM 구조 — 이게 모순을 구조적으로 막는다:**
```
Shell   = [ Sidebar | Content ]           Sidebar는 셸. 절대 안 덮인다
Content = [ Main    | AiPanel ]           ★ AI는 Main의 형제. 상세 안에 넣지 마라
Main    = [ ListColumn | DetailPanel ]    ListColumn = 1층 검색 + 2층 그래프 + 3층 표
```

| 상태 | ListColumn | DetailPanel | AiPanel |
|---|---|---|---|
| 기본 | flex-1 | w-0 | w-0 |
| 살짝 | flex-1 | w-[480px] | w-0 |
| 전체 | w-0 opacity-0 | w-full | w-0 |
| **목록+AI** | flex-1 | w-0 | w-[420px] |
| 전체+AI | w-0 | w-full | w-[420px] |

**AI를 DetailPanel 안에 넣으면 "상세 없이는 AI를 못 연다"가 된다. 틀렸다.**
목록만 보면서도 물어야 한다 — "이 네임스페이스에 문제 있는 파드 있나?"

**불변식:** 사이드바가 셸이고 나머지는 전부 콘텐츠다.
**상세의 "전체화면"은 콘텐츠 전체(검색바 포함)를 덮는다는 뜻이다. 셸은 안 덮는다.**
**사이드바 토글은 사이드바 헤더 안**(로고 옆). 사이드바가 안 사라지니 토글도 안 사라진다.
맥락은 상세 제목 아래 `prod-eks / target / Pod` 한 줄. `≫` 한 번이면 검색바가 돌아온다.

**두 축은 완전히 독립:** `detail ∈ {닫힘, 살짝, 전체}` · `ai ∈ {닫힘, 열림}`

| 조작 | detail | ai |
|---|---|---|
| 행/파드 클릭 | 닫힘→살짝 | 변화 없음 |
| 확장 `≪` | 살짝→전체 | ★ **변화 없음. AI가 열려 있으면 열린 채 유지** |
| 축소 `≫` | 전체→살짝 | ★ **변화 없음** |
| 닫기/Esc | →닫힘 | ★ **변화 없음** |
| ✦ AI 열기 | **살짝일 때만** 전체로 승격. **닫힘이면 닫힘 그대로** | 열림 |
| ✦ AI 닫기 | ★ **변화 없음** | 닫힘 |

**지금 있는 버그 둘 — 이 표로 봉쇄된다:**
(a) AI 열린 상태에서 확장 누르면 AI가 사라진다 → 금지
(b) AI를 누르면 상세가 딸려 열린다 → 금지

**공간 부족(<1440px)에서 "전체+AI"에서 축소를 누르면 마지막 조작이 이긴다:**
축소가 이기고 AI가 닫히며 토스트 "AI를 닫고 상세를 좁혔습니다". **조용히 깨지지 않는다.**

**아이콘(lucide):** 살짝→전체 `ChevronsLeft`(≪) "넓게 보기" / 전체→살짝 `ChevronsRight`(≫) "좁게 보기" /
닫기 `X` / 사이드바 `PanelLeft`(사이드바 헤더 안).
**`⤢` 같은 대각선 금지** — 상세는 왼쪽 경계가 왼쪽으로 밀려 넓어진다. **방향을 그려라.**
확장/축소 버튼은 상세 패널 좌상단 부착. `position:fixed` 금지.

**AI 맥락 칩은 지금 상태를 그대로 비춘다:**
상세 열림 → `[리소스][prod-eks][checkout-api-7d9f]` / 목록만 → `[리소스][prod-eks][ns: target]`

**URL:** `?detail=<kind>/<ns>/<name>` + `?detail.full=1`. 뒤로가기=닫기. `J`/`K`는 살짝·전체 둘 다.
**Issues·GitOps 상세도 같은 컴포넌트로 통일.** 지금은 구식 우측 `SheetContent`다.

**회귀 가드:** 상세 열었는데 사이드바 폭이 변하면 FAIL / 확장·축소·닫기가 `ai`를 바꾸면 FAIL /
`detail=닫힘`에서 AI를 열었는데 detail이 열리면 FAIL / `AiPanel`이 `DetailPanel`의 자손이면 FAIL /
상세가 사이드바를 덮으면 FAIL

### C2 · 사이드바
순서: **홈 → 클러스터 → 리소스 → 인시던트 → 애플리케이션 → GitOps ─── 설정**
`메트릭`·`카탈로그` 제거(기획에 없다). `워크플로우` → **`GitOps`** 이름 통일.
하단에 **워크스페이스 전환 + 프로필**. 지금 `user-bf4f9d6a…` UUID가 잘려 나온다.
표시는 `display_name` → `email` → UUID 8자+`…`. 툴팁에 전체.
프로필 메뉴: 프로필 · **테마(라이트/다크/시스템)** · 설정 · 로그아웃.
**설정 화면**을 만들어라 (워크스페이스·클러스터·저장소·멤버·알림·**정책(즉시/승인)**).
shadcn `sidebar-*` 블록 + `NavUser` + `TeamSwitcher` 패턴.

### C3 · 1층 검색 — 칩을 입력창 **안**으로
지금 칩이 입력창 **밖 왼쪽**에 있고, 늘어나면 **두 줄**이 되어 아래가 밀린다.
확정: `🔍 [칩][칩] 필터 추가… ✕` 가 **하나의 border 안에.**
**Radar `ui/SearchPillInput.tsx` 가 정본이다** (R1에서 가져온다).
**절대 두 줄 금지**(넘치면 가로 스크롤 또는 `+N` popover). **검색바 높이 고정.**
빈 입력에서 `Backspace` = 마지막 칩 삭제.
**홈 제외 모든 목록 화면**(클러스터·인시던트·애플리케이션·GitOps)에 **같은 위치·같은 컴포넌트.**
**회귀 가드:** 칩 0→5개일 때 아래 그래프 `top` 좌표가 변하면 FAIL.

### C4 · 그래프 — 2.25배, 잘림 금지, 안 가림
높이 **320 → 720px** (`--product-graph-height: 45rem`). 드래그 480~1040px, 값 저장.
지금 `h-96 sm:h-80` 이라 **데스크톱에서 오히려 작아진다. 반대다.** 모바일만 400px.
**2층 높이는 모든 화면에서 동일.**
표는 아래로 밀린다(그게 맞다). **표 헤더 sticky.** `⌃`로 접으면 표만 본다(URL `graph=0`).
**잘림 금지:** ELK 후 `fitView({padding:0.12})` + `ResizeObserver` 재-fit. 최소 줌 0.4.
**오버레이가 캔버스를 덮지 않는다:** 지금 툴바가 `absolute top-0` + `bg-background/80` 로 가린다.
→ **flex column** 으로 바꿔 툴바가 자기 높이를 차지하고 캔버스가 남은 공간 전부를 쓴다.
꼭 떠야 하는 것(힌트·줌·범례)만 오버레이 → **`bg-background/40` 이하, 모서리에만, `pointer-events:none`.**
`MAX_VISIBLE_PODS_PER_SERVER=12` 가 **정의만 되고 안 쓰인다.** 문제 우선 정렬 + 12개 + `+N개` 실제 적용.

### C5 · AI — 폼이 아니라 **대화**
- **대화 스레드**(말풍선이 쌓인다, 스크롤, 자동 하단 스크롤 + "새 메시지 ↓")
- **스트리밍**(토큰 단위, 커서 `▍`, 응답 중엔 전송 자리에 **[중단]**) → **BQ-080 `SSE /ai/chat/stream`**
- **추천 질문이 명사구다**("선택 리소스 상태"). **완전한 문장**으로. **`?`로 안 끝나면 FAIL**
- **전송 버튼을 입력창 안쪽 오른쪽.** `Enter` 전송 / `Shift+Enter` 줄바꿈
- **패널이 열려 있으면 FAB(✦)을 숨긴다.** 지금 입력창을 덮고 있다
- **[＋ 새 대화]·[⟲ 이력].** `GET /ai/conversations` 는 **이미 백엔드에 있다**(`ai/router.py:281`). UI가 안 쓸 뿐
- 헤더 설명문 삭제. **근거 클릭 → 그 리소스 상세(`?detail=`)가 열린다**
- evidence 없으면 답변 안 그린다 — **기존 가드 유지**

### C6 · 테마 — 다크/라이트가 **실제로 안 바뀐다** (R0보다 먼저)
`useProductTheme`·`ThemeToggle` 은 **있는데 화면이 안 바뀐다.**
십중팔구 **색 토큰이 `:root` 에만 있고 `.dark` 에 짝이 없다.**
모든 semantic 색 토큰을 `:root`/`.dark` 양쪽에 `oklch()` 로 **짝 정의.**
**회귀 가드:** CSS를 파싱해 `:root` 색 토큰 중 `.dark` 에 없는 게 하나라도 있으면 **FAIL.** 기본값 **다크**.
**이게 안 되면 Radar 어댑터(R0)도 무의미하다. 이걸 먼저 끝내라.**

### C7 · 클러스터 — 실제 로고 (이미 저장소에 있다)
`references/upstream/packages/k8s-ui/src/components/ui/provider-logos/`
→ `aws.png` `aws-dark.png` `azure.svg` `gcp.png` **를 쓴다.**
enum → 로고 매핑(문자열 매칭 금지). 온프렘은 lucide `server` + "우리 서버".
`NOTICE` 에 **상표 귀속** 별도 명시.

### C8 · 아이콘 단일화
`@tabler/icons-react` 제거 → **lucide 단일화** (`ClusterProviderIcon.tsx`, `ClusterConnectDialog.tsx`).
`package.json` 에서도 뺀다. brand 로고는 자산이므로 예외. **lucide 외 import 있으면 FAIL.**

### C9 · shadcn Blocks + 레이아웃 안정성
**shadcn Blocks 를 적극적으로 가져와 써라.** MIT이고, **코드를 저장소로 복사해 오는 것이 설계된 사용법**이다.
우리 primitive가 이미 shadcn이다. 손으로 다시 짜는 게 오히려 일관성을 깬다.
```
셸 = sidebar-*  ·  프로필/워크스페이스 = NavUser + TeamSwitcher
표 = data-table  ·  차트 = ChartContainer + recharts (/charts/area 규격)
검색 = command + badge + popover  ·  위자드 = dialog + stepper  ·  알림 = sonner
```
`npx shadcn@latest add <block>` 으로 가져온 뒤 **우리 토큰으로 다시 칠한다.** 원본 색·간격 하드코딩 금지.
정본은 `shared/ui/primitives` · `shared/ui/blocks` 두 곳뿐.
**`ResourceSparkline.tsx` 가 recharts를 직접 쓴다 → `ChartContainer` 경유로 교정.**

**레이아웃 안정성 계약** ("사이즈가 막 바뀐다"를 구조적으로 막는다):
- **스켈레톤은 실제 크기와 같아야 한다** (자리를 먼저 잡는다)
- `tabular-nums` · `scrollbar-gutter: stable` · 이미지·아이콘 폭·높이 명시
- 애니메이션은 `transform`·`opacity` 만 (패널·AI의 `width` 만 예외)
**회귀 가드:** Playwright **CLS < 0.05** / 칩 0→5개일 때 그래프 `top` 불변 / 로딩→완료 시 표 첫 행 `y` 불변

### C10 · **실시간 — 지금 아예 안 된다** ★

**화면이 한 번 불러오고 끝이다.** 폴링도 SSE도 없다 (로그 SSE만 있음).
**운영 도구인데 화면이 안 움직이면 도구가 아니다.**

**Radar 방식을 숫자까지 그대로 가져온다** (`web/src/hooks/useEventSource.ts` 실측):

| 장치 | 값 |
|---|---|
| **클러스터 크기별 동적 스로틀** | 노드 <100 → **500ms** / <300 → **1s** / <500 → **2s** / 그 외 → **3s** |
| **지수 백오프 재연결** | 초기 **3s** → 최대 **30s** 상한 |
| **이벤트 링 버퍼** | `MAX_EVENTS = 100` |
| **네임스페이스 서버측 필터** | 큰 클러스터는 SSE 재연결로 서버에서 좁힌다 |
| **새로고침 애니메이션** | `useRefreshAnimation` — idle → spinning(**최소 400ms**) → success(**1200ms**) → idle |

**백엔드 계약 (신설):**
```
BQ-081  SSE /events/stream?clusters=&namespaces=    토폴로지 델타 + K8s 이벤트
BQ-082  SSE /resources/stream?<filters>             3층 표의 행 상태 변화
BQ-080  SSE /ai/chat/stream                         AI 토큰 스트리밍
```

**화면에 어떻게 나타나나:**
- 2층 그래프: SSE로 파드가 **뜨고 사라지는 게 실시간으로 보인다**
- 3층 표: 값이 바뀌면 **막대만 500ms 보간, 숫자는 즉시 교체** (VP-017 §8)
- 클러스터 카드: SSE 없으면 **폴링 10초** fallback
- **끊기면** 1층 오른쪽에 `연결 끊김 · 재연결 중…`. **조용히 멈추지 않는다**
- 갱신 표시: `ui/FreshnessControl` — **"3초 전 ↻"**
- **탭이 백그라운드면 SSE를 끊는다.** 복귀 시 재연결 + 전체 스냅샷 1회

**BE-Gap:** 계약이 아직 없으면 **폴링으로 시작한다**(10s/5s).
**"실시간인 척"하지 마라.** 폴링이면 "10초마다 갱신"이라고 정직하게 표시한다.

**회귀 가드:** 갱신 메커니즘이 하나도 없는 리스트가 있으면 FAIL / SSE 재연결이 고정 간격이면 FAIL /
이벤트 버퍼에 상한이 없으면 FAIL / 탭이 백그라운드인데 계속 돌면 FAIL /
연결이 끊겼는데 화면이 아무 말도 안 하면 FAIL

---

## 5. shadcn 문법 규칙 (우리 코드의 문법으로 채택)

**`ui.shadcn.com` 의 작성 규약을 그대로 따른다.** "비슷하게 생기게"가 아니라 **"같은 문법으로 쓴다".**

- 모든 `className` 은 **`cn()`** 을 통과 (clsx + tailwind-merge)
- 변형(variant/size)은 **`cva`** 로 선언. 컴포넌트 안에서 `if` 로 클래스 분기 금지
- **모든 primitive 루트에 `data-slot="<name>"`.** **테스트와 스타일 훅은 이걸로 잡는다**
- 합성은 **`asChild` + Radix `Slot`.** 래퍼 div로 버튼 흉내 금지
- **시맨틱 토큰만**: `bg-background` `text-foreground` `text-muted-foreground` `border`
  `bg-accent` `bg-destructive` `ring` `bg-card` `bg-popover`
  → **`bg-zinc-*` `text-gray-*` `border-slate-*` `bg-[#18181b]` 전면 금지**
- **Tailwind v4 + CSS 변수.** 색은 `oklch()` 로 `:root`/`.dark`, `@theme inline` 매핑
- **arbitrary value 금지** (`w-[437px]` `text-[13px]`). 스케일을 쓴다. 정사각형은 **`size-4`**
- 포커스 링 = `focus-visible:ring-ring/50 focus-visible:ring-[3px]` 표준
- 폼 에러 = `aria-invalid` + `aria-invalid:ring-destructive/20`
- **React 19 스타일** (`forwardRef` 없이 `ref` 를 prop으로)
- **컴포넌트별 `.css` 파일 금지**

**회귀 가드:** 팔레트 색 클래스 등장 시 FAIL / 허용목록 밖 arbitrary value 시 FAIL /
primitive 루트에 `data-slot` 없으면 FAIL / 컴포넌트별 `.css` 파일 생기면 FAIL /
`theme-*` 가 `shared/ui/radar/` 밖에 나오면 FAIL

---

## 6. 정정·이식 후 — 남은 슬라이스

VP-016 순서: **S11 TimelineStrip → S12 Issues+RCA → S13 변경 적용 진행 ★ → S14 GitOps →
S15 Checks → S16 Settings → S17 Home 위젯**

**S13이 데모의 클라이맥스인데 백엔드가 통째로 없다.** `routes.py` 에 `/changes` 상수가 **0개**다.
```
BQ-076  POST /changes                  → change_id (모드는 정책이 결정)
BQ-077  SSE  /changes/{id}/progress    → 단계 이벤트 (실제 이벤트만, 추정 금지)
BQ-078  POST /changes/{id}/revert
BQ-079  GET  /changes/active
```
그리고 **VP-017 §7의 고스트 파드 · 단계 레일 · 트레이스 워터폴**을 구현하라.
`motion-ghost-breathe` · `motion-rail-flow` CSS는 **정의만 되고 아무도 안 쓴다.**

### C11 · 커밋 컨벤션을 **강제 장치로** 만든다

**지금 아무 장치가 없다.** `commit-msg` 훅도 CI 검사도 없어서
`origin/dev` 2,413개 중 **23개가 스코프 위반**(`feat(applications):`)이고 **영어 제목**도 섞여 있다.

**컨벤션:**
```
<type>: <한국어 제목>
```
- 허용 타입: `feat` `fix` `refactor` `docs` `test` `chore` `style` `perf` `build` `ci` `revert`
- **스코프 금지.** `feat(applications):` 는 위반이다. 변경된 파일과 제목으로 영향 범위를 전달한다
- **제목은 한국어.** `feat: add workflow plan picker` 는 위반이다
- 마침표로 끝내지 않는다 · 한 줄(72자 이하) 유지
- **`수정` `작업` `변경` `업데이트` 로 끝나는 모호한 제목 금지.** **변경의 결과**를 서술한다
- 본문이 필요하면 제목 아래 빈 줄 뒤에 한국어로. BREAKING CHANGE는 영어로

**금지어 (오픈소스 공개 대비 — 우녕 정책):**
커밋 **제목**에 **외부 레퍼런스 구현체 이름**과 **내부 기획 문서 ID**를 남기지 않는다.
목록은 `scripts/commit-denylist.txt` 에 있다.
> 커밋 제목은 **"무엇이 달라졌는가"** 를 말한다. "어디서 베꼈는가"나 "몇 번 문서를 따랐는가"는
> 코드·문서 안에 남긴다. **레퍼런스 귀속은 `NOTICE` 와 파일 헤더에 남긴다** — 라이선스가 요구하는 곳이 거기다.

**해야 할 일:**
1. **`scripts/commit-msg-gate.sh` · `scripts/commit-denylist.txt` 가 이미 있다.** 6가지 위반 전부 잡는 것 검증 완료
2. `.git/hooks/commit-msg` 에 연결한다 — `exec scripts/commit-msg-gate.sh "$1"`
   팀원 전부에게 적용되도록 **`make setup-hooks`** 타깃 또는 `.pre-commit-config.yaml` 에 등록
3. **`dev-gate.yml` 에 검사를 추가한다:** `scripts/commit-msg-gate.sh --range origin/dev..HEAD`
   → **위반 커밋이 있으면 CI 빨간불.** 그러면 다시는 안 들어온다
4. 게이트 스크립트의 유닛 테스트 (위반 6종 + 통과 2종)

**과거 커밋(dev 2,413개 중 457개 위반)은 고치지 마라. 우녕이 "재작성 안 함"으로 결정했다.**
히스토리 재작성 + force-push는 **배포 증적(SHA)·팀원 클론·진행 중인 작업을 전부 깨뜨린다.**
`deploy-status.md`·night-log·Actions run·ECR 태그가 전부 특정 SHA를 가리키고 있다.
**지금부터 들어오는 것만 막는다.**

**저자 정보:** `choi woo-nyong <woonyong.kr@gmail.com>`.
`git config user.name` 이 `woonyong` 으로 되어 있으면 고쳐라.

---

## 7. 건드리지 마라 (우녕 승인 필요)

1. **`tests/test_dev_gate_contract.py` 의 가드 테스트 반전** —
   `test_pre_push_hook_calls_the_fast_gate` 가 `"set -- make gate\n" not in wrapper` 를 단언한다.
   **전체 게이트로 복원하는 커밋이 테스트에 걸려 실패한다.** 서버 게이트(`dev-gate.yml`의 `make gate`)는
   멀쩡하므로 안전 문제는 아니다. 하지만 **우녕 서명 없이 [D-040]을 개정한 상태**다.
2. **라이브 PG 비밀번호 회전** (비밀 값을 다룬다)

---

## 8. 규율 (변함없음)

- **BE-Gap**: 백엔드가 못 주는 값을 **0·disabled로 그리지 않는다.** `null`이면 **빈칸**. 화면이 얇아 보이는 건 정상이다
- **단일 writer**: Git → 웹훅 → 에이전트. **`kubectl apply` 금지.**
  예외: 드리프트 되돌리기는 Git이 이미 옳으므로 **Git 커밋 단계를 건너뛴다** (그리고 UI에서도 **그 단계를 그리지 않는다**)
- **모션은 `web/src/motion/` 에서만.** 컴포넌트 인라인 `@keyframes`·`animate()` 금지
- **DB**: 개발 중엔 마이그레이션 안 한다. 스키마가 바뀌면 **DB를 날리고 다시 만든다**
- **비밀 값은 커밋·로그·문서·night-log 에 절대 쓰지 않는다.** 이름과 절차만
- **라이선스**: Radar = Apache-2.0 (루트 NOTICE + 전문 + 상당한 수정·재작성 표기). provider-logos = **상표**. shadcn = MIT
- 슬라이스마다 **배포하고 `docs/auto/deploy-status.md` 갱신.** 안 하면 완료가 아니다
- **목표모드.** 막히면 3번 시도 후 다음으로 넘어가고 `night-log.md` 에 남겨라. **멈추지 마라**
