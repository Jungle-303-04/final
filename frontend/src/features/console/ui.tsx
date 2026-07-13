// 운영 콘솔 셸 — 사이드바/헤더/브레드크럼/알림. 모든 표시는 실데이터(세션·알림)만 사용
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeftIcon as LucideArrowLeftIcon,
  BellIcon as LucideBellIcon,
  Globe2Icon as LucideGlobeIcon,
  InboxIcon as LucideInboxIcon,
  MoonIcon as LucideMoonIcon,
  PackageIcon as LucidePackageIcon,
  SendIcon as LucideSendIcon,
  SettingsIcon as LucideGearIcon,
  ShieldCheckIcon as LucideShieldIcon,
  SunIcon as LucideSunIcon,
  TerminalIcon as LucideTerminalIcon,
  WorkflowIcon,
  type LucideProps,
} from 'lucide-react';
import { bindLiveQueryClient, startLive } from '@/shared/lib/live';
import { useIsAdmin, useLogout, useSession } from '@/features/auth/api';
import { timeAgo, useNotices } from '@/features/notifications/api';
import { Badge, Button, Drawer, EmptyState, IconButton, cx, useToast } from '@/ui';
import { fadeInUp } from '@/ui/motion';
import type { Tone } from '@/shared/lib/types';

/* ── 사이드바 메뉴 — 실존 도메인만 노출 ── */
const MENU = [
  { to: '/repos', label: '배포', icon: <SendIcon /> },
  { to: '/workflows', label: '워크플로우', icon: <WorkflowIcon size={18} aria-hidden="true" /> },
  { to: '/clusters', label: '클러스터', icon: <GlobeIcon /> },
  { to: '/incidents', label: '인시던트', icon: <ShieldIcon /> },
  { to: '/ai', label: 'AI 채팅', icon: <TerminalIcon /> },
  { to: '/catalog', label: '카탈로그', icon: <PackageIcon /> },
];

/* 브레드크럼 1뎁스 라벨 — 메뉴와 동일 어휘 */
const SECTION_LABEL: Record<string, string> = {
  clusters: '클러스터', repos: '배포', workflows: '워크플로우', incidents: '인시던트',
  ai: 'AI 어시스턴트', catalog: '카탈로그', settings: '설정',
};

type ThemeMode = 'dark' | 'light';
const THEME_KEY = 'theme-mode';

function ThemeToggle() {
  const [mode, toggle] = useThemeMode();
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-raised p-1 text-text-muted transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onClick={toggle}
      aria-label="테마 전환"
    >
      <span className={cx('grid h-6 w-6 place-items-center rounded-full transition-colors', mode === 'light' && 'bg-surface text-text-primary shadow-soft')}>
        <SunIcon />
      </span>
      <span className={cx('grid h-6 w-6 place-items-center rounded-full transition-colors', mode === 'dark' && 'bg-surface text-text-primary shadow-soft')}>
        <MoonIcon />
      </span>
    </button>
  );
}

function useThemeMode(): [ThemeMode, () => void] {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (window.localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? 'dark';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme-mode', mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.classList.toggle('light', mode === 'light');
    window.localStorage.setItem(THEME_KEY, mode);
  }, [mode]);
  const toggle = useCallback(() => setMode((value) => (value === 'dark' ? 'light' : 'dark')), []);
  return [mode, toggle];
}

type BadgeTone = ComponentProps<typeof Badge>['tone'];
const toneSeverity = (t: Tone): BadgeTone =>
  t === 'ok' ? 'success' : t === 'warn' ? 'warning' : t === 'danger' ? 'danger' : t === 'info' ? 'info' : 'neutral';

const NOTICE_KIND_LABEL: Record<string, string> = { approval: '승인', incident: '인시던트', dlq: 'DLQ', cluster: '클러스터' };

const ConsolePathContext = createContext<(to: string) => string>((to) => to);

export const useConsolePath = () => useContext(ConsolePathContext);

function normalizeBasePath(basePath: string | undefined) {
  if (!basePath || basePath === '/') return '';
  return basePath.startsWith('/') ? basePath.replace(/\/$/, '') : `/${basePath.replace(/\/$/, '')}`;
}

