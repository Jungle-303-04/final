// Console 셸 + 공용 빌딩블록 (plural-ui 재사용, 콘솔 전용 레이아웃)
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { fadeRise } from '@/plural-ui/motion';
import { Button, Chip, Modal, useThemeMode, type ChipSeverity } from '@/plural-ui';
import { ALERTS } from './api';
import {
  ArrowLeftIcon,
  CardIcon,
  CaretDownIcon,
  ChartIcon,
  DocumentIcon,
  FrameIcon,
  GearIcon,
  GlobeIcon,
  ListIcon,
  MoonIcon,
  PackageIcon,
  PeopleIcon,
  PluralMarkIcon,
  SendIcon,
  ShieldIcon,
  SunIcon,
  TerminalIcon,
} from '@/plural-ui/icons';
import { ChatPanel } from './ChatPanel';
import { RoleSwitchModal, useViewer, ViewAsBanner, ViewerProvider } from './viewer';
import './console.css';

/* ── 사이드바 메뉴 ────────────────────── */
const MENU = [
  { to: '/console/home', label: '홈', icon: <FrameIcon /> },
  { to: '/console/cd', label: '지속 배포 (CD)', icon: <SendIcon /> },
  { to: '/console/stacks', label: '스택', icon: <PackageIcon /> },
  { to: '/console/marketplace', label: '마켓플레이스', icon: <DocumentIcon /> },
  { to: '/console/flows', label: '플로우', icon: <ChartIcon /> },
  { to: '/console/workbenches', label: '워크벤치', icon: <TerminalIcon /> },
  { to: '/console/self-service', label: '셀프 서비스', icon: <DocumentIcon /> },
  { to: '/console/kubernetes', label: '쿠버네티스', icon: <GlobeIcon /> },
  { to: '/console/ai', label: 'LOGO AI', icon: <SendIcon /> },
  { to: '/console/shell', label: '셸', icon: <TerminalIcon /> },
  { to: '/console/edge', label: '엣지', icon: <FrameIcon /> },
  { to: '/console/security', label: '보안', icon: <ShieldIcon /> },
  { to: '/console/cost-management', label: '비용 관리', icon: <CardIcon /> },
  { to: '/console/settings', label: '설정', icon: <GearIcon /> },
];

function ThemeToggle() {
  const [mode, toggle] = useThemeMode();
  return (
    <button type="button" className="pl-themetoggle" onClick={toggle} aria-label="테마 전환">
      <span className={`slot${mode === 'light' ? ' active' : ''}`}>
        <SunIcon size={13} />
      </span>
      <span className={`slot${mode === 'dark' ? ' active' : ''}`}>
        <MoonIcon size={12} />
      </span>
    </button>
  );
}

export function ConsoleLayout() {
  return (
    <ViewerProvider>
      <ConsoleShell />
    </ViewerProvider>
  );
}

function ConsoleShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [project, setProject] = useState('모든 프로젝트');
  const { role } = useViewer();
  const crumbs = location.pathname.replace(/^\/console\/?/, '').split('/').filter(Boolean);
  const instance = new URLSearchParams(location.search).get('instance');

  return (
    <div className="pl-app co-app">
      <div className="co-body">
        <nav className={`co-sidebar${collapsed ? ' collapsed' : ''}`}>
          <div className="co-logo" onClick={() => setCollapsed(!collapsed)}>
            <PluralMarkIcon size={24} />
            {!collapsed && <span className="word">LOGO</span>}
          </div>
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              title={m.label}
              className={({ isActive }) => `co-menuitem${isActive ? ' active' : ''}`}
            >
              {m.icon}
              {!collapsed && <span>{m.label}</span>}
            </NavLink>
          ))}
          <div className="co-side-bottom">
            <NavLink to="/console/profile" className="co-menuitem" title="프로필">
              <div className="pl-avatar" style={{ width: 24, height: 24, fontSize: 12 }}>
                {role.user[0].toUpperCase()}
              </div>
              {!collapsed && <span>{role.user}</span>}
            </NavLink>
          </div>
        </nav>

        <div className="co-main">
          <header className="co-header">
            <div className="pl-row">
              <button type="button" className="co-project" onClick={() => setProjectOpen(true)}>
                <PeopleIcon size={14} /> {project} <CaretDownIcon size={12} />
              </button>
              {instance && (
                <button
                  type="button"
                  className="co-project"
                  title="LOGO app에서 연결된 인스턴스"
                  onClick={() => navigate(`/plural/overview/clusters/plural-cloud/${instance}`)}
                >
                  <PluralMarkIcon size={14} /> {instance}.console.cloud.logo.dev
                </button>
              )}
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
                <span
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'var(--color-text-danger)',
                    color: '#fff',
                    fontSize: 9,
                    lineHeight: '14px',
                    textAlign: 'center',
                    fontWeight: 700,
                  }}
                >
                  {ALERTS.length}
                </span>
              </button>
              <Button size="small" onClick={() => setChatOpen(!chatOpen)}>
                <SendIcon size={13} /> 채팅
              </Button>
              <ThemeToggle />
              <button
                type="button"
                className="pl-avatar co-avatarbtn"
                style={{ width: 28, height: 28, fontSize: 13 }}
                title="다른 역할로 보기"
                onClick={() => setRoleOpen(true)}
              >
                {role.user[0].toUpperCase()}
              </button>
            </div>
          </header>

          <ViewAsBanner />

          <div className="co-subheader">
            <button type="button" className="pl-navbtn" aria-label="뒤로" onClick={() => navigate(-1)}>
              <ArrowLeftIcon size={14} />
            </button>
            <div className="pl-crumbs">
              {crumbs.length === 0 && <span className="crumb current">home</span>}
              {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1;
                const to = `/console/${crumbs.slice(0, i + 1).join('/')}`;
                return (
                  <span key={`${c}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {i > 0 && <span className="sep">/</span>}
                    {isLast ? (
                      <span className="crumb current">{decodeURIComponent(c)}</span>
                    ) : (
                      <NavLink to={to} className="crumb crumb-link">
                        {decodeURIComponent(c)}
                      </NavLink>
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="co-content">
            {/* 섹션(1뎁스 메뉴) 전환 시에만 fade+rise — 탭 이동은 리마운트하지 않음 (I12) */}
            <motion.div key={crumbs[0] ?? 'home'} variants={fadeRise} initial="initial" animate="animate">
              <Outlet />
            </motion.div>
          </div>
        </div>

        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
        <RoleSwitchModal open={roleOpen} onClose={() => setRoleOpen(false)} />

        <Modal
          open={projectOpen}
          onClose={() => setProjectOpen(false)}
          title="프로젝트 선택"
          actions={<Button onClick={() => setProjectOpen(false)}>닫기</Button>}
        >
          <div className="pl-stack" style={{ gap: 8 }}>
            {['모든 프로젝트', 'default', 'team-a'].map((p) => (
              <button
                key={p}
                type="button"
                className={`pl-sidenav-item${project === p ? ' active' : ''}`}
                style={{ textAlign: 'left', border: 'none', cursor: 'pointer', width: '100%' }}
                onClick={() => {
                  setProject(p);
                  setProjectOpen(false);
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </Modal>

        <Modal
          open={notifOpen}
          onClose={() => setNotifOpen(false)}
          title="알림"
          actions={
            <>
              <Button onClick={() => setNotifOpen(false)}>모두 읽음</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setNotifOpen(false);
                  navigate('/console/cd/clusters/cluster02/alerts');
                }}
              >
                알림 센터로 이동
              </Button>
            </>
          }
        >
          <div className="pl-stack" style={{ gap: 10 }}>
            {ALERTS.map((a) => (
              <div key={a.id} className="pl-row pl-row--between">
                <div className="pl-row">
                  <Chip severity={a.severity === '심각' ? 'danger' : 'warning'}>{a.severity}</Chip>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{a.name}</div>
                    <div className="pl-muted">{a.resource}</div>
                  </div>
                </div>
                <span className="pl-muted">{a.firedAt}</span>
              </div>
            ))}
          </div>
        </Modal>
      </div>
    </div>
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

export function healthSeverity(score: number): ChipSeverity {
  if (score >= 70) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

export function statusSeverity(status: string): ChipSeverity {
  if (['건강함', '성공', '최신', '완료', '통과', '온라인', '실행 중', '준비됨'].includes(status)) return 'success';
  if (['동기화 중', '가능', '대기', '진행 중', '경고', '리뷰 대기'].includes(status)) return 'warning';
  if (['실패', '뒤처짐', '오래됨', '심각', 'CrashLoopBackOff'].includes(status)) return 'danger';
  return 'neutral';
}
