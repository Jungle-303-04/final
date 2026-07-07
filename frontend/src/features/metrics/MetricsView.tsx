import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { post } from '@/shared/lib/api';
import { liveStore } from '@/shared/lib/live';
import { useClusters, useClusterSummary, useClusterUsage, usePods } from '@/features/cluster/api';
import { useIsAdmin } from '@/features/auth/api';
import {
  commandResultMessage,
  isTerminal,
  summarizeTelemetryResult,
  useCommandStatus,
  useDeleteMetricQueryPreset,
  useDeleteMetricWidget,
  useMetricQueryPresets,
  useMetricWidgets,
  useRunMetricQueryPreset,
  useUpsertMetricQueryPreset,
  useUpsertMetricWidget,
  type CommandAcceptedResponse,
  type MetricQueryPresetPayload,
  type MetricWidgetPayload,
} from '@/features/metrics/api';
import { Badge, Button, Card, EmptyState, Skeleton, StatBox } from '@/shared/ui';
import { PageHeader } from '@/plural-ui';
import { TimeSeriesChart, type Series } from '@/shared/ui/charts';
import { AnimatedList, FadeSlideIn } from '@/shared/motion';
import { IconClock, IconPause, IconPlay } from '@/shared/ui/icons';
import { useConsolePath } from '@/features/console/ui';
import type { Tone } from '@/shared/lib/types';

