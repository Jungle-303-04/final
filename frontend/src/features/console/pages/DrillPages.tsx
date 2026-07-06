// 드릴다운 페이지 — 클러스터(개요 탭) → 서비스|노드|네임스페이스 → 팟
// 각 레벨은 레벨×탭 매트릭스(기획서 I4)에 따른 자기 탭 세트를 가진 온전한 페이지다:
//   서비스/노드: 개요(보드+팟맵) · 팟 · 메트릭 · 알림 · 로그 · 네트워크 · 인사이트
//   네임스페이스: 개요(팟맵) · 팟  (그 외 탭은 매트릭스에서 제외 — 무의미한 화면을 만들지 않는다)
//   팟(리프): 정보 · 이벤트 · 알림 · 로그 · YAML
// I11: 수집기 비정상 클러스터는 모든 레벨에서 값 대신 결측을 보여준다
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  InfoList,
  PageHeader,
  SaveButton,
  Table,
  TabList,
} from '@/plural-ui';
import { ALERTS, CLUSTERS, genHistorySeries, hashStr, mulberry32, SERVICES } from '../api';
import { collectorOf, getNodeAggs, getPodMetrics, NODE_SPEC, type PodMetric } from '../api';
import { statusSeverity } from '../ui';
import { useLiveStream, useLiveValue } from '../live';
import { PodMap } from '../map/PodMap';
import { WidgetBoard } from '../widgets/WidgetBoard';
import { fmtCost } from '../map/colors';

const clusterNameOf = (clusterId: string) => CLUSTERS.find((c) => c.id === clusterId)?.name ?? clusterId;

/* ══ 공용 블록 ═══════════════════════════ */

function CollectorGate({ clusterId }: { clusterId: string }) {
  const navigate = useNavigate();
  const collector = collectorOf(clusterId);
  return (
    <EmptyState title="데이터 없음" message={collector.reason ?? '수집기 비정상'}>
      <Button size="small" onClick={() => navigate(`/console/cd/clusters/${clusterId}/addons`)}>
        애드온에서 확인
      </Button>
    </EmptyState>
  );
}

function PodTable({ clusterId, pods }: { clusterId: string; pods: PodMetric[] }) {
  const navigate = useNavigate();
  return (
    <Table headers={['팟', '서비스', '노드', 'CPU(요청 대비)', '메모리', '재시작', '상태']}>
      {pods.map((p) => (
        <tr
          key={p.name}
          className="clickable"
          onClick={() => navigate(`/console/cd/clusters/${clusterId}/pods/${encodeURIComponent(p.name)}`)}
        >
          <td style={{ fontWeight: 600 }}>{p.name}</td>
          <td>{p.service}</td>
          <td>
            <span className="pl-code">{p.nodeName.split('.')[0]}</span>
          </td>
          <td>{((p.cpuUse / p.cpuReq) * 100).toFixed(0)}%</td>
          <td>
            {p.memUse}/{p.memReq}Mi
          </td>
          <td>{p.restarts > 0 ? <Chip severity="warning">{p.restarts}</Chip> : '—'}</td>
          <td>
            <Chip severity={statusSeverity(p.status)}>{p.status}</Chip>
          </td>
        </tr>
      ))}
    </Table>
  );
}

/** 스코프 알림: 스코프의 팟(이름·서비스)과 매칭되는 알림만 — 지어내지 않는다 */
function scopeAlerts(pods: PodMetric[]) {
  return ALERTS.filter((a) => pods.some((p) => a.resource === p.name || a.resource === p.service));
}

function AlertsTab({ pods }: { pods: PodMetric[] }) {
  const rows = scopeAlerts(pods);
  if (rows.length === 0)
    return <EmptyState title="활성 알림이 없어요" message="이 스코프의 팟과 연결된 알림이 없습니다." />;
  return (
    <Table headers={['알림', '심각도', '리소스', '발생']}>
      {rows.map((a) => (
        <tr key={a.id}>
          <td style={{ fontWeight: 600 }}>{a.name}</td>
          <td>
            <Chip severity={a.severity === '심각' ? 'danger' : 'warning'}>{a.severity}</Chip>
          </td>
          <td>
            <span className="pl-code">{a.resource}</span>
          </td>
          <td>{a.firedAt}</td>
        </tr>
      ))}
    </Table>
  );
}

