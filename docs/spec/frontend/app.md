---
source_commit: 1d7b4fbd
status: synced
---

# app — 부트스트랩·라우터·가드·콘솔 셸

> 소스: `frontend/src/main.tsx`, `frontend/src/app/`, `frontend/src/features/console/`

## 책임 (Responsibility)

- React 앱 부트스트랩(`main.tsx`), 전역 provider(`providers.tsx`), 라우트 트리(`router.tsx`), 접근 가드(`guards.tsx`)를 담당한다.
- 로그인 후 공통 레이아웃은 `features/console/ui.tsx :: ConsoleLayout`이다. 이 셸이 사이드바, 상단 프로젝트 라벨/알림/테마/로그아웃, 브레드크럼, 알림 flyover, `<Outlet />`을 조립한다.
- 기본 랜딩은 `/`의 `features/console/pages/HomePage`이다. `/console`과 `/console/*`는 루트 `/`로 회수하며, `/overview`와 구 UI 경로 계열은 호환 redirect 만 수행한다.
- WebSocket 실시간 연결의 시작점은 `ConsoleLayout`이다. 세션의 `workspace_id`가 준비되면 해당 workspace 로 연결하고, workspace 가 사라지면 연결을 닫는다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/query`, `@/shared/lib/api`, `@/shared/lib/live`, `@/shared/lib/ui-store`, `@/shared/tokens.css`, `@/shared/ui/app.css`, `@/shared/theme-bridge.css`, `@/ui` | [shared](./shared.md) | QueryClient, 401 핸들러, 브라우저 스냅샷 스트림 시작, 토스트, skeleton, 전역 스타일 |
| import | 콘솔 UI 프리미티브·아이콘·토큰 모듈 | [shared](./shared.md) | 콘솔 셸 프리미티브·아이콘·토큰 |
| import | `@/features/auth/api`, `@/features/auth/sessionRefresh` | [features/auth](auth.md) | `useSession`·`useIsAdmin`·`useLogout`·`sessionKey`, 세션 hint, 사용자 interaction 후 세션 refresh |
| import | `@/features/notifications/api` | [features/notifications](notifications.md) | 알림 flyover와 unread badge |
| import | `@/features/console/pages/HomePage` | [fleet](fleet.md) | router index 랜딩 |
| import (lazy) | `@/features/*` 각 뷰 | [features/*](fleet.md) | 라우트별 코드 스플리팅 |
| 외부 | `react-router-dom` v6 (`createBrowserRouter`) | — | 라우팅 |
| 외부 | `@tanstack/react-query` | — | 서버 상태 |
| 백엔드 | WS `/api/live/browser` | [realtime-gateway](../services/realtime-realtime-gateway.md) | 실시간 스냅샷(연결은 shared/lib/live 가 수행) |

## 공개 인터페이스 (Public API)

### 부트스트랩 — `frontend/src/main.tsx`

파일 자체가 엔트리포인트(export 없음). 동작:

1. `@/shared/tokens.css`, `@/shared/ui/app.css`, 콘솔 UI 토큰 CSS, `@/shared/theme-bridge.css` 순서로 전역 스타일을 로드한다.
2. 첫 페인트 전에 `document.documentElement.data-theme-mode`를 `localStorage['theme-mode'] === 'light' ? 'light' : 'dark'`로 세팅한다.
3. `MotionConfig reducedMotion="user"` 아래에 `Providers`와 `RouterProvider(router)`를 렌더한다.

### Providers — `frontend/src/app/providers.tsx :: Providers`

```tsx
export function Providers({ children }: { children: ReactNode })
```

- `useEffect` 1회: `setUnauthorizedHandler(() => { clearSessionHint(); queryClient.invalidateQueries({ queryKey: sessionKey }); })` — API 401 수신 시 최근 세션 hint 를 지우고 세션 쿼리를 무효화해 가드가 `/login` 으로 보내게 한다. 같은 effect 는 `installSessionRefresh(queryClient)`를 설치하고 cleanup 으로 이벤트 리스너를 제거한다.
- 렌더: `<QueryClientProvider client={queryClient}>{children}<Toasts /></QueryClientProvider>`. `Toasts` 는 [shared/ui](./shared.md#toasts) 전역 토스트 뷰포트.

### 라우터 — `frontend/src/app/router.tsx :: router`

```tsx
export const router = createBrowserRouter([...])
```

- 내부 헬퍼 `L(f)` (비공개): `lazy(f)` 를 `<Suspense fallback={<Skeleton lines={6} />}>` 로 감싼 lazy 라우트 요소를 만든다.
- 내부 헬퍼 `consoleChildren(basePath = '')` (비공개): `/` 콘솔 하위 IA를 정의한다. `settings` index redirect 는 base path 를 반영할 수 있지만 현재 운영 라우트는 `/`만 사용한다.
- 라우트 트리:

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/login` | `features/auth/LoginView` (lazy) | `RequireGuest` | 로그인 |
| `/signup` | `features/auth/SignupView` (lazy) | `RequireGuest` | 가입 |
| `/pending` | `features/auth/PendingView` (lazy) | `RequireGuest` | 관리자 승인 대기 안내 |
| `/verify-email` | `features/auth/VerifyEmailView` (lazy) | `RequireGuest` | 이메일 검증 결과/재전송 |
| `/` | `ConsoleLayout` index `HomePage` | `RequireSession` | 플릿 현황 홈 |
| `/clusters` | `features/cluster/ClusterListView` (lazy) | `RequireSession` + `ConsoleLayout` | 클러스터 목록 |
| `/clusters/:clusterId` | `features/cluster/ClusterDetailView` (lazy) | 〃 | 클러스터 상세(탭) |
| `/clusters/:clusterId/pods/:namespace/:pod` | `features/cluster/ClusterDetailView` (lazy) | 〃 | 팟 상세 Drawer 딥링크 |
| `/repos` | `features/repo/RepoListView` (lazy) | 〃 | 배포 정의 목록 |
| `/repos/:applicationId` | `features/repo/RepoDetailView` (lazy) | 〃 | 배포 정의 상세(탭) |
| `/workflows` | `features/workflow/WorkflowListView` (lazy) | 〃 | 전체 run 목록 |
| `/workflows/:runId` | `features/workflow/WorkflowGraphView` (lazy) | 〃 | run 단계 그래프 |
| `/incidents` | `features/notifications/NotificationsView` (lazy) | 〃 | 알림/인시던트 합성 피드 |
| `/incidents/:incidentId` | `features/notifications/IncidentDetailView` (lazy) | 〃 | RCA 인시던트 파이프라인 |
| `/metrics` | `features/metrics/MetricsView` (lazy) | 〃 | 스트림·스냅샷 메트릭 + 온디맨드 PromQL |
| `/ai` | `features/chat/ChatView` (lazy) | 〃 | AI 대화(새 대화) |
| `/ai/:conversationId` | `features/chat/ChatView` (lazy) | 〃 | AI 대화(기존 대화) |
| `/catalog` | `features/resources/CatalogView` (lazy) | 〃 | 카탈로그 |
| `/settings` (index) | `<Navigate to="/settings/members" replace />` | `RequireSession` + `ConsoleLayout` + `RequireAdmin` | 설정 기본 탭 |
| `/settings/members` | `features/org/MembersView` (lazy) | 〃 | 멤버 관리 |
| `/settings/orgs` | `features/org/OrganizationsView` (lazy) | 〃 | 조직 관리 |
| `/settings/groups` | `features/org/GroupsView` (lazy) | 〃 | 그룹 관리 |
| `/settings/access` | `features/org/AccessView` (lazy) | 〃 | 리소스 권한 |
| `/settings/alerts` | `features/notifications/AlertChannelsView` (lazy) | 〃 | 알림 채널 테스트·저장 |
| `/settings/ops` | `features/notifications/OpsView` (lazy) | 〃 | 운영(Dead Letter) |
| `*` | `features/console/pages/NotFoundPage` (lazy) | `RequireSession` + `ConsoleLayout` | 알 수 없는 콘솔 경로 404 안내 |
| `/console`, `/console/*` | `<Navigate to="/" replace />` | 없음 | 아카이브 콘솔 데모 삭제 후 루트로 회수 |
| 구 UI 경로 계열 | `<Navigate to="/" replace />` | 없음 | 구 UI 경로 호환 |
| `/overview`, `/overview/*` | `<Navigate to="/" replace />` | 없음 | 구 오버뷰 경로 호환 |
| `/notifications` | `<Navigate to="/incidents" replace />` | 없음 | 구 알림 경로 호환 |

### 가드 — `frontend/src/app/guards.tsx`

| 심볼 | 앵커 | 동작 |
|---|---|---|
| `RequireSession` | `frontend/src/app/guards.tsx :: RequireSession` | 성공 세션(`data.authenticated`)은 `markSessionSeen()`으로 최근 세션 hint 를 기록하고, 401/unauthorized error 는 `clearSessionHint()`로 지운다. `useSession()` pending 이면서 `hasRecentSessionHint()`가 true 면 `<Outlet />`을 즉시 렌더한다. hint 가 없으면 처음 5초는 `@/ui Skeleton`, 이후에는 `@/ui EmptyState(AlertGlyph, '세션 확인 중')` + "다시 시도" 버튼을 `bg-bg p-6 sm:p-12` 컨테이너에서 보여준다. 세션 조회가 실패했지만 `unauthorized`/401이 아니면 같은 `@/ui EmptyState`로 detail 또는 '세션을 확인하지 못했습니다' + "다시 시도" 버튼을 보여준다. 401 또는 unauthenticated 는 `returnTo = loc.pathname + loc.search + loc.hash` 를 인코딩해 `<Navigate to={"/login?returnTo=" + encodeURIComponent(returnTo)} replace />`. 아니면 `<Outlet />` |
| `RequireGuest` | `frontend/src/app/guards.tsx :: RequireGuest` | `!isError && data?.authenticated` 면 `returnTo` query 를 `safeReturnTo` 로 검증한 뒤 replace 이동한다. 세션 조회가 pending 이거나 실패한 게스트 화면은 막지 않고 `<Outlet />`을 렌더한다. `safeReturnTo` 는 값이 없거나 `/`로 시작하지 않거나 `//`/`://`를 포함하면 `/`로 폴백한다. |
| `RequireAdmin` | `frontend/src/app/guards.tsx :: RequireAdmin` | `useIsAdmin()` 가 false 면 `@/ui EmptyState` + local `LockGlyph` 로 "권한이 필요합니다"를 렌더(리다이렉트 아님). true 면 `<Outlet />` |

### 콘솔 셸 — `frontend/src/features/console/ui.tsx :: ConsoleLayout`

```tsx
export function ConsoleLayout({ basePath }: { basePath?: string }): JSX.Element
export const useConsolePath: () => (to: string) => string
```

컴포넌트 트리:

```text
ConsoleLayout (div.pl-app.co-app)
├─ nav.co-sidebar(.collapsed)
│  ├─ button.co-logo (브랜드 마크 아이콘 + "LOGO", click=sidebar collapse toggle)
│  ├─ MENU NavLink: /, /clusters, /repos, /workflows, /incidents, /metrics, /ai, /catalog
│  ├─ admin only NavLink /settings
│  └─ session email avatar row
├─ div.co-main
│  ├─ header.co-header
│  │  └─ 프로젝트 라벨 + 알림 버튼(unread badge) + AI 채팅 버튼 + ThemeToggle + 로그아웃 버튼
│  ├─ div.co-subheader: back button + pathname 기반 breadcrumbs
│  └─ div.co-content > motion.div(key=first path segment, fadeRise) > <Outlet />
└─ Flyover(notifOpen): 최근 알림 최대 30개, 모두 읽음, 인시던트로 이동. 알림이 없으면 "표시할 알림이 없습니다"
```

- 상태 소스: local `collapsed`, `notifOpen`, `useIsAdmin()`, `useSession()`, `useLogout()`, `useNotices()`, `useLocation()`, `useNavigate()`. `ConsoleLayout`은 `liveStore` 값을 표시하지 않지만 `startLive(session?.workspace_id)`로 스트림 연결은 시작한다.
- `basePath`가 있으면 `normalizeBasePath`와 `pathFor`가 내부 링크, sidebar `NavLink`, breadcrumb, 알림 이동, 홈/AI/인시던트 이동을 같은 base path 아래로 보정한다. 하위 뷰는 `useConsolePath()`로 `/clusters/...` 같은 절대 콘솔 경로를 현재 base path에 맞춘다.
- `useEffect(() => { startLive(session?.workspace_id); }, [session?.workspace_id])` — WS 연결은 세션 workspace 기준으로 유지한다([shared/lib/live](./shared.md#실시간-livets)).
- `MENU` (비공개): 홈(`/`), 배포(`/repos`), 클러스터(`/clusters`), 워크플로우(`/workflows`), 인시던트(`/incidents`), 메트릭(`/metrics`), AI 채팅(`/ai`), 카탈로그(`/catalog`). admin 이면 `/settings` 추가.
- `SECTION_LABEL` (비공개): 1뎁스 breadcrumb 라벨을 메뉴 어휘와 맞춘다.
- 알림 flyover 의 항목 클릭은 `navigate(pathFor(n.link))` 하고, "인시던트로 이동"은 `pathFor('/incidents')` 로 이동한다.

### 홈 — `frontend/src/features/console/pages/HomePage.tsx :: HomePage`

- 라우트: `/` index.
- 데이터: `useFleetSummary`, `useTimeline`, `useNotices`, `useConversations`, `useIsAdmin`, 선택 클러스터 기준 `useClusterUsage`, `useMetricWidgets`, `useMetricQueryPresets`.
- state: `clusterWizard`, `repoWizard`, `fleetLens`, `selectedClusterId`.
- `fleetClusters = useMemo(() => fleetQ.data?.clusters ?? [], [fleetQ.data?.clusters])` 로 fleet 배열 참조를 고정한다. `useEffect`는 선택 클러스터가 비었거나 fleet 에 없으면 첫 클러스터로 보정한다.
- 트리: `QueryBoundary(useFleetSummary)` → 빈 클러스터 `EmptyState('아직 등록된 클러스터가 없습니다', admin 이면 등록 action)` 또는 dashboard toolbar(배포 정의 추가, admin 클러스터 등록, 쿼리 이동, 위젯 추가) → 플릿 맵(`FLEET_LENSES` tab + 공용 `DrilldownHeatmap`) → `FleetWidgetStrip` KPI 4개 → 최근 인시던트/승인 카드 → 클러스터 `Table` → 최근 AI 대화 카드.
- `usageSeries`는 [metrics](./metrics.md)의 `buildUsageSeries()`를 재사용한다. `restart_total`은 누적값이 아니라 샘플 간 증가분(`재시작 증가`)으로 렌더하고, 시간 라벨 포맷은 [shared `TimeSeriesChart`](shared.md#차트-uichartstsx)가 담당한다.
- `fleetHeatNode(cluster, lens)`는 모든 렌즈에서 tile 크기 `value=max(1,pods_total)`을 유지하고 score/label만 바꾼다. `all`: `score=healthScore(health)`. `cpu`: `score=ratioHealthScore(cpu_pct)`. `memory`: `score=ratioHealthScore(mem_pct)`. `incidents`: 인시던트가 있으면 `score=0.12`, 없으면 `healthScore(health)`. tile 라벨은 한국어 표시(`팟`, `인시던트`)를 쓴다.
- `FleetWidgetStrip`은 fleet totals 와 cluster summary 만 사용한다. 팟 수, 평균 CPU, 평균 메모리, 활성 알림(`open_incidents + dead_letters`)을 표시하고 CPU/MEM 관측값이 없으면 `—`로 표시한다.
- `StoredWidgetSummary`는 선택 클러스터의 `/metric-widgets`와 `/metric-query-presets` 결과 개수와 최대 4개 저장 위젯을 보여준다. 저장 위젯이 없으면 `저장된 위젯 없음`을 표시한다.
- 최근 인시던트, 승인 대기, 최근 AI 대화 행은 `AnimatedList`로 렌더한다. 빈 상태 문구는 각각 `열린 인시던트 없음`, `승인 대기 없음`, `대화 없음`.

## 동작 (Behavior)

1. 부팅: `main.tsx` → `Providers`(QueryClient + 401 핸들러 + Toasts) → `RouterProvider`.
2. 게스트 플로우: 인증 전 사용자는 `RequireGuest` 하위 4개 라우트만 접근. 이미 로그인된 사용자가 게스트 라우트에 들어오면 안전한 `returnTo` query 로 이동하고, 없거나 외부 URL 형태면 `/` 로 이동한다. 세션 조회가 pending 이거나 실패하면 게스트 화면을 그대로 렌더한다.
3. 세션 플로우: `RequireSession` 이 세션 확인 후 `ConsoleLayout` 렌더 → `startLive(session.workspace_id)` 호출로 해당 workspace 의 WS 시작. 최근 세션 hint 가 있으면 세션 확인 pending 동안에도 기존 콘솔 화면을 먼저 유지하고, 응답이 오면 성공/401 규칙으로 수렴한다.
4. 401 발생 시: `api()` 가 `onUnauthorized` 호출 → 세션 hint 삭제 + 세션 쿼리 무효화 → `RequireSession` 재평가 → `/login?returnTo=<현재 path+query+hash>` 이동.
5. 세션 확인 timeout/network/server 오류는 로그인 이동으로 위장하지 않고 세션 확인 실패 empty state 와 재시도 버튼을 렌더한다.
5. `/console`과 `/console/*`는 `/`로 redirect한다. `/overview`, `/notifications`, 구 UI 경로 계열도 호환 redirect 로 회수한다. 그 외 알 수 없는 세션 경로는 해당 `ConsoleLayout` 안에서 404 `EmptyState` 를 렌더한다.

## 불변식·오류 (Invariants & Errors)

- WS 연결 시작(`startLive`)은 앱 전체에서 `ConsoleLayout` 한 곳에서만 호출한다.
- 정식 뷰 라우트는 lazy import + `Skeleton` fallback 을 사용한다. `HomePage`만 index 화면이라 직접 import 한다.
- `RequireAdmin` 은 리다이렉트하지 않고 안내 `EmptyState` 를 렌더한다(URL 유지).
- 최근 세션 hint 는 pending 화면을 줄이는 표시 최적화다. 401/unauthorized, logout 은 hint 를 지우며 최종 인증 판단은 항상 `/auth/session` 응답과 서버 쿠키 검증에 따른다.
- `HomePage`는 `/fleet/summary`, 선택 클러스터의 usage series, metric widget/preset API 결과만 렌더한다. 없는 위젯이나 시계열을 프론트에서 만들어 보이지 않는다.
- 알 수 없는 경로는 몰래 홈으로 보내지 않고 `NotFoundPage` 로 표시한다. 구 경로 호환 redirect 만 예외다.
- 라우트 추가 시 이 표, `consoleChildren`, `ConsoleLayout` 의 `MENU`(전역 네비 대상일 때), `useConsolePath` 소비 위치를 함께 갱신한다.

## 설정 (Settings)

| 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `VITE_API_BASE` | string | `'/api'` | REST prefix. 로컬 vite dev/preview 는 [shared 설정](./shared.md#설정-settings)의 `/api` proxy 기준을 따른다. |
