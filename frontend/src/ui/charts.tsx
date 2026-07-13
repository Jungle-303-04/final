import { useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cx } from '@/ui';

const LINE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const tooltipStyle: CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--ui-shadow-elevated)',
  color: 'var(--popover-foreground)',
  fontSize: '0.75rem',
  padding: '0.5rem 0.75rem',
};

export interface Series {
  id: string;
  data: { x: number | string; y: number }[];
}

interface RechartsLine {
  dataKey: string;
  id: string;
}

type RechartsRow = { x: number | string } & Record<string, number | string | undefined>;

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
  const reduced = useReducedMotion();
  const values = normalizeSparkPoints(points);
  const drawable = values.length === 1 ? [values[0], values[0]] : values;

  if (drawable.length === 0) {
    return (
      <span
        className={cx('grid h-full w-full place-items-center text-text-muted', className)}
        role="img"
        aria-label={`${ariaLabel} 없음`}
      >
        <span className="h-0.5 w-[84%] rounded-full bg-current opacity-40" aria-hidden="true" />
      </span>
    );
  }

  const data = drawable.map((value, index) => ({ index, value }));
  return (
    <span
      className={cx('block h-full w-full', sparklineToneClass(tone), className)}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke="currentColor"
            strokeWidth={2}
            fill="currentColor"
            fillOpacity={0.1}
            dot={false}
            isAnimationActive={!reduced}
          />
        </AreaChart>
      </ResponsiveContainer>
    </span>
  );
}

export function TimeSeriesChart({ series, className }: { series: Series[]; className?: string }) {
  const reduced = useReducedMotion();
  const drawable = series
    .map((item) => ({
      ...item,
      data: item.data.filter((point) => Number.isFinite(Number(point.y))),
    }))
    .filter((item) => item.data.length > 0);

  if (drawable.length === 0) {
    return (
      <div className={cx('grid h-64 min-h-64 place-items-center rounded-panel border border-dashed border-border bg-bg p-6 text-center text-body text-text-muted', className)}>
        표시할 시계열 데이터가 아직 없습니다
      </div>
    );
  }

  const usesLinearTime = drawable.every((item) => item.data.every((point) => typeof point.x === 'number'));
  const xTickValues = sampleAxisTicks(drawable, MAX_X_AXIS_TICKS);
  const { rows, lines } = buildTimeSeriesRows(drawable, usesLinearTime);

  return (
    <div className={cx('flex h-64 min-h-64 min-w-0 flex-col', className)}>
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-3 text-caption text-text-secondary">
        {lines.map((item, index) => (
          <span key={item.dataKey} className="inline-flex min-w-0 items-center gap-2">
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
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
            <XAxis
              dataKey="x"
              type={usesLinearTime ? 'number' : 'category'}
              domain={usesLinearTime ? ['dataMin', 'dataMax'] : undefined}
              ticks={xTickValues}
              tickFormatter={formatAxisTick}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              domain={[0, 'auto']}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ stroke: 'var(--border)' }}
              labelFormatter={(label) => formatAxisTick(label as number | string)}
              formatter={(value, name) => [String(value), String(name)]}
            />
            {lines.map((item, index) => (
              <Line
                key={item.dataKey}
                type="monotone"
                dataKey={item.dataKey}
                name={item.id}
                stroke={LINE_COLORS[index % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={!reduced}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function buildTimeSeriesRows(series: Series[], sortNumericX = false): {
  rows: RechartsRow[];
  lines: RechartsLine[];
} {
  const rowsByX = new Map<string, RechartsRow>();
  const lines = series.map((item, index) => ({ id: item.id, dataKey: `series-${index}` }));

  series.forEach((item, index) => {
    const dataKey = lines[index].dataKey;
    item.data.forEach((point) => {
      const value = Number(point.y);
      if (!Number.isFinite(value)) return;
      const identity = `${typeof point.x}:${String(point.x)}`;
      const row = rowsByX.get(identity) ?? { x: point.x };
      row[dataKey] = value;
      rowsByX.set(identity, row);
    });
  });

  const rows = Array.from(rowsByX.values());
  if (sortNumericX) rows.sort((left, right) => Number(left.x) - Number(right.x));
  return { rows, lines };
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
