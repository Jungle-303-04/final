import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { post } from '@/shared/lib/api';
import { liveStore } from '@/shared/lib/live';
import { useClusters, useClusterSummary, useClusterUsage, usePods } from '@/features/cluster/api';
import { useIsAdmin } from '@/features/auth/api';
import { commandResultMessage, isTerminal, summarizeTelemetryResult, useCommandStatus } from '@/features/metrics/api';
import { Badge, Button, Card, EmptyState, Skeleton, StatBox } from '@/shared/ui';
import { PageHeader } from '@/plural-ui';
import { TimeSeriesChart, type Series } from '@/shared/ui/charts';
import { fmtHms } from '@/shared/lib/format';
import { AnimatedList, FadeSlideIn } from '@/shared/motion';
import { IconClock, IconPause, IconPlay } from '@/shared/ui/icons';
import { useConsolePath } from '@/features/console/ui';

// 프리셋은 실제 스크레이프되는 계열만 사용 — node-exporter/kube-state-metrics/node-collector.
// 전체 카탈로그·근거는 docs/frontend-metrics-queries.md 참조.
type Unit = 'ratio' | 'count';
const PRESETS: { label: string; promql: string; unit: Unit }[] = [
  { label: '노드 CPU 사용률', unit: 'ratio', promql: '1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))' },
  { label: '노드 메모리 사용률', unit: 'ratio', promql: '1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)' },
  { label: '노드 파일시스템 사용률', unit: 'ratio', promql: '1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"})' },
  { label: '팟 재시작율 (5m, 네임스페이스별)', unit: 'count', promql: 'sum by (namespace) (rate(kube_pod_container_status_restarts_total[5m]))' },
  { label: '네임스페이스별 팟 수', unit: 'count', promql: 'count by (namespace) (kube_pod_info)' },
  { label: 'sandbox 디플로이 레플리카', unit: 'count', promql: 'kube_deployment_status_replicas{namespace="sandbox"}' },
];
const RANGES = [
  { label: '5분', seconds: 300 },
  { label: '15분', seconds: 900 },
  { label: '1시간', seconds: 3600 },
  { label: '6시간', seconds: 21600 },
];
interface QueryCard { id: string; promql: string; unit: Unit; rangeSeconds: number; commandId?: string; submitFailed?: boolean }
interface ContextPreset { promql: string; unit: Unit; label: string }

