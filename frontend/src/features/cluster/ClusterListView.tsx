import { useMemo, useState } from 'react';
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  Globe2Icon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIsAdmin } from '@/features/auth/api';
import { useClusters } from '@/features/cluster/api';
import { clusterConnectionMeta, connectedStatuses, type ConnectionMeta } from '@/features/cluster/status';
import { useConsolePath } from '@/features/console/ui';
import { RegisterClusterWizard } from '@/features/resources/RegisterClusterWizard';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/shared/lib/format';
import type { Cluster } from '@/shared/lib/types';

type SortDirection = 'asc' | 'desc';
type SortKey = 'name' | 'environment' | 'connection' | 'nodes' | 'pods' | 'incidents' | 'registered';

const columns: Array<{ key: SortKey; label: string; align?: 'right' }> = [
  { key: 'name', label: '이름' },
  { key: 'environment', label: '환경' },
  { key: 'connection', label: '연결' },
  { key: 'nodes', label: '노드', align: 'right' },
  { key: 'pods', label: '팟', align: 'right' },
  { key: 'incidents', label: '인시던트', align: 'right' },
  { key: 'registered', label: '등록' },
];

export default function ClusterListView() {
  const query = useClusters();
  const navigate = useNavigate();
  const pathFor = useConsolePath();
  const admin = useIsAdmin();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const clusters = useMemo(() => query.data ?? [], [query.data]);
  const normalizedSearch = search.trim().toLowerCase();

  const filteredClusters = useMemo(() => {
    if (!normalizedSearch) return clusters;
    const tokens = normalizedSearch.split(/\s+/);
    return clusters.filter((cluster) => {
      const connectionLabel = clusterConnectionMeta(cluster.connection_status).label;
      const haystack = `${cluster.name} ${cluster.cluster_id} ${cluster.environment} ${cluster.role} ${connectionLabel}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [clusters, normalizedSearch]);

  const visibleClusters = useMemo(() => {
    if (!sort) return filteredClusters;
    return [...filteredClusters].sort((left, right) => {
      const leftValue = sortValue(left, sort.key);
      const rightValue = sortValue(right, sort.key);
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredClusters, sort]);

  const stats = useMemo(() => {
    const connected = clusters.filter((cluster) => connectedStatuses.has(cluster.connection_status)).length;
    return {
      connected,
      disconnected: clusters.length - connected,
      incidents: clusters.reduce((sum, cluster) => sum + cluster.incident_count, 0),
      nodes: clusters.reduce((sum, cluster) => sum + cluster.node_count, 0),
      pods: clusters.reduce((sum, cluster) => sum + cluster.pod_count, 0),
    };
  }, [clusters]);

  const statItems = [
    {
      label: '전체 클러스터',
      value: clusters.length,
      detail: `${stats.connected.toLocaleString()} 연결`,
      tone: stats.disconnected > 0 ? 'text-warning' : 'text-success',
    },
    {
      label: '열린 인시던트',
      value: stats.incidents,
      detail: stats.incidents > 0 ? '주의' : '정상',
      tone: stats.incidents > 0 ? 'text-danger' : 'text-success',
    },
    { label: '노드', value: stats.nodes, detail: '인벤토리', tone: 'text-text-muted' },
    { label: '팟', value: stats.pods, detail: '인벤토리', tone: 'text-text-muted' },
  ];

  const updateSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <div className="grid gap-6">
      <header className="flex min-w-0 items-center justify-between gap-4">
        <h1 className="truncate text-page font-semibold text-text-primary">클러스터</h1>
        {admin && (
          <Button type="button" onClick={() => setWizardOpen(true)}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            클러스터 등록
          </Button>
        )}
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="클러스터 요약">
        {statItems.map((item) => (
          <Card key={item.label} className="rounded-panel border border-border bg-surface shadow-soft ring-0">
            <CardHeader>
              <CardDescription className="text-label text-text-muted">{item.label}</CardDescription>
              <CardTitle className="text-page font-semibold tabular-nums text-text-primary">
                {item.value.toLocaleString()}
              </CardTitle>
              <p className={cn('text-caption font-medium', item.tone)}>{item.detail}</p>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-title font-semibold text-text-primary">클러스터</CardTitle>
          <div className="flex flex-col gap-3 pt-3 md:flex-row md:items-center md:justify-between">
            <InputGroup className="w-full md:max-w-sm">
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="클러스터 검색"
                aria-label="클러스터 검색"
              />
            </InputGroup>
            <span className="text-label text-text-muted" role="status" aria-live="polite">
              {filteredClusters.length.toLocaleString()}개 표시
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table className="table-fixed bg-surface">
            <TableHeader className="bg-raised text-label text-text-muted">
              <TableRow className="hover:bg-raised">
                {columns.map((column) => {
                  const active = sort?.key === column.key;
                  const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
                  const SortIcon = active
                    ? sort.direction === 'asc' ? ArrowUpIcon : ArrowDownIcon
                    : ArrowUpDownIcon;
                  return (
                    <TableHead
                      key={column.key}
                      aria-sort={ariaSort}
                      className={cn(column.align === 'right' && 'text-right', column.key === 'name' && 'w-80')}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn('-mx-2 text-text-muted', column.align === 'right' && 'ml-auto')}
                        onClick={() => updateSort(column.key)}
                      >
                        {column.label}
                        <SortIcon data-icon="inline-end" aria-hidden="true" />
                      </Button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending && Array.from({ length: 6 }, (_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`} aria-hidden="true">
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      <Skeleton className={cn('h-5', column.key === 'name' ? 'w-40' : 'w-20')} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

              {query.isError && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="p-4 whitespace-normal">
                    <Alert variant="destructive">
                      <AlertCircleIcon aria-hidden="true" />
                      <AlertTitle>목록 조회 실패</AlertTitle>
                      <AlertDescription>{errorMessage(query.error)}</AlertDescription>
                      <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
                        다시 시도
                      </Button>
                    </Alert>
                  </TableCell>
                </TableRow>
              )}

              {!query.isPending && !query.isError && visibleClusters.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="p-8 whitespace-normal">
                    <div className="grid justify-items-center gap-3 text-center">
                      {normalizedSearch ? (
                        <SearchIcon className="size-5 text-text-muted" aria-hidden="true" />
                      ) : (
                        <Globe2Icon className="size-5 text-text-muted" aria-hidden="true" />
                      )}
                      <p className="text-body font-semibold text-text-primary">
                        {normalizedSearch ? '검색 결과 없음' : '등록된 클러스터 없음'}
                      </p>
                      {normalizedSearch ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => setSearch('')}>
                          필터 초기화
                        </Button>
                      ) : admin ? (
                        <Button type="button" size="sm" onClick={() => setWizardOpen(true)}>
                          첫 클러스터 등록
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!query.isPending && !query.isError && visibleClusters.map((cluster) => {
                const connection = clusterConnectionMeta(cluster.connection_status);
                const detailPath = pathFor(`/clusters/${cluster.cluster_id}`);
                return (
                  <TableRow
                    key={cluster.cluster_id}
                    className="cursor-pointer"
                    onClick={() => navigate(detailPath)}
                  >
                    <TableCell className="min-w-0 overflow-hidden whitespace-normal">
                      <div className="grid min-w-0 gap-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <Link
                            to={detailPath}
                            className="truncate font-semibold text-text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {cluster.name}
                          </Link>
                          {cluster.role === 'management' && (
                            <Badge variant="outline" className="border-info/40 bg-info/10 text-info">
                              관리 클러스터
                            </Badge>
                          )}
                        </span>
                        <span className="truncate text-caption text-text-muted">{cluster.cluster_id}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-border bg-raised text-text-secondary">
                        {environmentLabel(cluster.environment)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={connectionBadgeClass(connection.tone)}>
                        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                        {connection.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text-primary">
                      {cluster.node_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text-primary">
                      {cluster.pod_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {cluster.incident_count > 0 ? (
                        <Badge variant="destructive">{cluster.incident_count.toLocaleString()}</Badge>
                      ) : (
                        <span className="text-text-muted">없음</span>
                      )}
                    </TableCell>
                    <TableCell className="text-text-secondary">{timeAgo(cluster.registered_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RegisterClusterWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function sortValue(cluster: Cluster, key: SortKey): string | number {
  if (key === 'name') return cluster.name;
  if (key === 'environment') return cluster.environment;
  if (key === 'connection') return clusterConnectionMeta(cluster.connection_status).label;
  if (key === 'nodes') return cluster.node_count;
  if (key === 'pods') return cluster.pod_count;
  if (key === 'incidents') return cluster.incident_count;
  return cluster.registered_at;
}

function environmentLabel(value: string) {
  return !value || value === 'unknown' ? '미지정' : value;
}

function connectionBadgeClass(tone: ConnectionMeta['tone']) {
  if (tone === 'success') return 'border-success/40 bg-success/10 text-success';
  if (tone === 'warning') return 'border-warning/40 bg-warning/10 text-warning';
  if (tone === 'danger') return 'border-danger/40 bg-danger/10 text-danger';
  return 'border-border bg-raised text-text-secondary';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청을 완료하지 못했습니다.';
}
