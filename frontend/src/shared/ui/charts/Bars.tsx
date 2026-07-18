import { cn } from "@/shared/lib/cn";
import {
  chartToneColor,
  finitePositive,
  normalizedRatio,
  type ChartTone,
} from "./chartPrimitives";

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
    <svg
      aria-label={ariaLabel}
      className={cn("h-1.5 w-full overflow-visible", className)}
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 6"
    >
      <rect
        fill="var(--color-muted)"
        height="6"
        rx="3"
        width="100"
      />
      {ratio == null ? (
        <path
          d="M2 3h96"
          stroke="var(--color-caption-foreground)"
          strokeDasharray="2 3"
          strokeWidth="1"
        />
      ) : (
        <rect
          className="transition-[width] duration-(--motion-value) ease-(--ease-draw) motion-reduce:transition-none"
          fill={chartToneColor(tone)}
          height="6"
          rx="3"
          width={ratio * 100}
        />
      )}
    </svg>
  );
}

export interface RatioBarSegment {
  id: string;
  tone: ChartTone;
  value: number;
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
  const total = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.value),
    0,
  );
  let offset = 0;

  return (
    <svg
      aria-label={ariaLabel}
      className={cn("h-2 w-full overflow-hidden rounded-full", className)}
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 8"
    >
      <rect fill="var(--color-muted)" height="8" rx="4" width="100" />
      {total > 0
        ? segments.map((segment) => {
            const width = (Math.max(0, segment.value) / total) * 100;
            const x = offset;
            offset += width;
            return (
              <rect
                fill={chartToneColor(segment.tone)}
                height="8"
                key={segment.id}
                width={width}
                x={x}
              />
            );
          })
        : null}
    </svg>
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
    Math.max(1, ...values.filter((value): value is number => value != null)),
  );
  const gap = 2;
  const barWidth = values.length > 0
    ? Math.max(1, (100 - gap * (values.length - 1)) / values.length)
    : 100;

  return (
    <svg
      aria-label={ariaLabel}
      className={cn("h-8 w-full overflow-visible", className)}
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 32"
    >
      {values.map((value, index) => {
        const ratio = normalizedRatio(value, ceiling);
        const height = ratio == null ? 2 : Math.max(2, ratio * 30);
        return (
          <rect
            fill={ratio == null
              ? "var(--color-caption-foreground)"
              : chartToneColor(tone)}
            height={height}
            key={`${index}-${String(value)}`}
            opacity={ratio == null ? 0.45 : 1}
            rx="1"
            width={barWidth}
            x={index * (barWidth + gap)}
            y={32 - height}
          />
        );
      })}
    </svg>
  );
}

export function ProgressFill({
  ariaLabel,
  className,
  max = 100,
  tone = "primary",
  value,
}: MiniBarProps) {
  const ratio = normalizedRatio(value, max);
  return (
    <div
      aria-label={ariaLabel}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={value == null ? undefined : Math.min(max, Math.max(0, value))}
      className={cn(
        "h-2 overflow-hidden rounded-full bg-muted",
        className,
      )}
      role="progressbar"
    >
      <svg
        aria-hidden="true"
        className="h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 8"
      >
        {ratio == null ? (
          <path
            d="M2 4h96"
            stroke="var(--color-caption-foreground)"
            strokeDasharray="2 3"
            strokeWidth="1"
          />
        ) : (
          <rect
            className="transition-[width] duration-(--motion-value) ease-(--ease-draw) motion-reduce:transition-none"
            fill={chartToneColor(tone)}
            height="8"
            width={ratio * 100}
          />
        )}
      </svg>
    </div>
  );
}
