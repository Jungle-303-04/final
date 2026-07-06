---
source_commit: 664925a6
status: synced
---

# app — 부트스트랩·라우터·가드·앱 셸

> 소스: `frontend/src/main.tsx`, `frontend/src/app/`

## 책임 (Responsibility)

- React 앱 부트스트랩(`main.tsx`), 전역 프로바이더(`providers.tsx`), 라우트 트리(`router.tsx`), 접근 가드(`guards.tsx`), 로그인 후 공통 레이아웃(`shell/AppShell.tsx`)을 담당한다.
- 화면(뷰)의 실제 내용은 [features](auth.md) 패키지가, 공용 프리미티브·API 클라이언트·실시간 스토어는 [shared](./shared.md)가 담당한다 — 이 계층은 조립만 한다.
- WebSocket 실시간 연결의 시작점은 `AppShell`이다(로그인 후 1회, D6 규칙).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/query`, `@/shared/lib/api`, `@/shared/lib/live`, `@/shared/lib/ui-store`, `@/shared/ui`, `@/shared/motion`, `@/shared/tokens.css`, `@/shared/ui/app.css` | [shared](./shared.md) | QueryClient, 401 핸들러, 실시간 스토어, 사이드바/토스트 상태, UI 프리미티브 |
| import | `@/features/auth/api` | [features/auth](auth.md) | `useSession`·`useIsAdmin`·`useLogout`·`sessionKey` |
| import | `@/features/notifications/api` | [features/notifications](notifications.md) | 탑바 알림 뱃지(`useNotices`) |
| import (lazy) | `@/features/*` 각 뷰 | [features/*](fleet.md) | 라우트별 코드 스플리팅 |
| 외부 | `react-router-dom` v6 (`createBrowserRouter`) | — | 라우팅 |
| 외부 | `@tanstack/react-query` | — | 서버 상태 |
| 백엔드 | WS `/api/live/browser` | [realtime-gateway](../services/realtime-realtime-gateway.md) | 실시간 스냅샷(연결은 shared/lib/live 가 수행) |

## 공개 인터페이스 (Public API)

### 부트스트랩 — `frontend/src/main.tsx`

파일 자체가 엔트리포인트(export 없음). 동작:

1. `import '@/shared/tokens.css'` → `import '@/shared/ui/app.css'` 순서로 전역 스타일 로드.
2. `createRoot(document.getElementById('root')!)` 에 렌더:
   ```tsx
   <StrictMode>
     <Providers>
       <RouterProvider router={router} />
     </Providers>
   </StrictMode>
   ```

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

- 내부 헬퍼 `L(f)` (비공개): `lazy(f)` 를 `<Suspense fallback={<Skeleton lines={6} />}>` 로 감싼 lazy 라우트 요소를 만든다. 모든 뷰 라우트는 이 헬퍼로 등록한다.
- 라우트 트리 (docs/fd/05 와 1:1):

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/login` | `features/auth/LoginView` (lazy) | `RequireGuest` | 로그인 |
| `/signup` | `features/auth/SignupView` (lazy) | `RequireGuest` | 가입 |
| `/pending` | `features/auth/PendingView` (lazy) | `RequireGuest` | 관리자 승인 대기 안내 |
| `/verify-email` | `features/auth/VerifyEmailView` (lazy) | `RequireGuest` | 이메일 검증 결과/재전송 |
| `/` | `<Navigate to="/overview" replace />` | `RequireSession` + `AppShell` | 오버뷰로 리다이렉트 |
| `/overview` | `features/fleet/FleetHeatmapView` (lazy) | `RequireSession` + `AppShell` | 플릿 히트맵 |
| `/overview/c/:clusterId` | `features/fleet/FleetHeatmapView` (lazy) | `RequireSession` + `AppShell` | 히트맵 클러스터 드릴다운 |
| `/clusters` | `features/cluster/ClusterListView` (lazy) | `RequireSession` + `AppShell` | 클러스터 목록 |
| `/clusters/:clusterId` | `features/cluster/ClusterDetailView` (lazy) | `RequireSession` + `AppShell` | 클러스터 상세(탭) |
| `/clusters/:clusterId/pods/:namespace/:pod` | `features/cluster/ClusterDetailView` (lazy) | `RequireSession` + `AppShell` | 팟 상세 Drawer 딥링크 |
| `/repos` | `features/repo/RepoListView` (lazy) | `RequireSession` + `AppShell` | 레포(애플리케이션) 목록 |
| `/repos/:applicationId` | `features/repo/RepoDetailView` (lazy) | `RequireSession` + `AppShell` | 레포 상세(탭) |
| `/workflows` | `features/workflow/WorkflowListView` (lazy) | `RequireSession` + `AppShell` | 전체 run 목록 |
| `/workflows/:runId` | `features/workflow/WorkflowGraphView` (lazy) | `RequireSession` + `AppShell` | run 단계 그래프 |
| `/metrics` | `features/metrics/MetricsView` (lazy) | `RequireSession` + `AppShell` | 실시간 메트릭 + 온디맨드 PromQL |
| `/ai` | `features/chat/ChatView` (lazy) | `RequireSession` + `AppShell` | AI 대화(새 대화) |
| `/ai/:conversationId` | `features/chat/ChatView` (lazy) | `RequireSession` + `AppShell` | AI 대화(기존 대화) |
| `/notifications` | `features/notifications/NotificationsView` (lazy) | `RequireSession` + `AppShell` | 알림 피드 |
| `/incidents/:incidentId` | `features/notifications/IncidentDetailView` (lazy) | `RequireSession` + `AppShell` | RCA 인시던트 파이프라인 |
| `/catalog` | `features/resources/CatalogView` (lazy) | `RequireSession` + `AppShell` | 카탈로그 |
| `/settings` (index) | `<Navigate to="/settings/members" replace />` | `RequireSession` + `AppShell` + `RequireAdmin` | 설정 기본 탭 |
| `/settings/members` | `features/org/MembersView` (lazy) | `RequireSession` + `AppShell` + `RequireAdmin` | 멤버 관리 |
| `/settings/orgs` | `features/org/OrganizationsView` (lazy) | `RequireSession` + `AppShell` + `RequireAdmin` | 조직 관리 |
| `/settings/groups` | `features/org/GroupsView` (lazy) | `RequireSession` + `AppShell` + `RequireAdmin` | 그룹 관리 |
| `/settings/access` | `features/org/AccessView` (lazy) | `RequireSession` + `AppShell` + `RequireAdmin` | 리소스 권한 |
| `/settings/ops` | `features/notifications/OpsView` (lazy) | `RequireSession` + `AppShell` + `RequireAdmin` | 운영(Dead Letter) |
| `*` | `<Navigate to="/overview" replace />` | (없음) | 폴백 |

### 가드 — `frontend/src/app/guards.tsx`

| 심볼 | 앵커 | 동작 |
|---|---|---|
| `RequireSession` | `frontend/src/app/guards.tsx :: RequireSession` | `useSession()` pending 이면 `<div style={{padding:48}}><Skeleton lines={5}/></div>`. `data?.authenticated` 가 falsy 면 `<Navigate to={"/login?returnTo=" + encodeURIComponent(loc.pathname)} replace />`. 아니면 `<Outlet />` |
| `RequireGuest` | `frontend/src/app/guards.tsx :: RequireGuest` | pending 이면 `null`. `authenticated` 면 `/overview` 로 replace 이동. 아니면 `<Outlet />` |
| `RequireAdmin` | `frontend/src/app/guards.tsx :: RequireAdmin` | `useIsAdmin()` 가 false 면 `<EmptyState icon={<IconLock size={26} />} title="권한이 필요합니다" description="service_admin 역할이 필요한 화면입니다" />` 렌더(리다이렉트 아님, 아이콘은 `frontend/src/shared/ui/icons.tsx :: IconLock`). true 면 `<Outlet />` |

### 앱 셸 — `frontend/src/app/shell/AppShell.tsx :: AppShell`

```tsx
export function AppShell(): JSX.Element
```

컴포넌트 트리:

```
AppShell (div.shell / 접힘 시 .shell--collapsed)
├─ aside.sidebar
│  ├─ button.sidebar__brand  ("◈ 운영 콘솔", onClick=uiStore.toggleSidebar)
│  └─ nav → NAV 항목별 NavLink.sidebar__item (+ admin 전용 "설정" NavLink)
└─ div.main
   ├─ header.topbar
   │  └─ div.topbar__right
   │     ├─ MOCK 뱃지 (API_MODE === 'mock' 일 때만, span.badge, color var(--neutral))
   │     ├─ PulseOnChange(signal=liveAt) → "● LIVE" (open: var(--ok) / 그 외 var(--neutral), fontSize 10)
   │     ├─ Link(/notifications).topbar__bell → IconBell(16) + unread>0 시 span.topbar__count
   │     ├─ Avatar(name=session.email)  (email 있을 때만)
   │     └─ Button(ghost, sm) "로그아웃" → logout.mutate → 성공 시 nav('/login', {replace:true})
   └─ main.content → <Outlet />
```

- 상태 소스: `uiStore(s => s.sidebarOpen)`, `uiStore(s => s.toggleSidebar)`, `liveStore(s => s.status)`, `liveStore(s => s.snapshot?.at)`(스냅샷 수신 시각 — 수신 순간 LIVE 인디케이터 pulse), `useIsAdmin()`, `useSession()`, `useLogout()`, `useNotices().unread`, `useLocation()`, `useNavigate()`.
- `useEffect(() => { startLive(); }, [])` — WS 연결은 셸 마운트 시 1회만([shared/lib/live](./shared.md#실시간-livets)).
- 네비 항목 상수 `NAV` (비공개): `[{ to:'/overview', icon:'▦', label:'오버뷰' }, { to:'/clusters', icon:'⬢', label:'클러스터' }, { to:'/repos', icon:'⑂', label:'레포' }, { to:'/workflows', icon:'⇶', label:'워크플로우' }, { to:'/metrics', icon:'∿', label:'메트릭' }, { to:'/ai', icon:'✦', label:'AI' }, { to:'/catalog', icon:'▤', label:'카탈로그' }]`.
- admin 이면 `/settings/members` 로 가는 "⚙ 설정" NavLink 추가. active 판정은 `loc.pathname.startsWith('/settings')`.

### 셸 스타일 — `frontend/src/app/shell/shell.css`

- `.shell` flex, 높이 100vh. `.sidebar` 폭 220px(접힘 `.shell--collapsed` 시 60px, `width var(--dur-base) var(--ease-in-out)` 트랜지션), `--surface-1` 배경 + 우측 `--border`.
- `.sidebar__item` active 시 `border-left-color: var(--brand)` + `--surface-2` 배경.
- `.topbar__count` — 절대 위치(top:-6px, right:-8px) `--danger` 배경 pill.
- `.content` — `flex:1; overflow:auto; padding:var(--sp-6)`, 직계 자식 `max-width:1440px; margin:0 auto`.

## 동작 (Behavior)

1. 부팅: `main.tsx` → `Providers`(QueryClient + 401 핸들러 + Toasts) → `RouterProvider`.
2. 게스트 플로우: 인증 전 사용자는 `RequireGuest` 하위 4개 라우트만 접근. 로그인되면 `/overview` 강제 이동.
3. 세션 플로우: `RequireSession` 이 세션 확인 후 `AppShell` 렌더 → `startLive()` 1회 호출로 WS(또는 mock 스트림) 시작.
4. 401 발생 시: `api()` 가 `onUnauthorized` 호출 → 세션 쿼리 무효화 → `RequireSession` 재평가 → `/login?returnTo=<현재경로>` 이동.
5. 알 수 없는 경로는 항상 `/overview` 로 회수된다.

## 불변식·오류 (Invariants & Errors)

- WS 연결 시작(`startLive`)은 앱 전체에서 `AppShell` 한 곳에서만 호출한다(D6).
- 모든 뷰 라우트는 lazy import + `Skeleton` fallback — 직접 import 로 등록하지 않는다.
- `RequireAdmin` 은 리다이렉트하지 않고 안내 `EmptyState` 를 렌더한다(URL 유지).
- 라우트 추가 시 이 표와 `AppShell` 의 `NAV`(전역 네비 대상일 때)를 함께 갱신한다.

## 설정 (Settings)

| 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `VITE_API_MODE` | `'mock' \| 'real'` | `real` | `'mock'` 을 명시했을 때만 mock 동작(우발적 페이크 차단). mock 이면 탑바에 MOCK 뱃지 표시, live 는 가짜 스트림. 로컬 vite dev 는 `frontend/.env.development` 가 `mock` 을 기본 지정 ([shared](./shared.md#설정-settings) 참조) |
