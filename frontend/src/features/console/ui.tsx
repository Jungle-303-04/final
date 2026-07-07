// 운영 콘솔 셸 — 사이드바/헤더/브레드크럼/알림. 모든 표시는 실데이터(세션·알림·라이브 WS)만 사용
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { liveStore, startLive } from '@/shared/lib/live';
import { uiStore } from '@/shared/lib/ui-store';
import { useIsAdmin, useLogout, useSession } from '@/features/auth/api';
import { timeAgo, useNotices } from '@/features/notifications/api';
import { PulseOnChange } from '@/shared/motion';
import { fadeRise } from '@/plural-ui/motion';
import { Button, Chip, Flyover, useThemeMode, type ChipSeverity } from '@/plural-ui';
import {
  ArrowLeftIcon,
  ChartIcon,
  FrameIcon,
  GearIcon,
  GlobeIcon,
  ListIcon,
  MoonIcon,
  PackageIcon,
  PluralMarkIcon,
  SendIcon,
  ShieldIcon,
  SunIcon,
  TerminalIcon,
} from '@/plural-ui/icons';
import type { Tone } from '@/shared/lib/types';
import './console.css';

/* ── 사이드바 메뉴 — 실존 도메인만 노출 ── */
const MENU = [
  { to: '/', label: '홈', icon: <FrameIcon />, end: true },
  { to: '/repos', label: '지속 배포 (CD)', icon: <SendIcon /> },
  { to: '/clusters', label: '쿠버네티스', icon: <GlobeIcon /> },
  { to: '/workflows', label: '워크플로우', icon: <SendIcon /> },
  { to: '/incidents', label: '인시던트 (RCA)', icon: <ShieldIcon /> },
  { to: '/metrics', label: '메트릭', icon: <ChartIcon /> },
  { to: '/ai', label: 'LOGO AI', icon: <TerminalIcon /> },
  { to: '/catalog', label: '카탈로그', icon: <PackageIcon /> },
];

/* 브레드크럼 1뎁스 라벨 — 메뉴와 동일 어휘 */
const SECTION_LABEL: Record<string, string> = {
  clusters: '클러스터', repos: '레포', workflows: '워크플로우', incidents: '인시던트',
  metrics: '메트릭', ai: 'AI 어시스턴트', catalog: '카탈로그', settings: '설정',
};

function ThemeToggle() {
  const [mode, toggle] = useThemeMode();
  return (
    <button type="button" className="pl-themetoggle" onClick={toggle} aria-label="테마 전환">
      <span className={`slot${mode === 'light' ? ' active' : ''}`}><SunIcon size={13} /></span>
      <span className={`slot${mode === 'dark' ? ' active' : ''}`}><MoonIcon size={12} /></span>
    </button>
  );
}

const toneSeverity = (t: Tone): ChipSeverity =>
  t === 'ok' ? 'success' : t === 'warn' ? 'warning' : t === 'danger' ? 'danger' : t === 'info' ? 'info' : 'neutral';

const NOTICE_KIND_LABEL: Record<string, string> = { approval: '승인', incident: '인시던트', dlq: 'DLQ', cluster: '클러스터' };

const ConsolePathContext = createContext<(to: string) => string>((to) => to);

export const useConsolePath = () => useContext(ConsolePathContext);

function normalizeBasePath(basePath: string | undefined) {
  if (!basePath || basePath === '/') return '';
  return basePath.startsWith('/') ? basePath.replace(/\/$/, '') : `/${basePath.replace(/\/$/, '')}`;
}

