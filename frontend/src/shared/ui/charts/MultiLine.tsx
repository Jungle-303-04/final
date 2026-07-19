import { useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine as RechartsReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/shared/lib/cn";
import {
  ChartContainer,
  type ChartConfig,
} from "@/shared/ui/primitives/chart";
import { chartToneColor, type ChartTone } from "./chartPrimitives";

export interface MultiLineSeries {
  id: string;
  label: string;
  tone: ChartTone;
  values: readonly number[];
}

export function MultiLine({
  ariaLabel,
  className,
  formatPoint,
  labels,
  series,
}: {
  ariaLabel: string;
  className?: string;
  formatPoint: (index: number) => string;
  labels: readonly string[];
  series: readonly MultiLineSeries[];
}) {
  const pointCount = labels.length;
  const annotationId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const max = Math.max(
    1,
    ...series.flatMap((item) => (
      item.values.slice(0, pointCount).filter(Number.isFinite)
    )),
  );
  const selected = activeIndex === null || pointCount === 0
    ? null
    : Math.min(pointCount - 1, Math.max(0, activeIndex));
  const chartSeries = useMemo(() => series.map((item, index) => ({
    dataKey: `series${index}`,
    item,
  })), [series]);
  const config = useMemo<ChartConfig>(() => Object.fromEntries(
    chartSeries.map(({ dataKey, item }) => [dataKey, {
      color: chartToneColor(item.tone),
      label: item.label,
    }]),
  ), [chartSeries]);
  const data = useMemo(() => labels.map((label, index) => Object.fromEntries([
    ["label", label],
    ["pointIndex", index],
    ...chartSeries.map(({ dataKey, item }) => [
      dataKey,
      finiteChartValue(item.values[index]),
    ]),
  ])), [chartSeries, labels]);

  return (
    <div className={cn("grid min-w-0 gap-3", className)} data-slot="multi-line">
      <ChartContainer
        aria-describedby={selected === null ? undefined : annotationId}
        aria-label={ariaLabel}
        className="h-44 w-full aspect-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        config={config}
        onBlur={() => setActiveIndex(null)}
        onFocus={() => setActiveIndex(pointCount === 0 ? null : pointCount - 1)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          if (pointCount === 0) return;
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? 1 : -1;
          setActiveIndex((current) => Math.min(
            pointCount - 1,
            Math.max(0, (current ?? pointCount - 1) + delta),
          ));
        }}
        role="img"
        tabIndex={0}
      >
        <LineChart
          accessibilityLayer
          data={data}
          margin={{ bottom: 8, left: 8, right: 8, top: 8 }}
          onMouseLeave={() => setActiveIndex(null)}
          onMouseMove={(state) => {
            setActiveIndex(normalizeTooltipPointIndex(
              state.activeTooltipIndex,
              pointCount,
            ));
          }}
        >
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="pointIndex" hide />
          <YAxis domain={[0, max]} hide />
          {chartSeries.map(({ dataKey }) => (
            <Line
              dataKey={dataKey}
              dot={false}
              isAnimationActive={false}
              key={dataKey}
              stroke={`var(--color-${dataKey})`}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.4}
              type="monotone"
            />
          ))}
          {selected !== null ? (
            <RechartsReferenceLine
              stroke="var(--color-foreground)"
              strokeDasharray="2 3"
              x={selected}
            />
          ) : null}
        </LineChart>
      </ChartContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {series.map((item) => (
          <span className="inline-flex items-center gap-1.5 text-caption text-caption-foreground" key={item.id}>
            <span aria-hidden="true" className={toneDotClass(item.tone)} />
            <span>{item.label}</span>
            {selected !== null ? (
              <strong className="font-mono tabular-nums text-foreground">
                {finiteChartValue(item.values[selected])}
              </strong>
            ) : null}
          </span>
        ))}
      </div>
      {selected !== null ? (
        <p
          aria-atomic="true"
          aria-live="polite"
          className="font-mono text-caption text-caption-foreground"
          id={annotationId}
        >
          {formatPoint(selected)}
          <span className="sr-only">
            {series.map((item) => (
              `, ${item.label} ${finiteChartValue(item.values[selected])}`
            )).join("")}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function normalizeTooltipPointIndex(
  value: null | number | string | undefined,
  pointCount: number,
): number | null {
  let index = Number.NaN;
  if (typeof value === "number") {
    index = value;
  } else if (typeof value === "string" && /^\d+$/.test(value)) {
    index = Number(value);
  }
  return Number.isInteger(index) && index >= 0 && index < pointCount
    ? index
    : null;
}

function finiteChartValue(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toneDotClass(tone: ChartTone): string {
  if (tone === "primary") return "size-2 rounded-full bg-primary";
  if (tone === "healthy") return "size-2 rounded-full bg-status-healthy";
  if (tone === "warning") return "size-2 rounded-full bg-status-warning";
  if (tone === "critical") return "size-2 rounded-full bg-status-critical";
  if (tone === "stale") return "size-2 rounded-full bg-status-stale";
  return "size-2 rounded-full bg-status-unknown";
}
