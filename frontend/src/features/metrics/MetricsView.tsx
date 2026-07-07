import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { post } from '@/shared/lib/api';
import { liveStore } from '@/shared/lib/live';
import { useClusters, useClusterSummary, useClusterUsage, useWorkloads } from '@/features/cluster/api';
import { commandResultMessage, isTerminal, summarizeTelemetryResult, useCommandStatus } from '@/features/metrics/api';
import { Badge, Button, Card, EmptyState, Skeleton, StatBox } from '@/shared/ui';
import { TimeSeriesChart, type Series } from '@/shared/ui/charts';
import { fmtHms } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import { IconClock } from '@/shared/ui/icons';

const PRESETS = [
  { label: '팟 재시작 (5m)', promql: 'sum(rate(kube_pod_container_status_restarts_total[5m]))' },
  { label: '노드 CPU', promql: 'sum(rate(node_cpu_seconds_total{mode!="idle"}[5m])) by (node)' },
  { label: '네임스페이스 메모리', promql: 'sum(container_memory_working_set_bytes) by (namespace)' },
];
interface QueryCard { id: string; promql: string; commandId?: string; submitFailed?: boolean }

export default function MetricsView() {
  const [sp] = useSearchParams();
  const clustersQ = useClusters();
  const clusters = useMemo(() => clustersQ.data ?? [], [clustersQ.data]);
  const [clusterId, setClusterId] = useState(sp.get('cluster') ?? '');
  const [paused, setPaused] = useState(false);
  const [promql, setPromql] = useState(PRESETS[0].promql);
  const [cards, setCards] = useState<QueryCard[]>([]);
  const summaryQ = useClusterSummary(clusterId);
  const usageQ = useClusterUsage(clusterId);
  const workloadsQ = useWorkloads(clusterId);
  const history = liveStore(s => s.history);
  const status = liveStore(s => s.status);
  const snapshot = liveStore(s => s.snapshot);
  const [frozen, setFrozen] = useState(history);

  useEffect(() => {
    if (!clusters.length) return;
    if (!clusterId || !clusters.some(c => c.cluster_id === clusterId)) {
      setClusterId(clusters[0].cluster_id);
    }
  }, [clusterId, clusters]);

  useEffect(() => {
    if (!paused) setFrozen(history);
  }, [history, paused]);

  const summary = summaryQ.data;
  const workloads = workloadsQ.data ?? [];
  const inventoryPhases = summary?.pod_phases ?? {};
  const workloadPhases = workloads.reduce<Record<string, number>>((acc, pod) => {
    acc[pod.phase] = (acc[pod.phase] ?? 0) + 1;
    return acc;
  }, {});
  const livePhases = snapshot
    ? snapshot.namespaces.flatMap(n => n.pods).reduce<Record<string, number>>((a, p) => ({ ...a, [p.phase]: (a[p.phase] ?? 0) + 1 }), {})
    : {};
  const phases = Object.keys(livePhases).length ? livePhases : Object.keys(inventoryPhases).length ? inventoryPhases : workloadPhases;
  const inventoryRunning = phases.Running ?? 0;
  const inventoryRestarts = workloads.reduce((sum, pod) => sum + pod.restarts, 0);
  const series: Series[] = useMemo(() => {
    const base = paused ? frozen : history;
    const pts = (base.length
      ? base
      : clusterId ? [{ at: Date.now(), restarts: inventoryRestarts, running: inventoryRunning }] : []
    ).slice(-120);
    return [
      { id: '재시작 합', data: pts.map(p => ({ x: fmtHms(p.at), y: p.restarts })) },
      { id: '실행 팟', data: pts.map(p => ({ x: fmtHms(p.at), y: p.running })) },
    ];
  }, [paused, frozen, history, clusterId, inventoryRestarts, inventoryRunning]);

  // 스냅샷 기반 실측 추이 — cluster_usage_samples 시계열(실 시각 라벨)
  const usageSeries: Series[] = useMemo(() => {
    const samples = usageQ.data ?? [];
    if (!samples.length) return [];
    const label = (s: { sampled_at: string | null }, i: number) => (s.sampled_at ? fmtHms(s.sampled_at) : `#${i}`);
    return [
      { id: '실행 팟', data: samples.map((s, i) => ({ x: label(s, i), y: s.usage.pod_running ?? 0 })) },
      { id: '재시작 누적', data: samples.map((s, i) => ({ x: label(s, i), y: s.usage.restart_total ?? 0 })) },
      { id: '준비 노드', data: samples.map((s, i) => ({ x: label(s, i), y: s.usage.node_ready ?? 0 })) },
    ];
  }, [usageQ.data]);

  const run = useMutation({
    mutationFn: (q: string) => post<{ command_id: string }>('/agent/debug/query', {
      cluster_id: clusterId,
      query: {
        source: 'prometheus',
        name: 'console_promql',
        description: 'Console PromQL query',
        query: q,
        range_seconds: 300,
      },
    }),
  });
  // query 인자를 받는다 — 재시도 시 '그 카드의' 쿼리를 다시 실행(현재 입력값과 무관)
  const execute = (query?: string) => {
    const q = (query ?? promql).trim();
    if (!q) return;
    const id = Math.random().toString(36).slice(2, 8);
    setCards(cs => [{ id, promql: q }, ...cs]);
    run.mutate(q, {
      onSuccess: d => setCards(cs => cs.map(c => c.id === id ? { ...c, commandId: d.command_id } : c)),
      onError: () => setCards(cs => cs.map(c => c.id === id ? { ...c, submitFailed: true } : c)),
    });
  };

  // 클러스터가 하나도 없으면 차트가 의미 없다 — 등록 유도(정직한 빈 상태)
  if (clustersQ.isSuccess && clusters.length === 0) {
    return (
      <FadeSlideIn>
        <h1 style={{ marginTop: 0, fontSize: 'var(--fs-xl)' }}>메트릭</h1>
        <Card>
          <EmptyState icon={<IconClock size={26} />} title="등록된 클러스터가 없습니다"
            description="클러스터를 등록하고 에이전트가 연결되면 실시간·스냅샷 메트릭이 표시됩니다"
            action={<Link to="/clusters"><Button variant="primary">클러스터 등록</Button></Link>} />
        </Card>
      </FadeSlideIn>
    );
  }

  return (
    <FadeSlideIn>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)', flex: 1 }}>메트릭</h1>
        <select className="input" style={{ width: 180 }} value={clusterId} onChange={e => setClusterId(e.target.value)}>
          {clusters.map(c => <option key={c.cluster_id} value={c.cluster_id}>{c.name}</option>)}
        </select>
        <Button onClick={() => setPaused(p => !p)}>{paused ? '▶ 재개' : '⏸ 일시정지'}</Button>
      </div>
      {status !== 'open' && <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: 12, fontSize: 'var(--fs-sm)' }}>실시간 스트림 재연결 중 — 최신 인벤토리 스냅샷을 표시합니다</div>}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <StatBox label="Running" value={phases.Running ?? 0} tone="ok" />
        <StatBox label="Pending" value={phases.Pending ?? 0} tone="warn" />
        <StatBox label="CrashLoop" value={phases.CrashLoopBackOff ?? 0} tone={(phases.CrashLoopBackOff ?? 0) > 0 ? 'danger' : 'neutral'} />
        <StatBox label="노드" value={summary?.nodes.length ?? 0} tone="info" />
        {snapshot?.rollout && <StatBox label={`rollout ${snapshot.rollout.name}`} value={snapshot.rollout.progress} tone="info" />}
      </div>
      <Card title="실시간 — 재시작 추이 / 실행 팟" style={{ marginBottom: 16 }}>
        <TimeSeriesChart series={series} />
      </Card>
      <Card title="스냅샷 추이 — 인벤토리 실측 (usage rollup)" style={{ marginBottom: 16 }}>
        {usageQ.isPending && !!clusterId ? <Skeleton lines={4} />
          : usageQ.isError ? (
            <EmptyState icon={<IconClock size={26} />} title="추이 데이터를 불러오지 못했습니다"
              description={(usageQ.error as Error).message}
              action={<Button size="sm" onClick={() => usageQ.refetch()}>다시 시도</Button>} />
          ) : usageSeries.length === 0 ? (
            <EmptyState icon={<IconClock size={26} />} title="아직 수집된 스냅샷 시계열이 없습니다"
              description="에이전트가 연결되면 스냅샷(30초 주기)마다 실측 usage 가 쌓입니다" />
          ) : <TimeSeriesChart series={usageSeries} />}
      </Card>
      <Card title="온디맨드 PromQL (비동기 — agent 경유)">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select className="input" style={{ width: 200 }}
            value={PRESETS.some(p => p.promql === promql) ? promql : ''}
            onChange={e => { if (e.target.value) setPromql(e.target.value); }}>
            <option value="" disabled>직접 입력…</option>
            {PRESETS.map(p => <option key={p.label} value={p.promql}>{p.label}</option>)}
          </select>
          <input className="input" style={{ fontFamily: 'var(--font-mono)' }} value={promql} onChange={e => setPromql(e.target.value)} />
          <Button variant="primary" onClick={() => execute()} disabled={!clusterId || !promql.trim()}
            title={clusterId ? '' : '클러스터를 먼저 선택해주세요'}>실행</Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cards.map(c => <QueryCardRow key={c.id} card={c} onRetry={() => execute(c.promql)} />)}
        </div>
      </Card>
    </FadeSlideIn>
  );
}