/** 라이브 로그 스트림 — 스코프 시드 기반, 1.1초 간격 추가 */
const LOG_TEMPLATES = [
  'INFO  request handled path=/api/v1/%s status=200 dur=%dms',
  'INFO  healthcheck ok',
  'INFO  consumed event stream=%s offset=%d',
  'WARN  slow query dur=%dms table=events',
  'INFO  gc pause=%dms heap=62%%',
];

function LogsTab({ scopeKey, oom }: { scopeKey: string; oom: boolean }) {
  const [lines, setLines] = useState<string[]>(() => {
    const r = mulberry32(hashStr(scopeKey));
    const base = Array.from({ length: 14 }, (_, i) => {
      const t = LOG_TEMPLATES[Math.floor(r() * LOG_TEMPLATES.length)];
      return `2026-07-07T04:${String(10 + i).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}Z ${t
        .replace('%s', ['clusters', 'alerts', 'commands'][Math.floor(r() * 3)])
        .replace(/%d/g, () => String(3 + Math.floor(r() * 120)))}`;
    });
    return oom
      ? [...base, '2026-07-07T04:24:41Z WARN  heap usage 91% — GC pressure rising', '2026-07-07T04:24:47Z ERROR allocation failed: out of memory']
      : base;
  });

  useEffect(() => {
    const r = mulberry32(hashStr(scopeKey) ^ Date.now());
    const id = setInterval(() => {
      const t = LOG_TEMPLATES[Math.floor(r() * LOG_TEMPLATES.length)];
      const now = new Date();
      setLines((prev) => [
        ...prev.slice(-120),
        `${now.toISOString().slice(0, 19)}Z ${t
          .replace('%s', ['clusters', 'alerts', 'commands'][Math.floor(r() * 3)])
          .replace(/%d/g, () => String(3 + Math.floor(r() * 120)))}`,
      ]);
    }, 1100);
    return () => clearInterval(id);
  }, [scopeKey]);

  return <div className="co-terminal">{lines.join('\n')}</div>;
}

