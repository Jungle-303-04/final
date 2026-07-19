import { motion } from "motion/react";

import { MOTION_TWEEN } from "../../../motion/transitions";
import { usePrefersReducedMotion } from "../../../motion/usePrefersReducedMotion";
import { cn } from "../../lib/cn";

export type MeterTone = "healthy" | "warning" | "critical" | "unknown";

export interface MeterFillProps {
  className?: string;
  tone: MeterTone;
  value: number;
}

const METER_TONE_VARIABLE = Object.freeze({
  healthy: "var(--status-healthy)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
  unknown: "var(--status-unknown)",
} satisfies Record<MeterTone, string>);

/** Shared meter fill matching demo-freeze-v3's tokenized draw motion. */
export function MeterFill({ className, tone, value }: MeterFillProps) {
  const reducedMotion = usePrefersReducedMotion();
  const normalizedValue = clampMeterValue(value);

  return (
    <motion.span
      animate={{ width: `${normalizedValue}%` }}
      aria-hidden="true"
      className={cn("block h-full rounded-full", className)}
      data-meter-tone={tone}
      initial={false}
      style={{ backgroundColor: METER_TONE_VARIABLE[tone] }}
      transition={reducedMotion ? MOTION_TWEEN.none : MOTION_TWEEN.meter}
    />
  );
}

function clampMeterValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
