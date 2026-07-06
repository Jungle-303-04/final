import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useClusters, useClusterSummary, useWorkloads } from '@/features/cluster/api';
import { useTimeline } from '@/features/notifications/api';
import { clusterScore, nodeScore, podScore } from '@/features/fleet/score';
import { Badge, Breadcrumbs, Button, Card, EmptyState, KeyValue, QueryBoundary, StatBox } from '@/shared/ui';
import { TreemapChart, heatColor, type HeatNode } from '@/shared/ui/charts';
import { FadeSlideIn, AnimatedList } from '@/shared/motion';
import { liveStore } from '@/shared/lib/live';
import { timeAgo } from '@/shared/lib/format';
import { IconCheckCircle } from '@/shared/ui/icons';

export default function FleetHeatmapView() {
  const { clusterId } = useParams();
  const nav = useNavigate();
  const clustersQ = useClusters();
  const summaryQ = useClusterSummary(clusterId);
  const workloadsQ = useWorkloads(clusterId ?? '');
  const timelineQ = useTimeline();
  const [nodeSel, setNodeSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const snapshot = liveStore(s => s.snapshot); // WS 스냅샷 — 수신 시 타일/스탯 즉시 갱신(D6)

  const clusters = useMemo(() => clustersQ.data ?? [], [clustersQ.data]);
  // 팟 레벨은 WS 스냅샷 값을 이름 기준으로 덮어써 polling 을 기다리지 않고 실시간 반영
  const livePods = useMemo(
    () => new Map((snapshot?.namespaces ?? []).flatMap(n => n.pods).map(p => [p.name, p])),
    [snapshot],
  );
  const pods = useMemo(() => {
    if (!clusterId) return [];
    return (workloadsQ.data ?? []).map(p => {
      const l = livePods.get(p.name);
      return l ? { ...p, phase: l.phase, restarts: l.restarts, hot: l.hot } : p;
    });
  }, [clusterId, workloadsQ.data, livePods]);
  const nodes = useMemo(() => (clusterId ? (summaryQ.data?.nodes ?? []) : []), [clusterId, summaryQ.data]);

  const tiles: HeatNode[] = useMemo(() => {
    if (!clusterId) return clusters.map(c => ({ id: c.cluster_id, label: `${c.name} · ${c.pod_count}pods`, value: Math.max(1, c.pod_count), score: clusterScore(c) }));
    if (!nodeSel) return nodes.map(n => ({ id: n.name, label: `${n.name} · ${n.pod_count}`, value: Math.max(1, n.pod_count), score: nodeScore(n, pods) }));
    return pods.filter(p => p.node === nodeSel).slice(0, 400)
      .map(p => ({ id: p.name, label: p.name, value: 1 + p.restarts, score: podScore(p) }));
  }, [clusterId, nodeSel, clusters, nodes, pods]);

  const totals = {
    clusters: clusters.length,
    nodes: clusters.reduce((a, c) => a + c.node_count, 0),
    pods: clusters.reduce((a, c) => a + c.pod_count, 0),
    incidents: clusters.reduce((a, c) => a + c.incident_count, 0),
  };
  // 실행 팟 스탯: WS 스냅샷 수신 시 invalidate 대신 live 값 우선(스냅샷은 에이전트 연결
  // 클러스터 범위라 플릿 집계와 단위가 같은 단일 클러스터일 때만 적용)
  const liveRunning = snapshot ? [...livePods.values()].filter(p => p.phase === 'Running').length : null;
  const podsStat = liveRunning !== null && clusters.length === 1 ? liveRunning : totals.pods;
  const crumbs = [{ label: '플릿', to: clusterId ? '/overview' : undefined }];
  if (clusterId) crumbs.push({ label: clusterId, to: nodeSel ? `/overview/c/${clusterId}` : undefined });
  if (nodeSel) crumbs.push({ label: nodeSel, to: undefined });

  const onTile = (id: string) => {
    if (!clusterId) nav(`/overview/c/${id}`);
    else if (!nodeSel) setNodeSel(id);
    else nav(`/clusters/${clusterId}?tab=pods&q=${id}`);
  };
  const hoverInfo = hover && tiles.find(t => t.id === hover);

  return (
    <FadeSlideIn>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <StatBox label="클러스터" value={totals.clusters} />
        <StatBox label="노드" value={totals.nodes} />
        <StatBox label="실행 팟" value={podsStat} />
        <StatBox label="열린 인시던트" value={totals.incidents} tone={totals.incidents ? 'danger' : 'ok'} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span onClick={() => nodeSel && setNodeSel(null)}><Breadcrumbs items={crumbs} /></span>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-2)', display: 'flex', gap: 10 }}>
          {(['건강', '주의', '위험'] as const).map((l, i) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: heatColor([0.9, 0.5, 0.1][i]) }} />{l}
            </span>
          ))}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        <Card style={{ height: 440, padding: 8 }}>
          <QueryBoundary query={clustersQ}>{() =>
            tiles.length === 0
              ? <EmptyState icon="⬢" title="클러스터가 없습니다" description="첫 클러스터를 등록해보세요"
                  action={<Link to="/clusters"><Button variant="primary">클러스터 등록</Button></Link>} />
              : <div onMouseMove={e => { const t = (e.target as HTMLElement).closest('[data-testid=treemap]'); if (!t) setHover(null); }} style={{ height: '100%' }}>
                  <TreemapChart nodes={tiles} onTileClick={onTile} />
                </div>
          }</QueryBoundary>
        </Card>
        <Card title={hoverInfo ? hoverInfo.label : '요약'}>
          {hoverInfo
            ? <KeyValue pairs={[['건강도', `${(hoverInfo.score * 100).toFixed(0)}%`], ['규모', String(hoverInfo.value)]]} />
            : <KeyValue pairs={[['레벨', !clusterId ? '플릿' : !nodeSel ? '노드' : '팟'], ['타일 수', String(tiles.length)], ['안내', '타일 클릭 시 드릴다운']]} />}
        </Card>
      </div>
      <Card title="최근 인시던트" style={{ marginTop: 16 }}>
        <QueryBoundary query={timelineQ} skeletonLines={2}>{items =>
          items.length === 0 ? <EmptyState icon={<IconCheckCircle size={26} />} title="열린 인시던트가 없습니다" /> :
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <AnimatedList items={items.slice(0, 5)} getKey={i => i.incident_id}>{i => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
                <Badge tone="danger">{i.stage}</Badge>
                <Link to={`/incidents/${i.incident_id}`}>{i.summary}</Link>
                <span style={{ color: 'var(--text-3)', marginLeft: 'auto' }}>{timeAgo(i.at)}</span>
                <Link to={`/incidents/${i.incident_id}`} style={{ color: 'var(--brand)' }}>파이프라인 →</Link>
              </div>
            )}</AnimatedList>
          </div>
        }</QueryBoundary>
      </Card>
    </FadeSlideIn>
  );
}
