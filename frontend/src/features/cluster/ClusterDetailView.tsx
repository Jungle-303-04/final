import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useClusterEvents, useClusters, useClusterSummary, useInventoryResourceDetail, usePods, useResources, useRestart, useScale, useServices, useWorkloads, type InventoryResourceIdentity } from '@/features/cluster/api';
import { useClusterAgg } from '@/features/fleet/api';
import { useIsAdmin } from '@/features/auth/api';
import { Badge, Breadcrumbs, Button, Card, Drawer, EmptyState, KeyValue, Modal, QueryBoundary, ResourceTable, StatBox, Tabs } from '@/shared/ui';
import { liveStore } from '@/shared/lib/live';
import { timeAgo } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import { IconFile, IconFlame } from '@/shared/ui/icons';
import type { InventoryResource, InventoryResourceDetail, K8sEvent, ServiceInfo, Workload, WorkloadResource } from '@/shared/lib/types';
import { useConsolePath } from '@/features/console/ui';
import { encodeChatContext } from '@/features/chat/context';

const TABS = [
  { key: 'workloads', label: '워크로드' }, { key: 'pods', label: '팟' }, { key: 'nodes', label: '노드' },
  { key: 'services', label: '서비스' }, { key: 'resources', label: '리소스' }, { key: 'events', label: '이벤트' },
];