// 쿼리 카드 1개 — 명령 상태를 폴링해 agent 가 올린 실측 결과만 표시한다.
function QueryCardRow({ card, onRetry }: { card: QueryCard; onRetry: () => void }) {
  const statusQ = useCommandStatus(card.commandId);
  const status = card.submitFailed ? 'failed' : statusQ.data?.status ?? 'queued';
  const badge = status === 'completed' ? 'done' : status === 'leased' ? 'running' : status;
  const result = statusQ.data?.result ?? {};
  const summary = status === 'completed' ? summarizeTelemetryResult(result) : null;
  const failMessage = status === 'failed' && !card.submitFailed ? commandResultMessage(result) : null;
  return (
    <div className="card" style={{ background: 'var(--surface-2)', padding: 10, display: 'flex', gap: 10, alignItems: 'center' }} data-testid="query-card">
      <Badge status={badge} />
      <code style={{ fontSize: 'var(--fs-xs)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.promql}</code>
      {card.commandId && <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{card.commandId}</span>}
      {summary && (
        <span style={{ color: 'var(--ok)', fontSize: 'var(--fs-sm)' }}>
          {summary.series} series · {summary.points} pts{summary.avg !== null ? ` · 평균 ${summary.avg.toFixed(2)}` : ''}
        </span>
      )}
      {status === 'completed' && !summary && <span style={{ color: 'var(--ok)', fontSize: 'var(--fs-sm)' }}>{commandResultMessage(result) ?? '완료'}</span>}
      {failMessage && <span style={{ color: 'var(--danger)', fontSize: 'var(--fs-xs)' }}>{failMessage}</span>}
      {!isTerminal(status) && card.commandId && <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>agent 실행 대기·수행 중</span>}
      {status === 'failed' && <Button size="sm" onClick={onRetry}>재시도</Button>}
    </div>
  );
}
