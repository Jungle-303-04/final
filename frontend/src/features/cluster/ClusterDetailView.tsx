import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useClusterEvents,
  useClusters,
  useClusterSummary,
  useInventoryResourceDetail,
  usePods,
  useResources,
  useRestart,
  useScale,
  useServices,
  useWorkloads,
  type InventoryResourceIdentity,
} from '@/features/cluster/api';
import { useClusterAgg, type ClusterAggIncident } from '@/features/fleet/api';
import { useIsAdmin } from '@/features/auth/api';
import { liveStore } from '@/shared/lib/live';
import { timeAgo } from '@/shared/lib/format';
import type { ClusterSummary, InventoryResource, InventoryResourceDetail, K8sEvent, ServiceInfo, Workload, WorkloadResource } from '@/shared/lib/types';
import { useConsolePath } from '@/features/console/ui';
import { encodeChatContext } from '@/features/chat/context';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  KeyValueList,
  Modal,
  PageHeader,
  Skeleton,
  StatCard,
  Table,
  Tabs,
  cx,
  type TableColumn,
} from '@/ui';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type DetailSubject = 'node' | 'service' | 'workload';

const TABS = [
  { value: 'workloads', label: '워크로드' },
  { value: 'pods', label: '팟' },
  { value: 'nodes', label: '노드' },
  { value: 'services', label: '서비스' },
  { value: 'resources', label: '리소스' },
  { value: 'events', label: '이벤트' },
];