export default function ClusterDetailView() {
  const { clusterId = '', namespace, pod } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const pathFor = useConsolePath();
  const tab = sp.get('tab') ?? 'workloads';
  const filter = sp.get('q') ?? '';
  const detailSubject = sp.get('detail') ?? '';
  const detailName = sp.get('name') ?? '';
  const detailNamespace = sp.get('namespace') ?? '';
  const detailKind = sp.get('kind') ?? '';
  const clustersQ = useClusters();
  const summaryQ = useClusterSummary(clusterId);
  const podsQ = usePods(clusterId);
  const cluster = clustersQ.data?.find(c => c.cluster_id === clusterId);
  const snapshot = liveStore(s => s.snapshot);
  // selector 에서 새 객체 생성 금지(무한 리렌더) — 파생은 useMemo
  const hotPods = useMemo(() => new Set(snapshot?.namespaces.flatMap(n => n.pods.filter(p => p.hot).map(p => p.name)) ?? []), [snapshot]);
  const admin = useIsAdmin();
  const scale = useScale(clusterId);
  const restart = useRestart(clusterId);
  const [scaleTarget, setScaleTarget] = useState<DeploymentTarget | null>(null);
  const [restartTarget, setRestartTarget] = useState<DeploymentTarget | null>(null);
  const [replicas, setReplicas] = useState(2);

  const podRows = useMemo(() =>
    (podsQ.data ?? []).map(w => ({ ...w, hot: hotPods.has(w.name) || w.hot }))
      .filter(w => !filter || w.name.includes(filter) || w.workload_name?.includes(filter) || w.namespace === filter || w.node === filter),
    [podsQ.data, hotPods, filter]);
  const openPod = pod ? podRows.find(w => w.name === pod && w.namespace === namespace) : null;
  const phases = summaryQ.data?.pod_phases ?? {};
  const selectedDetail = useMemo<InventoryResourceIdentity | null>(() => {
    if (openPod) return { resource_type: 'pod', kind: 'Pod', name: openPod.name, namespace: openPod.namespace };
    if (detailSubject === 'node' && detailName) return { resource_type: 'node', kind: 'Node', name: detailName };
    if (detailSubject === 'service' && detailName) return { resource_type: 'service', kind: detailKind || 'Service', name: detailName, namespace: detailNamespace || undefined };
    if (detailSubject === 'workload' && detailName) return { resource_type: 'workload', kind: detailKind || 'Deployment', name: detailName, namespace: detailNamespace || undefined };
    return null;
  }, [detailKind, detailName, detailNamespace, detailSubject, openPod]);
  const setTab = (nextTab: string) => {
    const next = new URLSearchParams(sp);
    next.set('tab', nextTab);
    next.delete('detail');
    next.delete('name');
    next.delete('namespace');
    next.delete('kind');
    setSp(next);
  };
  const showTab = (nextTab: string, q?: string) => {
    const next = new URLSearchParams(sp);
    next.set('tab', nextTab);
    if (q) next.set('q', q);
    else next.delete('q');
    next.delete('detail');
    next.delete('name');
    next.delete('namespace');
    next.delete('kind');
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
    next.delete('detail');
    next.delete('name');
    next.delete('namespace');
    next.delete('kind');
    setSp(next);
  };
  const closeResourceDetail = () => {
    if (openPod) nav(pathFor(`/clusters/${clusterId}?tab=pods`));
    else closeDetail();
  };

  return (
    <FadeSlideIn>
      <Breadcrumbs items={[{ label: '클러스터', to: pathFor('/clusters') }, { label: cluster?.name ?? clusterId }]} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 16px', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {cluster?.name ?? clusterId}
          {cluster && <Badge tone="neutral">{cluster.environment}</Badge>}
          {cluster && <Badge status={cluster.connection_status} />}
        </h1>
        <ContextActions clusterId={clusterId} subject="cluster" subjectName={clusterId} kind="Cluster" />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatBox label="노드" value={summaryQ.data?.nodes.length ?? 0} />
        <StatBox label="실행 팟" value={phases['Running'] ?? 0} tone="ok" />
        <StatBox label="비정상 팟" value={(phases['CrashLoopBackOff'] ?? 0) + (phases['Pending'] ?? 0)} tone={(phases['CrashLoopBackOff'] ?? 0) > 0 ? 'danger' : 'neutral'} />
        <StatBox label="서비스" value={summaryQ.data?.services ?? 0} />
      </div>
      <ClusterAggPanel clusterId={clusterId} />
      <ContextEvents clusterId={clusterId} title="클러스터 이벤트" match="" compact />
      {filter && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: 10, minWidth: 0 }}>
          <Badge tone="info">drill</Badge>
          <code style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filter}</code>
          <span style={{ marginLeft: 'auto' }}><Button size="sm" onClick={() => showTab(tab)}>해제</Button></span>
        </div>
      )}
      <Tabs items={TABS} current={tab} onChange={setTab} />
      {tab === 'workloads' && <WorkloadsTab clusterId={clusterId} admin={admin}
        onInspect={d => openDetail('workload', d.name, d.namespace, d.kind)}
        onDrillPods={d => showTab('pods', d.name)}
        onScale={d => { const target = deploymentTargetFromWorkload(d); if (target) { setScaleTarget(target); setReplicas(target.podCount); } }}
        onRestart={d => { const target = deploymentTargetFromWorkload(d); if (target) setRestartTarget(target); }} />}
      {tab === 'pods' && (
        <Card>
          <ResourceTable<Workload>
            rows={podRows} rowKey={w => `${w.namespace}/${w.name}`}
            onRowClick={w => nav(pathFor(`/clusters/${clusterId}/pods/${w.namespace}/${w.name}?tab=pods`))}
            columns={[
              { key: 'name', label: '이름', render: w => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{w.hot && <IconFlame size={13} style={{ color: 'var(--warn)' }} />}{w.name}</span> },
              { key: 'ns', label: '네임스페이스', render: w => w.namespace },
              { key: 'phase', label: '상태', render: w => <Badge status={w.phase} /> },
              { key: 'restarts', label: '재시작', render: w => w.restarts },
              { key: 'node', label: '노드', render: w => w.node ?? '—' },
            ]}
          />
        </Card>
      )}
      {tab === 'nodes' && (
        <Card><QueryBoundary query={summaryQ}>{s => (
          <ResourceTable rows={s.nodes} rowKey={n => n.name}
            onRowClick={n => openDetail('node', n.name, undefined, 'Node')}
            columns={[
              { key: 'name', label: '이름', render: n => <b>{n.name}</b> },
              { key: 'ready', label: '상태', render: n => <Badge tone={n.ready ? 'ok' : 'danger'}>{n.ready ? 'Ready' : 'NotReady'}</Badge> },
              { key: 'pods', label: '팟 수', render: n => n.pod_count },
              { key: 'cpu', label: 'CPU', render: n => n.cpu_ratio != null ? `${(n.cpu_ratio * 100).toFixed(0)}%` : '—' },
              { key: 'mem', label: 'MEM', render: n => n.mem_ratio != null ? `${(n.mem_ratio * 100).toFixed(0)}%` : '—' },
              { key: 'ver', label: '버전', render: n => n.version },
            ]} />
        )}</QueryBoundary></Card>
      )}
      {tab === 'services' && <ServicesTab clusterId={clusterId} onInspect={s => openDetail('service', s.name, s.namespace, 'Service')} />}
      {tab === 'resources' && <ResourcesTab clusterId={clusterId} filter={filter} />}
      {tab === 'events' && <EventsTab clusterId={clusterId} filter={filter} />}

      <ResourceDetailDrawer
        clusterId={clusterId}
        identity={selectedDetail}
        open={!!selectedDetail}
        onClose={closeResourceDetail}
        admin={admin}
        onShowPods={name => showTab('pods', name)}
        onShowResources={name => showTab('resources', name)}
        onScale={target => { setScaleTarget(target); setReplicas(target.podCount); }}
        onRestart={setRestartTarget}
      />

      <Modal open={!!scaleTarget} title={`${scaleTarget?.name ?? ''} 스케일`} onClose={() => setScaleTarget(null)}>
        <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-sm)' }}>
          현재 팟 {scaleTarget?.podCount ?? 0}개
        </p>
        <input className="input" type="number" min={0} max={100} value={replicas} onChange={e => setReplicas(Number(e.target.value))} />
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <Button onClick={() => setScaleTarget(null)}>취소</Button>
          <Button variant="primary" loading={scale.isPending} onClick={() => scaleTarget && scale.mutate(
            { ns: scaleTarget.ns, name: scaleTarget.name, replicas },
            { onSuccess: () => setScaleTarget(null) },
          )}>실행</Button>
        </div>
      </Modal>

      {/* 재시작은 파괴적 명령 — 즉시 실행 대신 확인 단계를 둔다 */}
      <Modal open={!!restartTarget} title={`${restartTarget?.name ?? ''} 재시작`} onClose={() => setRestartTarget(null)}>
        <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-sm)' }}>
          <code>{restartTarget?.ns}/{restartTarget?.name}</code> 팟 {restartTarget?.podCount ?? 0}개 순차 재시작
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <Button onClick={() => setRestartTarget(null)}>취소</Button>
          <Button variant="danger" loading={restart.isPending} onClick={() => restartTarget && restart.mutate(
            { ns: restartTarget.ns, name: restartTarget.name },
            { onSettled: () => setRestartTarget(null) },
          )}>재시작 실행</Button>
        </div>
      </Modal>
    </FadeSlideIn>
  );
}