export function ConsoleLayout({ basePath }: { basePath?: string }) {
  useEffect(() => { startLive(); }, []); // WS 단일 연결(D6) — 셸에서 1회
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
  const logout = useLogout();
  const { notices, unread, markAllSeen } = useNotices();
  const liveStatus = liveStore(s => s.status);
  const liveAt = liveStore(s => s.snapshot?.at);
  const localPath =
    routeBase && (location.pathname === routeBase || location.pathname.startsWith(`${routeBase}/`))
      ? location.pathname.slice(routeBase.length) || '/'
      : location.pathname;
  const crumbs = localPath.split('/').filter(Boolean);

  return (
    <ConsolePathContext.Provider value={pathFor}>
    <div className="pl-app co-app">
      <div className="co-body">
        <nav className={`co-sidebar${collapsed ? ' collapsed' : ''}`}>
          <div className="co-logo" onClick={() => setCollapsed(!collapsed)} role="button" aria-label="사이드바 접기/펼치기">
            <PluralMarkIcon size={24} />
            {!collapsed && <span className="word">LOGO</span>}
          </div>
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={pathFor(m.to)}
              end={m.end}
              title={m.label}
              className={({ isActive }) => `co-menuitem${isActive ? ' active' : ''}`}
            >
              {m.icon}
              {!collapsed && <span>{m.label}</span>}
            </NavLink>
          ))}
          {admin && (
            <NavLink
              to={pathFor('/settings')}
              title="설정"
              className={`co-menuitem${localPath.startsWith('/settings') ? ' active' : ''}`}
            >
              <GearIcon />
              {!collapsed && <span>설정</span>}
            </NavLink>
          )}
          <div className="co-side-bottom">
            {session?.email && (
              <div className="co-menuitem" title={session.email} style={{ cursor: 'default' }}>
                <div className="pl-avatar" style={{ width: 24, height: 24, fontSize: 12 }}>
                  {session.email[0]?.toUpperCase()}
                </div>
                {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.email}</span>}
              </div>
            )}
          </div>
        </nav>

        <div className="co-main">
          <header className="co-header">
            <div className="pl-row">
              <button type="button" className="co-project" title={session?.workspace_id ?? 'workspace'}>
                모든 프로젝트
              </button>
              <PulseOnChange signal={liveAt}>
                <span
                  title={liveStatus === 'open' ? '실시간 스트림 연결됨' : '실시간 스트림 재연결 중'}
                  className={`co-live ${liveStatus === 'open' ? 'is-open' : ''}`}
                >
                  LIVE
                </span>
              </PulseOnChange>
            </div>
            <div className="co-header-right">
              <button
                type="button"
                className="pl-navbtn"
                title="알림"
                style={{ position: 'relative' }}
                onClick={() => setNotifOpen(true)}
              >
                <ListIcon size={14} />
                {unread > 0 && (
                  <span
                    style={{
                      position: 'absolute', top: -3, right: -3, minWidth: 14, height: 14, padding: '0 2px',
                      borderRadius: 7, background: 'var(--color-text-danger)', color: '#fff',
                      fontSize: 9, lineHeight: '14px', textAlign: 'center', fontWeight: 700,
                    }}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
              <Button size="small" onClick={() => navigate(pathFor('/ai'))}>
                <SendIcon size={13} /> AI 채팅
              </Button>
              <ThemeToggle />
              <Button
                size="small"
                disabled={logout.isPending}
                onClick={() =>
                  logout.mutate(undefined, {
                    onSuccess: () => navigate('/login', { replace: true }),
                    onError: () => uiStore.getState().toast('danger', '로그아웃 실패 — 네트워크를 확인해주세요'),
                  })
                }
              >
                {logout.isPending ? '로그아웃 중…' : '로그아웃'}
              </Button>
            </div>
          </header>

          <div className="co-subheader">
            <button type="button" className="pl-navbtn" aria-label="뒤로" onClick={() => navigate(-1)}>
              <ArrowLeftIcon size={14} />
            </button>
            <div className="pl-crumbs">
              {crumbs.length === 0 && <span className="crumb current">홈</span>}
              {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1;
                const to = pathFor(`/${crumbs.slice(0, i + 1).join('/')}`);
                const label = i === 0 ? (SECTION_LABEL[c] ?? decodeURIComponent(c)) : decodeURIComponent(c);
                return (
                  <span key={`${c}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {i > 0 && <span className="sep">/</span>}
                    {isLast ? (
                      <span className="crumb current">{label}</span>
                    ) : (
                      <NavLink to={to} className="crumb crumb-link">{label}</NavLink>
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="co-content">
            {/* 섹션(1뎁스) 전환 시에만 fade+rise — 탭/하위 이동은 리마운트하지 않음 */}
            <motion.div key={crumbs[0] ?? 'home'} variants={fadeRise} initial="initial" animate="animate">
              <Outlet />
            </motion.div>
          </div>
        </div>

        <Flyover
          open={notifOpen}
          onClose={() => setNotifOpen(false)}
          title={`알림 ${unread > 0 ? `(안 읽음 ${unread})` : ''}`}
          actions={
            <>
              <Button onClick={() => markAllSeen()}>모두 읽음</Button>
              <Button variant="primary" onClick={() => { setNotifOpen(false); navigate(pathFor('/incidents')); }}>
                인시던트로 이동
              </Button>
            </>
          }
        >
          {notices.length === 0 ? (
            <p className="pl-muted" style={{ margin: 0 }}>표시할 알림이 없습니다 — 승인 대기·인시던트·처리 실패 이벤트가 생기면 여기 모입니다.</p>
          ) : (
            <div className="pl-stack" style={{ gap: 10 }}>
              {notices.slice(0, 30).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="pl-bindrow"
                  style={{ cursor: 'pointer', textAlign: 'left', width: '100%', border: 'none', opacity: n.read ? 0.65 : 1 }}
                  onClick={() => { setNotifOpen(false); navigate(pathFor(n.link)); }}
                >
                  <div className="pl-row" style={{ minWidth: 0 }}>
                    <Chip severity={toneSeverity(n.tone)}>{NOTICE_KIND_LABEL[n.kind] ?? n.kind}</Chip>
                    <span style={{ color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.title}
                    </span>
                  </div>
                  <span className="pl-muted" style={{ flex: 'none' }}>{n.at ? timeAgo(n.at) : ''}</span>
                </button>
              ))}
            </div>
          )}
        </Flyover>
      </div>
    </div>
    </ConsolePathContext.Provider>
  );
}

/* ── 공용 블록 ────────────────────────── */
export function StatCard({ label, value, chip, chipSeverity }: { label: string; value: ReactNode; chip?: string; chipSeverity?: ChipSeverity }) {
  return (
    <div className="pl-card">
      <div className="pl-muted">{label}</div>
      <div className="co-stat pl-row">
        {value}
        {chip && <Chip severity={chipSeverity ?? 'neutral'}>{chip}</Chip>}
      </div>
    </div>
  );
}
