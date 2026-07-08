// 홈 대시보드 — 플릿 집계(/fleet/summary) + 인시던트 타임라인 + 승인 대기 + 최근 AI 대화 (전부 실데이터)
import { useMemo, useState, type ComponentProps, type SVGProps } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, Skeleton, StatCard, Table, Tabs, type TableColumn } from '@/ui';
import { TimeSeriesChart } from '@/ui/charts';
import { useClusters, type UsageSample } from '@/features/cluster/api';
import { healthLabel, useFleetSummary, type FleetClusterSummary, type FleetHealth } from '@/features/fleet/api';
import { DrilldownHeatmap } from '@/features/fleet/DrilldownHeatmap';
import { timeAgo, useNotices, useTimeline } from '@/features/notifications/api';
import { useConversations } from '@/features/chat/api';
import { useIsAdmin } from '@/features/auth/api';
import { get } from '@/shared/lib/api';
import { useConsolePath } from '../ui';
import { buildFleetPodSeries, buildFleetRestartSeries, trackedFleetChartClusters } from './homeCharts';

type BadgeTone = ComponentProps<typeof Badge>['tone'];
type StatTone = ComponentProps<typeof StatCard>['tone'];

const HEALTH_TONE: Record<FleetHealth, BadgeTone> = {
  healthy: 'success',
  warning: 'warning',
  critical: 'danger',
  stale: 'warning',
  unknown: 'neutral',
};

type FleetHealthTotals = {
  clusters: number;
  healthy: number;
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

export function fleetClusterChip(totals: FleetHealthTotals): { chip?: string; severity: BadgeTone } {
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
  const clustersQ = useClusters();
  const timelineQ = useTimeline();
  const { notices } = useNotices();
  const conversationsQ = useConversations();
  const admin = useIsAdmin();
  const [fleetLens, setFleetLens] = useState<FleetLens>('all');
  const approvals = notices.filter(n => n.kind === 'approval').slice(0, 5);
  const clusterRoles = useMemo(() => new Map((clustersQ.data ?? []).map(cluster => [cluster.cluster_id, cluster.role])), [clustersQ.data]);

  const clusterColumns = useMemo<TableColumn<FleetClusterSummary>[]>(() => [
    {
      id: 'name',
      header: '클러스터',
      width: 'lg',
      sortValue: row => row.name,
      cell: row => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-primary">{row.name}</span>
          {clusterRoles.get(row.cluster_id) === 'management' && <Badge tone="info">관리 클러스터</Badge>}
        </span>
      ),
    },
    { id: 'health', header: '상태', sortValue: row => row.health, cell: row => <HealthBadge health={row.health} /> },
    { id: 'pods', header: '팟', sortValue: row => row.pods_total, cell: row => `${row.pods_running}/${row.pods_total}` },
    { id: 'nodes', header: '노드', sortValue: row => row.nodes_total, cell: row => `${row.nodes_ready}/${row.nodes_total}` },
    { id: 'cpu', header: 'CPU', sortValue: row => row.cpu_pct ?? -1, cell: row => pct(row.cpu_pct) },
    { id: 'mem', header: '메모리', sortValue: row => row.mem_pct ?? -1, cell: row => pct(row.mem_pct) },
    { id: 'incidents', header: '인시던트', sortValue: row => row.open_incidents, cell: row => row.open_incidents > 0 ? <Badge tone="danger">{row.open_incidents}</Badge> : <span className="text-muted">없음</span> },
    { id: 'restarts', header: '재시작', sortValue: row => row.restarts_recent, cell: row => row.restarts_recent.toLocaleString() },
    { id: 'lastSeen', header: '마지막 확인', sortValue: row => row.last_seen ?? '', cell: row => row.last_seen ? timeAgo(row.last_seen) : <span className="text-muted">미확인</span> },
  ], [clusterRoles]);

  if (fleetQ.isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton lines={6} />
        <div className="grid gap-4 lg:grid-cols-4">
          <Skeleton lines={3} />
          <Skeleton lines={3} />
          <Skeleton lines={3} />
          <Skeleton lines={3} />
        </div>
      </div>
    );
  }

  if (fleetQ.isError) {
    return (
      <Card title="홈 대시보드" error={fleetQ.error as Error} onRetry={() => void fleetQ.refetch()}>
        <span />
      </Card>
    );
  }

  const fleet = fleetQ.data;
  if (fleet.clusters.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<GlobeIcon />}
          title="클러스터 없음"
          action={admin ? <Button variant="primary" onClick={() => navigate(pathFor('/clusters'))}>클러스터 등록</Button> : undefined}
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-page font-semibold text-primary">홈</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" leadingIcon={<PlusIcon />} onClick={() => navigate(pathFor('/repos'))}>레포 연결</Button>
          {admin && <Button size="sm" leadingIcon={<PlusIcon />} onClick={() => navigate(pathFor('/clusters'))}>클러스터 등록</Button>}
          <Button size="sm" onClick={() => navigate(pathFor('/metrics'))}>쿼리</Button>
          <Button size="sm" variant="primary" leadingIcon={<PlusIcon />} onClick={() => navigate(pathFor('/metrics'))}>위젯 추가</Button>
        </div>
      </div>

      <FleetStatCards totals={fleet.totals} clusters={fleet.clusters} />

      <FleetTrendCharts clusters={fleet.clusters} />

      <FleetHeatmap clusters={fleet.clusters} clusterRoles={clusterRoles} lens={fleetLens} onLensChange={setFleetLens} onOpen={clusterId => navigate(pathFor(`/clusters/${clusterId}`))} />

      <div className="grid gap-4 xl:grid-cols-2">
        <RecentIncidentCard query={timelineQ} pathFor={pathFor} />
        <ApprovalCard approvals={approvals} pathFor={pathFor} />
      </div>

      <Card title="클러스터">
        <Table
          columns={clusterColumns}
          rows={fleet.clusters}
          rowKey={row => row.cluster_id}
          onRowClick={row => navigate(pathFor(`/clusters/${row.cluster_id}`))}
        />
      </Card>

      <RecentConversationCard query={conversationsQ} pathFor={pathFor} />
    </div>
  );
}