export default function ClusterDetailView() {
  const { clusterId = '', namespace, pod } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const pathFor = useConsolePath();
  const tab = TABS.some((item) => item.value === sp.get('tab')) ? sp.get('tab') ?? 'workloads' : 'workloads';
  const filter = sp.get('q') ?? '';
  const detailSubject = sp.get('detail') ?? '';
  const detailName = sp.get('name') ?? '';
  const detailNamespace = sp.get('namespace') ?? '';
  const detailKind = sp.get('kind') ?? '';
  const clustersQ = useClusters();
  const summaryQ = useClusterSummary(clusterId);
  const podsQ = usePods(clusterId);
  const cluster = clustersQ.data?.find((item) => item.cluster_id === clusterId);
  const snapshot = liveStore((state) => state.snapshot);
  const hotPods = useMemo(() => new Set(snapshot?.namespaces.flatMap((item) => item.pods.filter((row) => row.hot).map((row) => row.name)) ?? []), [snapshot]);
  const admin = useIsAdmin();
  const scale = useScale(clusterId);
  const restart = useRestart(clusterId);
  const [scaleTarget, setScaleTarget] = useState<DeploymentTarget | null>(null);
  const [restartTarget, setRestartTarget] = useState<DeploymentTarget | null>(null);
  const [replicas, setReplicas] = useState(2);

  const podRows = useMemo(() =>
    (podsQ.data ?? [])
      .map((row) => ({ ...row, hot: hotPods.has(row.name) || row.hot }))
      .filter((row) => textMatches(filter, row.name, row.workload_name, row.namespace, row.node, row.phase)),
    [filter, hotPods, podsQ.data]);
  const openPod = pod ? podRows.find((row) => row.name === pod && row.namespace === namespace) : null;
  const phases = summaryQ.data?.pod_phases ?? {};
  const selectedDetail = useMemo<InventoryResourceIdentity | null>(() => {
    if (openPod) return { resource_type: 'pod', kind: 'Pod', name: openPod.name, namespace: openPod.namespace };
    if (detailSubject === 'node' && detailName) return { resource_type: 'node', kind: 'Node', name: detailName };
    if (detailSubject === 'service' && detailName) return { resource_type: 'service', kind: detailKind || 'Service', name: detailName, namespace: detailNamespace || undefined };
    if (detailSubject === 'workload' && detailName) return { resource_type: 'workload', kind: detailKind || 'Deployment', name: detailName, namespace: detailNamespace || undefined };
    return null;
  }, [detailKind, detailName, detailNamespace, detailSubject, openPod]);
  const selectedServiceIdentity = selectedDetail?.resource_type === 'service' ? selectedDetail : null;
  const selectedServiceQ = useInventoryResourceDetail(clusterId, selectedServiceIdentity);
  const selectedServicePods = useMemo(() => selectedServiceQ.data?.related_pods ?? [], [selectedServiceQ.data?.related_pods]);
  const selectedServicePodKeys = useMemo(() => new Set(selectedServicePods.map((row) => `${row.namespace}/${row.name}`)), [selectedServicePods]);
  const selectedServiceNodeNames = useMemo(() => new Set(selectedServicePods.map((row) => row.node).filter((node): node is string => Boolean(node))), [selectedServicePods]);
  const nodeNamespaces = useMemo(() => {
    const byNode = new Map<string, Set<string>>();
    for (const podRow of podsQ.data ?? []) {
      if (!podRow.node) continue;
      const namespaces = byNode.get(podRow.node) ?? new Set<string>();
      namespaces.add(podRow.namespace);
      byNode.set(podRow.node, namespaces);
    }
    return byNode;
  }, [podsQ.data]);

  const setTab = (nextTab: string) => {
    const next = new URLSearchParams(sp);
    next.set('tab', nextTab);
    clearDetailParams(next);
    setSp(next);
  };
  const showTab = (nextTab: string, q?: string) => {
    const next = new URLSearchParams(sp);
    next.set('tab', nextTab);
    if (q) next.set('q', q);
    else next.delete('q');
    clearDetailParams(next);
    setSp(next);
  };
  const setFilter = (q: string) => {
    const next = new URLSearchParams(sp);
    if (q.trim()) next.set('q', q.trim());
    else next.delete('q');
    setSp(next);
  };
  const openDetail = (subject: DetailSubject, name: string, ns?: string, kind?: string) => {
    const next = new URLSearchParams(sp);
    next.set('detail', subject);
    next.set('name', name);
    if (ns) next.set('namespace', ns);
    else next.delete('namespace');
    if (kind) next.set('kind', kind);
    else next.delete('kind');
    setSp(next);
  };
  const closeDetail = () => {
    const next = new URLSearchParams(sp);
    clearDetailParams(next);
    setSp(next);
  };
  const closeResourceDetail = () => {
    if (openPod) nav(pathFor(`/clusters/${clusterId}?tab=pods`));
    else closeDetail();
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title={cluster?.name ?? clusterId}
        description="워크로드, 팟, 노드, 서비스, 이벤트를 같은 인벤토리 맥락에서 확인합니다"
        breadcrumb={<Breadcrumb items={[{ label: '클러스터', href: pathFor('/clusters') }, { label: cluster?.name ?? clusterId }]} />}
        actions={<ContextActions clusterId={clusterId} subject="cluster" subjectName={clusterId} kind="Cluster" compact />}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="클러스터 요약">
        <StatCard label="노드" value={statValue(summaryQ, summaryQ.data?.nodes.length)} spark={<MiniBars />} />
        <StatCard label="실행 팟" value={statValue(summaryQ, phases.Running)} delta="Running" tone="success" spark={<MiniBars tone="success" />} />
        <StatCard
          label="비정상 팟"
          value={statValue(summaryQ, (phases.CrashLoopBackOff ?? 0) + (phases.Pending ?? 0))}
          delta="CrashLoopBackOff · Pending"
          tone={(phases.CrashLoopBackOff ?? 0) > 0 ? 'danger' : 'neutral'}
          spark={<MiniBars tone={(phases.CrashLoopBackOff ?? 0) > 0 ? 'danger' : 'neutral'} />}
        />
        <StatCard label="서비스" value={statValue(summaryQ, summaryQ.data?.services)} spark={<MiniBars />} />
      </section>

      <ClusterAggPanel clusterId={clusterId} />
      <ContextEvents clusterId={clusterId} title="최근 클러스터 이벤트" match="" compact />

      <Card title="인벤토리 탐색" description="검색어와 탭을 조합해 관련 리소스를 좁혀봅니다">
        <div className="mb-4 grid gap-3">
          {filter && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-panel border border-border bg-raised p-3">
              <Badge tone="info">드릴다운</Badge>
              <CodeText>{filter}</CodeText>
              <Button size="sm" className="ms-auto" onClick={() => showTab(tab)}>해제</Button>
            </div>
          )}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-lg">
              <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="이름, 네임스페이스, 상태, 노드 검색" aria-label="인벤토리 검색" className="ps-9" />
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            </div>
            {selectedServiceIdentity && (
              <div className="flex shrink-0 items-center gap-2 rounded-control border border-border bg-bg px-3 py-2 text-label text-secondary">
                <Badge tone="info">selector</Badge>
                <span>{selectedServiceQ.isPending ? '확인 중' : `팟 ${selectedServicePods.length} · 노드 ${selectedServiceNodeNames.size}`}</span>
              </div>
            )}
          </div>
          <Tabs items={TABS} value={tab} onValueChange={setTab} />
        </div>

        {tab === 'workloads' && (
          <WorkloadsTab
            clusterId={clusterId}
            admin={admin}
            filter={filter}
            onInspect={(row) => openDetail('workload', row.name, row.namespace, row.kind)}
            onDrillPods={(row) => showTab('pods', row.name)}
            onScale={(row) => {
              const target = deploymentTargetFromWorkload(row);
              if (target) {
                setScaleTarget(target);
                setReplicas(target.podCount);
              }
            }}
            onRestart={(row) => {
              const target = deploymentTargetFromWorkload(row);
              if (target) setRestartTarget(target);
            }}
          />
        )}
        {tab === 'pods' && (
          <PodsTab
            query={podsQ}
            rows={podRows}
            selectedKeys={selectedServicePodKeys}
            clusterId={clusterId}
            onOpen={(row) => nav(pathFor(`/clusters/${clusterId}/pods/${row.namespace}/${row.name}?tab=pods`))}
          />
        )}
        {tab === 'nodes' && (
          <NodesTab
            query={summaryQ}
            filter={filter}
            nodeNamespaces={nodeNamespaces}
            selectedNodeNames={selectedServiceNodeNames}
            onInspect={(node) => openDetail('node', node.name, undefined, 'Node')}
          />
        )}
        {tab === 'services' && <ServicesTab clusterId={clusterId} filter={filter} onInspect={(row) => openDetail('service', row.name, row.namespace, 'Service')} />}
        {tab === 'resources' && <ResourcesTab clusterId={clusterId} filter={filter} />}
        {tab === 'events' && <EventsTab clusterId={clusterId} filter={filter} />}
      </Card>

      <ResourceDetailDrawer
        clusterId={clusterId}
        identity={selectedDetail}
        open={Boolean(selectedDetail)}
        onClose={closeResourceDetail}
        admin={admin}
        onShowPods={(name) => showTab('pods', name)}
        onShowResources={(name) => showTab('resources', name)}
        onScale={(target) => {
          setScaleTarget(target);
          setReplicas(target.podCount);
        }}
        onRestart={setRestartTarget}
      />

      <Modal
        open={Boolean(scaleTarget)}
        title={`${scaleTarget?.name ?? ''} 스케일`}
        description={`${scaleTarget?.ns ?? ''}/${scaleTarget?.name ?? ''}`}
        onOpenChange={(open) => !open && setScaleTarget(null)}
        actions={(
          <>
            <Button onClick={() => setScaleTarget(null)}>취소</Button>
            <Button
              variant="primary"
              loading={scale.isPending}
              onClick={() => scaleTarget && scale.mutate(
                { ns: scaleTarget.ns, name: scaleTarget.name, replicas },
                { onSuccess: () => setScaleTarget(null) },
              )}
            >
              실행
            </Button>
          </>
        )}
      >
        <Field label="레플리카" help={`현재 팟 ${scaleTarget?.podCount ?? 0}개`}>
          <Input type="number" min={0} max={100} value={replicas} onChange={(event) => setReplicas(Number(event.target.value))} />
        </Field>
      </Modal>

      <Modal
        open={Boolean(restartTarget)}
        title={`${restartTarget?.name ?? ''} 재시작`}
        description={`${restartTarget?.ns ?? ''}/${restartTarget?.name ?? ''} 팟 ${restartTarget?.podCount ?? 0}개 순차 재시작`}
        onOpenChange={(open) => !open && setRestartTarget(null)}
        actions={(
          <>
            <Button onClick={() => setRestartTarget(null)}>취소</Button>
            <Button
              variant="danger"
              loading={restart.isPending}
              onClick={() => restartTarget && restart.mutate(
                { ns: restartTarget.ns, name: restartTarget.name },
                { onSettled: () => setRestartTarget(null) },
              )}
            >
              재시작 실행
            </Button>
          </>
        )}
      >
        <p className="text-body text-secondary">
          파괴적 명령이므로 워크로드 상태를 확인한 뒤 실행합니다.
        </p>
      </Modal>
    </div>
  );
}

