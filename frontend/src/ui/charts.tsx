import { ResponsiveLine } from '@nivo/line';
import { useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';
import { cx } from '@/ui';

const theme = {
  text: { fill: 'var(--ui-text-secondary)', fontSize: 11 },
  grid: { line: { stroke: 'var(--ui-border)', strokeWidth: 1 } },
  tooltip: {
    container: {
      background: 'var(--ui-surface)',
      color: 'var(--ui-text-primary)',
      fontSize: 12,
      borderRadius: 'var(--radius-control)',
    },
  },
} as const;

const LINE_COLORS = [
  'var(--ui-info)',
  'var(--ui-success)',
  'var(--ui-warning)',
  'color-mix(in oklab, var(--ui-accent) 72%, var(--ui-info))',
  'color-mix(in oklab, var(--ui-danger) 72%, var(--ui-warning))',
];

const tooltipStyle: CSSProperties = {
  background: 'var(--ui-surface)',
  border: '1px solid var(--ui-border)',
  borderRadius: 'var(--radius-control)',
  boxShadow: 'var(--ui-shadow-elevated)',
  color: 'var(--ui-text-primary)',
  fontSize: '0.75rem',
  padding: '0.5rem 0.75rem',
};

export interface Series {
  id: string;
  data: { x: number | string; y: number }[];
}

const MAX_X_AXIS_TICKS = 5;
type SparklineTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function hasSparklinePoints(points: Array<number | null | undefined>): boolean {
  return points.some((point) => {
    if (point == null) return false;
    const value = Number(point);
    return Number.isFinite(value) && value >= 0;
  });
}

export function Sparkline({
  points,
  tone = 'neutral',
  ariaLabel = '실데이터 추이',
  className,
}: {
  points: Array<number | null | undefined>;
  tone?: SparklineTone;
  ariaLabel?: string;
  className?: string;
}) {
  const values = normalizeSparkPoints(points);
  const drawable = values.length === 1 ? [values[0], values[0]] : values;
  const path = drawable.length > 0 ? sparkPath(drawable) : '';
  const areaPath = path ? `${path} L 92 28 L 8 28 Z` : '';

  if (!path) {
    return (
      <svg className={cx('h-full w-full text-text-muted', className)} viewBox="0 0 100 32" role="img" aria-label={`${ariaLabel} 없음`} preserveAspectRatio="none">
        <path d="M8 16 H92" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="opacity-40" />
      </svg>
    );
  }

  return (
    <svg className={cx('h-full w-full', sparklineToneClass(tone), className)} viewBox="0 0 100 32" role="img" aria-label={ariaLabel} preserveAspectRatio="none">
      <path d={areaPath} fill="currentColor" className="opacity-10" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function TimeSeriesChart({ series, className }: { series: Series[]; className?: string }) {
  const reduced = useReducedMotion();
  const drawable = series.filter((item) => item.data.length > 0);

  if (drawable.length === 0) {
    return (
      <div className={cx('grid h-64 min-h-64 place-items-center rounded-panel border border-dashed border-border bg-bg p-6 text-center text-body text-text-muted', className)}>
        표시할 시계열 데이터가 아직 없습니다
      </div>
    );
  }

  const usesLinearTime = drawable.every((item) => item.data.every((point) => typeof point.x === 'number'));
  const xTickValues = sampleAxisTicks(drawable, MAX_X_AXIS_TICKS);

  return (
    <div className={cx('flex h-64 min-h-64 min-w-0 flex-col', className)}>
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-3 text-caption text-text-secondary">
        {drawable.map((item, index) => (
          <span key={item.id} className="inline-flex min-w-0 items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-control"
              aria-hidden="true"
              style={{ background: LINE_COLORS[index % LINE_COLORS.length] }}
            />
            <span className="truncate">{item.id}</span>
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveLine
          data={drawable}
          theme={theme}
          margin={{ top: 8, right: 18, bottom: 34, left: 42 }}
          xScale={usesLinearTime ? { type: 'linear', min: 'auto', max: 'auto' } : { type: 'point' }}
          yScale={{ type: 'linear', min: 0, max: 'auto' }}
          axisBottom={{ tickValues: xTickValues, tickSize: 0, tickPadding: 8, format: formatAxisTick }}
          enablePoints={false}
          enableGridX={false}
          colors={LINE_COLORS}
          lineWidth={2}
          animate={!reduced}
          motionConfig="gentle"
          isInteractive
          enableSlices="x"
          crosshairType="x"
          sliceTooltip={({ slice }) => (
            <div style={tooltipStyle}>
              <div className="mb-1 text-caption tabular-nums text-text-muted">
                {formatAxisTick(slice.points[0]?.data.x as number | string)}
              </div>
              <div className="grid gap-1">
                {slice.points.map((point) => (
                  <div key={point.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-caption text-text-primary">
                    <span
                      className="h-2 w-2 rounded-control"
                      aria-hidden="true"
                      style={{ background: point.serieColor }}
                    />
                    <span className="truncate text-text-secondary">{String(point.serieId)}</span>
                    <b className="tabular-nums">{String(point.data.yFormatted)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}

function normalizeSparkPoints(points: Array<number | null | undefined>): number[] {
  const values: number[] = [];
  for (const point of points) {
    if (point == null) continue;
    const value = Number(point);
    if (Number.isFinite(value) && value >= 0) values.push(value);
  }
  return values;
}

function sparkPath(values: number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(max, 1);
  const flat = max === min;
  return values.map((value, index) => {
    const x = values.length === 1 ? 50 : 8 + (index / (values.length - 1)) * 84;
    const y = flat ? 16 : 28 - ((value - min) / range) * 24;
    return `${index === 0 ? 'M' : 'L'} ${roundCoord(x)} ${roundCoord(y)}`;
  }).join(' ');
}

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

function sparklineToneClass(tone: SparklineTone): string {
  return {
    neutral: 'text-text-muted',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
  }[tone];
}

function sampleAxisTicks(series: Series[], maxTicks: number): Array<number | string> {
  const source = series.reduce((best, current) => (current.data.length > best.data.length ? current : best), series[0]);
  const values = Array.from(new Set(source.data.map((point) => point.x)));
  if (values.length <= maxTicks) return values;

  const step = (values.length - 1) / (maxTicks - 1);
  return Array.from({ length: maxTicks }, (_item, index) => values[Math.round(index * step)]);
}

function formatAxisTick(value: number | string): string {
  if (typeof value === 'number') {
    return value > 10_000_000_000 ? formatTime(value) : String(value);
  }
  const text = String(value);
  if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5);
  return text.length > 10 ? `${text.slice(0, 9)}...` : text;
}

function formatTime(value: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}