function FleetStatCards({ totals, clusters }: { totals: FleetStatTotals; clusters: FleetClusterSummary[] }) {
  const totalPods = clusters.reduce((sum, cluster) => sum + cluster.pods_total, 0);
  const avgCpu = avgMetric(clusters.map(cluster => cluster.cpu_pct));
  const avgMem = avgMetric(clusters.map(cluster => cluster.mem_pct));
  const activeAlerts = totals.open_incidents + totals.dead_letters;
  const clusterChip = fleetClusterChip(totals);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard label="클러스터" value={totals.clusters.toLocaleString()} delta={clusterChip.chip} tone={clusterChip.severity as StatTone} />
      <StatCard label="팟 수" value={totalPods.toLocaleString()} delta={`${totals.stale + totals.unknown} 미확인`} tone={totals.stale + totals.unknown > 0 ? 'warning' : 'success'} />
      <StatCard label="CPU 사용률" value={pct(avgCpu)} delta="평균" tone={avgCpu != null && avgCpu >= 80 ? 'warning' : 'neutral'} />
      <StatCard label="활성 알림" value={`${activeAlerts.toLocaleString()}건`} delta="인시던트 + DLQ" tone={activeAlerts > 0 ? 'danger' : 'success'} />
      <StatCard label="메모리 사용률" value={pct(avgMem)} delta="평균" tone={avgMem != null && avgMem >= 80 ? 'warning' : 'neutral'} />
      <StatCard label="인시던트" value={totals.open_incidents.toLocaleString()} delta="열린 항목" tone={totals.open_incidents > 0 ? 'danger' : 'success'} />
      <StatCard label="승인 대기" value={totals.pending_approvals.toLocaleString()} delta="배포 승인" tone={totals.pending_approvals > 0 ? 'warning' : 'neutral'} />
      <StatCard label="워크플로우" value={totals.running_workflows.toLocaleString()} delta="실행 중" tone={totals.running_workflows > 0 ? 'info' : 'neutral'} />
    </div>
  );
}

