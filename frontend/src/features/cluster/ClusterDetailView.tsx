import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useClusterEvents, useClusters, useClusterSummary, useResources, useRestart, useScale, useServices, useWorkloads } from '@/features/cluster/api';
import { useClusterAgg } from '@/features/fleet/api';
import { useIsAdmin } from '@/features/auth/api';
import { Badge, Breadcrumbs, Button, Card, Drawer, EmptyState, KeyValue, Modal, QueryBoundary, ResourceTable, StatBox, Tabs } from '@/shared/ui';
import { liveStore } from '@/shared/lib/live';
import { timeAgo } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import { IconFile, IconFlame } from '@/shared/ui/icons';
import type { K8sEvent, ServiceInfo, Workload } from '@/shared/lib/types';

const TABS = [
  { key: 'workloads', label: '워크로드' }, { key: 'pods', label: '팟' }, { key: 'nodes', label: '노드' },
  { key: 'services', label: '서비스' }, { key: 'resources', label: '리소스' }, { key: 'events', label: '이벤트' },
];

export default function ClusterDetailView() {
  const { clusterId = '', namespace, pod } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const tab = sp.get('tab') ?? 'workloads';
  const filter = sp.get('q') ?? '';
  const detailSubject = sp.get('detail') ?? '';
  const detailName = sp.get('name') ?? '';
  const detailNamespace = sp.get('namespace') ?? '';
  const clustersQ = useClusters();
  const summaryQ = useClusterSummary(clusterId);
  const workloadsQ = useWorkloads(clusterId);
  const servicesQ = useServices(clusterId);
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
    (workloadsQ.data ?? []).map(w => ({ ...w, hot: hotPods.has(w.name) || w.hot }))
      .filter(w => !filter || w.name.includes(filter) || w.workload_name?.includes(filter) || w.namespace === filter || w.node === filter),
    [workloadsQ.data, hotPods, filter]);
  const openPod = pod ? podRows.find(w => w.name === pod && w.namespace === namespace) : null;
  const phases = summaryQ.data?.pod_phases ?? {};
  const deploymentTargets = useMemo(() => deploymentTargetsFromPods(workloadsQ.data ?? []), [workloadsQ.data]);
  const nodeTarget = detailSubject === 'node' ? summaryQ.data?.nodes.find(n => n.name === detailName) ?? null : null;
  const serviceTarget = detailSubject === 'service'
    ? servicesQ.data?.find(s => s.name === detailName && (!detailNamespace || s.namespace === detailNamespace)) ?? null
    : null;
  const workloadTarget = detailSubject === 'workload'
    ? deploymentTargets.find(d => d.name === detailName && (!detailNamespace || d.ns === detailNamespace)) ?? null
    : null;
  const setTab = (nextTab: string) => {
    const next = new URLSearchParams(sp);
    next.set('tab', nextTab);
    next.delete('detail');
    next.delete('name');
    next.delete('namespace');
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
    setSp(next);
  };
  const openDetail = (subject: DetailSubject, name: string, ns?: string) => {
    const next = new URLSearchParams(sp);
    next.set('detail', subject);
    next.set('name', name);
    if (ns) next.set('namespace', ns);
    else next.delete('namespace');
    setSp(next);
  };
  const closeDetail = () => {
    const next = new URLSearchParams(sp);
    next.delete('detail');
    next.delete('name');
    next.delete('namespace');
    setSp(next);
  };

  return (
    <FadeSlideIn>
      <Breadcrumbs items={[{ label: '클러스터', to: '/clusters' }, { label: cluster?.name ?? clusterId }]} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 16px', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {cluster?.name ?? clusterId}
          {cluster && <Badge tone="neutral">{cluster.environment}</Badge>}
          {cluster && <Badge status={cluster.connection_status} />}
        </h1>
        <ContextActions clusterId={clusterId} subject="cluster" subjectName={clusterId} />
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
        onInspect={d => openDetail('workload', d.name, d.ns)}
        onDrillPods={d => showTab('pods', d.name)}
        onScale={d => { setScaleTarget(d); setReplicas(d.podCount); }} onRestart={setRestartTarget} />}
      {tab === 'pods' && (
        <Card>
          <ResourceTable<Workload>
            rows={podRows} rowKey={w => `${w.namespace}/${w.name}`}
            onRowClick={w => nav(`/clusters/${clusterId}/pods/${w.namespace}/${w.name}?tab=pods`)}
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
            onRowClick={n => openDetail('node', n.name)}
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
      {tab === 'services' && <ServicesTab clusterId={clusterId} onInspect={s => openDetail('service', s.name, s.namespace)} />}
      {tab === 'resources' && <ResourcesTab clusterId={clusterId} filter={filter} />}
      {tab === 'events' && <EventsTab clusterId={clusterId} filter={filter} />}

      <Drawer open={!!openPod} title={openPod?.name ?? ''} onClose={() => nav(`/clusters/${clusterId}?tab=pods`)}>
        {openPod && (
          <>
            <KeyValue pairs={[
              ['상태', <Badge key="s" status={openPod.phase} />], ['네임스페이스', openPod.namespace],
              ['재시작', String(openPod.restarts)], ['노드', openPod.node ?? '—'], ['이미지', openPod.image], ['Ready', openPod.ready],
            ]} />
            <ContextActions clusterId={clusterId} subject="pod" subjectName={openPod.name} namespace={openPod.namespace} />
            <ContextEvents clusterId={clusterId} title="팟 이벤트" match={openPod.name} />
          </>
        )}
      </Drawer>

      <Drawer open={!!nodeTarget} title={nodeTarget?.name ?? ''} onClose={closeDetail}>
        {nodeTarget && (
          <>
            <KeyValue pairs={[
              ['상태', <Badge key="ready" tone={nodeTarget.ready ? 'ok' : 'danger'}>{nodeTarget.ready ? 'Ready' : 'NotReady'}</Badge>],
              ['팟 수', String(nodeTarget.pod_count)],
              ['CPU', nodeTarget.cpu_ratio != null ? `${(nodeTarget.cpu_ratio * 100).toFixed(0)}%` : '—'],
              ['MEM', nodeTarget.mem_ratio != null ? `${(nodeTarget.mem_ratio * 100).toFixed(0)}%` : '—'],
              ['버전', nodeTarget.version],
            ]} />
            <ContextActions clusterId={clusterId} subject="node" subjectName={nodeTarget.name} />
            <ContextEvents clusterId={clusterId} title="노드 이벤트" match={nodeTarget.name} />
            <div style={{ marginTop: 12 }}>
              <Button onClick={() => showTab('pods', nodeTarget.name)}>팟 보기</Button>
            </div>
          </>
        )}
      </Drawer>

      <Drawer open={!!serviceTarget} title={serviceTarget?.name ?? ''} onClose={closeDetail}>
        {serviceTarget && (
          <>
            <KeyValue pairs={[
              ['네임스페이스', serviceTarget.namespace],
              ['타입', serviceTarget.type],
              ['ClusterIP', <code key="ip">{serviceTarget.cluster_ip}</code>],
              ['포트', serviceTarget.ports],
            ]} />
            <ContextActions clusterId={clusterId} subject="service" subjectName={serviceTarget.name} namespace={serviceTarget.namespace} />
            <ContextEvents clusterId={clusterId} title="서비스 이벤트" match={serviceTarget.name} />
            <div style={{ marginTop: 12 }}>
              <Button onClick={() => showTab('resources', serviceTarget.name)}>리소스 보기</Button>
            </div>
          </>
        )}
      </Drawer>

      <Drawer open={!!workloadTarget} title={workloadTarget?.name ?? ''} onClose={closeDetail}>
        {workloadTarget && (
          <>
            <KeyValue pairs={[
              ['네임스페이스', workloadTarget.ns],
              ['팟', String(workloadTarget.podCount)],
            ]} />
            <ContextActions clusterId={clusterId} subject="workload" subjectName={workloadTarget.name} namespace={workloadTarget.ns} />
            <ContextEvents clusterId={clusterId} title="워크로드 이벤트" match={workloadTarget.name} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Button onClick={() => showTab('pods', workloadTarget.name)}>팟 보기</Button>
              <Button disabled={!admin} onClick={() => { closeDetail(); setScaleTarget(workloadTarget); setReplicas(workloadTarget.podCount); }}>스케일</Button>
              <Button variant="danger" disabled={!admin} onClick={() => { closeDetail(); setRestartTarget(workloadTarget); }}>재시작</Button>
            </div>
          </>
        )}
      </Drawer>

      <Modal open={!!scaleTarget} title={`${scaleTarget?.name ?? ''} 스케일`} onClose={() => setScaleTarget(null)}>
        <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-sm)' }}>
          현재 팟 {scaleTarget?.podCount ?? 0}개 — 비동기 명령입니다. command-worker 정책 확인 후 agent 가 실행합니다.
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
          <code>{restartTarget?.ns}/{restartTarget?.name}</code> 의 팟 {restartTarget?.podCount ?? 0}개가 순차 재시작됩니다.
          비동기 명령입니다 — command-worker 정책 확인 후 agent 가 실행합니다.
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

export function deploymentTargetsFromPods(pods: Workload[]): DeploymentTarget[] {
  const byDeploy = new Map<string, Workload[]>();
  pods.forEach(w => {
    const name = w.workload_name || w.name;
    const key = `${w.namespace}/${name}`;
    byDeploy.set(key, [...(byDeploy.get(key) ?? []), w]);
  });
  return [...byDeploy.entries()].map(([key, rows]) => ({
    ns: rows[0].namespace,
    name: key.split('/')[1],
    podCount: rows.length,
  }));
}

function WorkloadsTab({ clusterId, admin, onInspect, onDrillPods, onScale, onRestart }: {
  clusterId: string; admin: boolean; onInspect: (d: DeploymentTarget) => void; onDrillPods: (d: DeploymentTarget) => void;
  onScale: (d: DeploymentTarget) => void; onRestart: (d: DeploymentTarget) => void
}) {
  const q = useWorkloads(clusterId);
  const deployments = useMemo(() => {
    const byDeploy = new Map<string, Workload[]>();
    (q.data ?? []).forEach(w => {
      const name = w.workload_name || w.name;
      const key = `${w.namespace}/${name}`;
      byDeploy.set(key, [...(byDeploy.get(key) ?? []), w]);
    });
    return [...byDeploy.entries()].map(([key, pods]) => ({ key, ns: pods[0].namespace, name: key.split('/')[1], pods }));
  }, [q.data]);
  return (
    <Card><QueryBoundary query={q}>{() => (
      <ResourceTable rows={deployments} rowKey={d => d.key}
        onRowClick={d => onInspect({ ns: d.ns, name: d.name, podCount: d.pods.length })}
        columns={[
          { key: 'name', label: '워크로드', render: d => <b>{d.name}</b> },
          { key: 'ns', label: '네임스페이스', render: d => d.ns },
          { key: 'ready', label: 'Ready', render: d => `${d.pods.filter(p => p.phase === 'Running').length}/${d.pods.length}` },
          { key: 'restarts', label: '재시작 합', render: d => d.pods.reduce((a, p) => a + p.restarts, 0) },
          { key: 'act', label: '', render: d => (
            <span style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
              <Button size="sm" disabled={!admin} title={admin ? '' : 'release_operator 권한 필요'} onClick={() => onScale({ ns: d.ns, name: d.name, podCount: d.pods.length })}>스케일</Button>
              <Button size="sm" variant="danger" disabled={!admin} title={admin ? '' : 'release_operator 권한 필요'} onClick={() => onRestart({ ns: d.ns, name: d.name, podCount: d.pods.length })}>재시작</Button>
              <Button size="sm" onClick={() => onDrillPods({ ns: d.ns, name: d.name, podCount: d.pods.length })}>팟</Button>
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

function ContextActions({ clusterId, subject, subjectName, namespace }: {
  clusterId: string; subject: string; subjectName: string; namespace?: string
}) {
  const hrefs = contextActionHrefs(clusterId, subject, subjectName, namespace);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
      <Link to={hrefs.events}><Button>이벤트</Button></Link>
      <Link to={hrefs.metrics}><Button>메트릭</Button></Link>
      <Link to={hrefs.ai}><Button variant="primary">AI 분석</Button></Link>
    </div>
  );
}

export function contextActionHrefs(clusterId: string, subject: string, subjectName: string, namespace?: string) {
  const prefill = `${clusterId} ${namespace ? `${namespace}/` : ''}${subjectName} ${subject} 상태 분석`;
  const metricParams = new URLSearchParams({ cluster: clusterId, subject, name: subjectName });
  if (namespace) metricParams.set('namespace', namespace);
  const eventParams = new URLSearchParams({ tab: 'events' });
  if (subject !== 'cluster') eventParams.set('q', subjectName);
  return {
    events: `/clusters/${clusterId}?${eventParams.toString()}`,
    metrics: `/metrics?${metricParams.toString()}`,
    ai: `/ai?prefill=${encodeURIComponent(prefill)}`,
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
              <Link to={`/incidents/${i.id}`} style={{ color: 'var(--brand)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
