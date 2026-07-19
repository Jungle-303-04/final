import { useState } from "react";

import { cn } from "@/shared/lib/cn";
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const max = Math.max(
    1,
    ...series.flatMap((item) => item.values.filter(Number.isFinite)),
  );
  const selected = activeIndex === null
    ? null
    : Math.min(pointCount - 1, Math.max(0, activeIndex));

  return (
    <div className={cn("grid min-w-0 gap-3", className)} data-slot="multi-line">
      <svg
        aria-label={ariaLabel}
        className="h-44 w-full overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        onBlur={() => setActiveIndex(null)}
        onFocus={() => setActiveIndex(Math.max(0, pointCount - 1))}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? 1 : -1;
          setActiveIndex((current) => Math.min(
            pointCount - 1,
            Math.max(0, (current ?? pointCount - 1) + delta),
          ));
        }}
        onPointerLeave={() => setActiveIndex(null)}
        onPointerMove={(event) => {
          if (pointCount === 0) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const ratio = bounds.width > 0
            ? (event.clientX - bounds.left) / bounds.width
            : 0;
          setActiveIndex(Math.round(Math.min(1, Math.max(0, ratio)) * (pointCount - 1)));
        }}
        role="img"
        tabIndex={0}
        viewBox="0 0 600 176"
      >
        {[0, 0.5, 1].map((ratio) => (
          <line
            key={ratio}
            stroke="var(--color-border-subtle)"
            strokeDasharray="3 5"
            x1="0"
            x2="600"
            y1={8 + ratio * 144}
            y2={8 + ratio * 144}
          />
        ))}
        {series.map((item) => (
          <polyline
            className="motion-safe:[stroke-dasharray:700] motion-safe:[stroke-dashoffset:0] motion-safe:transition-[stroke-dashoffset] motion-safe:duration-(--motion-layout) motion-safe:ease-(--ease-draw)"
            fill="none"
            key={item.id}
            points={item.values.map((value, index) => [
              xPosition(index, pointCount),
              yPosition(value, max),
            ].join(",")).join(" ")}
            stroke={chartToneColor(item.tone)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        ))}
        {selected !== null ? (
          <line
            stroke="var(--color-foreground)"
            strokeDasharray="2 3"
            x1={xPosition(selected, pointCount)}
            x2={xPosition(selected, pointCount)}
            y1="8"
            y2="152"
          />
        ) : null}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {series.map((item) => (
          <span className="inline-flex items-center gap-1.5 text-caption text-caption-foreground" key={item.id}>
            <span
              aria-hidden="true"
              className={toneDotClass(item.tone)}
            />
            <span>{item.label}</span>
            {selected !== null ? (
              <strong className="font-mono tabular-nums text-foreground">
                {item.values[selected] ?? 0}
              </strong>
            ) : null}
          </span>
        ))}
      </div>
      {selected !== null ? (
        <p aria-live="polite" className="font-mono text-caption text-caption-foreground">
          {formatPoint(selected)}
        </p>
      ) : null}
    </div>
  );
}

function xPosition(index: number, total: number): number {
  return total <= 1 ? 300 : (index / (total - 1)) * 600;
}

function yPosition(value: number, max: number): number {
  const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value / max)) : 0;
  return 152 - ratio * 144;
}

function toneDotClass(tone: ChartTone): string {
  if (tone === "primary") return "size-2 rounded-full bg-primary";
  if (tone === "healthy") return "size-2 rounded-full bg-status-healthy";
  if (tone === "warning") return "size-2 rounded-full bg-status-warning";
  if (tone === "critical") return "size-2 rounded-full bg-status-critical";
  if (tone === "stale") return "size-2 rounded-full bg-status-stale";
  return "size-2 rounded-full bg-status-unknown";
}