interface DeploymentTarget { ns: string; name: string; podCount: number }

export function deploymentTargetFromWorkload(workload: WorkloadResource): DeploymentTarget | null {
  if (workload.kind !== 'Deployment') return null;
  return { ns: workload.namespace, name: workload.name, podCount: workload.ready || workload.desired };
}

function WorkloadsTab({ clusterId, admin, filter, onInspect, onDrillPods, onScale, onRestart }: {
  clusterId: string;
  admin: boolean;
  filter: string;
  onInspect: (row: WorkloadResource) => void;
  onDrillPods: (row: WorkloadResource) => void;
  onScale: (row: WorkloadResource) => void;
  onRestart: (row: WorkloadResource) => void;
}) {
  const q = useWorkloads(clusterId);
  const rows = (q.data ?? []).filter((row) => textMatches(filter, row.name, row.namespace, row.kind, row.status, row.health, row.image));
  const columns = useMemo<TableColumn<WorkloadResource>[]>(() => [
    { id: 'name', header: '워크로드', width: 'lg', sortValue: (row) => row.name, cell: (row) => <span className="font-semibold text-primary">{row.name}</span> },
    { id: 'kind', header: '종류', sortValue: (row) => row.kind, cell: (row) => row.kind },
    { id: 'namespace', header: '네임스페이스', sortValue: (row) => row.namespace, cell: (row) => <NamespaceChip namespace={row.namespace} /> },
    { id: 'ready', header: 'Ready', sortValue: (row) => row.ready, cell: (row) => row.status || `${row.ready}/${row.desired}` },
    { id: 'health', header: '상태', sortValue: (row) => row.health, cell: (row) => <StatusBadge status={row.health} /> },
    {
      id: 'actions',
      header: '작업',
      width: 'lg',
      cell: (row) => (
        <div className="flex min-w-0 flex-wrap justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" disabled={!admin || row.kind !== 'Deployment'} title={admin ? '' : 'release_operator 권한 필요'} onClick={() => onScale(row)}>스케일</Button>
          <Button size="sm" variant="danger" disabled={!admin || row.kind !== 'Deployment'} title={admin ? '' : 'release_operator 권한 필요'} onClick={() => onRestart(row)}>재시작</Button>
          <Button size="sm" onClick={() => onDrillPods(row)}>팟</Button>
        </div>
      ),
    },
  ], [admin, onDrillPods, onRestart, onScale]);
  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.namespace}/${row.kind}/${row.name}`}
      loading={q.isPending}
      error={q.isError ? q.error : null}
      empty={<EmptyState icon={<BoxIcon />} title="워크로드 없음" description="조건에 맞는 워크로드가 없습니다" />}
      onRetry={() => void q.refetch()}
      onRowClick={onInspect}
    />
  );
}

function PodsTab({ query, rows, selectedKeys, clusterId, onOpen }: {
  query: ReturnType<typeof usePods>;
  rows: Workload[];
  selectedKeys: Set<string>;
  clusterId: string;
  onOpen: (row: Workload) => void;
}) {
  const columns = useMemo<TableColumn<Workload>[]>(() => [
    {
      id: 'name',
      header: '이름',
      width: 'lg',
      sortValue: (row) => row.name,
      cell: (row) => (
        <span className="inline-flex min-w-0 items-center gap-2">
          {row.hot && <FlameIcon />}
          <span className="truncate font-semibold text-primary">{row.name}</span>
        </span>
      ),
    },
    { id: 'namespace', header: '네임스페이스', sortValue: (row) => row.namespace, cell: (row) => <NamespaceChip namespace={row.namespace} /> },
    { id: 'phase', header: '상태', sortValue: (row) => row.phase, cell: (row) => <StatusBadge status={row.phase} /> },
    { id: 'restarts', header: '재시작', align: 'right', sortValue: (row) => row.restarts, cell: (row) => <span className="tabular-nums text-primary">{row.restarts.toLocaleString()}</span> },
    { id: 'node', header: '노드', sortValue: (row) => row.node ?? '', cell: (row) => row.node ?? '없음' },
    { id: 'service', header: '서비스', cell: (row) => selectedKeys.has(`${row.namespace}/${row.name}`) ? <Badge tone="info">선택</Badge> : <span className="text-muted">없음</span> },
  ], [selectedKeys]);
  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(row) => `${clusterId}/${row.namespace}/${row.name}`}
      loading={query.isPending}
      error={query.isError ? query.error : null}
      empty={<EmptyState icon={<BoxIcon />} title="팟 없음" description="조건에 맞는 팟이 없습니다" />}
      onRetry={() => void query.refetch()}
      onRowClick={onOpen}
    />
  );
}

function NodesTab({ query, filter, nodeNamespaces, selectedNodeNames, onInspect }: {
  query: ReturnType<typeof useClusterSummary>;
  filter: string;
  nodeNamespaces: Map<string, Set<string>>;
  selectedNodeNames: Set<string>;
  onInspect: (node: ClusterSummary['nodes'][number]) => void;
}) {
  const rows = (query.data?.nodes ?? []).filter((node) => nodeMatches(node, filter, nodeNamespaces));
  const columns = useMemo<TableColumn<ClusterSummary['nodes'][number]>[]>(() => [
    {
      id: 'name',
      header: '이름',
      width: 'lg',
      sortValue: (node) => node.name,
      cell: (node) => (
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-primary">{node.name}</span>
          {selectedNodeNames.has(node.name) && <Badge tone="info">서비스 팟</Badge>}
        </span>
      ),
    },
    { id: 'ready', header: '상태', sortValue: (node) => String(node.ready), cell: (node) => <Badge tone={node.ready ? 'success' : 'danger'}>{node.ready ? 'Ready' : 'NotReady'}</Badge> },
    { id: 'pods', header: '팟 수', align: 'right', sortValue: (node) => node.pod_count, cell: (node) => <span className="tabular-nums text-primary">{node.pod_count.toLocaleString()}</span> },
    { id: 'namespaces', header: '네임스페이스', width: 'lg', cell: (node) => <NamespaceCluster namespaces={[...(nodeNamespaces.get(node.name) ?? [])]} /> },
    { id: 'cpu', header: 'CPU', align: 'right', sortValue: (node) => node.cpu_ratio ?? -1, cell: (node) => ratioText(node.cpu_ratio) },
    { id: 'memory', header: 'MEM', align: 'right', sortValue: (node) => node.mem_ratio ?? -1, cell: (node) => ratioText(node.mem_ratio) },
    { id: 'version', header: '버전', sortValue: (node) => node.version, cell: (node) => node.version || '없음' },
  ], [nodeNamespaces, selectedNodeNames]);
  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(node) => node.name}
      loading={query.isPending}
      error={query.isError ? query.error : null}
      empty={<EmptyState icon={<ServerIcon />} title="노드 없음" description="조건에 맞는 노드가 없습니다" />}
      onRetry={() => void query.refetch()}
      onRowClick={onInspect}
    />
  );
}

function ServicesTab({ clusterId, filter, onInspect }: { clusterId: string; filter: string; onInspect: (service: ServiceInfo) => void }) {
  const q = useServices(clusterId);
  const rows = (q.data ?? []).filter((row) => serviceMatches(row, filter));
  const columns = useMemo<TableColumn<ServiceInfo>[]>(() => [
    { id: 'name', header: '이름', width: 'lg', sortValue: (row) => row.name, cell: (row) => <span className="font-semibold text-primary">{row.name}</span> },
    { id: 'namespace', header: '네임스페이스', sortValue: (row) => row.namespace, cell: (row) => <NamespaceChip namespace={row.namespace} /> },
    { id: 'type', header: '타입', sortValue: (row) => row.type, cell: (row) => row.type || '없음' },
    { id: 'ip', header: 'ClusterIP', sortValue: (row) => row.cluster_ip, cell: (row) => <CodeText>{row.cluster_ip || '없음'}</CodeText> },
    { id: 'ports', header: '포트', cell: (row) => row.ports || '없음' },
    { id: 'selector', header: 'Selector', width: 'lg', cell: (row) => <LabelChips labels={row.selector} /> },
  ], []);
  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.namespace}/${row.name}`}
      loading={q.isPending}
      error={q.isError ? q.error : null}
      empty={<EmptyState icon={<RouteIcon />} title="서비스 없음" description="조건에 맞는 서비스가 없습니다" />}
      onRetry={() => void q.refetch()}
      onRowClick={onInspect}
    />
  );
}

