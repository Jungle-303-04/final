// 홈 대시보드 — 플릿 집계(/fleet/summary) + 인시던트 타임라인 + 승인 대기 + 최근 AI 대화 (전부 실데이터)
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Chip, Table, type ChipSeverity } from '@/plural-ui';
import { CaretRightIcon, GlobeIcon, PlusIcon, SendIcon, ShieldIcon } from '@/plural-ui/icons';
import { healthLabel, healthScore, useFleetSummary, type FleetClusterSummary, type FleetHealth } from '@/features/fleet/api';
import { timeAgo, useNotices, useTimeline } from '@/features/notifications/api';
import { useConversations } from '@/features/chat/api';
import { useIsAdmin } from '@/features/auth/api';
import { useClusterUsage } from '@/features/cluster/api';
import { useMetricQueryPresets, useMetricWidgets } from '@/features/metrics/api';
import { buildUsageSeries } from '@/features/metrics/usageSeries';
import { RegisterClusterWizard } from '@/features/resources/RegisterClusterWizard';
import { ConnectRepoWizard } from '@/features/resources/ConnectRepoWizard';
import { TimeSeriesChart, TreemapChart, type HeatNode } from '@/shared/ui/charts';
import { EmptyState, QueryBoundary, Skeleton } from '@/shared/ui';
import { AnimatedList, CountUp } from '@/shared/motion';
import { useConsolePath } from '../ui';
import '../console.css';

