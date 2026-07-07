// /console 보존용 아카이브 — 실제 서비스(/)와 분리된 Plural 콘솔 데모 스냅샷
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CaretRightIcon,
  ChartIcon,
  DocumentIcon,
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
import { useThemeMode } from '@/plural-ui';
import './archive.css';

const MENU = [
  { to: '/console', label: '홈', icon: <FrameIcon /> },
  { to: '/console/cd/clusters', label: '지속 배포 (CD)', icon: <SendIcon /> },
  { to: '/console/stacks', label: '스택', icon: <PackageIcon /> },
  { to: '/console/marketplace', label: '마켓플레이스', icon: <DocumentIcon /> },
  { to: '/console/flows', label: '플로우', icon: <ChartIcon /> },
  { to: '/console/workbenches', label: '워크벤치', icon: <TerminalIcon /> },
  { to: '/console/kubernetes', label: '쿠버네티스', icon: <GlobeIcon /> },
  { to: '/console/ai', label: 'LOGO AI', icon: <SendIcon /> },
  { to: '/console/security', label: '보안', icon: <ShieldIcon /> },
  { to: '/console/settings', label: '설정', icon: <GearIcon /> },
];

const CLUSTERS = [
  { name: 'logo-mgmt', score: 92, tone: 'good' },
  { name: '클러스터01', score: 61, tone: 'mid' },
  { name: 'prod-us1-01', score: 53, tone: 'mid' },
  { name: 'staging-ap-02', score: 81, tone: 'good' },
  { name: 'dev-eu1-03', score: 69, tone: 'mid' },
  { name: 'prod-us2-04', score: 55, tone: 'mid' },
  { name: 'staging-us1-05', score: 81, tone: 'good' },
  { name: 'dev-ap2-06', score: 76, tone: 'good' },
  { name: 'prod-eu1-07', score: 54, tone: 'mid' },
  { name: 'staging-us2-08', score: 33, tone: 'bad' },
  { name: 'dev-us1-09', score: null, tone: 'none' },
  { name: 'prod-ap2-10', score: 73, tone: 'good' },
  { name: 'staging-eu1-11', score: 81, tone: 'good' },
  { name: 'dev-us2-12', score: 48, tone: 'bad' },
  { name: 'prod-us1-13', score: 69, tone: 'mid' },
  { name: 'staging-ap2-14', score: 79, tone: 'good' },
  { name: 'dev-eu1-15', score: 93, tone: 'good' },
  { name: 'prod-us2-16', score: 87, tone: 'good' },
  { name: 'staging-us1-17', score: null, tone: 'none' },
];

function ThemeToggle() {
  const [mode, toggle] = useThemeMode();
  return (
    <button type="button" className="archive-theme" onClick={toggle} aria-label="테마 전환">
      <span><SunIcon size={13} /></span>
      <span className={mode === 'dark' ? 'active' : ''}><MoonIcon size={12} /></span>
    </button>
  );
}

export default function ArchivedConsoleDemo() {
  const location = useLocation();
  const crumbs = location.pathname.replace(/^\/console\/?/, '').split('/').filter(Boolean);
  const isClusterPage = location.pathname.includes('/cd/clusters');

  return (
    <div className="archive-console">
      <aside className="archive-sidebar">
        <Link to="/console" className="archive-logo">
          <PluralMarkIcon size={23} />
          <span>LOGO</span>
        </Link>
        <nav>
          {MENU.map(item => (
            <Link key={item.to} to={item.to} className={location.pathname === item.to ? 'active' : ''}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="archive-main">
        <header className="archive-topbar">
          <span className="archive-project">모든 프로젝트</span>
          <div className="archive-actions">
            <button type="button" className="archive-icon"><ListIcon size={14} /><i>4</i></button>
            <button type="button" className="archive-chat"><SendIcon size={13} />채팅</button>
            <ThemeToggle />
            <span className="archive-user">우</span>
          </div>
        </header>
        <div className="archive-breadcrumb">
          <button type="button" aria-label="뒤로"><ArrowLeftIcon size={14} /></button>
          <span>{crumbs.length ? crumbs.join(' / ') : 'home'}</span>
          <Link to="/" title="실서비스로 이동">실서비스</Link>
        </div>
        <section className="archive-content">
          {isClusterPage ? <ClusterArchive /> : <HomeArchive />}
        </section>
      </main>
    </div>
  );
}

function HomeArchive() {
  return (
    <>
      <div className="archive-sectionbar">
        <b>위젯</b>
        <div>
          <button type="button">프리셋으로</button>
          <button type="button" className="primary">+ 위젯 추가</button>
        </div>
      </div>
      <div className="archive-card archive-map">
        <div className="archive-tabs">
          <b>플릿 맵</b>
          <span className="active">전체</span>
          <span>CPU</span>
          <span>메모리</span>
          <span>비용</span>
        </div>
        <div className="archive-treemap">
          {CLUSTERS.map((cluster, index) => (
            <Link
              key={cluster.name}
              to="/console/cd/clusters/cluster01"
              className={`tile ${cluster.tone}`}
              style={{ gridColumn: `span ${index % 5 === 0 ? 2 : 1}`, gridRow: `span ${index % 4 === 0 ? 2 : 1}` }}
            >
              <b>{cluster.name}</b>
              <span>{cluster.score ?? '—'}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="archive-kpis">
        <div><span>팟 수</span><b>18,000개</b><small>수집기 비정상 2개 클러스터 제외</small></div>
        <div><span>CPU 사용률</span><b>34.9%</b><small>수집기 비정상 2개 클러스터 제외</small></div>
        <div><span>메모리 사용률</span><b>16.5%</b><small>수집기 비정상 2개 클러스터 제외</small></div>
        <div><span>활성 알림</span><b className="danger">4건</b></div>
      </div>
    </>
  );
}

function ClusterArchive() {
  return (
    <>
      <div className="archive-sectionbar">
        <b>클러스터</b>
        <div>
          <button type="button">+ 배포 연결</button>
          <button type="button" className="primary">+ 클러스터 등록</button>
        </div>
      </div>
      <div className="archive-table">
        <table>
          <thead><tr><th>사례</th><th>상태</th><th>구름</th><th>호스팅</th><th>지역</th><th>크기</th><th>소유자</th><th /></tr></thead>
          <tbody>
            {['클러스터01', '클러스터02'].map(name => (
              <tr key={name}>
                <td><PluralMarkIcon size={18} />{name}</td>
                <td><span className="chip ok">제공됨</span></td>
                <td>AWS</td>
                <td><span className="chip">공유됨</span></td>
                <td>미국 동부-1</td>
                <td>크기가 큰</td>
                <td>{name === '클러스터01' ? 'cluster01-cloud-sa' : 'cluster02-cloud-sa'}<small>{name.toLowerCase()}-cloud-sa@srv.plural.sh</small></td>
                <td><CaretRightIcon size={14} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
