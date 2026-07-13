import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClusters } from '@/features/cluster/api';
import { clusterConnectionMeta, connectedStatuses } from '@/features/cluster/status';
import { useIsAdmin } from '@/features/auth/api';
import { RegisterClusterWizard } from '@/features/resources/RegisterClusterWizard';
import { Badge, Button, Card, EmptyState, Input, PageHeader, StatCard, Table, cx, type TableColumn } from '@/ui';
import { timeAgo } from '@/shared/lib/format';
import type { Cluster } from '@/shared/lib/types';
import { useConsolePath } from '@/features/console/ui';

export default function ClusterListView() {
  const q = useClusters();
  const nav = useNavigate();
  const pathFor = useConsolePath();
  const admin = useIsAdmin();
  const [wizard, setWizard] = useState(false);
  const [search, setSearch] = useState('');
  const clusters = useMemo(() => q.data ?? [], [q.data]);
  const normalizedSearch = search.trim().toLowerCase();

  const rows = useMemo(() => {
    if (!normalizedSearch) return clusters;
    const tokens = normalizedSearch.split(/\s+/);
    return clusters.filter((cluster) => {
      const haystack = `${cluster.name} ${cluster.cluster_id} ${cluster.environment} ${cluster.role} ${clusterConnectionMeta(cluster.connection_status).label}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [clusters, normalizedSearch]);

  const stats = useMemo(() => {
    const connected = clusters.filter((cluster) => connectedStatuses.has(cluster.connection_status)).length;
    const disconnected = clusters.length - connected;
    const incidents = clusters.reduce((sum, cluster) => sum + cluster.incident_count, 0);
    const nodes = clusters.reduce((sum, cluster) => sum + cluster.node_count, 0);
    const pods = clusters.reduce((sum, cluster) => sum + cluster.pod_count, 0);
    return { connected, disconnected, incidents, nodes, pods };
  }, [clusters]);

  const columns = useMemo<TableColumn<Cluster>[]>(() => [
    {
      id: 'name',
      header: '이름',
      width: 'lg',
      sortValue: (cluster) => cluster.name,
      cell: (cluster) => (
        <div className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-primary">{cluster.name}</span>
            {cluster.role === 'management' && <Badge tone="info">관리 클러스터</Badge>}
          </span>
          <span className="truncate text-caption text-muted">{cluster.cluster_id}</span>
        </div>
      ),
    },
    {
      id: 'environment',
      header: '환경',
      sortValue: (cluster) => cluster.environment,
      cell: (cluster) => <Badge>{environmentLabel(cluster.environment)}</Badge>,
    },
    {
      id: 'connection',
      header: '연결',
      sortValue: (cluster) => clusterConnectionMeta(cluster.connection_status).label,
      cell: (cluster) => {
        const meta = clusterConnectionMeta(cluster.connection_status);
        return <Badge tone={meta.tone}>{meta.label}</Badge>;
      },
    },
    {
      id: 'nodes',
      header: '노드',
      align: 'right',
      sortValue: (cluster) => cluster.node_count,
      cell: (cluster) => <span className="tabular-nums text-primary">{cluster.node_count.toLocaleString()}</span>,
    },
    {
      id: 'pods',
      header: '팟',
      align: 'right',
      sortValue: (cluster) => cluster.pod_count,
      cell: (cluster) => <span className="tabular-nums text-primary">{cluster.pod_count.toLocaleString()}</span>,
    },
    {
      id: 'incidents',
      header: '인시던트',
      align: 'right',
      sortValue: (cluster) => cluster.incident_count,
      cell: (cluster) => (
        cluster.incident_count > 0
          ? <Badge tone="danger">{cluster.incident_count.toLocaleString()}</Badge>
          : <span className="text-muted">없음</span>
      ),
    },
    {
      id: 'registered',
      header: '등록',
      sortValue: (cluster) => cluster.registered_at,
      cell: (cluster) => <span className="text-secondary">{timeAgo(cluster.registered_at)}</span>,
    },
  ], []);

  const emptyState = normalizedSearch ? (
    <EmptyState
      icon={<SearchIcon />}
      title="검색 결과 없음"
      action={<Button size="sm" onClick={() => setSearch('')}>필터 초기화</Button>}
    />
  ) : (
    <EmptyState
      icon={<GlobeIcon />}
      title="등록된 클러스터 없음"
      action={admin ? <Button variant="primary" onClick={() => setWizard(true)}>첫 클러스터 등록</Button> : undefined}
    />
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="클러스터"
        actions={admin ? (
          <Button variant="primary" leadingIcon={<PlusIcon />} onClick={() => setWizard(true)}>
            클러스터 등록
          </Button>
        ) : undefined}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="클러스터 요약">
        <StatCard label="전체 클러스터" value={clusters.length.toLocaleString()} delta={`${stats.connected.toLocaleString()} 연결`} tone={stats.disconnected > 0 ? 'warning' : 'success'} />
        <StatCard label="열린 인시던트" value={stats.incidents.toLocaleString()} delta={stats.incidents > 0 ? '주의' : '정상'} tone={stats.incidents > 0 ? 'danger' : 'success'} />
        <StatCard label="노드" value={stats.nodes.toLocaleString()} delta="인벤토리" />
        <StatCard label="팟" value={stats.pods.toLocaleString()} delta="인벤토리" />
      </section>

      <Card title="클러스터">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="클러스터 검색"
              aria-label="클러스터 검색"
              className="ps-9"
            />
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>
          <span className="text-label text-muted">{rows.length.toLocaleString()}개 표시</span>
        </div>
        <Table
          columns={columns}
          rows={rows}
          rowKey={(cluster) => cluster.cluster_id}
          loading={q.isPending}
          error={q.isError ? q.error : null}
          empty={emptyState}
          onRetry={() => void q.refetch()}
          onRowClick={(cluster) => nav(pathFor(`/clusters/${cluster.cluster_id}`))}
        />
      </Card>

      <RegisterClusterWizard open={wizard} onClose={() => setWizard(false)} />
    </div>
  );
}

function environmentLabel(value: string) {
  if (!value || value === 'unknown') return '미지정';
  return value;
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.7 8h10.6M8 2.5c1.7 1.5 2.5 3.3 2.5 5.5S9.7 12 8 13.5C6.3 12 5.5 10.2 5.5 8S6.3 4 8 2.5z" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

function SearchIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cx('h-5 w-5', className)} aria-hidden="true">
      <path d="M7 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zM10.5 10.5 14 14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}
