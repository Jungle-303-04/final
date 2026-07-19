import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/shared/lib/cn";
import {
  ChartContainer,
  type ChartConfig,
} from "@/shared/ui/primitives/chart";
import {
  chartToneColor,
  finitePositive,
  normalizedRatio,
  type ChartTone,
} from "./chartPrimitives";

const CHART_MARGIN = { bottom: 0, left: 0, right: 0, top: 0 } as const;
const NORMALIZED_DOMAIN = [0, 1] as const;
const MINI_BAR_FLOOR = 1 / 16;

function compactBarConfig(tone: ChartTone): ChartConfig {
  return {
    unavailable: { color: "var(--color-caption-foreground)" },
    value: { color: chartToneColor(tone) },
  };
}

export interface MiniBarProps {
  ariaLabel: string;
  className?: string;
  max?: number;
  tone?: ChartTone;
  value: null | number;
}

export function MiniBar({
  ariaLabel,
  className,
  max = 100,
  tone = "primary",
  value,
}: MiniBarProps) {
  const ratio = normalizedRatio(value, max);
  return (
    <ChartContainer
      aria-label={ariaLabel}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-muted aspect-auto",
        className,
      )}
      config={compactBarConfig(tone)}
      data-state={ratio == null ? "unavailable" : "measured"}
      role="img"
    >
      <BarChart
        barCategoryGap={0}
        data={[{ metric: "value", value: ratio ?? 0 }]}
        layout="vertical"
        margin={CHART_MARGIN}
      >
        <XAxis domain={NORMALIZED_DOMAIN} hide type="number" />
        <YAxis dataKey="metric" hide type="category" />
        {ratio == null ? (
          <ReferenceLine
            stroke="var(--color-unavailable)"
            strokeDasharray="2 3"
            strokeWidth={1}
            y="value"
          />
        ) : null}
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          isAnimationActive={false}
          radius={[3, 3, 3, 3]}
        />
      </BarChart>
    </ChartContainer>
  );
}

export interface RatioBarSegment {
  id: string;
  tone: ChartTone;
  value: number;
}

function segmentRadius(
  index: number,
  firstVisible: number,
  lastVisible: number,
): [number, number, number, number] {
  const leftRadius = index === firstVisible ? 4 : 0;
  const rightRadius = index === lastVisible ? 4 : 0;
  return [leftRadius, rightRadius, rightRadius, leftRadius];
}

export function RatioBar({
  ariaLabel,
  className,
  segments,
}: {
  ariaLabel: string;
  className?: string;
  segments: readonly RatioBarSegment[];
}) {
  const positiveValues = segments.map((segment) => Number.isFinite(segment.value)
    ? Math.max(0, segment.value)
    : 0);
  const total = positiveValues.reduce((sum, value) => sum + value, 0);
  const shares = positiveValues.map((value) => total > 0 ? value / total : 0);
  const firstVisible = shares.findIndex((share) => share > 0);
  const lastVisible = shares.reduce(
    (lastIndex, share, index) => share > 0 ? index : lastIndex,
    -1,
  );
  const config = segments.reduce<ChartConfig>((result, segment, index) => {
    result[`segment${index}`] = { color: chartToneColor(segment.tone) };
    return result;
  }, {});
  const row = shares.reduce<Record<string, number | string>>(
    (result, share, index) => {
      result[`segment${index}`] = share;
      return result;
    },
    { metric: "ratio" },
  );

  return (
    <ChartContainer
      aria-label={ariaLabel}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted aspect-auto",
        className,
      )}
      config={config}
      data-state={total > 0 ? "measured" : "empty"}
      role="img"
    >
      <BarChart
        barCategoryGap={0}
        data={[row]}
        layout="vertical"
        margin={CHART_MARGIN}
      >
        <XAxis domain={NORMALIZED_DOMAIN} hide type="number" />
        <YAxis dataKey="metric" hide type="category" />
        {segments.map((segment, index) => (
          <Bar
            dataKey={`segment${index}`}
            fill={`var(--color-segment${index})`}
            isAnimationActive={false}
            key={`${segment.id}-${index}`}
            radius={segmentRadius(index, firstVisible, lastVisible)}
            stackId="ratio"
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export function MiniBars({
  ariaLabel,
  className,
  max,
  tone = "primary",
  values,
}: {
  ariaLabel: string;
  className?: string;
  max?: number;
  tone?: ChartTone;
  values: readonly (null | number)[];
}) {
  const ceiling = finitePositive(
    max,
    Math.max(
      1,
      ...values.filter(
        (value): value is number => value != null && Number.isFinite(value),
      ),
    ),
  );
  const rows = values.map((value, index) => {
    const ratio = normalizedRatio(value, ceiling);
    return {
      index,
      unavailable: ratio == null,
      value: ratio == null ? MINI_BAR_FLOOR : Math.max(MINI_BAR_FLOOR, ratio),
    };
  });

  return (
    <ChartContainer
      aria-label={ariaLabel}
      className={cn("h-14 w-full aspect-auto", className)}
      config={compactBarConfig(tone)}
      data-state={rows.some((row) => row.unavailable) ? "partial" : "measured"}
      role="img"
    >
      <BarChart barCategoryGap={2} data={rows} margin={CHART_MARGIN}>
        <XAxis dataKey="index" hide type="category" />
        <YAxis domain={NORMALIZED_DOMAIN} hide type="number" />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          isAnimationActive={false}
          radius={[1, 1, 0, 0]}
        >
          {rows.map((row) => (
            <Cell
              fill={row.unavailable
                ? "var(--color-unavailable)"
                : "var(--color-value)"}
              fillOpacity={row.unavailable ? 0.45 : 1}
              key={`${row.index}-${String(values[row.index])}`}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function ProgressFill({
  ariaLabel,
  className,
  max = 100,
  tone = "primary",
  value,
}: MiniBarProps) {
  const effectiveMax = finitePositive(max);
  const ratio = normalizedRatio(value, effectiveMax);
  return (
    <div
      aria-label={ariaLabel}
      aria-valuemax={effectiveMax}
      aria-valuemin={0}
      aria-valuenow={ratio == null
        ? undefined
        : Math.min(effectiveMax, Math.max(0, value ?? 0))}
      className={cn(
        "relative h-2 overflow-hidden rounded-full bg-muted",
        className,
      )}
      data-state={ratio == null ? "unavailable" : "measured"}
      role="progressbar"
    >
      {ratio == null ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0.5 top-1/2 border-t border-dashed border-caption-foreground"
          data-slot="progress-unavailable"
        />
      ) : (
        <span
          aria-hidden="true"
          className="block h-full rounded-full transition-[width] duration-(--motion-value) ease-(--ease-draw) motion-reduce:transition-none"
          data-slot="progress-indicator"
          style={{
            backgroundColor: chartToneColor(tone),
            width: `${ratio * 100}%`,
          }}
        />
      )}
    </div>
  );
}