export function ConsoleLayout({ basePath }: { basePath?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeBase = normalizeBasePath(basePath);
  const pathFor = useMemo(() => (to: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(to)) return to;
    if (!routeBase) return to;
    if (to === '/') return routeBase;
    if (to === routeBase || to.startsWith(`${routeBase}/`)) return to;
    return `${routeBase}${to.startsWith('/') ? to : `/${to}`}`;
  }, [routeBase]);
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const admin = useIsAdmin();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { notices, unread, markAllSeen } = useNotices();
  const { push } = useToast();
  useEffect(() => {
    bindLiveQueryClient(queryClient);
    startLive(session?.workspace_id);
    return () => bindLiveQueryClient(null);
  }, [queryClient, session?.workspace_id]);
  const localPath =
    routeBase && (location.pathname === routeBase || location.pathname.startsWith(`${routeBase}/`))
      ? location.pathname.slice(routeBase.length) || '/'
      : location.pathname;
  const crumbs = localPath.split('/').filter(Boolean);

  return (
    <ConsolePathContext.Provider value={pathFor}>
      <div className="flex h-dvh overflow-hidden bg-bg text-text-primary">
        <nav className={cx('flex w-16 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-surface p-2 transition-[width] lg:w-60', collapsed && 'lg:w-16')}>
          <button
            type="button"
            className="mb-3 flex h-10 w-full items-center gap-3 rounded-control px-2 text-left font-semibold text-text-primary transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="사이드바 접기/펼치기"
          >
            <BrandMark />
            <span className={cx('hidden min-w-0 truncate text-title lg:inline', collapsed && 'lg:hidden')}>KubeHeal</span>
          </button>
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={pathFor(m.to)}
              title={m.label}
              className={({ isActive }) => navItemClass(isActive)}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center">{m.icon}</span>
              <span className={cx('hidden min-w-0 truncate lg:inline', collapsed && 'lg:hidden')}>{m.label}</span>
            </NavLink>
          ))}
          {admin && (
            <NavLink
              to={pathFor('/settings')}
              title="설정"
              className={navItemClass(localPath.startsWith('/settings'))}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center"><GearIcon /></span>
              <span className={cx('hidden min-w-0 truncate lg:inline', collapsed && 'lg:hidden')}>설정</span>
            </NavLink>
          )}
          <div className="mt-auto grid gap-1">
            {session?.email && (
              <div className="flex h-10 max-w-full items-center gap-3 rounded-control px-2 text-label text-text-secondary" title={session.email}>
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-panel border border-border bg-raised text-caption font-semibold text-text-primary">
                  {session.email[0]?.toUpperCase()}
                </div>
                <span className={cx('hidden min-w-0 truncate lg:inline', collapsed && 'lg:hidden')}>{session.email}</span>
              </div>
            )}
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-3 lg:px-6">
            <div className="min-w-0">
              <span className="hidden h-8 max-w-56 items-center rounded-control border border-border bg-bg px-3 text-label text-text-secondary sm:inline-flex" title={session?.workspace_id ?? 'workspace'}>
                모든 프로젝트
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative">
                <IconButton label="알림" icon={<InboxIcon />} onClick={() => setNotifOpen(true)} />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-caption font-bold leading-none text-on-danger">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </div>
              <Button size="sm" className="hidden sm:inline-flex" leadingIcon={<SendIcon />} onClick={() => navigate(pathFor('/ai'))}>
                AI 채팅
              </Button>
              <ThemeToggle />
              <Button
                size="sm"
                disabled={logout.isPending}
                loading={logout.isPending}
                onClick={() =>
                  logout.mutate(undefined, {
                    onSuccess: () => {
                      push({ tone: 'success', title: '로그아웃 완료', description: '세션을 종료했습니다' });
                      navigate('/login', { replace: true });
                    },
                    onError: (error) => push({ tone: 'danger', title: '로그아웃 실패', description: (error as Error).message || '네트워크를 확인해주세요' }),
                  })
                }
              >
                로그아웃
              </Button>
            </div>
          </header>

          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-bg px-3 lg:px-6">
            <IconButton size="sm" label="뒤로" icon={<ArrowLeftIcon />} onClick={() => navigate(-1)} />
            <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-2 text-label text-text-muted">
              {crumbs.length === 0 && <span className="min-w-0 truncate text-text-secondary">홈</span>}
              {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1;
                const to = pathFor(`/${crumbs.slice(0, i + 1).join('/')}`);
                const label = i === 0 ? (SECTION_LABEL[c] ?? decodeURIComponent(c)) : decodeURIComponent(c);
                return (
                  <span key={`${c}-${i}`} className="inline-flex min-w-0 items-center gap-2">
                    {i > 0 && <span>/</span>}
                    {isLast ? (
                      <span className="min-w-0 truncate text-text-secondary">{label}</span>
                    ) : (
                      <NavLink to={to} className="min-w-0 truncate hover:text-text-primary">{label}</NavLink>
                    )}
                  </span>
                );
              })}
            </nav>
          </div>

          <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            {/* 섹션(1뎁스) 전환 시에만 fade+rise — 탭/하위 이동은 리마운트하지 않음 */}
            <motion.div key={crumbs[0] ?? 'home'} variants={fadeInUp} initial="initial" animate="animate">
              <Outlet />
            </motion.div>
          </main>
        </div>

        <Drawer
          open={notifOpen}
          onOpenChange={setNotifOpen}
          title={`알림 ${unread > 0 ? `(안 읽음 ${unread})` : ''}`}
          actions={
            <>
              <Button size="sm" onClick={() => markAllSeen()}>모두 읽음</Button>
              <Button size="sm" variant="primary" onClick={() => { setNotifOpen(false); navigate(pathFor('/incidents')); }}>
                인시던트
              </Button>
            </>
          }
        >
          {notices.length === 0 ? (
            <EmptyState title="알림 없음" description="표시할 알림이 없습니다" icon={<BellIcon />} />
          ) : (
            <div className="grid gap-2">
              {notices.slice(0, 30).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={cx(
                    'grid w-full gap-2 rounded-panel border border-border bg-bg p-3 text-left transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    n.read && 'opacity-65',
                  )}
                  onClick={() => { setNotifOpen(false); navigate(pathFor(n.link)); }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge tone={toneSeverity(n.tone)}>{NOTICE_KIND_LABEL[n.kind] ?? n.kind}</Badge>
                    <span className="min-w-0 truncate text-body font-medium text-text-primary">
                      {n.title}
                    </span>
                  </div>
                  <span className="text-caption text-text-muted">{n.at ? timeAgo(n.at) : ''}</span>
                </button>
              ))}
            </div>
          )}
        </Drawer>
      </div>
    </ConsolePathContext.Provider>
  );
}

