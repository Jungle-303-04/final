import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { post } from '@/shared/lib/api';
import { liveStore } from '@/shared/lib/live';
import { useClusters, useClusterSummary, useClusterUsage, usePods, type UsageSample } from '@/features/cluster/api';
import { buildUsageSeries } from '@/features/metrics/usageSeries';
import { useIsAdmin } from '@/features/auth/api';
import {
  commandResultMessage,
  isTerminal,
  summarizeTelemetryResult,
  useCommandStatus,
  useDeleteMetricQueryPreset,
  useDeleteMetricWidget,
  useMetricQueryPresets,
  useMetricValidation,
  useMetricWidgets,
  useRunMetricQueryPreset,
  useUpsertMetricQueryPreset,
  useUpsertMetricWidget,
  validateMetricQuery,
  type CommandAcceptedResponse,
  type MetricQueryPresetPayload,
  type MetricValidationResponse,
  type MetricWidgetPayload,
} from '@/features/metrics/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  StatusChip,
  Textarea,
  cx,
  useToast,
} from '@/ui';
import { hasSparklinePoints, Sparkline, TimeSeriesChart, type Series } from '@/ui/charts';
import { AnimatePresence, listItem, listStagger } from '@/ui/motion';
import { useConsolePath } from '@/features/console/ui';

type Unit = 'ratio' | 'count' | string;
type StatTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type UiStatus = 'healthy' | 'warning' | 'critical' | 'pending' | 'running' | 'failed';

const RANGES = [
  { label: '5분', seconds: 300 },
  { label: '15분', seconds: 900 },
  { label: '1시간', seconds: 3600 },
  { label: '6시간', seconds: 21600 },
];
const PROMQL_VALIDATE_DEBOUNCE_MS = 450;

interface QueryCard {
  id: string;
  promql: string;
  unit: Unit;
  rangeSeconds: number;
  presetId?: string;
  commandId?: string;
  submitFailed?: boolean;
}

type QueryRunInput = Pick<QueryCard, 'promql' | 'unit' | 'rangeSeconds'> & Partial<Pick<QueryCard, 'presetId'>>;

interface ContextPreset {
  promql: string;
  unit: Unit;
  label: string;
}

