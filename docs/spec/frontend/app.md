---
source_commit: 664925a6
status: synced
---

# app — 부트스트랩·라우터·가드·콘솔 셸

> 소스: `frontend/src/main.tsx`, `frontend/src/app/`, `frontend/src/features/console/`

## 책임 (Responsibility)

- React 앱 부트스트랩(`main.tsx`), 전역 provider(`providers.tsx`), 라우트 트리(`router.tsx`), 접근 가드(`guards.tsx`)를 담당한다.
- 로그인 후 공통 레이아웃은 `features/console/ui.tsx :: ConsoleLayout`이다. 이 셸이 사이드바, 상단 LIVE/알림/테마/로그아웃, 브레드크럼, 알림 flyover, `<Outlet />`을 조립한다.
- 기본 랜딩은 `/`의 `features/console/pages/HomePage`이다. `/console` 하위에도 같은 콘솔 라우트 트리를 보존용 base path 로 제공하고, `/overview`와 구 UI 경로 계열은 호환 redirect 만 수행한다.
- WebSocket 실시간 연결의 시작점은 `ConsoleLayout`이다(로그인 후 1회).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/query`, `@/shared/lib/api`, `@/shared/lib/live`, `@/shared/lib/ui-store`, `@/shared/ui`, `@/shared/motion`, `@/shared/tokens.css`, `@/shared/ui/app.css`, `@/shared/theme-bridge.css` | [shared](./shared.md) | QueryClient, 401 핸들러, 실시간 스토어, 토스트, skeleton, 전역 스타일 |
| import | 콘솔 UI 프리미티브·아이콘·토큰 모듈 | [shared](./shared.md) | 콘솔 셸 프리미티브·아이콘·토큰 |
| import | `@/features/auth/api` | [features/auth](auth.md) | `useSession`·`useIsAdmin`·`useLogout`·`sessionKey` |
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

- `useEffect` 1회: `setUnauthorizedHandler(() => queryClient.invalidateQueries({ queryKey: sessionKey }))` — API 401 수신 시 세션 쿼리를 무효화해 가드가 `/login` 으로 보내게 한다.
- 렌더: `<QueryClientProvider client={queryClient}>{children}<Toasts /></QueryClientProvider>`. `Toasts` 는 [shared/ui](./shared.md#toasts) 전역 토스트 뷰포트.

### 라우터 — `frontend/src/app/router.tsx :: router`

```tsx
export const router = createBrowserRouter([...])
```

- 내부 헬퍼 `L(f)` (비공개): `lazy(f)` 를 `<Suspense fallback={<Skeleton lines={6} />}>` 로 감싼 lazy 라우트 요소를 만든다.
- 내부 헬퍼 `consoleChildren(basePath = '')` (비공개): `/`와 `/console`이 같은 콘솔 하위 IA를 공유하게 만든다. `settings` index redirect 는 base path 를 반영해 `/settings/members` 또는 `/console/settings/members`로 이동한다.
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
| `/repos` | `features/repo/RepoListView` (lazy) | 〃 | 레포(애플리케이션) 목록 |
| `/repos/:applicationId` | `features/repo/RepoDetailView` (lazy) | 〃 | 레포 상세(탭) |
| `/workflows` | `features/workflow/WorkflowListView` (lazy) | 〃 | 전체 run 목록 |
| `/workflows/:runId` | `features/workflow/WorkflowGraphView` (lazy) | 〃 | run 단계 그래프 |
| `/incidents` | `features/notifications/NotificationsView` (lazy) | 〃 | 알림/인시던트 합성 피드 |
| `/incidents/:incidentId` | `features/notifications/IncidentDetailView` (lazy) | 〃 | RCA 인시던트 파이프라인 |
| `/metrics` | `features/metrics/MetricsView` (lazy) | 〃 | 실시간 메트릭 + 온디맨드 PromQL |
| `/ai` | `features/chat/ChatView` (lazy) | 〃 | AI 대화(새 대화) |
| `/ai/:conversationId` | `features/chat/ChatView` (lazy) | 〃 | AI 대화(기존 대화) |
| `/catalog` | `features/resources/CatalogView` (lazy) | 〃 | 카탈로그 |
| `/settings` (index) | `<Navigate to="/settings/members" replace />` | `RequireSession` + `ConsoleLayout` + `RequireAdmin` | 설정 기본 탭 |
| `/settings/members` | `features/org/MembersView` (lazy) | 〃 | 멤버 관리 |
| `/settings/orgs` | `features/org/OrganizationsView` (lazy) | 〃 | 조직 관리 |
| `/settings/groups` | `features/org/GroupsView` (lazy) | 〃 | 그룹 관리 |
| `/settings/access` | `features/org/AccessView` (lazy) | 〃 | 리소스 권한 |
| `/settings/ops` | `features/notifications/OpsView` (lazy) | 〃 | 운영(Dead Letter) |
| `*` | `features/console/pages/NotFoundPage` (lazy) | `RequireSession` + `ConsoleLayout` | 알 수 없는 콘솔 경로 404 안내 |
| `/console`, `/console/*` | `ConsoleLayout basePath="/console"` + `consoleChildren('/console')` | `RequireSession` | 보존용 콘솔 경로. `/console/clusters`, `/console/ai/:conversationId` 등은 같은 화면을 base path 유지 상태로 렌더 |
| 구 UI 경로 계열 | `<Navigate to="/" replace />` | 없음 | 구 UI 경로 호환 |
| `/overview`, `/overview/*` | `<Navigate to="/" replace />` | 없음 | 구 오버뷰 경로 호환 |
| `/notifications` | `<Navigate to="/incidents" replace />` | 없음 | 구 알림 경로 호환 |

### 가드 — `frontend/src/app/guards.tsx`

| 심볼 | 앵커 | 동작 |
|---|---|---|
| `RequireSession` | `frontend/src/app/guards.tsx :: RequireSession` | `useSession()` pending 이면 `<div style={{padding:48}}><Skeleton lines={5}/></div>`. `data?.authenticated` 가 falsy 면 `<Navigate to={"/login?returnTo=" + encodeURIComponent(loc.pathname)} replace />`. 아니면 `<Outlet />` |
| `RequireGuest` | `frontend/src/app/guards.tsx :: RequireGuest` | pending 이면 `null`. `authenticated` 면 `/` 로 replace 이동. 아니면 `<Outlet />` |
| `RequireAdmin` | `frontend/src/app/guards.tsx :: RequireAdmin` | `useIsAdmin()` 가 false 면 `<EmptyState icon={<IconLock size={26} />} title="권한이 필요합니다" description="service_admin 역할이 필요한 화면입니다" />` 렌더(리다이렉트 아님). true 면 `<Outlet />` |

### 콘솔 셸 — `frontend/src/features/console/ui.tsx :: ConsoleLayout`

```tsx
export function ConsoleLayout({ basePath }: { basePath?: string }): JSX.Element
export const useConsolePath: () => (to: string) => string
```

컴포넌트 트리:

```text
ConsoleLayout (div.pl-app.co-app)
├─ nav.co-sidebar(.collapsed)
│  ├─ div.co-logo ("운영 콘솔", click=sidebar collapse toggle)
│  ├─ MENU NavLink: /, /clusters, /repos, /workflows, /incidents, /metrics, /ai, /catalog
│  ├─ admin only NavLink /settings
│  └─ session email avatar row
├─ div.co-main
│  ├─ header.co-header
│  │  └─ LIVE indicator + 알림 버튼(unread badge) + AI 채팅 버튼 + ThemeToggle + 로그아웃 버튼
│  ├─ div.co-subheader: back button + pathname 기반 breadcrumbs
│  └─ div.co-content > motion.div(key=first path segment, fadeRise) > <Outlet />
└─ Flyover(notifOpen): 최근 알림 최대 30개, 모두 읽음, 인시던트로 이동
```

- 상태 소스: local `collapsed`, `notifOpen`, `liveStore(status/snapshot.at)`, `useIsAdmin()`, `useSession()`, `useLogout()`, `useNotices()`, `useLocation()`, `useNavigate()`.
- `basePath`가 있으면 `normalizeBasePath`와 `pathFor`가 내부 링크, sidebar `NavLink`, breadcrumb, 알림 이동, 홈/AI/인시던트 이동을 같은 base path 아래로 보정한다. 하위 뷰는 `useConsolePath()`로 `/clusters/...` 같은 절대 콘솔 경로를 현재 base path에 맞춘다.
- `useEffect(() => { startLive(); }, [])` — WS 연결은 셸 마운트 시 1회만([shared/lib/live](./shared.md#실시간-livets)).
- `MENU` (비공개): 홈(`/`), 클러스터(`/clusters`), 레포(`/repos`), 워크플로우(`/workflows`), 인시던트(`/incidents`), 메트릭(`/metrics`), AI 어시스턴트(`/ai`), 카탈로그(`/catalog`). admin 이면 `/settings` 추가.
- `SECTION_LABEL` (비공개): 1뎁스 breadcrumb 라벨을 메뉴 어휘와 맞춘다.
- 알림 flyover 의 항목 클릭은 `navigate(pathFor(n.link))` 하고, "인시던트로 이동"은 `pathFor('/incidents')` 로 이동한다.

### 홈 — `frontend/src/features/console/pages/HomePage.tsx :: HomePage`

- 라우트: `/` index.
- 데이터: `useFleetSummary`, `useTimeline`, `useNotices`, `useConversations`, `useIsAdmin`.
- state: `clusterWizard`, `repoWizard`.
- 트리: `PageHeader('플릿 현황', actions=레포 연결 + admin 일 때만 클러스터 등록)` → `QueryBoundary(useFleetSummary)` 안의 `StatCard` 5개, 빈 클러스터 `EmptyState`(admin 이면 등록 action, non-admin 이면 접근 가능한 클러스터 없음 안내), `TreemapChart`, 클러스터 `Table` → 최근 인시던트 카드 → 승인 대기 배포 카드 → 최근 AI 대화 카드 → `RegisterClusterWizard`, `ConnectRepoWizard`.
- 최근 인시던트, 승인 대기, 최근 AI 대화 행은 `AnimatedList`로 렌더한다. 빈 상태 문구는 각각 `열린 인시던트 없음`, `승인 대기 없음`, `대화 없음`.
- treemap 노드: `value=max(1,pods_total)`, `score=healthScore(health)`, 클릭 시 `/clusters/:clusterId`.

## 동작 (Behavior)

1. 부팅: `main.tsx` → `Providers`(QueryClient + 401 핸들러 + Toasts) → `RouterProvider`.
2. 게스트 플로우: 인증 전 사용자는 `RequireGuest` 하위 4개 라우트만 접근. 로그인되어 있으면 `/` 로 이동한다.
3. 세션 플로우: `RequireSession` 이 세션 확인 후 `ConsoleLayout` 렌더 → `startLive()` 1회 호출로 WS 시작.
4. 401 발생 시: `api()` 가 `onUnauthorized` 호출 → 세션 쿼리 무효화 → `RequireSession` 재평가 → `/login?returnTo=<현재경로>` 이동.
5. `/console`과 `/console/*`는 같은 콘솔 IA를 base path 유지 상태로 렌더한다. `/overview`, `/notifications`, 구 UI 경로 계열은 호환 redirect 로 회수한다. 그 외 알 수 없는 세션 경로는 해당 `ConsoleLayout` 안에서 404 `EmptyState` 를 렌더한다.

## 불변식·오류 (Invariants & Errors)

- WS 연결 시작(`startLive`)은 앱 전체에서 `ConsoleLayout` 한 곳에서만 호출한다.
- 정식 뷰 라우트는 lazy import + `Skeleton` fallback 을 사용한다. `HomePage`만 index 화면이라 직접 import 한다.
- `RequireAdmin` 은 리다이렉트하지 않고 안내 `EmptyState` 를 렌더한다(URL 유지).
- 알 수 없는 경로는 몰래 홈으로 보내지 않고 `NotFoundPage` 로 표시한다. 구 경로 호환 redirect 만 예외다.
- 라우트 추가 시 이 표, `consoleChildren`, `ConsoleLayout` 의 `MENU`(전역 네비 대상일 때), `useConsolePath` 소비 위치를 함께 갱신한다.

## 설정 (Settings)

| 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `VITE_API_BASE` | string | `'/api'` | REST prefix. 로컬 vite dev/preview 는 [shared 설정](./shared.md#설정-settings)의 `/api` proxy 기준을 따른다. |