/** 메트릭 탭 — 기간 선택 + CPU/메모리 시계열 (I2: 시계열은 시드 고정, 마지막 점=현재값) */
function AxisArea({ series, unit, color }: { series: number[]; unit: string; color: string }) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const W = 100;
  const H = 34;
  const d = series
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${((i / (series.length - 1)) * W).toFixed(2)} ${(H - ((v - min) / range) * (H - 6) - 3).toFixed(2)}`)
    .join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 120, display: 'block' }}>
        <path d={`${d} L ${W} ${H} L 0 ${H} Z`} fill={color} opacity="0.12" />
        <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="pl-row pl-row--between" style={{ fontSize: 11 }}>
        <span className="pl-muted">
          {min.toFixed(1)}
          {unit} ~ {max.toFixed(1)}
          {unit}
        </span>
        <span style={{ fontWeight: 600 }}>
          현재 {series[series.length - 1].toFixed(1)}
          {unit}
        </span>
      </div>
    </div>
  );
}

function MetricsTab({ scopeKey, cpuPct, memPct }: { scopeKey: string; cpuPct: number; memPct: number }) {
  const [range, setRange] = useState('6시간');
  const cpu = useMemo(() => {
    const s = genHistorySeries(`${scopeKey}-cpu`, range, cpuPct, 7);
    s[s.length - 1] = cpuPct;
    return s;
  }, [scopeKey, range, cpuPct]);
  const mem = useMemo(() => {
    const s = genHistorySeries(`${scopeKey}-mem`, range, memPct, 5);
    s[s.length - 1] = memPct;
    return s;
  }, [scopeKey, range, memPct]);
  return (
    <div className="pl-stack">
      <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
        <TabList tabs={['1시간', '6시간', '24시간'].map((k) => ({ key: k, label: k }))} value={range} onChange={setRange} />
      </div>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>CPU 사용률</div>
        <AxisArea series={cpu} unit="%" color="var(--map-cpu)" />
      </Card>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>메모리 사용률</div>
        <AxisArea series={mem} unit="%" color="var(--map-mem)" />
      </Card>
    </div>
  );
}

/** 네트워크 탭 — 코어 서비스 토폴로지 기반 연결 목록 (시드 고정) */
const TOPOLOGY: Record<string, string[]> = {
  'api-gateway': ['realtime-gateway', 'nats', 'postgres'],
  'realtime-gateway': ['api-gateway', 'nats'],
  'rca-worker': ['nats', 'postgres'],
  'dashboard-worker': ['nats', 'postgres'],
  'alert-worker': ['nats', 'mail-worker'],
  'command-worker': ['nats', 'cluster-agent'],
  monitoring: ['node-collector', 'nats'],
  'cluster-agent': ['api-gateway'],
};

function NetworkTab({ scopeKey, services }: { scopeKey: string; services: string[] }) {
  const rows = useMemo(() => {
    const r = mulberry32(hashStr(`${scopeKey}-net`));
    const set = new Map<string, { peer: string; dir: string; rps: number; p99: number }>();
    for (const svc of services) {
      for (const peer of TOPOLOGY[svc] ?? ['nats']) {
        const key = `${svc}→${peer}`;
        if (!set.has(key))
          set.set(key, { peer: `${svc} → ${peer}`, dir: '송신', rps: Math.round(5 + r() * 220), p99: Math.round(4 + r() * 90) });
      }
    }
    return [...set.values()].slice(0, 10);
  }, [scopeKey, services]);
  if (rows.length === 0) return <EmptyState title="관측된 연결이 없어요" />;
  return (
    <Table headers={['연결', '방향', 'RPS', 'p99 지연', '상태']}>
      {rows.map((row) => (
        <tr key={row.peer}>
          <td>
            <span className="pl-code">{row.peer}</span>
          </td>
          <td>{row.dir}</td>
          <td>{row.rps}/s</td>
          <td>{row.p99}ms</td>
          <td>
            <Chip severity={row.p99 > 80 ? 'warning' : 'success'}>{row.p99 > 80 ? '지연' : '정상'}</Chip>
          </td>
        </tr>
      ))}
    </Table>
  );
}

/** 인사이트 탭 — 스코프 데이터에서만 도출 (지어내지 않는다) */
function InsightsTab({ pods, memPct }: { pods: PodMetric[]; memPct: number }) {
  const navigate = useNavigate();
  const crash = pods.filter((p) => p.status !== '실행 중');
  const cards: { severity: 'danger' | 'warning' | 'success'; title: string; body: string; action?: () => void; actionLabel?: string }[] = [];
  if (crash.length > 0)
    cards.push({
      severity: 'danger',
      title: `CrashLoopBackOff ${crash.length}건 — 메모리 한도(512Mi) 초과가 원인`,
      body: `${crash[0].name}이(가) OOMKilled 후 재시작을 반복하고 있어요. AI RCA가 PR#128(한도 1Gi 상향)을 제안했습니다.`,
      action: () => navigate('/console/self-service/pr/outstanding'),
      actionLabel: 'PR#128 보기',
    });
  if (memPct > 80 && crash.length === 0)
    cards.push({ severity: 'warning', title: `메모리 사용률 ${memPct.toFixed(0)}% — 여유 부족`, body: '요청량 대비 사용률이 높아요. 한도 상향 또는 레플리카 분산을 검토하세요.' });
  if (cards.length === 0)
    cards.push({ severity: 'success', title: '이상 징후 없음', body: '최근 관측에서 재시작·한도 초과·지연 스파이크가 발견되지 않았어요.' });
  return (
    <div className="pl-stack">
      {cards.map((c) => (
        <Card key={c.title}>
          <div className="pl-row pl-row--between">
            <div className="pl-row">
              <Chip severity={c.severity}>{c.severity === 'danger' ? '심각' : c.severity === 'warning' ? '경고' : '정상'}</Chip>
              <span style={{ fontWeight: 600 }}>{c.title}</span>
            </div>
            {c.action && (
              <Button size="small" onClick={c.action}>
                {c.actionLabel}
              </Button>
            )}
          </div>
          <p className="pl-sub" style={{ margin: '8px 0 0' }}>
            {c.body}
          </p>
        </Card>
      ))}
    </div>
  );
}

/* ══ L1: 클러스터 상세 "개요" 탭 (보드 + 맵 위젯 프리셋) ══ */
export function ClusterOverviewTab() {
  const { clusterId = 'mgmt' } = useParams();
  return <WidgetBoard scope={{ level: 'cluster', clusterId }} />;
}

