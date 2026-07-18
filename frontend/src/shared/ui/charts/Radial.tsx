import { cn } from "@/shared/lib/cn";
import {
  chartToneColor,
  normalizedRatio,
  type ChartTone,
} from "./chartPrimitives";

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
  const total = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.value),
    0,
  );
  let offset = 0;

  return (
    <svg
      aria-label={ariaLabel}
      className={cn("size-24 overflow-visible", className)}
      role="img"
      viewBox="0 0 100 100"
    >
      <circle
        cx="50"
        cy="50"
        fill="none"
        pathLength="100"
        r="38"
        stroke="var(--color-muted)"
        strokeWidth="12"
      />
      {total > 0
        ? segments.map((segment) => {
            const portion = (Math.max(0, segment.value) / total) * 100;
            const currentOffset = offset;
            offset += portion;
            return (
              <circle
                cx="50"
                cy="50"
                fill="none"
                key={segment.id}
                pathLength="100"
                r="38"
                stroke={chartToneColor(segment.tone)}
                strokeDasharray={`${portion} ${100 - portion}`}
                strokeDashoffset={-currentOffset}
                strokeWidth="12"
                transform="rotate(-90 50 50)"
              />
            );
          })
        : null}
      {centerLabel ? (
        <text
          fill="var(--color-foreground)"
          fontSize="13"
          fontWeight="700"
          textAnchor="middle"
          x="50"
          y="54"
        >
          {centerLabel}
        </text>
      ) : null}
    </svg>
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
  const ratio = normalizedRatio(value, max);
  return (
    <svg
      aria-label={ariaLabel}
      className={cn("size-24 overflow-visible", className)}
      data-surface={surface}
      role="img"
      viewBox="0 0 100 100"
    >
      <circle
        cx="50"
        cy="50"
        fill="none"
        pathLength="100"
        r="38"
        stroke="var(--color-muted)"
        strokeWidth="10"
      />
      {ratio == null ? (
        <circle
          cx="50"
          cy="50"
          fill="none"
          pathLength="100"
          r="38"
          stroke="var(--color-caption-foreground)"
          strokeDasharray="2 4"
          strokeWidth="10"
          transform="rotate(-90 50 50)"
        />
      ) : (
        <circle
          className="origin-center transition-[stroke-dasharray] duration-(--motion-value) ease-(--ease-draw) motion-reduce:transition-none"
          cx="50"
          cy="50"
          fill="none"
          pathLength="100"
          r="38"
          stroke={chartToneColor(tone)}
          strokeDasharray={`${ratio * 100} ${100 - ratio * 100}`}
          strokeLinecap="round"
          strokeWidth="10"
          transform="rotate(-90 50 50)"
        />
      )}
      <text
        fill="var(--color-foreground)"
        fontSize="13"
        fontWeight="700"
        textAnchor="middle"
        x="50"
        y="54"
      >
        {displayValue}
      </text>
    </svg>
  );
}