export default function MetricsView() {
  const [sp, setSp] = useSearchParams();
  const pathFor = useConsolePath();
  const { push } = useToast();
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
  const [queryNotice, setQueryNotice] = useState<string | null>(null);
  const debouncedPromql = useDebouncedValue(promql.trim(), PROMQL_VALIDATE_DEBOUNCE_MS);
  const summaryQ = useClusterSummary(clusterId);
  const usageQ = useClusterUsage(clusterId);
  const workloadsQ = usePods(clusterId);
  const history = liveStore((s) => s.history);
  const status = liveStore((s) => s.status);
  const snapshot = liveStore((s) => s.snapshot);
  const [frozen, setFrozen] = useState(history);
  const queryPresetsQ = useMetricQueryPresets(clusterId);
  const metricWidgetsQ = useMetricWidgets(clusterId);
  const savePreset = useUpsertMetricQueryPreset(clusterId);
  const deletePreset = useDeleteMetricQueryPreset(clusterId);
  const runPreset = useRunMetricQueryPreset(clusterId);
  const saveWidget = useUpsertMetricWidget(clusterId);
  const deleteWidget = useDeleteMetricWidget(clusterId);
  const validateRun = useMutation({
    mutationFn: (input: { query: string; rangeSeconds: number }) => validateMetricQuery(input),
  });
  const queryValidationQ = useMetricValidation({
    query: debouncedPromql,
    rangeSeconds: range,
    enabled: Boolean(clusterId && debouncedPromql),
  });
  const queryPresets = queryPresetsQ.data ?? [];
  const metricWidgets = metricWidgetsQ.data ?? [];
  const selectedPreset = queryPresets.find((p) => p.preset_id === selectedPresetId) ?? null;
  const clusterKnown = clusters.some((c) => c.cluster_id === clusterId);
  const statPending = !clusterId || summaryQ.isPending || workloadsQ.isPending;
  const queryIsCurrent = debouncedPromql === promql.trim();
  const queryValidationPending = Boolean(promql.trim()) && (!queryIsCurrent || queryValidationQ.isFetching);
  const currentValidationValid = Boolean(promql.trim()) && queryIsCurrent && queryValidationQ.data?.valid === true && !queryValidationQ.isFetching;
  const validationState = describeValidationState({
    promql,
    clusterId,
    pending: queryValidationPending,
    data: queryValidationQ.data,
    error: queryValidationQ.error,
    valid: currentValidationValid,
  });
  const canSavePreset = Boolean(clusterId && presetName.trim() && currentValidationValid);
  const canExecuteCurrent = Boolean(clusterId && currentValidationValid && !validateRun.isPending);

  useEffect(() => {
    if (!clusters.length) return;
    if (!clusterId || !clusters.some((c) => c.cluster_id === clusterId)) {
      setClusterId(clusters[0].cluster_id);
    }
  }, [clusterId, clusters]);

  useEffect(() => {
    if (!paused) setFrozen(history);
  }, [history, paused]);

  useEffect(() => {
    if (!contextPreset) return;
    setSelectedPresetId('');
    setPromql(contextPreset.promql);
    setPresetName(contextPreset.label);
  }, [contextPreset]);

  useEffect(() => {
    setQueryNotice(null);
  }, [clusterId, promql, range]);

  const selectCluster = (nextClusterId: string) => {
    setClusterId(nextClusterId);
    setSelectedPresetId('');
    setWidgetTitle('');
    const next = new URLSearchParams(sp);
    next.set('cluster', nextClusterId);
    setSp(next, { replace: true, preventScrollReset: true });
  };

  const summary = summaryQ.data;
  const workloads = workloadsQ.data ?? [];
  const inventoryPhases = summary?.pod_phases ?? {};
  const workloadPhases = workloads.reduce<Record<string, number>>((acc, pod) => {
    acc[pod.phase] = (acc[pod.phase] ?? 0) + 1;
    return acc;
  }, {});
  const livePhases = snapshot
    ? snapshot.namespaces.flatMap((n) => n.pods).reduce<Record<string, number>>((acc, pod) => {
      acc[pod.phase] = (acc[pod.phase] ?? 0) + 1;
      return acc;
    }, {})
    : {};
  const phases = Object.keys(livePhases).length
    ? livePhases
    : Object.keys(inventoryPhases).length
      ? inventoryPhases
      : workloadPhases;
  const series: Series[] = useMemo(() => {
    const base = paused ? frozen : history;
    const pts = base.filter((p) => !p.clusterId || p.clusterId === clusterId).slice(-120);
    return [
      { id: '재시작', data: pts.map((p) => ({ x: p.at, y: p.restarts })) },
      { id: '실행 팟', data: pts.map((p) => ({ x: p.at, y: p.running })) },
    ];
  }, [clusterId, paused, frozen, history]);
  const usageSeries: Series[] = useMemo(() => buildUsageSeries(usageQ.data ?? []), [usageQ.data]);
  const usageSamples = usageQ.data ?? [];
  const runningSpark = seriesPoints(series, '실행 팟', usageMetricPoints(usageSamples, 'pod_running'));
  const restartSpark = seriesPoints(series, '재시작', usageRestartDeltaPoints(usageSamples));
  const nodeSpark = usageMetricPoints(usageSamples, 'node_ready');

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

  const execute = (card?: QueryRunInput) => {
    const q = (card?.promql ?? promql).trim();
    if (!clusterId) {
      setQueryNotice('클러스터를 먼저 선택하세요');
      return;
    }
    if (!q) {
      setQueryNotice('PromQL을 입력하세요');
      return;
    }
    const unit = card?.unit ?? unitForCurrentQuery(q, selectedPreset, contextPreset);
    const rangeSeconds = card?.rangeSeconds ?? range;
    const presetId = card?.presetId ?? presetIdForCurrentQuery(q, rangeSeconds, selectedPreset);
    validateRun.mutate({ query: q, rangeSeconds }, {
      onSuccess: (validation) => {
        if (!validation.valid) {
          setQueryNotice(metricValidationMessage(validation));
          return;
        }
        queuePromqlRun({ q, unit, rangeSeconds, presetId });
      },
      onError: (error) => {
        setQueryNotice((error as Error).message || 'PromQL dry-run 검증에 실패했습니다');
      },
    });
  };

  const queuePromqlRun = ({ q, unit, rangeSeconds, presetId }: { q: string; unit: Unit; rangeSeconds: number; presetId?: string }) => {
    const id = newQueryCardId();
    setCards((items) => [{ id, promql: q, unit, rangeSeconds, presetId }, ...items]);
    const onSuccess = (data: CommandAcceptedResponse) => {
      setCards((items) => items.map((item) => (item.id === id ? { ...item, commandId: data.command_id } : item)));
      push({ tone: 'success', title: '쿼리 실행 요청 완료', description: '명령 상태를 인라인으로 추적합니다' });
    };
    const onError = (error: unknown) => {
      setCards((items) => items.map((item) => (item.id === id ? { ...item, submitFailed: true } : item)));
      setQueryNotice((error as Error).message || '쿼리 실행 요청에 실패했습니다');
    };
    if (presetId) runPreset.mutate(presetId, { onSuccess, onError });
    else run.mutate({ q, rangeSeconds }, { onSuccess, onError });
  };

  const selectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = queryPresets.find((p) => p.preset_id === presetId);
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
      onSuccess: (response) => {
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

  if (clustersQ.isSuccess && clusters.length === 0) {
    return (
      <section>
        <PageHeader title="메트릭" description="클러스터 사용량, 저장 쿼리, 온디맨드 PromQL을 한 화면에서 확인합니다" />
        <Card>
          <EmptyState
            title="등록된 클러스터가 없습니다"
            description="메트릭을 보려면 먼저 대상 클러스터를 등록하세요"
            action={admin ? <Link to={pathFor('/clusters')}><Button variant="primary">클러스터 등록</Button></Link> : undefined}
          />
        </Card>
      </section>
    );
  }

  if (clustersQ.isError) {
    return (
      <section>
        <PageHeader title="메트릭" description="클러스터 사용량, 저장 쿼리, 온디맨드 PromQL을 한 화면에서 확인합니다" />
        <Card>
          <EmptyState
            title="클러스터 조회 실패"
            description={(clustersQ.error as Error).message}
            action={<Button size="sm" onClick={() => clustersQ.refetch()}>다시 시도</Button>}
          />
        </Card>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title="메트릭"
        description="스트림과 스냅샷 추이를 확인하고, PromQL은 dry-run 검증 후 실행합니다"
        actions={(
          <>
            <Select className="w-full md:w-56" value={clusterId} onChange={(event) => selectCluster(event.target.value)}>
              {!clusterKnown && (
                <option value={clusterId}>{clusterId || (clustersQ.isPending ? '클러스터 확인 중' : '클러스터 없음')}</option>
              )}
              {clusters.map((cluster) => (
                <option key={cluster.cluster_id} value={cluster.cluster_id}>{cluster.name || cluster.cluster_id}</option>
              ))}
            </Select>
            <Button onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
              {paused ? '재개' : '일시정지'}
            </Button>
          </>
        )}
      />

      <div className="grid gap-4">
        {(subject || subjectName) && (
          <Card className="p-3">
            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge tone="info">{subject || 'resource'}</Badge>
                {namespace && <code className="min-w-0 truncate rounded-control bg-bg px-2 py-1 font-mono text-caption text-text-secondary">{namespace}</code>}
                {subjectName && <code className="min-w-0 truncate rounded-control bg-bg px-2 py-1 font-mono text-caption text-text-secondary">{subjectName}</code>}
              </div>
              {contextPreset && (
                <div className="md:ml-auto">
                  <Button size="sm" onClick={() => execute({ ...contextPreset, rangeSeconds: range })} loading={validateRun.isPending}>
                    쿼리 실행
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {status !== 'open' && (
          <Card className="border-warning/40 bg-warning/10 p-3">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <p className="text-body font-semibold text-warning">수집 지연</p>
              <p className="text-label text-text-secondary">실시간 스트림이 닫혀 있어 스냅샷 데이터로 화면을 유지합니다</p>
            </div>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricStatCard label="실행" value={phases.Running ?? 0} tone="success" loading={statPending} sparkPoints={runningSpark} />
          <MetricStatCard label="대기" value={phases.Pending ?? 0} tone="warning" loading={statPending} />
          <MetricStatCard label="재시작 오류" value={phases.CrashLoopBackOff ?? 0} tone={(phases.CrashLoopBackOff ?? 0) > 0 ? 'danger' : 'neutral'} loading={statPending} sparkPoints={restartSpark} />
          <MetricStatCard label="노드" value={summary?.nodes.length ?? 0} tone="info" loading={statPending} sparkPoints={nodeSpark} />
          {snapshot?.rollout && <StatCard label={`rollout ${snapshot.rollout.name}`} value={snapshot.rollout.progress} tone="info" />}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="실시간 추이" description={paused ? '일시정지된 스트림 기록입니다' : '브라우저 스트림의 최근 기록입니다'}>
            <TimeSeriesChart series={series} />
          </Card>
          <Card title="사용량 추이" description="인벤토리 스냅샷 기준의 장기 추이입니다">
            {usageQ.isPending ? (
              <Skeleton lines={5} />
            ) : usageQ.isError ? (
              <EmptyState
                title="추이 데이터 조회 실패"
                description={(usageQ.error as Error).message}
                action={<Button size="sm" onClick={() => usageQ.refetch()}>다시 시도</Button>}
              />
            ) : usageSeries.length === 0 ? (
              <EmptyState title="수집된 사용량 추이가 없습니다" description="target agent가 usage 샘플을 적재하면 이 카드에 표시됩니다" />
            ) : (
              <TimeSeriesChart series={usageSeries} />
            )}
          </Card>
        </div>

        <Card title="저장 위젯" description="저장된 PromQL 정의를 대시보드 위젯으로 실행합니다">
          {metricWidgetsQ.isPending ? (
            <Skeleton lines={4} />
          ) : metricWidgetsQ.isError ? (
            <EmptyState
              title="위젯 조회 실패"
              description={(metricWidgetsQ.error as Error).message}
              action={<Button size="sm" onClick={() => metricWidgetsQ.refetch()}>다시 시도</Button>}
            />
          ) : metricWidgets.length === 0 ? (
            <EmptyState title="저장된 위젯이 없습니다" description="검증된 쿼리를 저장한 뒤 위젯으로 고정하세요" />
          ) : (
            <motion.div variants={listStagger} initial="initial" animate="animate" className="grid gap-2">
              <AnimatePresence initial={false}>
                {metricWidgets.map((widget) => {
                  const preset = queryPresets.find((item) => item.preset_id === widget.query_preset_id);
                  return (
                    <RowShell key={widget.widget_id}>
                      <Badge tone="info">{widget.kind}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-semibold text-text-primary">{widget.title}</p>
                        <code className="mt-1 block truncate font-mono text-caption text-text-muted">{preset?.name ?? widget.query_preset_id}</code>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={!preset || validateRun.isPending}
                          loading={validateRun.isPending}
                          onClick={() => preset && execute({
                            promql: preset.query,
                            unit: preset.unit || 'count',
                            rangeSeconds: preset.range_seconds ?? range,
                            presetId: preset.preset_id,
                          })}
                        >
                          실행
                        </Button>
                        <Button size="sm" variant="danger" loading={deleteWidget.isPending} onClick={() => deleteWidget.mutate(widget.widget_id)}>
                          삭제
                        </Button>
                      </div>
                    </RowShell>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </Card>

        <Card title="PromQL 실행" description="문법 dry-run 검증이 성공해야 저장과 실행이 가능합니다">
          <div className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="저장 쿼리">
                <Select value={selectedPresetId} onChange={(event) => selectPreset(event.target.value)}>
                  <option value="">{queryPresetsQ.isPending ? '저장 쿼리 확인 중' : '저장 쿼리 선택'}</option>
                  {queryPresets.map((preset) => (
                    <option key={preset.preset_id} value={preset.preset_id}>{preset.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="쿼리 이름" help="저장할 때 사용하는 이름입니다">
                <Input value={presetName} placeholder="CPU 사용률" onChange={(event) => setPresetName(event.target.value)} />
              </Field>
              <Field label="조회 범위">
                <Select value={range} onChange={(event) => setRange(Number(event.target.value))}>
                  {RANGES.map((item) => (
                    <option key={item.seconds} value={item.seconds}>{item.label}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="PromQL" help={validationState.help} error={validationState.error}>
              <Textarea
                className="min-h-28 font-mono"
                value={promql}
                placeholder="sum by (namespace) (kube_pod_info)"
                onChange={(event) => setPromql(event.target.value)}
              />
            </Field>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <Field label="위젯 제목" help="선택된 저장 쿼리를 위젯으로 고정합니다">
                <Input value={widgetTitle} placeholder="네임스페이스별 팟 수" onChange={(event) => setWidgetTitle(event.target.value)} />
              </Field>
              <div className="flex flex-wrap items-end gap-2">
                <Button onClick={saveCurrentPreset} loading={savePreset.isPending} disabled={!canSavePreset}>
                  저장
                </Button>
                <Button onClick={saveCurrentWidget} loading={saveWidget.isPending} disabled={!selectedPreset || !widgetTitle.trim()}>
                  위젯 저장
                </Button>
                <Button
                  variant="primary"
                  onClick={() => execute()}
                  loading={validateRun.isPending || run.isPending || runPreset.isPending}
                  disabled={!canExecuteCurrent}
                >
                  실행
                </Button>
              </div>
            </div>

            {queryNotice && (
              <InlineNotice tone="danger">{queryNotice}</InlineNotice>
            )}
            {queryPresetsQ.isError && (
              <InlineNotice tone="danger" action={<Button size="sm" onClick={() => queryPresetsQ.refetch()}>다시 시도</Button>}>
                {(queryPresetsQ.error as Error).message}
              </InlineNotice>
            )}
            {selectedPreset && (
              <InlineNotice
                tone="neutral"
                action={(
                  <Button
                    size="sm"
                    variant="danger"
                    loading={deletePreset.isPending}
                    onClick={() => {
                      deletePreset.mutate(selectedPreset.preset_id);
                      setSelectedPresetId('');
                    }}
                  >
                    삭제
                  </Button>
                )}
              >
                저장됨 · {selectedPreset.unit || 'count'} · 범위 {fmtRange(selectedPreset.range_seconds ?? range)}
              </InlineNotice>
            )}

            <motion.div variants={listStagger} initial="initial" animate="animate" className="grid gap-2">
              <AnimatePresence initial={false}>
                {cards.map((card) => (
                  <QueryCardRow
                    key={card.id}
                    card={card}
                    onRetry={() => execute(card)}
                    onExpandRange={(nextRange) => execute({ promql: card.promql, unit: card.unit, rangeSeconds: nextRange })}
                  />
                ))}
              </AnimatePresence>
              {cards.length === 0 && (
                <EmptyState title="실행한 쿼리가 없습니다" description="검증이 끝난 PromQL을 실행하면 상태와 결과 요약이 여기에 쌓입니다" />
              )}
            </motion.div>
          </div>
        </Card>
      </div>
    </section>
  );
}

const fmtValue = (value: number, unit: Unit) => (unit === 'ratio' ? `${(value * 100).toFixed(1)}%` : Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2));
const fmtRange = (seconds: number) => (seconds >= 3600 ? `${seconds / 3600}h` : `${seconds / 60}m`);
const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function newQueryCardId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
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

function MetricStatCard({
  label,
  value,
  tone,
  loading,
  sparkPoints,
}: {
  label: string;
  value: number;
  tone: StatTone;
  loading: boolean;
  sparkPoints?: Array<number | null | undefined>;
}) {
  const hasSpark = sparkPoints ? hasSparklinePoints(sparkPoints) : false;
  return (
    <StatCard
      label={label}
      value={loading ? '확인 중' : value.toLocaleString('ko-KR')}
      tone={tone}
      spark={!loading && hasSpark ? <Sparkline points={sparkPoints ?? []} tone={tone} ariaLabel={`${label} 추이`} /> : undefined}
    />
  );
}

type UsageMetricKey = 'pod_running' | 'node_ready' | 'restart_total';

function usageMetricPoints(samples: UsageSample[], key: UsageMetricKey): number[] {
  return samples
    .filter((sample) => key in sample.usage)
    .map((sample) => Number(sample.usage[key]))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

function usageRestartDeltaPoints(samples: UsageSample[]): number[] {
  let previous: number | null = null;
  return samples.flatMap((sample) => {
    if (!('restart_total' in sample.usage)) return [];
    const current = Number(sample.usage.restart_total);
    if (!Number.isFinite(current) || current < 0) return [];
    const delta = previous == null ? 0 : Math.max(0, current - previous);
    previous = current;
    return [delta];
  });
}

function seriesPoints(series: Series[], id: string, fallback: number[]): number[] {
  const item = series.find((candidate) => candidate.id === id);
  const points = item?.data.map((point) => point.y).filter(Number.isFinite) ?? [];
  return points.length ? points : fallback;
}

function RowShell({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <motion.div
      layout
      variants={listItem}
      data-testid={testId}
      className={cx('flex min-w-0 flex-col gap-3 rounded-panel border border-border bg-bg p-3 text-body md:flex-row md:items-center', className)}
    >
      {children}
    </motion.div>
  );
}

function InlineNotice({ tone, children, action }: { tone: StatTone; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-3 rounded-panel border bg-bg p-3 text-body md:flex-row md:items-center', noticeToneClass(tone))}>
      <Badge tone={tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : tone === 'danger' ? 'danger' : tone === 'info' ? 'info' : 'neutral'}>
        {tone === 'danger' ? '오류' : tone === 'success' ? '완료' : tone === 'warning' ? '주의' : '정보'}
      </Badge>
      <div className="min-w-0 flex-1 text-text-secondary">{children}</div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

function noticeToneClass(tone: StatTone) {
  return {
    neutral: 'border-border',
    success: 'border-success/40',
    warning: 'border-warning/40',
    danger: 'border-danger/40',
    info: 'border-info/40',
  }[tone];
}

function describeValidationState(input: {
  promql: string;
  clusterId: string;
  pending: boolean;
  data?: MetricValidationResponse;
  error: unknown;
  valid: boolean;
}): { help?: ReactNode; error?: ReactNode } {
  if (!input.clusterId) return { help: '클러스터를 선택하면 dry-run 검증을 시작합니다' };
  if (!input.promql.trim()) return { help: 'PromQL을 입력하면 자동으로 dry-run 검증합니다' };
  if (input.pending) {
    return {
      help: (
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border-2 border-info border-t-transparent motion-safe:animate-spin" aria-hidden="true" />
          PromQL dry-run 검증 중
        </span>
      ),
    };
  }
  if (input.error) return { error: (input.error as Error).message || 'PromQL dry-run 검증에 실패했습니다' };
  if (input.data && !input.data.valid) return { error: metricValidationMessage(input.data) };
  if (input.valid) return { help: `검증 완료${input.data?.result_type ? ` · ${input.data.result_type}` : ''}` };
  return { help: 'PromQL을 입력하면 자동으로 dry-run 검증합니다' };
}

function metricValidationMessage(response: MetricValidationResponse): string {
  if (response.detail) return response.detail;
  if (response.code === 'prometheus_base_url_required') return 'Prometheus 검증 URL 설정이 필요합니다';
  if (response.code === 'promql_invalid') return 'PromQL 문법이 올바르지 않습니다';
  if (response.code === 'prometheus_timeout') return 'Prometheus dry-run 응답이 지연되고 있습니다';
  return 'PromQL dry-run 검증을 통과하지 못했습니다';
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

function QueryCardRow({ card, onRetry, onExpandRange }: { card: QueryCard; onRetry: () => void; onExpandRange: (rangeSeconds: number) => void }) {
  const statusQ = useCommandStatus(card.commandId);
  const status = card.submitFailed ? 'failed' : statusQ.data?.status ?? 'queued';
  const result = statusQ.data?.result ?? {};
  const summary = status === 'completed' ? summarizeTelemetryResult(result) : null;
  const failMessage = status === 'failed' && !card.submitFailed ? commandResultMessage(result) : null;
  const expandedRange = nextRange(card.rangeSeconds);
  const zeroResult = status === 'completed' && summary !== null && summary.points === 0;

  return (
    <RowShell testId="query-card">
      <StatusChip status={commandStatus(status)} label={commandStatusLabel(status)} />
      <div className="min-w-0 flex-1">
        <code className="block truncate font-mono text-caption text-text-primary">{card.promql}</code>
        <p className="mt-1 text-caption text-text-muted">범위 {fmtRange(card.rangeSeconds)}</p>
      </div>
      <div className="min-w-0 md:text-right">
        {summary && !zeroResult && (
          <p className="text-label font-medium tabular-nums text-success">
            {summary.series} series · {summary.points} pts
            {summary.avg !== null ? ` · 평균 ${fmtValue(summary.avg, card.unit)}` : ''}
            {summary.max !== null && summary.max !== summary.avg ? ` · 최대 ${fmtValue(summary.max, card.unit)}` : ''}
          </p>
        )}
        {zeroResult && (
          <p className="text-label font-medium text-warning">결과 0건</p>
        )}
        {status === 'completed' && !summary && <p className="text-label font-medium text-success">{commandResultMessage(result) ?? '완료'}</p>}
        {failMessage && <p className="text-caption font-medium text-danger">{failMessage}</p>}
        {!isTerminal(status) && card.commandId && <p className="text-caption text-text-muted">실행 대기 중</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {zeroResult && expandedRange && (
          <Button size="sm" onClick={() => onExpandRange(expandedRange)}>시간범위 넓히기</Button>
        )}
        {status === 'failed' && <Button size="sm" onClick={onRetry}>재시도</Button>}
      </div>
    </RowShell>
  );
}

function commandStatus(status: string): UiStatus {
  if (status === 'completed') return 'healthy';
  if (status === 'failed') return 'failed';
  if (status === 'leased' || status === 'running') return 'running';
  return 'pending';
}

function commandStatusLabel(status: string): string {
  if (status === 'completed') return '완료';
  if (status === 'failed') return '실패';
  if (status === 'leased' || status === 'running') return '실행 중';
  return '대기';
}

function nextRange(current: number): number | null {
  const index = RANGES.findIndex((item) => item.seconds === current);
  if (index < 0 || index >= RANGES.length - 1) return null;
  return RANGES[index + 1].seconds;
}
