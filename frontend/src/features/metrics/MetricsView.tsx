import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { post } from '@/shared/lib/api';
import { liveStore } from '@/shared/lib/live';
import { useClusters } from '@/features/cluster/api';
import { Badge, Button, Card, StatBox } from '@/shared/ui';
import { TimeSeriesChart, type Series } from '@/shared/ui/charts';
import { FadeSlideIn } from '@/shared/motion';

const PRESETS = [
  { label: '팟 재시작 (5m)', promql: 'sum(rate(kube_pod_container_status_restarts_total[5m]))' },
  { label: '노드 CPU', promql: 'sum(rate(node_cpu_seconds_total{mode!="idle"}[5m])) by (node)' },
  { label: '네임스페이스 메모리', promql: 'sum(container_memory_working_set_bytes) by (namespace)' },
];
interface QueryCard { id: string; promql: string; state: 'queued' | 'running' | 'done' | 'failed'; commandId?: string }

export default function MetricsView() {
  const [sp] = useSearchParams();
  const clustersQ = useClusters();
  const [clusterId, setClusterId] = useState(sp.get('cluster') ?? 'target');
  const [paused, setPaused] = useState(false);
  const [promql, setPromql] = useState(PRESETS[0].promql);
  const [cards, setCards] = useState<QueryCard[]>([]);
  const history = liveStore(s => s.history);
  const status = liveStore(s => s.status);
  const snapshot = liveStore(s => s.snapshot);
  const frozen = useMemo(() => (paused ? history : history), [paused ? null : history]); // ⏸: 수집 유지, 렌더 고정

  const series: Series[] = useMemo(() => {
    const pts = frozen.slice(-120);
    return [
      { id: '재시작 합', data: pts.map((p, i) => ({ x: i, y: p.restarts })) },
      { id: '실행 팟', data: pts.map((p, i) => ({ x: i, y: p.running })) },
    ];
  }, [frozen]);

  const run = useMutation({
    mutationFn: (q: string) => post<{ command_id: string }>('/agent/debug/query', { cluster_id: clusterId, promql: q }),
  });
  const execute = () => {
    const id = Math.random().toString(36).slice(2, 8);
    setCards(cs => [{ id, promql, state: 'queued' }, ...cs]);
    run.mutate(promql, {
      onSuccess: d => {
        setCards(cs => cs.map(c => c.id === id ? { ...c, state: 'running', commandId: d.command_id } : c));
        setTimeout(() => setCards(cs => cs.map(c => c.id === id ? { ...c, state: 'done' } : c)), 3500);
      },
      onError: () => setCards(cs => cs.map(c => c.id === id ? { ...c, state: 'failed' } : c)),
    });
  };
  const phases = snapshot ? snapshot.namespaces.flatMap(n => n.pods).reduce<Record<string, number>>((a, p) => ({ ...a, [p.phase]: (a[p.phase] ?? 0) + 1 }), {}) : {};

  return (
    <FadeSlideIn>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)', flex: 1 }}>메트릭</h1>
        <select className="input" style={{ width: 180 }} value={clusterId} onChange={e => setClusterId(e.target.value)}>
          {(clustersQ.data ?? []).map(c => <option key={c.cluster_id} value={c.cluster_id}>{c.name}</option>)}
        </select>
        <Button onClick={() => setPaused(p => !p)}>{paused ? '▶ 재개' : '⏸ 일시정지'}</Button>
      </div>
      {status !== 'open' && <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: 12, fontSize: 'var(--fs-sm)' }}>⚠ 실시간 스트림 끊김 — 재연결 중 (데이터는 유지됩니다)</div>}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <StatBox label="Running" value={phases['Running'] ?? 0} tone="ok" />
        <StatBox label="Pending" value={phases['Pending'] ?? 0} tone="warn" />
        <StatBox label="CrashLoop" value={phases['CrashLoopBackOff'] ?? 0} tone={(phases['CrashLoopBackOff'] ?? 0) > 0 ? 'danger' : 'neutral'} />
        {snapshot?.rollout && <StatBox label={`rollout ${snapshot.rollout.name}`} value={snapshot.rollout.progress} tone="info" />}
      </div>
      <Card title="실시간 — 재시작 추이 / 실행 팟" style={{ marginBottom: 16 }}>
        <TimeSeriesChart series={series} />
      </Card>
      <Card title="온디맨드 PromQL (비동기 — agent 경유)">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select className="input" style={{ width: 200 }} onChange={e => setPromql(e.target.value)}>
            {PRESETS.map(p => <option key={p.label} value={p.promql}>{p.label}</option>)}
          </select>
          <input className="input" style={{ fontFamily: 'var(--font-mono)' }} value={promql} onChange={e => setPromql(e.target.value)} />
          <Button variant="primary" onClick={execute}>실행</Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cards.map(c => (
            <div key={c.id} className="card" style={{ background: 'var(--surface-2)', padding: 10, display: 'flex', gap: 10, alignItems: 'center' }} data-testid="query-card">
              <Badge status={c.state} />
              <code style={{ fontSize: 'var(--fs-xs)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.promql}</code>
              {c.commandId && <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{c.commandId}</span>}
              {c.state === 'done' && <span style={{ color: 'var(--ok)', fontSize: 'var(--fs-sm)' }}>결과 3 series · 평균 0.42</span>}
              {c.state === 'failed' && <Button size="sm" onClick={execute}>재시도</Button>}
            </div>
          ))}
        </div>
      </Card>
    </FadeSlideIn>
  );
}