/* 제어 명령 대상 — 팟이 아니라 디플로이먼트(워크로드) 단위 */
interface DeploymentTarget { ns: string; name: string; podCount: number }
type DetailSubject = 'node' | 'service' | 'workload';

export function deploymentTargetFromWorkload(workload: WorkloadResource): DeploymentTarget | null {
  if (workload.kind !== 'Deployment') return null;
  return { ns: workload.namespace, name: workload.name, podCount: workload.ready || workload.desired };
}

function WorkloadsTab({ clusterId, admin, onInspect, onDrillPods, onScale, onRestart }: {
  clusterId: string; admin: boolean; onInspect: (d: WorkloadResource) => void; onDrillPods: (d: WorkloadResource) => void;
  onScale: (d: WorkloadResource) => void; onRestart: (d: WorkloadResource) => void
}) {
  const q = useWorkloads(clusterId);
  return (
    <Card><QueryBoundary query={q}>{rows => (
      <ResourceTable rows={rows} rowKey={d => `${d.namespace}/${d.kind}/${d.name}`}
        onRowClick={onInspect}
        columns={[
          { key: 'name', label: '워크로드', render: d => <b>{d.name}</b> },
          { key: 'kind', label: 'Kind', render: d => d.kind },
          { key: 'ns', label: '네임스페이스', render: d => d.namespace },
          { key: 'ready', label: 'Ready', render: d => d.status || `${d.ready}/${d.desired}` },
          { key: 'health', label: '상태', render: d => <Badge status={d.health} /> },
          { key: 'act', label: '', render: d => (
            <span style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
              <Button size="sm" disabled={!admin || d.kind !== 'Deployment'} title={admin ? '' : 'release_operator 권한 필요'} onClick={() => onScale(d)}>스케일</Button>
              <Button size="sm" variant="danger" disabled={!admin || d.kind !== 'Deployment'} title={admin ? '' : 'release_operator 권한 필요'} onClick={() => onRestart(d)}>재시작</Button>
              <Button size="sm" onClick={() => onDrillPods(d)}>팟</Button>
            </span>
          ) },
        ]} />
    )}</QueryBoundary></Card>
  );
}
function ServicesTab({ clusterId, onInspect }: { clusterId: string; onInspect: (service: ServiceInfo) => void }) {
  const q = useServices(clusterId);
  return <Card><QueryBoundary query={q}>{rows => (
    <ResourceTable rows={rows} rowKey={s => `${s.namespace}/${s.name}`}
      onRowClick={onInspect}
      columns={[
        { key: 'name', label: '이름', render: s => <b>{s.name}</b> },
        { key: 'ns', label: '네임스페이스', render: s => s.namespace },
        { key: 'type', label: '타입', render: s => s.type },
        { key: 'ip', label: 'ClusterIP', render: s => <code>{s.cluster_ip}</code> },
        { key: 'ports', label: '포트', render: s => s.ports },
      ]} />
  )}</QueryBoundary></Card>;
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
  const title = identity ? `${identity.kind}/${identity.name}` : '';
  return (
    <Drawer open={open} title={title} onClose={onClose}>
      <QueryBoundary query={q} skeletonLines={6}>{detail => (
        <ResourceDetailBody
          clusterId={clusterId}
          detail={detail}
          admin={admin}
          onShowPods={onShowPods}
          onShowResources={onShowResources}
          onScale={onScale}
          onRestart={onRestart}
        />
      )}</QueryBoundary>
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
  return (
    <>
      <KeyValue pairs={resourcePairs(resource)} />
      <ContextActions clusterId={clusterId} subject={resource.resource_type || resource.kind.toLowerCase()} subjectName={resource.name} namespace={resource.namespace ?? undefined} kind={resource.kind} uid={resource.uid ?? undefined} />
      <DetailEvents title={`${resource.kind} 이벤트`} rows={detail.events} />
      {detail.related_pods.length > 0 && <RelatedPods rows={detail.related_pods} />}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {resource.resource_type !== 'pod' && detail.related_pods.length > 0 && <Button onClick={() => onShowPods(resource.name)}>팟 보기</Button>}
        {resource.resource_type === 'service' && <Button onClick={() => onShowResources(resource.name)}>리소스 보기</Button>}
        {deploymentTarget && (
          <>
            <Button disabled={!admin} onClick={() => onScale(deploymentTarget)}>스케일</Button>
            <Button variant="danger" disabled={!admin} onClick={() => onRestart(deploymentTarget)}>재시작</Button>
          </>
        )}
      </div>
    </>
  );
}

function resourcePairs(resource: InventoryResource): [string, ReactNode][] {
  const summary = resource.summary;
  const pairs: [string, ReactNode][] = [
    ['상태', <Badge key="status" status={resource.status || resource.health} />],
    ['Health', <Badge key="health" status={resource.health} />],
    ['Kind', resource.kind],
  ];
  if (resource.namespace) pairs.push(['네임스페이스', resource.namespace]);
  if (resource.resource_type === 'pod') {
    pairs.push(
      ['재시작', String(summary.restart_total ?? 0)],
      ['노드', String(summary.node_name ?? '—')],
      ['이미지', String(summary.image ?? '—')],
      ['Ready', String(summary.ready ?? '—')],
    );
  } else if (resource.resource_type === 'node') {
    pairs.push(
      ['팟 수', String(summary.pod_count ?? '—')],
      ['버전', String(summary.version ?? '—')],
      ['CPU', ratioText(summary.cpu_ratio)],
      ['MEM', ratioText(summary.mem_ratio)],
    );
  } else if (resource.resource_type === 'service') {
    pairs.push(
      ['타입', String(summary.type ?? resource.status ?? '—')],
      ['ClusterIP', <code key="ip">{String(summary.cluster_ip ?? '—')}</code>],
      ['포트', servicePorts(summary.ports)],
    );
  } else if (resource.resource_type === 'workload') {
    pairs.push(
      ['Ready', `${summary.ready_replicas ?? 0}/${summary.desired_replicas ?? 0}`],
      ['Available', String(summary.available_replicas ?? '—')],
      ['Updated', String(summary.updated_replicas ?? '—')],
    );
  }
  return pairs;
}

function ratioText(value: unknown) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '—';
}