function navItemClass(isActive: boolean) {
  return cx(
    'flex h-10 max-w-full items-center gap-3 rounded-control px-2 text-body font-medium text-text-secondary transition-colors hover:bg-raised hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    isActive && 'bg-raised text-text-primary',
  );
}

function BrandMark() {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-panel bg-brand text-label font-semibold text-on-accent shadow-soft">
      K
    </span>
  );
}

type IconProps = LucideProps;

const shellIconProps = { size: 18, strokeWidth: 1.8, 'aria-hidden': true } as const;

function SendIcon(props: IconProps) {
  return <LucideSendIcon {...shellIconProps} {...props} />;
}

function GlobeIcon(props: IconProps) {
  return <LucideGlobeIcon {...shellIconProps} {...props} />;
}

function ShieldIcon(props: IconProps) {
  return <LucideShieldIcon {...shellIconProps} {...props} />;
}

function TerminalIcon(props: IconProps) {
  return <LucideTerminalIcon {...shellIconProps} {...props} />;
}

function PackageIcon(props: IconProps) {
  return <LucidePackageIcon {...shellIconProps} {...props} />;
}

function GearIcon(props: IconProps) {
  return <LucideGearIcon {...shellIconProps} {...props} />;
}

function BellIcon(props: IconProps) {
  return <LucideBellIcon {...shellIconProps} {...props} />;
}

function InboxIcon(props: IconProps) {
  return <LucideInboxIcon {...shellIconProps} {...props} />;
}

function SunIcon(props: IconProps) {
  return <LucideSunIcon {...shellIconProps} {...props} />;
}

function MoonIcon(props: IconProps) {
  return <LucideMoonIcon {...shellIconProps} {...props} />;
}

function ArrowLeftIcon(props: IconProps) {
  return <LucideArrowLeftIcon {...shellIconProps} {...props} />;
}