function FleetTrendCharts({ clusters }: { clusters: FleetClusterSummary[] }) {
  const trackedClusters = trackedFleetChartClusters(clusters);
  const usageQueries = useQueries({
    queries: trackedClusters.map(cluster => ({
      queryKey: ['home', 'cluster-usage', cluster.cluster_id],
      queryFn: () => get<{ samples: UsageSample[] }>(`/clusters/${cluster.cluster_id}/usage?limit=120`, { timeoutMs: 8_000 }),
      refetchInterval: 30_000,
      retry: false,
      select: (response: { samples: UsageSample[] }) => response.samples,
    })),
  });
  const samplesByCluster = trackedClusters.reduce<Record<string, UsageSample[]>>((acc, cluster, index) => {
    acc[cluster.cluster_id] = usageQueries[index]?.data ?? [];
    return acc;
  }, {});
  const podSeries = buildFleetPodSeries(trackedClusters, samplesByCluster);
  const restartSeries = buildFleetRestartSeries(trackedClusters, samplesByCluster);
  const loading = usageQueries.some(query => query.isPending) && podSeries.length === 0 && restartSeries.length === 0;
  const allErrored = usageQueries.length > 0 && usageQueries.every(query => query.isError);
  const error = allErrored ? usageQueries.find(query => query.error)?.error as Error : null;
  const refetch = () => {
    for (const query of usageQueries) void query.refetch();
  };

  if (trackedClusters.length === 0) {
    return (
      <Card>
        <EmptyState title="시계열 없음" icon={<ChartIcon />} />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card
        title="실행 팟 추이"
        loading={loading}
        error={error}
        onRetry={refetch}
        empty={podSeries.length === 0 ? <EmptyState title="팟 시계열 없음" icon={<ChartIcon />} /> : undefined}
      >
        <TimeSeriesChart series={podSeries} />
      </Card>
      <Card
        title="재시작 증가"
        loading={loading}
        error={error}
        onRetry={refetch}
        empty={restartSeries.length === 0 ? <EmptyState title="재시작 시계열 없음" icon={<ChartIcon />} /> : undefined}
      >
        <TimeSeriesChart series={restartSeries} />
      </Card>
    </div>
  );
}

function FleetHeatmap({
  clusters,
  clusterRoles,
  lens,
  onLensChange,
  onOpen,
}: {
  clusters: FleetClusterSummary[];
  clusterRoles: Map<string, string>;
  lens: FleetLens;
  onLensChange: (lens: FleetLens) => void;
  onOpen: (clusterId: string) => void;
}) {
  const tiles = clusters.map(cluster => ({
    id: cluster.cluster_id,
    label: cluster.name,
    size: cluster.pods_total || 1,
    health: cluster.health,
    badge: clusterRoles.get(cluster.cluster_id) === 'management' ? <Badge tone="info">관리 클러스터</Badge> : undefined,
    meta: (
      <>
        <span>{heatSummary(cluster, lens)}</span>
        <span className="text-caption text-muted">팟 {cluster.pods_running}/{cluster.pods_total} · 노드 {cluster.nodes_ready}/{cluster.nodes_total}</span>
      </>
    ),
  }));
  return (
    <Card
      title="플릿 맵"
      actions={<Tabs items={FLEET_LENSES.map(item => ({ value: item.key, label: item.label }))} value={lens} onValueChange={value => onLensChange(value as FleetLens)} />}
    >
      <DrilldownHeatmap
        tiles={tiles}
        breadcrumb={[{ id: 'fleet', label: 'fleet' }]}
        onTileClick={tile => onOpen(tile.id)}
      />
    </Card>
  );
}

function RecentIncidentCard({ query, pathFor }: { query: ReturnType<typeof useTimeline>; pathFor: (to: string) => string }) {
  const items = query.data ?? [];
  return (
    <Card
      title="최근 인시던트"
      actions={<Link to={pathFor('/incidents')}><Button size="sm">전체 보기</Button></Link>}
      loading={query.isPending}
      error={query.isError ? query.error as Error : null}
      onRetry={() => void query.refetch()}
      empty={items.length === 0 ? <EmptyState title="열린 인시던트 없음" icon={<ShieldIcon />} /> : undefined}
    >
      <div className="grid gap-2">
        {items.slice(0, 5).map(item => (
          <Link key={item.incident_id} to={pathFor(`/incidents/${item.incident_id}`)} className="grid gap-2 rounded-panel border border-border bg-bg p-3 transition-colors hover:bg-raised">
            <span className="flex min-w-0 items-center gap-2">
              <Badge tone="danger">{item.stage}</Badge>
              <span className="min-w-0 truncate text-body font-medium text-primary">{item.summary}</span>
            </span>
            <span className="text-caption text-muted">{timeAgo(item.at)}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function ApprovalCard({ approvals, pathFor }: { approvals: ReturnType<typeof useNotices>['notices']; pathFor: (to: string) => string }) {
  return (
    <Card
      title="승인 대기 배포"
      actions={<Link to={pathFor('/workflows')}><Button size="sm">워크플로우</Button></Link>}
      empty={approvals.length === 0 ? <EmptyState title="승인 대기 없음" icon={<SendIcon />} /> : undefined}
    >
      <div className="grid gap-2">
        {approvals.map(approval => (
          <Link key={approval.id} to={pathFor(approval.link)} className="grid gap-2 rounded-panel border border-border bg-bg p-3 transition-colors hover:bg-raised">
            <span className="flex min-w-0 items-center gap-2">
              <Badge tone="warning">승인</Badge>
              <span className="min-w-0 truncate text-body font-medium text-primary">{approval.title}</span>
            </span>
            <span className="text-caption text-muted">{approval.at ? timeAgo(approval.at) : ''}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function RecentConversationCard({ query, pathFor }: { query: ReturnType<typeof useConversations>; pathFor: (to: string) => string }) {
  const conversations = query.data ?? [];
  return (
    <Card
      title="최근 AI 대화"
      actions={<Link to={pathFor('/ai')}><Button size="sm">전체 보기</Button></Link>}
      loading={query.isPending}
      error={query.isError ? query.error as Error : null}
      onRetry={() => void query.refetch()}
      empty={conversations.length === 0 ? <EmptyState title="대화 없음" icon={<TerminalIcon />} /> : undefined}
    >
      <div className="grid gap-2">
        {conversations.slice(0, 3).map(conversation => (
          <Link key={conversation.conversation_id} to={pathFor(`/ai/${conversation.conversation_id}`)} className="flex min-w-0 items-center justify-between gap-3 rounded-panel border border-border bg-bg p-3 transition-colors hover:bg-raised">
            <span className="min-w-0 truncate text-body font-medium text-primary">{conversation.title}</span>
            <span className="shrink-0 text-caption text-muted">{timeAgo(conversation.updated_at)}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function HealthBadge({ health }: { health: FleetHealth | string }) {
  return <Badge tone={HEALTH_TONE[health as FleetHealth] ?? 'neutral'}>{healthLabel(health)}</Badge>;
}

function pct(value: number | null): string {
  return value == null ? '미확인' : `${Math.round(value)}%`;
}

function avgMetric(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => typeof value === 'number');
  if (!known.length) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

function heatSummary(cluster: FleetClusterSummary, lens: FleetLens): string {
  if (lens === 'cpu') return `CPU ${pct(cluster.cpu_pct)}`;
  if (lens === 'memory') return `메모리 ${pct(cluster.mem_pct)}`;
  if (lens === 'incidents') return `인시던트 ${cluster.open_incidents.toLocaleString()}건`;
  return `상태 ${healthLabel(cluster.health)}`;
}

type IconProps = SVGProps<SVGSVGElement>;

function iconProps(props: IconProps = {}): IconProps {
  return {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  };
}

function PlusIcon(props: IconProps) {
  return <svg {...iconProps(props)}><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
}

function GlobeIcon(props: IconProps) {
  return <svg {...iconProps(props)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.2 2.3 3.2 5.3 3.2 9S14.2 18.7 12 21" /><path d="M12 3c-2.2 2.3-3.2 5.3-3.2 9s1 6.7 3.2 9" /></svg>;
}

function ShieldIcon(props: IconProps) {
  return <svg {...iconProps(props)}><path d="M12 3.5 5 6v5.7c0 4.2 2.8 7.1 7 8.8 4.2-1.7 7-4.6 7-8.8V6z" /><path d="m9 12 2 2 4-4" /></svg>;
}

function SendIcon(props: IconProps) {
  return <svg {...iconProps(props)}><path d="M21 3 10.5 13.5" /><path d="m21 3-6.5 18-4-7.5L3 9.5 21 3Z" /></svg>;
}

function ChartIcon(props: IconProps) {
  return <svg {...iconProps(props)}><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 3 5-7" /></svg>;
}

function TerminalIcon(props: IconProps) {
  return <svg {...iconProps(props)}><path d="m5 8 4 4-4 4" /><path d="M11 17h8" /><rect x="3" y="4" width="18" height="16" rx="2" /></svg>;
}