function servicePorts(value: unknown) {
  if (!Array.isArray(value)) return '—';
  return value.map(port => {
    const p = port as Record<string, unknown>;
    return `${p.port ?? ''}${p.protocol ? `/${p.protocol}` : ''}`;
  }).filter(Boolean).join(', ') || '—';
}

function deploymentTargetFromDetail(detail: InventoryResourceDetail): DeploymentTarget | null {
  const r = detail.resource;
  if (r.resource_type !== 'workload' || r.kind !== 'Deployment' || !r.namespace) return null;
  return {
    ns: r.namespace,
    name: r.name,
    podCount: detail.related_pods.length || Number(r.summary.ready_replicas ?? r.summary.desired_replicas ?? 0),
  };
}

function DetailEvents({ title, rows }: { title: string; rows: K8sEvent[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.slice(0, 8).map(e => (
          <div key={`${e.at}${e.reason}${e.target}${e.message}`} style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, fontSize: 'var(--fs-xs)' }}>
            <Badge tone={e.type === 'Warning' ? 'warn' : 'neutral'}>{e.reason}</Badge>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.message || e.target}</span>
            <span style={{ marginLeft: 'auto', flex: 'none', color: 'var(--text-3)' }}>{timeAgo(e.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelatedPods({ rows }: { rows: Workload[] }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 8 }}>관련 팟</div>
      <ResourceTable
        rows={rows.slice(0, 8)}
        rowKey={p => `${p.namespace}/${p.name}`}
        columns={[
          { key: 'name', label: '이름', render: p => <b>{p.name}</b> },
          { key: 'phase', label: '상태', render: p => <Badge status={p.phase} /> },
          { key: 'restart', label: '재시작', render: p => p.restarts },
          { key: 'node', label: '노드', render: p => p.node ?? '—' },
        ]}
      />
    </div>
  );
}

function ContextActions({ clusterId, subject, subjectName, namespace, kind, uid }: {
  clusterId: string; subject: string; subjectName: string; namespace?: string; kind?: string; uid?: string
}) {
  const hrefs = contextActionHrefs(clusterId, subject, subjectName, namespace, kind, uid);
  const pathFor = useConsolePath();
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
      <Link to={pathFor(hrefs.events)}><Button>이벤트</Button></Link>
      <Link to={pathFor(hrefs.metrics)}><Button>메트릭</Button></Link>
      <Link to={pathFor(hrefs.ai)}><Button variant="primary">AI 분석</Button></Link>
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
  if (q.isPending || rows.length === 0) return null;
  return (
    <div style={{ marginTop: compact ? 0 : 14, marginBottom: compact ? 12 : 0 }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(e => (
          <div key={`${e.at}${e.reason}${e.target}`} style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, fontSize: 'var(--fs-xs)' }}>
            <Badge tone={e.type === 'Warning' ? 'warn' : 'neutral'}>{e.reason}</Badge>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.message || e.target}</span>
            <span style={{ marginLeft: 'auto', flex: 'none', color: 'var(--text-3)' }}>{timeAgo(e.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function eventMatches(key: string) {
  return (e: K8sEvent) => !key ||
    e.target.toLowerCase().includes(key) ||
    e.message.toLowerCase().includes(key) ||
    e.reason.toLowerCase().includes(key);
}
function ResourcesTab({ clusterId, filter }: { clusterId: string; filter: string }) {
  const q = useResources(clusterId);
  const match = (value: string | null | undefined) => !!value && value.includes(filter);
  return <Card><QueryBoundary query={q}>{rows => (
    <ResourceTable rows={filter ? rows.filter(r => match(r.name) || match(r.namespace) || match(r.kind) || match(r.status)) : rows} rowKey={r => `${r.kind}/${r.namespace}/${r.name}`}
      columns={[
        { key: 'kind', label: 'Kind', render: r => r.kind },
        { key: 'ns', label: '네임스페이스', render: r => r.namespace ?? '—' },
        { key: 'name', label: '이름', render: r => <b>{r.name}</b> },
        { key: 'status', label: '상태', render: r => <Badge status={r.status} /> },
        { key: 'age', label: 'Age', render: r => r.age },
      ]} />
  )}</QueryBoundary></Card>;
}
function EventsTab({ clusterId, filter }: { clusterId: string; filter: string }) {
  const q = useClusterEvents(clusterId);
  const match = (value: string | null | undefined) => !!value && value.includes(filter);
  return <Card><QueryBoundary query={q}>{rows => (
    rows.length === 0 ? <EmptyState icon={<IconFile size={26} />} title="이벤트가 없습니다" /> :
    <ResourceTable rows={filter ? rows.filter(e => match(e.reason) || match(e.target) || match(e.message) || match(e.type)) : rows} rowKey={e => `${e.at}${e.reason}`}
      columns={[
        { key: 'at', label: '시각', render: e => timeAgo(e.at) },
        { key: 'type', label: '타입', render: e => <Badge tone={e.type === 'Warning' ? 'warn' : 'neutral'}>{e.type}</Badge> },
        { key: 'reason', label: '사유', render: e => e.reason },
        { key: 'target', label: '대상', render: e => <code>{e.target}</code> },
        { key: 'msg', label: '메시지', render: e => e.message },
      ]} />
  )}</QueryBoundary></Card>;
}
/* 집계 요약 — GET /clusters/{id}/summary (사용량 + 열린 인시던트). 실패해도 화면 흐름을 막지 않는다 */
function ClusterAggPanel({ clusterId }: { clusterId: string }) {
  const aggQ = useClusterAgg(clusterId);
  const pathFor = useConsolePath();
  if (aggQ.isPending) return null; // 보조 패널 — 첫 로딩은 조용히(본문 스켈레톤과 중복 방지)
  if (aggQ.isError) {
    return (
      <p style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)', margin: '0 0 12px' }}>
        집계 요약을 불러오지 못했습니다 — {(aggQ.error as Error).message}{' '}
        <Button size="sm" variant="ghost" onClick={() => aggQ.refetch()}>다시 시도</Button>
      </p>
    );
  }
  const agg = aggQ.data;
  const usage = agg?.usage;
  const incidents = agg?.open_incidents ?? [];
  return (
    <Card title="집계 요약 — 사용량 · 열린 인시던트" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: incidents.length ? 12 : 0 }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>
          CPU <b style={{ color: usage?.cpu_pct != null && usage.cpu_pct >= 85 ? 'var(--danger)' : 'var(--text-1)' }}>{usage?.cpu_pct != null ? `${Math.round(usage.cpu_pct)}%` : '—'}</b>
        </span>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>
          MEM <b style={{ color: usage?.mem_pct != null && usage.mem_pct >= 85 ? 'var(--danger)' : 'var(--text-1)' }}>{usage?.mem_pct != null ? `${Math.round(usage.mem_pct)}%` : '—'}</b>
        </span>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>
          재시작 누적 <b style={{ color: 'var(--text-1)' }}>{usage?.restarts_total ?? '—'}</b>
        </span>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>
          열린 인시던트 <b style={{ color: incidents.length ? 'var(--danger)' : 'var(--text-1)' }}>{incidents.length}</b>
        </span>
      </div>
      {incidents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {incidents.slice(0, 5).map(i => (
            <div key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
              <Badge status={i.status} />
              <Link to={pathFor(`/incidents/${i.id}`)} style={{ color: 'var(--brand)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {i.symptom}{i.root_cause ? ` — ${i.root_cause}` : ''}
              </Link>
              <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 'var(--fs-xs)', flex: 'none' }}>
                {i.created_at ? timeAgo(i.created_at) : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