/* ══ L2 공용 셸: 탭 세트 (I4 매트릭스) ══ */
const L2_TABS = [
  { key: 'overview', label: '개요' },
  { key: 'pods', label: '팟' },
  { key: 'metrics', label: '메트릭' },
  { key: 'alerts', label: '알림' },
  { key: 'logs', label: '로그' },
  { key: 'network', label: '네트워크' },
  { key: 'insights', label: '인사이트' },
] as const;
type L2Tab = (typeof L2_TABS)[number]['key'];

function L2Page({
  clusterId,
  title,
  sub,
  actions,
  pods,
  scopeKeyStr,
  overview,
}: {
  clusterId: string;
  title: string;
  sub: string;
  actions?: React.ReactNode;
  pods: PodMetric[];
  scopeKeyStr: string;
  overview: React.ReactNode;
}) {
  const [tab, setTab] = useState<L2Tab>('overview');
  const collector = collectorOf(clusterId);
  const alertCount = scopeAlerts(pods).length;
  const cpuPct = pods.length > 0 ? (pods.reduce((s, p) => s + p.cpuUse, 0) / pods.reduce((s, p) => s + p.cpuReq, 0)) * 100 : 0;
  const memPct = pods.length > 0 ? (pods.reduce((s, p) => s + p.memUse, 0) / pods.reduce((s, p) => s + p.memReq, 0)) * 100 : 0;
  const services = [...new Set(pods.map((p) => p.service))];
  const oom = pods.some((p) => p.status !== '실행 중');

  return (
    <>
      <PageHeader title={title} sub={sub} actions={actions} />
      {!collector.healthy ? (
        <CollectorGate clusterId={clusterId} />
      ) : (
        <>
          <TabList
            tabs={L2_TABS.map((t) => ({ key: t.key, label: t.key === 'alerts' && alertCount > 0 ? `알림 ${alertCount}` : t.label }))}
            value={tab}
            onChange={setTab}
          />
          <div style={{ marginTop: 16 }}>
            {tab === 'overview' && overview}
            {tab === 'pods' && <PodTable clusterId={clusterId} pods={pods.slice(0, 30)} />}
            {tab === 'metrics' && <MetricsTab scopeKey={scopeKeyStr} cpuPct={cpuPct} memPct={memPct} />}
            {tab === 'alerts' && <AlertsTab pods={pods} />}
            {tab === 'logs' && <LogsTab scopeKey={scopeKeyStr} oom={oom} />}
            {tab === 'network' && <NetworkTab scopeKey={scopeKeyStr} services={services} />}
            {tab === 'insights' && <InsightsTab pods={pods} memPct={memPct} />}
          </div>
        </>
      )}
    </>
  );
}

/* ══ L2: 클러스터 내 서비스 ══ */
export function ClusterServiceDrillPage() {
  const { clusterId = 'mgmt', serviceName = '' } = useParams();
  const navigate = useNavigate();
  const pods = useMemo(() => getPodMetrics(clusterId).filter((p) => p.service === serviceName), [clusterId, serviceName]);
  const catalog = SERVICES.find((s) => s.name === serviceName && s.cluster === clusterNameOf(clusterId));
  return (
    <L2Page
      clusterId={clusterId}
      title={serviceName}
      sub={`${clusterNameOf(clusterId)} 클러스터의 서비스 · 팟 ${pods.length}개`}
      actions={
        <>
          {catalog && <Button onClick={() => navigate(`/console/cd/services/${catalog.id}`)}>배포 상세</Button>}
          <Button onClick={() => navigate(`/console/cd/clusters/${clusterId}/overview`)}>클러스터로</Button>
        </>
      }
      pods={pods}
      scopeKeyStr={`svc-${clusterId}-${serviceName}`}
      overview={<WidgetBoard scope={{ level: 'service', clusterId, service: serviceName }} />}
    />
  );
}

/* ══ L2: 노드 ══ */
export function NodeDrillPage() {
  const { clusterId = 'mgmt', nodeName = '' } = useParams();
  const navigate = useNavigate();
  const node = useMemo(() => getNodeAggs(clusterId).find((n) => n.name === nodeName), [clusterId, nodeName]);
  const pods = useMemo(() => getPodMetrics(clusterId).filter((p) => p.nodeName === nodeName), [clusterId, nodeName]);
  return (
    <L2Page
      clusterId={clusterId}
      title={nodeName.split('.')[0]}
      sub={`${clusterNameOf(clusterId)} 클러스터의 노드 · ${nodeName}`}
      actions={
        <>
          {node && <Chip severity={node.ready ? 'success' : 'danger'}>{node.ready ? 'Ready' : 'NotReady'}</Chip>}
          <Button onClick={() => navigate(`/console/cd/clusters/${clusterId}/overview?group=node`)}>클러스터로</Button>
        </>
      }
      pods={pods}
      scopeKeyStr={`node-${clusterId}-${nodeName}`}
      overview={<WidgetBoard scope={{ level: 'node', clusterId, node: nodeName }} />}
    />
  );
}