export default function MetricsView() {
  const [sp, setSp] = useSearchParams();
  const pathFor = useConsolePath();
  const clustersQ = useClusters();
  const clusters = useMemo(() => clustersQ.data ?? [], [clustersQ.data]);
  const admin = useIsAdmin();
  const [clusterId, setClusterId] = useState(sp.get('cluster') ?? '');
  const subject = sp.get('subject') ?? '';
  const subjectName = sp.get('name') ?? '';
  const namespace = sp.get('namespace') ?? '';
  const contextPreset = useMemo(
    () => buildContextPreset(subject, subjectName, namespace),
    [namespace, subject, subjectName],
  );
  const [paused, setPaused] = useState(false);
  const [promql, setPromql] = useState(contextPreset?.promql ?? PRESETS[0].promql);
  const [range, setRange] = useState(RANGES[0].seconds);
  const [cards, setCards] = useState<QueryCard[]>([]);
  const summaryQ = useClusterSummary(clusterId);
  const usageQ = useClusterUsage(clusterId);
  const workloadsQ = usePods(clusterId);
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

  const selectCluster = (nextClusterId: string) => {
    setClusterId(nextClusterId);
    const next = new URLSearchParams(sp);
    next.set('cluster', nextClusterId);
    setSp(next, { replace: true });
  };

  useEffect(() => {
    if (!paused) setFrozen(history);
  }, [history, paused]);

  useEffect(() => {
    if (contextPreset) setPromql(contextPreset.promql);
  }, [contextPreset]);

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
    mutationFn: ({ q, rangeSeconds }: { q: string; rangeSeconds: number }) => post<{ command_id: string }>('/agent/debug/query', {
      cluster_id: clusterId,
      query: {
        source: 'prometheus',
        name: 'console_promql',
        description: 'Console PromQL query',
        query: q,
        range_seconds: rangeSeconds,
      },
    }),
  });
  // 재시도 시 '그 카드의' 쿼리·범위를 다시 실행(현재 입력값과 무관)
  const execute = (card?: Pick<QueryCard, 'promql' | 'unit' | 'rangeSeconds'>) => {
    const q = (card?.promql ?? promql).trim();
    if (!q) return;
    const unit = card?.unit ?? PRESETS.find(p => p.promql === q)?.unit ?? 'count';
    const rangeSeconds = card?.rangeSeconds ?? range;
    const id = Math.random().toString(36).slice(2, 8);
    setCards(cs => [{ id, promql: q, unit, rangeSeconds }, ...cs]);
    run.mutate({ q, rangeSeconds }, {
      onSuccess: d => setCards(cs => cs.map(c => c.id === id ? { ...c, commandId: d.command_id } : c)),
      onError: () => setCards(cs => cs.map(c => c.id === id ? { ...c, submitFailed: true } : c)),
    });
  };

  // 클러스터가 하나도 없으면 차트가 의미 없다 — 등록 유도(정직한 빈 상태)
  if (clustersQ.isSuccess && clusters.length === 0) {
    return (
      <FadeSlideIn>
        <PageHeader title="메트릭" />
        <Card>
          <EmptyState icon={<IconClock size={26} />} title="등록된 클러스터가 없습니다"
            description={admin ? '클러스터를 등록하고 에이전트가 연결되면 실시간·스냅샷 메트릭이 표시됩니다' : '접근 권한이 있는 클러스터가 연결되면 실시간·스냅샷 메트릭이 표시됩니다'}
            action={admin ? <Link to={pathFor('/clusters')}><Button variant="primary">클러스터 등록</Button></Link> : undefined} />
        </Card>
      </FadeSlideIn>
    );
  }

  return (
    <FadeSlideIn>
      <PageHeader title="메트릭"
        actions={
          <>
            <select className="input" style={{ width: 180 }} value={clusterId} onChange={e => selectCluster(e.target.value)}>
              {clusters.map(c => <option key={c.cluster_id} value={c.cluster_id}>{c.name}</option>)}
            </select>
            <Button onClick={() => setPaused(p => !p)} aria-pressed={paused} title={paused ? '재개' : '일시정지'}>
              {paused ? <IconPlay size={15} /> : <IconPause size={15} />}{paused ? '재개' : '일시정지'}
            </Button>
          </>
        } />
      {(subject || subjectName) && (
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: 10, minWidth: 0 }}>
          <Badge tone="info">{subject || 'resource'}</Badge>
          {namespace && <code>{namespace}</code>}
          {subjectName && <code style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subjectName}</code>}
          {contextPreset && (
            <span style={{ marginLeft: 'auto' }}>
              <Button size="sm" onClick={() => execute({ ...contextPreset, rangeSeconds: range })}>쿼리 실행</Button>
            </span>
          )}
        </div>
      )}
      {status !== 'open' && <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: 12, fontSize: 'var(--fs-sm)' }}>실시간 스트림 재연결 중 — 최신 인벤토리 스냅샷을 표시합니다</div>}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
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
        {usageQ.isPending ? <Skeleton lines={4} /> /* 클러스터 선택 전(비활성)에도 스켈레톤 — 성급한 '없음' 금지 */
          : usageQ.isError ? (
            <EmptyState icon={<IconClock size={26} />} title="추이 데이터를 불러오지 못했습니다"
              description={(usageQ.error as Error).message}
              action={<Button size="sm" onClick={() => usageQ.refetch()}>다시 시도</Button>} />
          ) : usageSeries.length === 0 ? (
            <EmptyState icon={<IconClock size={26} />} title="아직 수집된 스냅샷 시계열이 없습니다"
              description="에이전트가 연결되면 스냅샷(30초 주기)마다 실측 usage 가 쌓입니다" />
          ) : <TimeSeriesChart series={usageSeries} />}
      </Card>
      <Card title="PromQL">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 220 }}
            value={PRESETS.some(p => p.promql === promql) ? promql : ''}
            onChange={e => { if (e.target.value) setPromql(e.target.value); }}>
            <option value="" disabled>{contextPreset?.label ?? '직접 입력…'}</option>
            {PRESETS.map(p => <option key={p.label} value={p.promql}>{p.label}</option>)}
          </select>
          <input className="input" style={{ fontFamily: 'var(--font-mono)', flex: 1, minWidth: 220 }} value={promql} onChange={e => setPromql(e.target.value)} />
          <select className="input" style={{ width: 92 }} value={range} onChange={e => setRange(Number(e.target.value))}
            title="조회 범위 (range)">
            {RANGES.map(r => <option key={r.seconds} value={r.seconds}>{r.label}</option>)}
          </select>
          <Button variant="primary" onClick={() => execute()} disabled={!clusterId || !promql.trim()}
            title={clusterId ? '' : '클러스터를 먼저 선택해주세요'}>실행</Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AnimatedList items={cards} getKey={c => c.id}>
            {c => <QueryCardRow card={c} onRetry={() => execute(c)} />}
          </AnimatedList>
        </div>
      </Card>
    </FadeSlideIn>
  );
}