type Unit = 'ratio' | 'count' | string;
const RANGES = [
  { label: '5분', seconds: 300 },
  { label: '15분', seconds: 900 },
  { label: '1시간', seconds: 3600 },
  { label: '6시간', seconds: 21600 },
];
interface QueryCard { id: string; promql: string; unit: Unit; rangeSeconds: number; presetId?: string; commandId?: string; submitFailed?: boolean }
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
  const [promql, setPromql] = useState(contextPreset?.promql ?? '');
  const [presetName, setPresetName] = useState(contextPreset?.label ?? '');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [widgetTitle, setWidgetTitle] = useState('');
  const [range, setRange] = useState(RANGES[0].seconds);
  const [cards, setCards] = useState<QueryCard[]>([]);
  const summaryQ = useClusterSummary(clusterId);
  const usageQ = useClusterUsage(clusterId);
  const workloadsQ = usePods(clusterId);
  const history = liveStore(s => s.history);
  const status = liveStore(s => s.status);
  const snapshot = liveStore(s => s.snapshot);
  const [frozen, setFrozen] = useState(history);
  const queryPresetsQ = useMetricQueryPresets(clusterId);
  const metricWidgetsQ = useMetricWidgets(clusterId);
  const savePreset = useUpsertMetricQueryPreset(clusterId);
  const deletePreset = useDeleteMetricQueryPreset(clusterId);
  const runPreset = useRunMetricQueryPreset(clusterId);
  const saveWidget = useUpsertMetricWidget(clusterId);
  const deleteWidget = useDeleteMetricWidget(clusterId);
  const queryPresets = queryPresetsQ.data ?? [];
  const metricWidgets = metricWidgetsQ.data ?? [];
  const selectedPreset = queryPresets.find(p => p.preset_id === selectedPresetId) ?? null;
  const clusterKnown = clusters.some(c => c.cluster_id === clusterId);
  const statPending = !clusterId || summaryQ.isPending || workloadsQ.isPending;

  useEffect(() => {
    if (!clusters.length) return;
    if (!clusterId || !clusters.some(c => c.cluster_id === clusterId)) {
      setClusterId(clusters[0].cluster_id);
    }
  }, [clusterId, clusters]);

  const selectCluster = (nextClusterId: string) => {
    setClusterId(nextClusterId);
    setSelectedPresetId('');
    setWidgetTitle('');
    const next = new URLSearchParams(sp);
    next.set('cluster', nextClusterId);
    setSp(next, { replace: true });
  };

  useEffect(() => {
    if (!paused) setFrozen(history);
  }, [history, paused]);

  useEffect(() => {
    if (!contextPreset) return;
    setSelectedPresetId('');
    setPromql(contextPreset.promql);
    setPresetName(contextPreset.label);
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
  const series: Series[] = useMemo(() => {
    const base = paused ? frozen : history;
    const pts = base.filter(p => !p.clusterId || p.clusterId === clusterId).slice(-120);
    return [
      { id: '재시작', data: pts.map(p => ({ x: p.at, y: p.restarts })) },
      { id: '실행 팟', data: pts.map(p => ({ x: p.at, y: p.running })) },
    ];
  }, [clusterId, paused, frozen, history]);

  // 스냅샷 기반 실측 추이 — cluster_usage_samples 시계열(실 시각 라벨)
  const usageSeries: Series[] = useMemo(() => {
    const samples = usageQ.data ?? [];
    if (!samples.length) return [];
    const pointTime = (s: { sampled_at: string | null }, i: number) => {
      const parsed = s.sampled_at ? Date.parse(s.sampled_at) : NaN;
      return Number.isFinite(parsed) ? parsed : i + 1;
    };
    return [
      { id: '실행 팟', data: samples.map((s, i) => ({ x: pointTime(s, i), y: s.usage.pod_running ?? 0 })) },
      { id: '재시작 누적', data: samples.map((s, i) => ({ x: pointTime(s, i), y: s.usage.restart_total ?? 0 })) },
      { id: '준비 노드', data: samples.map((s, i) => ({ x: pointTime(s, i), y: s.usage.node_ready ?? 0 })) },
    ];
  }, [usageQ.data]);

  const run = useMutation({
    mutationFn: ({ q, rangeSeconds }: { q: string; rangeSeconds: number }) => post<CommandAcceptedResponse>('/agent/debug/query', {
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
    const unit = card?.unit ?? unitForCurrentQuery(q, selectedPreset, contextPreset);
    const rangeSeconds = card?.rangeSeconds ?? range;
    const presetId = 'presetId' in (card ?? {}) ? (card as QueryCard).presetId : presetIdForCurrentQuery(q, rangeSeconds, selectedPreset);
    const id = newQueryCardId();
    setCards(cs => [{ id, promql: q, unit, rangeSeconds, presetId }, ...cs]);
    const onSuccess = (d: CommandAcceptedResponse) => setCards(cs => cs.map(c => c.id === id ? { ...c, commandId: d.command_id } : c));
    const onError = () => setCards(cs => cs.map(c => c.id === id ? { ...c, submitFailed: true } : c));
    if (presetId) runPreset.mutate(presetId, { onSuccess, onError });
    else run.mutate({ q, rangeSeconds }, { onSuccess, onError });
  };

  const selectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = queryPresets.find(p => p.preset_id === presetId);
    if (!preset) return;
    setPromql(preset.query);
    setPresetName(preset.name);
    if (preset.range_seconds) setRange(preset.range_seconds);
    setWidgetTitle(preset.name);
  };

  const saveCurrentPreset = () => {
    const payload = metricPresetPayload({
      presetId: selectedPreset?.preset_id,
      name: presetName,
      query: promql,
      rangeSeconds: range,
      unit: unitForCurrentQuery(promql, selectedPreset, contextPreset),
      context: contextPreset ? { subject, name: subjectName, namespace } : undefined,
    });
    if (!payload) return;
    savePreset.mutate(payload, {
      onSuccess: response => {
        setSelectedPresetId(response.item.preset_id);
        setPresetName(response.item.name);
        setWidgetTitle(response.item.name);
      },
    });
  };

  const saveCurrentWidget = () => {
    const preset = selectedPreset;
    if (!preset) return;
    const payload = metricWidgetPayload({
      queryPresetId: preset.preset_id,
      title: widgetTitle || preset.name,
      kind: 'line',
      settings: { unit: preset.unit || unitForCurrentQuery(preset.query, preset, contextPreset) },
    });
    if (!payload) return;
    saveWidget.mutate(payload);
  };

  // 클러스터가 하나도 없으면 차트가 의미 없다 — 등록 유도(정직한 빈 상태)
  if (clustersQ.isSuccess && clusters.length === 0) {
    return (
      <FadeSlideIn>
        <PageHeader title="메트릭" />
        <Card>
          <EmptyState icon={<IconClock size={26} />} title="등록된 클러스터가 없습니다"
            description={admin ? '클러스터를 등록하고 에이전트가 연결되면 스트림·스냅샷 메트릭이 표시됩니다' : '접근 권한이 있는 클러스터가 연결되면 스트림·스냅샷 메트릭이 표시됩니다'}
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
              {!clusterKnown && (
                <option value={clusterId}>{clusterId || (clustersQ.isPending ? '클러스터 확인 중' : '클러스터 없음')}</option>
              )}
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
      {status !== 'open' && <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: 12, fontSize: 'var(--fs-sm)' }}>스트림 재연결 중 — 최신 인벤토리 스냅샷을 표시합니다</div>}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <MetricStatBox label="Running" value={phases.Running ?? 0} tone="ok" loading={statPending} />
        <MetricStatBox label="Pending" value={phases.Pending ?? 0} tone="warn" loading={statPending} />
        <MetricStatBox label="CrashLoop" value={phases.CrashLoopBackOff ?? 0} tone={(phases.CrashLoopBackOff ?? 0) > 0 ? 'danger' : 'neutral'} loading={statPending} />
        <MetricStatBox label="노드" value={summary?.nodes.length ?? 0} tone="info" loading={statPending} />
        {snapshot?.rollout && <StatBox label={`rollout ${snapshot.rollout.name}`} value={snapshot.rollout.progress} tone="info" />}
      </div>
      <Card title="스트림 추이 — 재시작 / 실행 팟" style={{ marginBottom: 16 }}>
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
      <Card title="저장 위젯" style={{ marginBottom: 16 }}>
        {metricWidgetsQ.isPending ? <Skeleton lines={3} />
          : metricWidgetsQ.isError ? (
            <EmptyState icon={<IconClock size={26} />} title="위젯을 불러오지 못했습니다"
              description={(metricWidgetsQ.error as Error).message}
              action={<Button size="sm" onClick={() => metricWidgetsQ.refetch()}>다시 시도</Button>} />
          ) : metricWidgets.length === 0 ? (
            <EmptyState icon={<IconClock size={26} />} title="저장된 위젯이 없습니다" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <AnimatedList items={metricWidgets} getKey={w => w.widget_id}>
                {widget => {
                  const preset = queryPresets.find(p => p.preset_id === widget.query_preset_id);
                  return (
                    <div className="query-row">
                      <Badge tone="info">{widget.kind}</Badge>
                      <strong style={{ minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{widget.title}</strong>
                      <code>{preset?.name ?? widget.query_preset_id}</code>
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                        <Button size="sm" disabled={!preset} onClick={() => preset && execute({
                          promql: preset.query,
                          unit: preset.unit || 'count',
                          rangeSeconds: preset.range_seconds ?? range,
                          presetId: preset.preset_id,
                        } as QueryCard)}>실행</Button>
                        <Button size="sm" variant="danger" onClick={() => deleteWidget.mutate(widget.widget_id)}>삭제</Button>
                      </span>
                    </div>
                  );
                }}
              </AnimatedList>
            </div>
          )}
      </Card>
      <Card title="PromQL">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 220 }}
            value={selectedPresetId}
            onChange={e => selectPreset(e.target.value)}>
            <option value="">저장 쿼리</option>
            {queryPresets.map(p => <option key={p.preset_id} value={p.preset_id}>{p.name}</option>)}
          </select>
          <input className="input" style={{ width: 180 }} value={presetName} placeholder="쿼리 이름" onChange={e => setPresetName(e.target.value)} />
          <input className="input" style={{ fontFamily: 'var(--font-mono)', flex: 1, minWidth: 220 }} value={promql} onChange={e => setPromql(e.target.value)} />
          <select className="input" style={{ width: 92 }} value={range} onChange={e => setRange(Number(e.target.value))}
            title="조회 범위 (range)">
            {RANGES.map(r => <option key={r.seconds} value={r.seconds}>{r.label}</option>)}
          </select>
          <Button onClick={saveCurrentPreset} loading={savePreset.isPending} disabled={!clusterId || !promql.trim() || !presetName.trim()}>저장</Button>
          <input className="input" style={{ width: 180 }} value={widgetTitle} placeholder="위젯 제목" onChange={e => setWidgetTitle(e.target.value)} />
          <Button onClick={saveCurrentWidget} loading={saveWidget.isPending} disabled={!selectedPreset || !widgetTitle.trim()}>위젯</Button>
          <Button variant="primary" onClick={() => execute()} disabled={!clusterId || !promql.trim()}
            title={clusterId ? '' : '클러스터를 먼저 선택해주세요'}>실행</Button>
        </div>
        {queryPresetsQ.isError && (
          <div className="query-row" style={{ marginBottom: 8 }}>
            <Badge tone="danger">error</Badge>
            <span style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{(queryPresetsQ.error as Error).message}</span>
            <Button size="sm" onClick={() => queryPresetsQ.refetch()}>다시 시도</Button>
          </div>
        )}
        {selectedPreset && (
          <div className="query-row" style={{ marginBottom: 8 }}>
            <Badge tone="neutral">saved</Badge>
            <span style={{ color: 'var(--text-2)', fontSize: 'var(--fs-xs)' }}>{selectedPreset.unit || 'count'} · range {fmtRange(selectedPreset.range_seconds ?? range)}</span>
            <Button size="sm" variant="danger" onClick={() => {
              deletePreset.mutate(selectedPreset.preset_id);
              setSelectedPresetId('');
            }}>삭제</Button>
          </div>
        )}
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

function newQueryCardId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

function unitForCurrentQuery(q: string, selectedPreset: { query: string; unit: string } | null, contextPreset: ContextPreset | null): Unit {
  if (selectedPreset?.query === q && selectedPreset.unit) return selectedPreset.unit;
  if (contextPreset?.promql === q) return contextPreset.unit;
  return 'count';
}

function presetIdForCurrentQuery(q: string, rangeSeconds: number, selectedPreset: { preset_id: string; query: string; range_seconds: number | null } | null): string | undefined {
  if (!selectedPreset) return undefined;
  return selectedPreset.query === q && (selectedPreset.range_seconds ?? rangeSeconds) === rangeSeconds
    ? selectedPreset.preset_id
    : undefined;
}

export function metricPresetPayload(input: {
  presetId?: string;
  name: string;
  query: string;
  rangeSeconds: number;
  unit: Unit;
  context?: Record<string, string>;
}): MetricQueryPresetPayload | null {
  const name = input.name.trim();
  const query = input.query.trim();
  if (!name || !query) return null;
  const metadata = input.context ? { context: input.context } : {};
  return {
    ...(input.presetId ? { preset_id: input.presetId } : {}),
    name,
    description: '',
    source: 'prometheus',
    query,
    range_seconds: input.rangeSeconds,
    step_seconds: Math.min(30, input.rangeSeconds),
    unit: input.unit,
    metadata,
  };
}

export function metricWidgetPayload(input: {
  widgetId?: string;
  queryPresetId: string;
  title: string;
  kind?: MetricWidgetPayload['kind'];
  settings?: Record<string, unknown>;
}): MetricWidgetPayload | null {
  const title = input.title.trim();
  const queryPresetId = input.queryPresetId.trim();
  if (!title || !queryPresetId) return null;
  return {
    ...(input.widgetId ? { widget_id: input.widgetId } : {}),
    query_preset_id: queryPresetId,
    title,
    kind: input.kind ?? 'line',
    position: {},
    settings: input.settings ?? {},
  };
}

function MetricStatBox({ label, value, tone, loading }: { label: string; value: number; tone?: Tone; loading: boolean }) {
  if (!loading) return <StatBox label={label} value={value} tone={tone} />;
  return <div className="statbox"><b>—</b><span>{label}</span></div>;
}

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