/* ══ L2: 네임스페이스 (개요·팟만 — I4 매트릭스) ══ */
export function NamespaceDrillPage() {
  const { clusterId = 'mgmt', nsName = '' } = useParams();
  const navigate = useNavigate();
  const collector = collectorOf(clusterId);
  const pods = useMemo(() => getPodMetrics(clusterId).filter((p) => p.namespace === nsName), [clusterId, nsName]);
  return (
    <>
      <PageHeader
        title={nsName}
        sub={`${clusterNameOf(clusterId)} 클러스터의 네임스페이스 · 팟 ${pods.length}개`}
        actions={
          <Button onClick={() => navigate(`/console/cd/clusters/${clusterId}/overview?group=namespace`)}>
            클러스터로
          </Button>
        }
      />
      {!collector.healthy ? (
        <CollectorGate clusterId={clusterId} />
      ) : (
        <>
          <PodMap clusterId={clusterId} pods={pods} />
          <PodTable clusterId={clusterId} pods={pods.slice(0, 30)} />
        </>
      )}
    </>
  );
}

/* ══ L3: 팟 상세 (리프) ══ */
const POD_TABS = [
  { key: 'info', label: '정보' },
  { key: 'events', label: '이벤트' },
  { key: 'alerts', label: '알림' },
  { key: 'logs', label: '로그' },
  { key: 'yaml', label: 'YAML' },
] as const;

