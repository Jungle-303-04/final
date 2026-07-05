// 차트 래퍼 — nivo 를 이 파일 밖으로 노출하지 않음(교체 용이)
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveTreeMap } from '@nivo/treemap';

const theme = {
  text: { fill: 'var(--text-2)', fontSize: 11 },
  grid: { line: { stroke: 'var(--border)', strokeWidth: 1 } },
  tooltip: { container: { background: 'var(--surface-2)', color: 'var(--text-1)', fontSize: 12, borderRadius: 6 } },
} as const;

export interface HeatNode { id: string; label: string; value: number; score: number }
// 건강도 0(위험)~1(건강) → 토큰 히트 스케일 보간
export function heatColor(score: number): string {
  const s = Math.max(0, Math.min(1, score));
  const mix = (a: string, b: string, k: number) => `color-mix(in oklab, ${a} ${(1 - k) * 100}%, ${b} ${k * 100}%)`;
  return s < 0.5 ? mix('var(--heat-bad)', 'var(--heat-mid)', s * 2) : mix('var(--heat-mid)', 'var(--heat-good)', (s - 0.5) * 2);
}

export function TreemapChart({ nodes, onTileClick }: { nodes: HeatNode[]; onTileClick?: (id: string) => void }) {
  const data = { id: 'root', children: nodes.map(n => ({ ...n })) };
  return (
    <div style={{ height: '100%', minHeight: 320 }} data-testid="treemap">
      <ResponsiveTreeMap
        data={data} identity="id" value="value" label={n => `${(n.data as HeatNode).label}`}
        labelSkipSize={40} leavesOnly innerPadding={4} outerPadding={4}
        theme={theme} borderWidth={0} labelTextColor="var(--text-1)" parentLabelTextColor="var(--text-2)"
        colors={n => heatColor((n.data as HeatNode).score)} nodeOpacity={1}
        onClick={n => onTileClick?.((n.data as HeatNode).id)}
        tooltip={({ node }) => {
          const d = node.data as HeatNode;
          return <div style={{ background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>{d.label} · 건강도 {(d.score * 100).toFixed(0)}%</div>;
        }}
      />
    </div>
  );
}

export interface Series { id: string; data: { x: number | string; y: number }[] }
export function TimeSeriesChart({ series, height = 220 }: { series: Series[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveLine
        data={series} theme={theme} margin={{ top: 12, right: 16, bottom: 28, left: 40 }}
        xScale={{ type: 'point' }} yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
        axisBottom={{ tickValues: 5 }} enablePoints={false} enableGridX={false}
        colors={['var(--info)', 'var(--ok)', 'var(--warn)']} lineWidth={2}
        animate={false} isInteractive useMesh
      />
    </div>
  );
}

export function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(1, ...points);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / Math.max(1, points.length - 1)) * 100},${28 - (p / max) * 24}`).join(' ');
  return <svg width={100} height={30} aria-hidden><path d={path} fill="none" stroke="var(--info)" strokeWidth={1.5} /></svg>;
}