const HEALTH_SEVERITY: Record<FleetHealth, ChipSeverity> = { healthy: 'success', warning: 'warning', critical: 'danger', stale: 'warning', unknown: 'neutral' };
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`);

type FleetHealthTotals = {
  clusters: number;
  critical: number;
  warning: number;
  stale: number;
  unknown: number;
};

type FleetStatTotals = FleetHealthTotals & {
  open_incidents: number;
  pending_approvals: number;
  running_workflows: number;
  dead_letters: number;
};

type FleetLens = 'all' | 'cpu' | 'memory' | 'incidents';

const FLEET_LENSES: { key: FleetLens; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'cpu', label: 'CPU' },
  { key: 'memory', label: '메모리' },
  { key: 'incidents', label: '인시던트' },
];

export function fleetClusterChip(totals: FleetHealthTotals): { chip?: string; severity: ChipSeverity } {
  if (totals.critical > 0) return { chip: `위험 ${totals.critical}`, severity: 'danger' };
  if (totals.warning > 0) return { chip: `주의 ${totals.warning}`, severity: 'warning' };
  if (totals.stale > 0) return { chip: `스테일 ${totals.stale}`, severity: 'warning' };
  if (totals.unknown > 0) return { chip: `미확인 ${totals.unknown}`, severity: 'neutral' };
  if (totals.clusters > 0) return { chip: '모두 정상', severity: 'success' };
  return { severity: 'success' };
}

export function HomePage() {
  const navigate = useNavigate();
  const pathFor = useConsolePath();
  const fleetQ = useFleetSummary();
  const timelineQ = useTimeline();
  const { notices } = useNotices();
  const conversationsQ = useConversations();
  const admin = useIsAdmin();
  const [clusterWizard, setClusterWizard] = useState(false);
  const [repoWizard, setRepoWizard] = useState(false);
  const [fleetLens, setFleetLens] = useState<FleetLens>('all');
  const [selectedClusterId, setSelectedClusterId] = useState('');

  const approvals = notices.filter(n => n.kind === 'approval').slice(0, 5);
  const fleetClusters = useMemo(() => fleetQ.data?.clusters ?? [], [fleetQ.data?.clusters]);

  useEffect(() => {
    if (!fleetClusters.length) return;
    if (!selectedClusterId || !fleetClusters.some(c => c.cluster_id === selectedClusterId)) {
      setSelectedClusterId(fleetClusters[0].cluster_id);
    }
  }, [fleetClusters, selectedClusterId]);

  const selectedCluster = fleetClusters.find(c => c.cluster_id === selectedClusterId) ?? fleetClusters[0];
  const usageQ = useClusterUsage(selectedCluster?.cluster_id);
  const widgetsQ = useMetricWidgets(selectedCluster?.cluster_id);
  const presetsQ = useMetricQueryPresets(selectedCluster?.cluster_id);
  const usageSeries = useMemo(() => buildUsageSeries(usageQ.data ?? []), [usageQ.data]);
  const openCluster = (clusterId: string) => navigate(pathFor(`/clusters/${clusterId}`));
  const openClusterByKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, clusterId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openCluster(clusterId);
  };

  return (
    <>
      {/* ── 집계 카드 + 히트맵 + 클러스터 테이블 — GET /fleet/summary ── */}
      <QueryBoundary query={fleetQ} skeletonLines={5}>{fleet => (
        <div className="co-dashboard">
          {fleet.clusters.length === 0 ? (
            <div className="pl-card" style={{ marginBottom: 16 }}>
              <EmptyState
                icon={<GlobeIcon size={26} />}
                title="아직 등록된 클러스터가 없습니다"
                action={admin ? <Button variant="primary" onClick={() => setClusterWizard(true)}>첫 클러스터 등록</Button> : undefined}
              />
            </div>
          ) : (
            <>
              <div className="co-dashboard-toolbar">
                <b>위젯</b>
                <div className="pl-row">
                  <Button onClick={() => setRepoWizard(true)}><PlusIcon size={14} />레포 연결</Button>
                  {admin && <Button onClick={() => setClusterWizard(true)}><PlusIcon size={14} />클러스터 등록</Button>}
                  <Button onClick={() => navigate(pathFor('/metrics'))}>쿼리</Button>
                  <Button variant="primary" onClick={() => navigate(pathFor('/metrics'))}><PlusIcon size={14} />위젯 추가</Button>
                </div>
              </div>

              <div className="pl-card co-fleet-map">
                <div className="co-map-head">
                  <b>플릿 맵</b>
                  <div className="co-map-tabs" role="tablist" aria-label="플릿 맵 렌즈">
                    {FLEET_LENSES.map(lens => (
                      <button
                        key={lens.key}
                        type="button"
                        role="tab"
                        aria-selected={fleetLens === lens.key}
                        className={fleetLens === lens.key ? 'active' : ''}
                        onClick={() => setFleetLens(lens.key)}
                      >
                        {lens.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="co-treemap-frame">
                  <TreemapChart
                    nodes={fleet.clusters.map(c => fleetHeatNode(c, fleetLens))}
                    onTileClick={openCluster}
                  />
                </div>
              </div>

              <FleetWidgetStrip totals={fleet.totals} clusters={fleet.clusters} />

              <div className="co-dashboard-grid">
                <Card className="pl-stack co-widget-panel">
                  <div className="pl-row pl-row--between">
                    <b>저장 위젯</b>
                    {selectedCluster && (
                      <select
                        className="input co-compact-select"
                        value={selectedCluster.cluster_id}
                        onChange={e => setSelectedClusterId(e.target.value)}
                        aria-label="위젯 클러스터"
                      >
                        {fleet.clusters.map(c => <option key={c.cluster_id} value={c.cluster_id}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                  <StoredWidgetSummary
                    loading={widgetsQ.isPending || presetsQ.isPending}
                    widgets={widgetsQ.data ?? []}
                    presetCount={(presetsQ.data ?? []).length}
                    onOpen={() => navigate(pathFor(`/metrics?cluster=${selectedCluster?.cluster_id ?? ''}`))}
                  />
                </Card>

                <Card className="pl-stack co-widget-panel">
                  <div className="pl-row pl-row--between">
                    <b>사용량 추이</b>
                    <Button size="small" onClick={() => navigate(pathFor(`/metrics?cluster=${selectedCluster?.cluster_id ?? ''}`))}>메트릭</Button>
                  </div>
                  {usageQ.isPending ? <Skeleton lines={4} /> : usageSeries.length === 0 ? (
                    <p className="pl-muted" style={{ margin: 0 }}>수집된 시계열 없음</p>
                  ) : (
                    <TimeSeriesChart series={usageSeries} height={180} />
                  )}
                </Card>

                <Card className="pl-stack co-widget-panel">
                  <div className="pl-row pl-row--between">
                    <b>최근 인시던트</b>
                    <Button size="small" onClick={() => navigate(pathFor('/incidents'))}>전체 보기</Button>
                  </div>
                  <RecentIncidentList query={timelineQ} pathFor={pathFor} />
                </Card>

                <Card className="pl-stack co-widget-panel">
                  <div className="pl-row pl-row--between">
                    <b>승인 대기 배포</b>
                    <Button size="small" onClick={() => navigate(pathFor('/workflows'))}>워크플로우</Button>
                  </div>
                  <ApprovalList approvals={approvals} pathFor={pathFor} />
                </Card>
              </div>

              <Table headers={['클러스터', '건강', '팟', '노드', 'CPU', 'MEM', '인시던트', '최근 재시작', '마지막 확인', '']}>
                {fleet.clusters.map(c => (
                  <tr
                    key={c.cluster_id}
                    className="clickable"
                    tabIndex={0}
                    role="button"
                    onClick={() => openCluster(c.cluster_id)}
                    onKeyDown={event => openClusterByKeyboard(event, c.cluster_id)}
                  >
                    <td><b style={{ color: 'var(--color-text)' }}>{c.name}</b></td>
                    <td><Chip severity={HEALTH_SEVERITY[c.health] ?? 'neutral'}>{healthLabel(c.health)}</Chip></td>
                    <td>{c.pods_running}/{c.pods_total}</td>
                    <td>{c.nodes_ready}/{c.nodes_total}</td>
                    <td>{pct(c.cpu_pct)}</td>
                    <td>{pct(c.mem_pct)}</td>
                    <td>{c.open_incidents > 0 ? <Chip severity="danger">{c.open_incidents}</Chip> : '—'}</td>
                    <td>{c.restarts_recent}</td>
                    <td>{c.last_seen ? timeAgo(c.last_seen) : '—'}</td>
                    <td>
                      <div className="pl-rowactions">
                        <span className="pl-caretbtn" aria-hidden><CaretRightIcon size={14} /></span>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </div>
      )}</QueryBoundary>

      {/* ── 최근 AI 대화 — GET /ai/conversations ── */}
      <div style={{ marginTop: 16 }}>
        <Card className="pl-stack">
          <div className="pl-row pl-row--between">
            <span className="pl-row" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
              <SendIcon size={14} /> 최근 AI 대화
            </span>
            <Button size="small" onClick={() => navigate(pathFor('/ai'))}>전체 보기</Button>
          </div>
          {conversationsQ.isPending ? <Skeleton lines={2} /> : (conversationsQ.data ?? []).length === 0 ? (
            <p className="pl-muted" style={{ margin: 0 }}>대화 없음</p>
          ) : (
            <div className="pl-stack" style={{ gap: 8 }}>
              <AnimatedList items={(conversationsQ.data ?? []).slice(0, 3)} getKey={c => c.conversation_id}>
                {c => <Link to={pathFor(`/ai/${c.conversation_id}`)} className="pl-bindrow" style={{ textDecoration: 'none' }}>
                  <div className="pl-row" style={{ minWidth: 0 }}>
                    <div className="pl-avatar" style={{ width: 26, height: 26, fontSize: 10, background: 'var(--color-fill-two)' }}>AI</div>
                    <span style={{ color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  </div>
                  <span className="pl-muted" style={{ flex: 'none' }}>{timeAgo(c.updated_at)}</span>
                </Link>}
              </AnimatedList>
            </div>
          )}
        </Card>
      </div>

      <RegisterClusterWizard open={clusterWizard} onClose={() => setClusterWizard(false)} />
      <ConnectRepoWizard open={repoWizard} onClose={() => setRepoWizard(false)} />
    </>
  );
}

function fleetHeatNode(cluster: FleetClusterSummary, lens: FleetLens): HeatNode {
  const cpuScore = ratioHealthScore(cluster.cpu_pct);
  const memScore = ratioHealthScore(cluster.mem_pct);
  const size = Math.max(1, cluster.pods_total);
  if (lens === 'cpu') {
    return {
      id: cluster.cluster_id,
      label: `${cluster.name} · ${pct(cluster.cpu_pct)} CPU`,
      value: size,
      score: cpuScore,
    };
  }
  if (lens === 'memory') {
    return {
      id: cluster.cluster_id,
      label: `${cluster.name} · ${pct(cluster.mem_pct)} MEM`,
      value: size,
      score: memScore,
    };
  }
  if (lens === 'incidents') {
    return {
      id: cluster.cluster_id,
      label: `${cluster.name} · 인시던트 ${cluster.open_incidents}`,
      value: size,
      score: cluster.open_incidents > 0 ? 0.12 : healthScore(cluster.health),
    };
  }
  return {
    id: cluster.cluster_id,
    label: `${cluster.name} · 팟 ${cluster.pods_running}/${cluster.pods_total}`,
    value: size,
    score: healthScore(cluster.health),
  };
}

function ratioHealthScore(value: number | null): number {
  if (value == null) return 0.36;
  return Math.max(0.05, Math.min(0.95, 1 - value / 100));
}

function avgMetric(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => typeof v === 'number');
  if (!known.length) return null;
  return known.reduce((sum, v) => sum + v, 0) / known.length;
}

function FleetWidgetStrip({ totals, clusters }: { totals: FleetStatTotals; clusters: FleetClusterSummary[] }) {
  const totalPods = clusters.reduce((sum, c) => sum + c.pods_total, 0);
  const avgCpu = avgMetric(clusters.map(c => c.cpu_pct));
  const avgMem = avgMetric(clusters.map(c => c.mem_pct));
  const activeAlerts = totals.open_incidents + totals.dead_letters;
  return (
    <div className="co-kpi-grid">
      <KpiTile label="팟 수" value={totalPods.toLocaleString()} sub={`${totals.stale + totals.unknown}개 클러스터 수집 상태 확인`} />
      <KpiTile label="CPU 사용률" value={pct(avgCpu)} />
      <KpiTile label="메모리 사용률" value={pct(avgMem)} />
      <KpiTile label="활성 알림" value={`${activeAlerts.toLocaleString()}건`} danger={activeAlerts > 0} />
    </div>
  );
}

function KpiTile({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="co-kpi">
      <span>{label}</span>
      <b className={danger ? 'danger' : ''}>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function StoredWidgetSummary({
  loading,
  widgets,
  presetCount,
  onOpen,
}: {
  loading: boolean;
  widgets: { widget_id: string; title: string; kind: string }[];
  presetCount: number;
  onOpen: () => void;
}) {
  if (loading) return <Skeleton lines={4} />;
  return (
    <>
      <div className="co-widget-count">
        <b><CountUp value={widgets.length} /></b>
        <span>위젯</span>
        <b><CountUp value={presetCount} /></b>
        <span>쿼리</span>
      </div>
      {widgets.length === 0 ? (
        <p className="pl-muted" style={{ margin: 0 }}>저장된 위젯 없음</p>
      ) : (
        <div className="pl-stack" style={{ gap: 8 }}>
          <AnimatedList items={widgets.slice(0, 4)} getKey={w => w.widget_id}>
            {w => (
              <button type="button" className="pl-bindrow co-compact-row" onClick={onOpen}>
                <span>{w.title}</span>
                <Chip severity="info">{w.kind}</Chip>
              </button>
            )}
          </AnimatedList>
        </div>
      )}
    </>
  );
}

function RecentIncidentList({ query, pathFor }: { query: ReturnType<typeof useTimeline>; pathFor: (to: string) => string }) {
  return (
    <QueryBoundary query={query} skeletonLines={3}>{items =>
      items.length === 0 ? (
        <p className="pl-muted" style={{ margin: 0 }}>열린 인시던트 없음</p>
      ) : (
        <div className="pl-stack" style={{ gap: 8 }}>
          <AnimatedList items={items.slice(0, 5)} getKey={i => i.incident_id}>
            {i => <Link to={pathFor(`/incidents/${i.incident_id}`)} className="pl-bindrow" style={{ textDecoration: 'none' }}>
              <div className="pl-row" style={{ minWidth: 0 }}>
                <ShieldIcon size={13} />
                <Chip severity="danger">{i.stage}</Chip>
                <span style={{ color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.summary}</span>
              </div>
              <span className="pl-muted" style={{ flex: 'none' }}>{timeAgo(i.at)}</span>
            </Link>}
          </AnimatedList>
        </div>
      )
    }</QueryBoundary>
  );
}

function ApprovalList({ approvals, pathFor }: { approvals: ReturnType<typeof useNotices>['notices']; pathFor: (to: string) => string }) {
  if (approvals.length === 0) return <p className="pl-muted" style={{ margin: 0 }}>승인 대기 없음</p>;
  return (
    <div className="pl-stack" style={{ gap: 8 }}>
      <AnimatedList items={approvals} getKey={n => n.id}>
        {n => <Link to={pathFor(n.link)} className="pl-bindrow" style={{ textDecoration: 'none' }}>
          <div className="pl-row" style={{ minWidth: 0 }}>
            <SendIcon size={13} />
            <Chip severity="warning">승인</Chip>
            <span style={{ color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
          </div>
          <span className="pl-muted" style={{ flex: 'none' }}>{n.at ? timeAgo(n.at) : ''}</span>
        </Link>}
      </AnimatedList>
    </div>
  );
}