function ResourcesTab({ clusterId, filter }: { clusterId: string; filter: string }) {
  const q = useResources(clusterId);
  const rows = (q.data ?? []).filter((row) => textMatches(filter, row.name, row.namespace, row.kind, row.status, row.health, ...Object.values(row.labels)));
  const columns = useMemo<TableColumn<InventoryResource>[]>(() => [
    { id: 'kind', header: '종류', sortValue: (row) => row.kind, cell: (row) => row.kind },
    { id: 'namespace', header: '네임스페이스', sortValue: (row) => row.namespace ?? '', cell: (row) => <NamespaceChip namespace={row.namespace} /> },
    { id: 'name', header: '이름', width: 'lg', sortValue: (row) => row.name, cell: (row) => <span className="font-semibold text-primary">{row.name}</span> },
    { id: 'status', header: '상태', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status || row.health} /> },
    { id: 'age', header: 'Age', sortValue: (row) => row.age, cell: (row) => row.age || '없음' },
  ], []);
  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.kind}/${row.namespace ?? 'cluster'}/${row.name}`}
      loading={q.isPending}
      error={q.isError ? q.error : null}
      empty={<EmptyState icon={<BoxIcon />} title="리소스 없음" description="조건에 맞는 리소스가 없습니다" />}
      onRetry={() => void q.refetch()}
    />
  );
}

function EventsTab({ clusterId, filter }: { clusterId: string; filter: string }) {
  const q = useClusterEvents(clusterId);
  const rows = (q.data ?? []).filter((row) => textMatches(filter, row.reason, row.target, row.message, row.type));
  const columns = useMemo<TableColumn<K8sEvent>[]>(() => [
    { id: 'at', header: '시각', sortValue: (row) => row.at, cell: (row) => timeAgo(row.at) || '없음' },
    { id: 'type', header: '타입', sortValue: (row) => row.type, cell: (row) => <Badge tone={row.type === 'Warning' ? 'warning' : 'neutral'}>{row.type || 'Normal'}</Badge> },
    { id: 'reason', header: '사유', sortValue: (row) => row.reason, cell: (row) => row.reason || '없음' },
    { id: 'target', header: '대상', width: 'lg', sortValue: (row) => row.target, cell: (row) => <CodeText>{row.target || '없음'}</CodeText> },
    { id: 'message', header: '메시지', width: 'lg', cell: (row) => row.message || '없음' },
  ], []);
  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(row, index) => `${row.at}/${row.reason}/${index}`}
      loading={q.isPending}
      error={q.isError ? q.error : null}
      empty={<EmptyState icon={<FileIcon />} title="이벤트 없음" description="조건에 맞는 이벤트가 없습니다" />}
      onRetry={() => void q.refetch()}
    />
  );
}

function ResourceDetailDrawer({ clusterId, identity, open, onClose, admin, onShowPods, onShowResources, onScale, onRestart }: {
  clusterId: string;
  identity: InventoryResourceIdentity | null;
  open: boolean;
  onClose: () => void;
  admin: boolean;
  onShowPods: (name: string) => void;
  onShowResources: (name: string) => void;
  onScale: (target: DeploymentTarget) => void;
  onRestart: (target: DeploymentTarget) => void;
}) {
  const q = useInventoryResourceDetail(clusterId, identity);
  const title = identity ? `${identity.kind}/${identity.name}` : '리소스';
  return (
    <Drawer open={open} title={title} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      {q.isPending ? (
        <Skeleton lines={6} />
      ) : q.isError ? (
        <EmptyState title="상세 조회 실패" description={(q.error as Error).message} action={<Button size="sm" onClick={() => q.refetch()}>다시 시도</Button>} />
      ) : q.data ? (
        <ResourceDetailBody
          clusterId={clusterId}
          detail={q.data}
          admin={admin}
          onShowPods={onShowPods}
          onShowResources={onShowResources}
          onScale={onScale}
          onRestart={onRestart}
        />
      ) : (
        <EmptyState title="상세 없음" description="표시할 리소스 상세가 없습니다" />
      )}
    </Drawer>
  );
}

function ResourceDetailBody({ clusterId, detail, admin, onShowPods, onShowResources, onScale, onRestart }: {
  clusterId: string;
  detail: InventoryResourceDetail;
  admin: boolean;
  onShowPods: (name: string) => void;
  onShowResources: (name: string) => void;
  onScale: (target: DeploymentTarget) => void;
  onRestart: (target: DeploymentTarget) => void;
}) {
  const resource = detail.resource;
  const deploymentTarget = deploymentTargetFromDetail(detail);
  const isService = resource.resource_type === 'service';
  return (
    <div className="grid gap-5">
      <Card title="리소스 속성">
        <KeyValueList items={resourcePairs(resource)} />
      </Card>
      <ContextActions clusterId={clusterId} subject={resource.resource_type || resource.kind.toLowerCase()} subjectName={resource.name} namespace={resource.namespace ?? undefined} kind={resource.kind} uid={resource.uid ?? undefined} />
      <DetailEvents title={`${resource.kind} 이벤트`} rows={detail.events} />
      {isService && <ServiceSelectorRelation detail={detail} />}
      {!isService && detail.related_pods.length > 0 && <RelatedPods rows={detail.related_pods} title="관련 팟" />}
      <div className="flex flex-wrap gap-2">
        {!isService && resource.resource_type !== 'pod' && detail.related_pods.length > 0 && <Button onClick={() => onShowPods(resource.name)}>팟 보기</Button>}
        {resource.resource_type === 'service' && <Button onClick={() => onShowResources(resource.name)}>리소스 보기</Button>}
        {deploymentTarget && (
          <>
            <Button disabled={!admin} onClick={() => onScale(deploymentTarget)}>스케일</Button>
            <Button variant="danger" disabled={!admin} onClick={() => onRestart(deploymentTarget)}>재시작</Button>
          </>
        )}
      </div>
    </div>
  );
}

function resourcePairs(resource: InventoryResource): Array<{ label: string; value: ReactNode }> {
  const summary = resource.summary;
  const pairs: Array<{ label: string; value: ReactNode }> = [
    { label: '상태', value: <StatusBadge status={resource.status || resource.health} /> },
    { label: 'Health', value: <StatusBadge status={resource.health} /> },
    { label: '종류', value: resource.kind },
  ];
  if (resource.namespace) pairs.push({ label: '네임스페이스', value: <NamespaceChip namespace={resource.namespace} /> });
  if (resource.resource_type === 'pod') {
    pairs.push(
      { label: '재시작', value: String(summary.restart_total ?? 0) },
      { label: '노드', value: String(summary.node_name ?? '없음') },
      { label: '이미지', value: String(summary.image ?? '없음') },
      { label: 'Ready', value: String(summary.ready ?? '없음') },
    );
  } else if (resource.resource_type === 'node') {
    pairs.push(
      { label: '팟 수', value: String(summary.pod_count ?? '없음') },
      { label: '버전', value: String(summary.version ?? '없음') },
      { label: 'CPU', value: ratioText(summary.cpu_ratio) },
      { label: 'MEM', value: ratioText(summary.mem_ratio) },
    );
  } else if (resource.resource_type === 'service') {
    pairs.push(
      { label: '타입', value: String(summary.type ?? resource.status ?? '없음') },
      { label: 'ClusterIP', value: <CodeText>{String(summary.cluster_ip ?? '없음')}</CodeText> },
      { label: '포트', value: servicePorts(summary.ports) },
      { label: 'Selector', value: <LabelChips labels={selectorRecord(summary.selector)} /> },
    );
  } else if (resource.resource_type === 'workload') {
    pairs.push(
      { label: 'Ready', value: `${summary.ready_replicas ?? 0}/${summary.desired_replicas ?? 0}` },
      { label: 'Available', value: String(summary.available_replicas ?? '없음') },
      { label: 'Updated', value: String(summary.updated_replicas ?? '없음') },
    );
  }
  return pairs;
}

function ratioText(value: unknown) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '없음';
}

function servicePorts(value: unknown) {
  if (!Array.isArray(value)) return '없음';
  return value.map((port) => {
    const item = port as Record<string, unknown>;
    return `${item.port ?? ''}${item.protocol ? `/${item.protocol}` : ''}`;
  }).filter(Boolean).join(', ') || '없음';
}

export function selectorRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const labels = raw.matchLabels && typeof raw.matchLabels === 'object' && !Array.isArray(raw.matchLabels)
    ? raw.matchLabels as Record<string, unknown>
    : raw;
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([key, item]) => key && item != null && item !== '')
      .map(([key, item]) => [key, String(item)]),
  );
}

function LabelChips({ labels }: { labels: Record<string, string> }) {
  const entries = Object.entries(labels);
  if (!entries.length) return <span className="text-muted">없음</span>;
  return (
    <span className="inline-flex min-w-0 flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <CodeText key={`${key}:${value}`}>{key}={value}</CodeText>
      ))}
    </span>
  );
}

function NamespaceChip({ namespace }: { namespace: string | null | undefined }) {
  const label = namespace || 'cluster';
  return (
    <span className={cx('inline-flex max-w-full items-center gap-2 rounded-control border px-2 py-1 text-caption font-semibold', namespaceClass(label))} title={label}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function NamespaceCluster({ namespaces }: { namespaces: string[] }) {
  if (!namespaces.length) return <span className="text-muted">없음</span>;
  const sorted = [...new Set(namespaces)].sort();
  return (
    <span className="inline-flex min-w-0 flex-wrap gap-1">
      {sorted.slice(0, 5).map((namespace) => <NamespaceChip key={namespace} namespace={namespace} />)}
      {sorted.length > 5 && <Badge>+{sorted.length - 5}</Badge>}
    </span>
  );
}

export function namespaceColor(namespace: string): string {
  return String(namespaceHash(namespace || 'cluster'));
}

function namespaceClass(namespace: string) {
  const classes = [
    'border-info/40 text-info',
    'border-success/40 text-success',
    'border-warning/40 text-warning',
    'border-danger/40 text-danger',
    'border-border text-muted',
  ];
  return classes[namespaceHash(namespace) % classes.length];
}

function namespaceHash(namespace: string) {
  let hash = 0;
  for (const char of namespace) hash = (hash * 31 + char.charCodeAt(0)) % 1000003;
  return hash;
}

function deploymentTargetFromDetail(detail: InventoryResourceDetail): DeploymentTarget | null {
  const resource = detail.resource;
  if (resource.resource_type !== 'workload' || resource.kind !== 'Deployment' || !resource.namespace) return null;
  return {
    ns: resource.namespace,
    name: resource.name,
    podCount: detail.related_pods.length || Number(resource.summary.ready_replicas ?? resource.summary.desired_replicas ?? 0),
  };
}

function DetailEvents({ title, rows }: { title: string; rows: K8sEvent[] }) {
  if (!rows.length) return (
    <Card title={title} empty={<EmptyState icon={<FileIcon />} title="이벤트 없음" description="이 리소스에 연결된 이벤트가 없습니다" />}>
      <span />
    </Card>
  );
  const columns: TableColumn<K8sEvent>[] = [
    { id: 'reason', header: '사유', cell: (row) => <Badge tone={row.type === 'Warning' ? 'warning' : 'neutral'}>{row.reason || row.type}</Badge> },
    { id: 'message', header: '메시지', width: 'lg', cell: (row) => row.message || row.target },
    { id: 'at', header: '시각', cell: (row) => timeAgo(row.at) || '없음' },
  ];
  return (
    <Card title={title}>
      <Table columns={columns} rows={rows.slice(0, 8)} rowKey={(row, index) => `${row.at}/${row.reason}/${index}`} />
    </Card>
  );
}

function ServiceSelectorRelation({ detail }: { detail: InventoryResourceDetail }) {
  const selector = selectorRecord(detail.resource.summary.selector);
  const nodes = [...new Set(detail.related_pods.map((row) => row.node).filter((node): node is string => Boolean(node)))].sort();
  const hasSelector = Object.keys(selector).length > 0;
  return (
    <Card title="selector 매칭" description={hasSelector ? undefined : '서비스 selector가 없습니다'}>
      <div className="grid gap-4">
        {hasSelector && <LabelChips labels={selector} />}
        {!hasSelector && <EmptyState icon={<FileIcon />} title="selector 없음" />}
        {hasSelector && detail.related_pods.length === 0 && <EmptyState icon={<FileIcon />} title="매칭된 팟 없음" />}
        {detail.related_pods.length > 0 && (
          <>
            <RelatedPods rows={detail.related_pods} title="선택된 팟" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-label font-semibold text-muted">호스팅 노드</span>
              {nodes.map((node) => <Badge key={node} tone="info">{node}</Badge>)}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function RelatedPods({ rows, title }: { rows: Workload[]; title: string }) {
  const columns: TableColumn<Workload>[] = [
    { id: 'name', header: '이름', width: 'lg', cell: (row) => <span className="font-semibold text-primary">{row.name}</span> },
    { id: 'namespace', header: '네임스페이스', cell: (row) => <NamespaceChip namespace={row.namespace} /> },
    { id: 'phase', header: '상태', cell: (row) => <StatusBadge status={row.phase} /> },
    { id: 'restart', header: '재시작', align: 'right', cell: (row) => <span className="tabular-nums text-primary">{row.restarts.toLocaleString()}</span> },
    { id: 'node', header: '노드', cell: (row) => row.node ?? '없음' },
  ];
  return (
    <Card title={title}>
      <Table columns={columns} rows={rows.slice(0, 8)} rowKey={(row) => `${row.namespace}/${row.name}`} />
    </Card>
  );
}

function ContextActions({ clusterId, subject, subjectName, namespace, kind, uid, compact = false }: {
  clusterId: string;
  subject: string;
  subjectName: string;
  namespace?: string;
  kind?: string;
  uid?: string;
  compact?: boolean;
}) {
  const hrefs = contextActionHrefs(clusterId, subject, subjectName, namespace, kind, uid);
  const pathFor = useConsolePath();
  const nav = useNavigate();
  const open = (href: string) => nav(pathFor(href));
  return (
    <div className={cx('flex flex-wrap gap-2', !compact && 'pt-1')}>
      <Button size={compact ? 'sm' : 'md'} onClick={() => open(hrefs.events)}>이벤트</Button>
      <Button size={compact ? 'sm' : 'md'} onClick={() => open(hrefs.metrics)}>메트릭</Button>
      <Button size={compact ? 'sm' : 'md'} variant="primary" onClick={() => open(hrefs.ai)}>AI 분석</Button>
    </div>
  );
}

export function contextActionHrefs(clusterId: string, subject: string, subjectName: string, namespace?: string, kind?: string, uid?: string) {
  const prefill = `${clusterId} ${namespace ? `${namespace}/` : ''}${subjectName} ${subject} 상태 분석`;
  const metricParams = new URLSearchParams({ cluster: clusterId, subject, name: subjectName });
  if (namespace) metricParams.set('namespace', namespace);
  const eventParams = new URLSearchParams({ tab: 'events' });
  if (subject !== 'cluster') eventParams.set('q', subjectName);
  const aiParams = new URLSearchParams({ prefill });
  const context = encodeChatContext({
    cluster_id: clusterId,
    resource_type: subject,
    kind,
    namespace,
    name: subjectName,
    uid,
  });
  if (context) aiParams.set('context', context);
  return {
    events: `/clusters/${clusterId}?${eventParams.toString()}`,
    metrics: `/metrics?${metricParams.toString()}`,
    ai: `/ai?${aiParams.toString()}`,
  };
}

function ContextEvents({ clusterId, title, match, compact = false }: { clusterId: string; title: string; match: string; compact?: boolean }) {
  const q = useClusterEvents(clusterId);
  const key = match.toLowerCase();
  const rows = (q.data ?? []).filter(eventMatches(key)).slice(0, compact ? 3 : 8);
  const columns: TableColumn<K8sEvent>[] = [
    { id: 'reason', header: '사유', cell: (row) => <Badge tone={row.type === 'Warning' ? 'warning' : 'neutral'}>{row.reason || row.type}</Badge> },
    { id: 'message', header: '메시지', width: 'lg', cell: (row) => row.message || row.target },
    { id: 'at', header: '시각', cell: (row) => timeAgo(row.at) || '없음' },
  ];
  return (
    <Card
      title={title}
      loading={q.isPending}
      error={q.isError ? q.error : null}
      onRetry={() => void q.refetch()}
      empty={rows.length === 0 ? <EmptyState icon={<FileIcon />} title="최근 이벤트 없음" description="표시할 클러스터 이벤트가 없습니다" /> : undefined}
    >
      <Table columns={columns} rows={rows} rowKey={(row, index) => `${row.at}/${row.reason}/${index}`} />
    </Card>
  );
}

function eventMatches(key: string) {
  return (event: K8sEvent) => !key ||
    event.target.toLowerCase().includes(key) ||
    event.message.toLowerCase().includes(key) ||
    event.reason.toLowerCase().includes(key);
}

export function textMatches(filter: string, ...values: Array<string | number | boolean | null | undefined>) {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value ?? '').toLowerCase().includes(needle));
}

export function serviceMatches(service: ServiceInfo, filter: string) {
  return textMatches(
    filter,
    service.name,
    service.namespace,
    service.type,
    service.cluster_ip,
    service.ports,
    ...Object.entries(service.selector).flatMap(([key, value]) => [key, value, `${key}=${value}`]),
  );
}

function nodeMatches(node: ClusterSummary['nodes'][number], filter: string, nodeNamespaces: Map<string, Set<string>>) {
  return textMatches(
    filter,
    node.name,
    node.ready ? 'ready' : 'notready',
    node.pod_count,
    node.version,
    ...[...(nodeNamespaces.get(node.name) ?? [])],
  );
}

function ClusterAggPanel({ clusterId }: { clusterId: string }) {
  const aggQ = useClusterAgg(clusterId);
  const pathFor = useConsolePath();
  const agg = aggQ.data;
  const usage = agg?.usage;
  const incidents = agg?.open_incidents ?? [];
  return (
    <Card
      title="집계 요약"
      description="사용량과 열린 인시던트를 한 번에 확인합니다"
      loading={aggQ.isPending}
      error={aggQ.isError ? aggQ.error : null}
      onRetry={() => void aggQ.refetch()}
    >
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-4">
          <MetricPill label="CPU" value={usage?.cpu_pct != null ? `${Math.round(usage.cpu_pct)}%` : '없음'} tone={usage?.cpu_pct != null && usage.cpu_pct >= 85 ? 'danger' : 'neutral'} />
          <MetricPill label="MEM" value={usage?.mem_pct != null ? `${Math.round(usage.mem_pct)}%` : '없음'} tone={usage?.mem_pct != null && usage.mem_pct >= 85 ? 'danger' : 'neutral'} />
          <MetricPill label="재시작 누적" value={usage?.restarts_total ?? '없음'} />
          <MetricPill label="열린 인시던트" value={incidents.length} tone={incidents.length ? 'danger' : 'success'} />
        </div>
        {incidents.length === 0 ? (
          <EmptyState icon={<ShieldIcon />} title="열린 인시던트 없음" description="이 클러스터에 연결된 열린 인시던트가 없습니다" />
        ) : (
          <IncidentList incidents={incidents} pathFor={pathFor} />
        )}
      </div>
    </Card>
  );
}

function IncidentList({ incidents, pathFor }: { incidents: ClusterAggIncident[]; pathFor: (to: string) => string }) {
  return (
    <div className="grid gap-2">
      {incidents.slice(0, 5).map((incident) => (
        <Link
          key={incident.id}
          to={pathFor(`/incidents/${incident.id}`)}
          className="flex min-w-0 items-center gap-3 rounded-control border border-border bg-bg px-3 py-2 text-body transition-colors hover:bg-raised"
        >
          <StatusBadge status={incident.status} />
          <span className="min-w-0 flex-1 truncate text-primary">
            {incident.symptom}{incident.root_cause ? ` - ${incident.root_cause}` : ''}
          </span>
          <span className="shrink-0 text-caption text-muted">{incident.created_at ? timeAgo(incident.created_at) : ''}</span>
        </Link>
      ))}
    </div>
  );
}

function MetricPill({ label, value, tone = 'neutral' }: { label: string; value: ReactNode; tone?: BadgeTone }) {
  return (
    <div className="rounded-panel border border-border bg-bg p-3">
      <p className="text-label font-medium text-muted">{label}</p>
      <p className={cx('mt-1 text-title font-semibold tabular-nums', toneText(tone))}>{value}</p>
    </div>
  );
}

function statValue(query: { isPending: boolean; isError: boolean }, value: number | undefined) {
  if (query.isPending) return '확인 중';
  if (query.isError) return '오류';
  return (value ?? 0).toLocaleString();
}

function StatusBadge({ status, label }: { status: string; label?: string }) {
  const meta = statusMeta(status);
  return <Badge tone={meta.tone}>{label ?? meta.label}</Badge>;
}

function statusMeta(status: string): { label: string; tone: BadgeTone } {
  const key = String(status || 'unknown').toLowerCase();
  if (['healthy', 'ok', 'ready', 'running', 'connected', 'online', 'normal', 'succeeded', 'available'].includes(key)) return { label: statusLabel(status, '정상'), tone: 'success' };
  if (['warning', 'warn', 'pending', 'stale', 'degraded', 'waiting', 'unknown', 'not_registered', 'never_connected'].includes(key)) return { label: statusLabel(status, '주의'), tone: 'warning' };
  if (['critical', 'danger', 'failed', 'error', 'crashloopbackoff', 'notready', 'disconnected', 'blocked'].includes(key)) return { label: statusLabel(status, '심각'), tone: 'danger' };
  if (['info', 'progressing', 'applying'].includes(key)) return { label: statusLabel(status, '정보'), tone: 'info' };
  return { label: status || '미확인', tone: 'neutral' };
}

function statusLabel(status: string, fallback: string) {
  const labels: Record<string, string> = {
    healthy: '정상',
    ok: '정상',
    ready: 'Ready',
    running: 'Running',
    connected: '연결',
    online: '연결',
    normal: 'Normal',
    warning: '주의',
    warn: '주의',
    pending: '대기',
    stale: '지연',
    degraded: '저하',
    waiting: '대기',
    unknown: '미확인',
    never_connected: '미연결',
    critical: '심각',
    danger: '심각',
    failed: '실패',
    error: '오류',
    crashloopbackoff: 'CrashLoopBackOff',
    notready: 'NotReady',
    disconnected: '끊김',
  };
  return labels[String(status).toLowerCase()] ?? status ?? fallback;
}

function toneText(tone: BadgeTone) {
  return {
    neutral: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
  }[tone];
}

function CodeText({ children }: { children: ReactNode }) {
  return (
    <code className="inline-flex max-w-full items-center truncate rounded-control border border-border bg-raised px-2 py-1 font-mono text-caption text-secondary">
      {children}
    </code>
  );
}

function MiniBars({ tone = 'neutral' }: { tone?: 'neutral' | 'success' | 'danger' }) {
  return (
    <div className={cx('flex h-full items-end gap-1 px-2 py-2', tone === 'success' && 'text-success', tone === 'danger' && 'text-danger', tone === 'neutral' && 'text-muted')}>
      <span className="h-4 w-full rounded-control bg-current opacity-30" />
      <span className="h-6 w-full rounded-control bg-current opacity-50" />
      <span className="h-5 w-full rounded-control bg-current opacity-40" />
      <span className="h-7 w-full rounded-control bg-current opacity-70" />
      <span className="h-6 w-full rounded-control bg-current opacity-60" />
    </div>
  );
}

function clearDetailParams(params: URLSearchParams) {
  params.delete('detail');
  params.delete('name');
  params.delete('namespace');
  params.delete('kind');
}

function SearchIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cx('h-5 w-5', className)} aria-hidden="true">
      <path d="M7 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zM10.5 10.5 14 14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-warning" aria-hidden="true">
      <path d="M8.3 2.4c.5 2-.8 2.8-1.6 4 .8-.4 1.5-.9 2-1.8 1.8 1.3 2.8 2.9 2.8 4.7a3.6 3.6 0 0 1-7.2 0c0-1.5.9-2.7 2.1-4 .5-.6 1.1-1.5 1.9-2.9z" fill="currentColor" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="m2.5 5 5.5-3 5.5 3v6L8 14l-5.5-3V5zM2.8 5.2 8 8.1l5.2-2.9M8 8.1v5.5" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.3" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M3 3.5h10v3H3zM3 9.5h10v3H3zM5 5h.5M5 11h.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M4 4h3a3 3 0 0 1 0 6H4M12 12H9a3 3 0 0 1 0-6h3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M4 2.5h5L12.5 6v7.5H4zM9 2.8V6h3.2" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M8 2.5 12.5 4v3.4c0 2.8-1.7 5-4.5 6.1-2.8-1.1-4.5-3.3-4.5-6.1V4z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}