export function PodDrillPage() {
  const { clusterId = 'mgmt', podName = '' } = useParams();
  const navigate = useNavigate();
  const collector = collectorOf(clusterId);
  const pod = useMemo(() => getPodMetrics(clusterId).find((p) => p.name === podName), [clusterId, podName]);
  const [tab, setTab] = useState<(typeof POD_TABS)[number]['key']>('info');
  const isOom = pod?.name === 'dashboard-worker-5c2d-q9r4';

  const cpuLive = useLiveValue(pod ? (pod.cpuUse / pod.cpuReq) * 100 : 0, 2, { min: 0, max: 100 });
  const stream = useLiveStream(cpuLive, { sampleMs: 160, size: 80 });

  if (!collector.healthy)
    return (
      <>
        <PageHeader title={podName} sub={`${clusterNameOf(clusterId)} 클러스터의 팟`} />
        <CollectorGate clusterId={clusterId} />
      </>
    );
  if (!pod) return <EmptyState title="팟을 찾을 수 없어요" message="팟맵에서 다시 선택해 주세요." />;

  const podAlerts = ALERTS.filter((a) => a.resource === pod.name || a.resource === pod.service);
  const yaml = `apiVersion: v1
kind: Pod
metadata:
  name: ${pod.name}
  namespace: ${pod.namespace}
  labels:
    app: ${pod.service}
spec:
  nodeName: ${pod.nodeName}
  containers:
    - name: ${pod.service}
      image: ghcr.io/jungle-303-04/${pod.service}:0.9.1
      resources:
        requests:
          cpu: ${pod.cpuReq}m
          memory: ${pod.memReq}Mi
        limits:
          memory: ${pod.memReq}Mi
status:
  phase: ${pod.status === '실행 중' ? 'Running' : 'CrashLoopBackOff'}
  restartCount: ${pod.restarts}`;

  return (
    <>
      <PageHeader
        title={pod.name}
        sub={
          <span>
            {clusterNameOf(clusterId)} · {pod.namespace} ·{' '}
            <button
              type="button"
              className="pl-caretbtn"
              style={{ font: 'inherit' }}
              onClick={() => navigate(`/console/cd/clusters/${clusterId}/nodes/${encodeURIComponent(pod.nodeName)}`)}
            >
              {pod.nodeName.split('.')[0]}
            </button>
          </span>
        }
        actions={
          <>
            <Chip severity={statusSeverity(pod.status)}>{pod.status}</Chip>
            {pod.restarts > 0 && <Chip severity="warning">재시작 {pod.restarts}회</Chip>}
            <Button onClick={() => navigate(`/console/cd/clusters/${clusterId}/services/${encodeURIComponent(pod.service)}`)}>
              서비스 보기
            </Button>
          </>
        }
      />
      <TabList
        tabs={POD_TABS.map((t) => ({ key: t.key, label: t.key === 'alerts' && podAlerts.length > 0 ? `알림 ${podAlerts.length}` : t.label }))}
        value={tab}
        onChange={setTab}
      />
      <div style={{ marginTop: 16 }}>
        {tab === 'info' && (
          <div className="pl-stack">
            <Card>
              <InfoList
                rows={[
                  { label: 'CPU', value: `${pod.cpuUse}m / 요청 ${pod.cpuReq}m (${((pod.cpuUse / pod.cpuReq) * 100).toFixed(0)}%)` },
                  {
                    label: '메모리',
                    value: (
                      <span style={isOom ? { color: 'var(--color-text-danger)', fontWeight: 600 } : undefined}>
                        {pod.memUse}Mi / 한도 {pod.memReq}Mi ({((pod.memUse / pod.memReq) * 100).toFixed(0)}%)
                        {isOom && ' — 한도 직전, OOM 원인'}
                      </span>
                    ),
                  },
                  { label: '월 비용(요청 기반)', value: fmtCost(pod.costMonth) },
                  { label: '노드', value: <span className="pl-code">{pod.nodeName}</span> },
                  { label: '노드 스펙', value: `${NODE_SPEC.cpuCap / 1000} vCPU · ${NODE_SPEC.memCap / 1024}Gi` },
                ]}
              />
            </Card>
            <Card>
              <div className="pl-row pl-row--between" style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>CPU 실시간</span>
                <span className="pl-muted">요청 대비 %</span>
              </div>
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: 64, display: 'block' }}>
                <path
                  d={stream.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (stream.length - 1)) * 100} ${28 - (v / 100) * 26}`).join(' ')}
                  fill="none"
                  stroke="var(--map-cpu)"
                  strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </Card>
          </div>
        )}
        {tab === 'events' && (
          <Table headers={['유형', '사유', '메시지', '시각']}>
            {(isOom
              ? [
                  { t: '경고', r: 'OOMKilled', m: '컨테이너가 메모리 한도(512Mi)를 초과해 종료됨', at: '12분 전' },
                  { t: '경고', r: 'BackOff', m: '컨테이너 재시작 백오프 (7회)', at: '10분 전' },
                  { t: '정보', r: 'Pulled', m: '이미지 ghcr.io/jungle-303-04/dashboard-worker:0.9.1', at: '12분 전' },
                ]
              : [
                  { t: '정보', r: 'Scheduled', m: `${pod.nodeName.split('.')[0]}에 할당됨`, at: '3일 전' },
                  { t: '정보', r: 'Pulled', m: `이미지 ghcr.io/jungle-303-04/${pod.service} 사용`, at: '3일 전' },
                  { t: '정보', r: 'Started', m: '컨테이너 시작됨', at: '3일 전' },
                ]
            ).map((e, i) => (
              <tr key={i}>
                <td>
                  <Chip severity={e.t === '경고' ? 'warning' : 'neutral'}>{e.t}</Chip>
                </td>
                <td style={{ fontWeight: 600 }}>{e.r}</td>
                <td>{e.m}</td>
                <td>{e.at}</td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'alerts' && (
          podAlerts.length === 0 ? (
            <EmptyState title="활성 알림이 없어요" />
          ) : (
            <Table headers={['알림', '심각도', '발생']}>
              {podAlerts.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td>
                    <Chip severity={a.severity === '심각' ? 'danger' : 'warning'}>{a.severity}</Chip>
                  </td>
                  <td>{a.firedAt}</td>
                </tr>
              ))}
            </Table>
          )
        )}
        {tab === 'logs' && <LogsTab scopeKey={`pod-${clusterId}-${pod.name}`} oom={isOom} />}
        {tab === 'yaml' && (
          <div className="pl-stack">
            <textarea className="pl-input" style={{ minHeight: 320, fontFamily: 'var(--font-mono)', fontSize: 12 }} defaultValue={yaml} />
            <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
              <SaveButton>적용</SaveButton>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