// 단위별 값 포맷 — ratio 는 % 로, count 는 유효자리 축약
const fmtValue = (v: number, unit: Unit) => (unit === 'ratio' ? `${(v * 100).toFixed(1)}%` : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
const fmtRange = (s: number) => (s >= 3600 ? `${s / 3600}h` : `${s / 60}m`);
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function buildContextPreset(subject: string, name: string, namespace: string): ContextPreset | null {
  const n = name.trim();
  if (!subject || !n) return null;
  const ns = namespace.trim();
  const nsFilter = ns ? `namespace="${esc(ns)}",` : '';
  if (subject === 'pod') {
    return {
      label: '선택 팟 재시작',
      unit: 'count',
      promql: `sum by (pod) (rate(kube_pod_container_status_restarts_total{${nsFilter}pod="${esc(n)}"}[5m]))`,
    };
  }
  if (subject === 'workload') {
    return {
      label: '선택 워크로드 레플리카',
      unit: 'count',
      promql: `kube_deployment_status_replicas{${nsFilter}deployment="${esc(n)}"}`,
    };
  }
  if (subject === 'node') {
    return {
      label: '선택 노드 CPU',
      unit: 'ratio',
      promql: `1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle",instance=~".*${esc(n)}.*"}[5m]))`,
    };
  }
  if (subject === 'service') {
    return {
      label: '선택 서비스 정보',
      unit: 'count',
      promql: `count by (service) (kube_service_info{${nsFilter}service="${esc(n)}"})`,
    };
  }
  if (subject === 'cluster') {
    return { label: '클러스터 팟 수', unit: 'count', promql: 'count by (namespace) (kube_pod_info)' };
  }
  return null;
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
    <div className="query-row" data-testid="query-card">
      <Badge status={badge} />
      <code style={{ fontSize: 'var(--fs-xs)', flex: 1, minWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.promql}</code>
      <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>range {fmtRange(card.rangeSeconds)}</span>
      {summary && (
        <span style={{ color: 'var(--ok)', fontSize: 'var(--fs-sm)', fontVariantNumeric: 'tabular-nums' }}>
          {summary.series} series · {summary.points} pts
          {summary.avg !== null ? ` · 평균 ${fmtValue(summary.avg, card.unit)}` : ''}
          {summary.max !== null && summary.max !== summary.avg ? ` · 최대 ${fmtValue(summary.max, card.unit)}` : ''}
        </span>
      )}
      {status === 'completed' && !summary && <span style={{ color: 'var(--ok)', fontSize: 'var(--fs-sm)' }}>{commandResultMessage(result) ?? '완료'}</span>}
      {failMessage && <span style={{ color: 'var(--danger)', fontSize: 'var(--fs-xs)' }}>{failMessage}</span>}
      {!isTerminal(status) && card.commandId && <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>agent 실행 대기·수행 중</span>}
      {status === 'failed' && <Button size="sm" onClick={onRetry}>재시도</Button>}
    </div>
  );
}
