import { Pie, PieChart } from "recharts";

import { usePrefersReducedMotion } from "@/motion";
import { cn } from "@/shared/lib/cn";
import {
  ChartContainer,
  type ChartConfig,
} from "@/shared/ui/primitives/chart";
import {
  normalizedRatio,
  RECHARTS_DRAW_ANIMATION,
  RECHARTS_METER_ANIMATION,
  type ChartTone,
} from "./chartPrimitives";

const RADIAL_CHART_CONFIG = {
  "radial-track": { color: "var(--color-muted)" },
  "radial-unavailable": { color: "var(--color-caption-foreground)" },
  "tone-critical": { color: "var(--color-status-critical)" },
  "tone-healthy": { color: "var(--color-status-healthy)" },
  "tone-primary": { color: "var(--color-primary)" },
  "tone-stale": { color: "var(--color-status-stale)" },
  "tone-unknown": { color: "var(--color-status-unknown)" },
  "tone-warning": { color: "var(--color-status-warning)" },
} satisfies ChartConfig;

const TRACK_DATA = [
  { fill: "var(--color-radial-track)", id: "track", value: 1 },
];

const UNKNOWN_RING_DATA = Array.from({ length: 32 }, (_, index) => ({
  fill: "var(--color-radial-unavailable)",
  id: `unknown-${index}`,
  value: 1,
}));

function toneFill(tone: ChartTone) {
  return `var(--color-tone-${tone})`;
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function CenterLabel({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 grid place-items-center text-caption font-bold text-foreground"
    >
      {children}
    </span>
  );
}

export interface DonutSegment {
  id: string;
  tone: ChartTone;
  value: number;
}

export function Donut({
  ariaLabel,
  centerLabel,
  className,
  segments,
}: {
  ariaLabel: string;
  centerLabel?: string;
  className?: string;
  segments: readonly DonutSegment[];
}) {
  const reducedMotion = usePrefersReducedMotion();
  const data = segments.map((segment) => ({
    fill: toneFill(segment.tone),
    id: segment.id,
    value: finiteNonNegative(segment.value),
  }));
  const total = data.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <ChartContainer
      aria-label={ariaLabel}
      className={cn("relative size-24 aspect-square overflow-visible", className)}
      config={RADIAL_CHART_CONFIG}
      data-chart-state={total > 0 ? "ready" : "empty"}
      role="img"
    >
      <PieChart>
        <Pie
          {...RECHARTS_DRAW_ANIMATION}
          data={TRACK_DATA}
          dataKey="value"
          endAngle={-270}
          fill="var(--color-radial-track)"
          innerRadius="64%"
          isAnimationActive={!reducedMotion}
          nameKey="id"
          outerRadius="88%"
          rootTabIndex={-1}
          startAngle={90}
          stroke="none"
        />
        {total > 0 ? (
          <Pie
            {...RECHARTS_DRAW_ANIMATION}
            data={data}
            dataKey="value"
            endAngle={-270}
            innerRadius="64%"
            isAnimationActive={!reducedMotion}
            nameKey="id"
            outerRadius="88%"
            rootTabIndex={-1}
            startAngle={90}
            stroke="var(--color-background)"
            strokeWidth={1}
          />
        ) : null}
      </PieChart>
      {centerLabel ? <CenterLabel>{centerLabel}</CenterLabel> : null}
    </ChartContainer>
  );
}

export interface RingGaugeProps {
  ariaLabel: string;
  className?: string;
  displayValue: string;
  max?: number;
  surface: "detail-overview";
  tone?: ChartTone;
  value: null | number;
}

export function RingGauge({
  ariaLabel,
  className,
  displayValue,
  max = 100,
  surface,
  tone = "primary",
  value,
}: RingGaugeProps) {
  const reducedMotion = usePrefersReducedMotion();
  const ratio = normalizedRatio(value, max);
  const valueData = ratio == null
    ? []
    : [
        { fill: toneFill(tone), id: "value", value: ratio },
        { fill: "transparent", id: "remainder", value: 1 - ratio },
      ];

  return (
    <ChartContainer
      aria-label={ariaLabel}
      className={cn("relative size-24 aspect-square overflow-visible", className)}
      config={RADIAL_CHART_CONFIG}
      data-chart-state={ratio == null ? "unknown" : "ready"}
      data-surface={surface}
      role="img"
    >
      <PieChart>
        <Pie
          {...RECHARTS_METER_ANIMATION}
          data={TRACK_DATA}
          dataKey="value"
          endAngle={-270}
          fill="var(--color-radial-track)"
          innerRadius="66%"
          isAnimationActive={!reducedMotion}
          nameKey="id"
          outerRadius="86%"
          rootTabIndex={-1}
          startAngle={90}
          stroke="none"
        />
        {ratio == null ? (
          <Pie
            {...RECHARTS_METER_ANIMATION}
            data={UNKNOWN_RING_DATA}
            dataKey="value"
            endAngle={-270}
            innerRadius="66%"
            isAnimationActive={!reducedMotion}
            nameKey="id"
            outerRadius="86%"
            paddingAngle={4}
            rootTabIndex={-1}
            startAngle={90}
            stroke="none"
          />
        ) : (
          <Pie
            {...RECHARTS_METER_ANIMATION}
            cornerRadius="50%"
            data={valueData}
            dataKey="value"
            endAngle={-270}
            innerRadius="66%"
            isAnimationActive={!reducedMotion}
            nameKey="id"
            outerRadius="86%"
            rootTabIndex={-1}
            startAngle={90}
            stroke="none"
          />
        )}
      </PieChart>
      <CenterLabel>{displayValue}</CenterLabel>
    </ChartContainer>
  );
}
