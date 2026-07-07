// 차트 래퍼 — nivo 를 이 파일 밖으로 노출하지 않음(교체 용이)
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveTreeMap } from '@nivo/treemap';
import { useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';

const theme = {
  text: { fill: 'var(--text-2)', fontSize: 11 },
  grid: { line: { stroke: 'var(--border)', strokeWidth: 1 } },
  tooltip: { container: { background: 'var(--surface-2)', color: 'var(--text-1)', fontSize: 12, borderRadius: 6 } },
} as const;

/* 차트 툴팁 공통 룩 — 라인 slice/트리맵 동일(surface-2 + border + shadow) */
const tooltipStyle: CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-2)', color: 'var(--text-1)',
};

export interface HeatNode { id: string; label: string; value: number; score: number }
// 건강도 0(위험)~1(건강) → 토큰 히트 스케일 보간
export function heatColor(score: number): string {
  const s = Math.max(0, Math.min(1, score));
  const mix = (a: string, b: string, k: number) => `color-mix(in oklab, ${a} ${(1 - k) * 100}%, ${b} ${k * 100}%)`;
  return s < 0.5 ? mix('var(--heat-bad)', 'var(--heat-mid)', s * 2) : mix('var(--heat-mid)', 'var(--heat-good)', (s - 0.5) * 2);
}

export function TreemapChart({ nodes, onTileClick }: { nodes: HeatNode[]; onTileClick?: (id: string) => void }) {
  const reduced = useReducedMotion(); // nivo 는 MotionConfig 밖 — 단일 훅으로 직접 존중
  const data = { id: 'root', children: nodes.map(n => ({ ...n })) };
  return (
    <div style={{ height: '100%', minHeight: 300 }} data-testid="treemap">
      <ResponsiveTreeMap
        data={data} identity="id" value="value" label={n => `${(n.data as HeatNode).label}`}
        labelSkipSize={40} leavesOnly innerPadding={4} outerPadding={4}
        theme={theme} borderWidth={0} labelTextColor="var(--text-1)" parentLabelTextColor="var(--text-2)"
        colors={n => heatColor((n.data as HeatNode).score)} nodeOpacity={1}
        animate={!reduced} motionConfig="gentle"
        onClick={n => onTileClick?.((n.data as HeatNode).id)}
        tooltip={({ node }) => {
          const d = node.data as HeatNode;
          return <div style={tooltipStyle}>{d.label} · 건강도 {(d.score * 100).toFixed(0)}%</div>;
        }}
      />
    </div>
  );
}

export interface Series { id: string; data: { x: number | string; y: number }[] }
export function TimeSeriesChart({ series, height = 220 }: { series: Series[]; height?: number }) {
  const reduced = useReducedMotion(); // nivo 는 MotionConfig 밖 — 단일 훅으로 직접 존중
  // 포인트 없는 시리즈는 제외 — nivo 가 빈 시리즈에 d="null" 패스를 그려 SVG 콘솔 오류를 낸다
  const drawable = series.filter(s => s.data.length > 0);
  if (drawable.length === 0) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 'var(--fs-sm)' }}>
        표시할 시계열 데이터가 아직 없습니다
      </div>
    );
  }
  return (
    <div style={{ height }}>
      <ResponsiveLine
        data={drawable} theme={theme} margin={{ top: 12, right: 16, bottom: 28, left: 40 }}
        xScale={{ type: 'point' }} yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
        axisBottom={{ tickValues: 5 }} enablePoints={false} enableGridX={false}
        colors={['var(--info)', 'var(--ok)', 'var(--warn)']} lineWidth={2}
        // 시리즈 전환 부드럽게 + x 기준 crosshair/슬라이스 툴팁(전 시리즈 동시 표시)
        animate={!reduced} motionConfig="gentle" isInteractive
        enableSlices="x" crosshairType="x"
        sliceTooltip={({ slice }) => (
          <div style={tooltipStyle}>
            <div style={{ color: 'var(--text-3)', marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{String(slice.points[0]?.data.x ?? '')}</div>
            {slice.points.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-1)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.serieColor }} />
                <span style={{ color: 'var(--text-2)' }}>{String(p.serieId)}</span>
                <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{String(p.data.yFormatted)}</b>
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
}

