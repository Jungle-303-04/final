// 앱 쉘 — 사이드바/탑바/아웃렛. WS 연결은 여기서 1회(D6)
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { liveStore, startLive } from '@/shared/lib/live';
import { uiStore } from '@/shared/lib/ui-store';
import { useIsAdmin, useLogout, useSession } from '@/features/auth/api';
import { useNotices } from '@/features/notifications/api';
import { Avatar, Button } from '@/shared/ui';
import { PulseOnChange } from '@/shared/motion';
import { IconBell } from '@/shared/ui/icons';
import { API_MODE } from '@/shared/lib/api';
import './shell.css';

const NAV = [
  { to: '/overview', icon: '▦', label: '오버뷰' },
  { to: '/clusters', icon: '⬢', label: '클러스터' },
  { to: '/repos', icon: '⑂', label: '레포' },
  { to: '/workflows', icon: '⇶', label: '워크플로우' },
  { to: '/metrics', icon: '∿', label: '메트릭' },
  { to: '/ai', icon: '✦', label: 'AI' },
  { to: '/catalog', icon: '▤', label: '카탈로그' },
];

export function AppShell() {
  useEffect(() => { startLive(); }, []);
  const open = uiStore(s => s.sidebarOpen);
  const toggle = uiStore(s => s.toggleSidebar);
  const liveStatus = liveStore(s => s.status);
  const liveAt = liveStore(s => s.snapshot?.at); // 스냅샷 수신 시각 — 수신 순간 인디케이터 pulse
  const admin = useIsAdmin();
  const { data: session } = useSession();
  const logout = useLogout();
  const { unread } = useNotices();
  const loc = useLocation();
  const nav = useNavigate();

  return (
    <div className={`shell ${open ? '' : 'shell--collapsed'}`}>
      <aside className="sidebar">
        <button className="sidebar__brand" onClick={toggle} aria-label="사이드바 토글">◈ {open && <b>운영 콘솔</b>}</button>
        <nav>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `sidebar__item ${isActive ? 'active' : ''}`}>
              <span className="ico">{n.icon}</span>{open && n.label}
            </NavLink>
          ))}
          {admin && (
            <NavLink to="/settings/members" className={`sidebar__item ${loc.pathname.startsWith('/settings') ? 'active' : ''}`}>
              <span className="ico">⚙</span>{open && '설정'}
            </NavLink>
          )}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <span />
          <div className="topbar__right">
            {API_MODE === 'mock' && <span className="badge" style={{ color: 'var(--neutral)' }}>MOCK</span>}
            <PulseOnChange signal={liveAt}>
              <span title={liveStatus === 'open' ? '실시간 연결됨' : '실시간 끊김'}
                style={{ color: liveStatus === 'open' ? 'var(--ok)' : 'var(--neutral)', fontSize: 10 }}>● LIVE</span>
            </PulseOnChange>
            <Link to="/notifications" className="topbar__bell" aria-label="알림">
              <IconBell size={16} />{unread > 0 && <span className="topbar__count">{unread}</span>}
            </Link>
            {session?.email && <Avatar name={session.email} />}
            <Button variant="ghost" size="sm" loading={logout.isPending}
              onClick={() => logout.mutate(undefined, {
                onSuccess: () => nav('/login', { replace: true }),
                onError: () => uiStore.getState().toast('danger', '로그아웃 실패 — 네트워크를 확인해주세요'),
              })}>로그아웃</Button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
