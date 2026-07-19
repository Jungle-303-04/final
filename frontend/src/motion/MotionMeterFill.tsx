import { motion } from "motion/react";

import { MOTION_TWEEN } from "./transitions";

export type MotionMeterFillTiming = "draw" | "meter";
export type MotionMeterFillTone =
  | "critical"
  | "healthy"
  | "primary"
  | "stale"
  | "unknown"
  | "warning";

interface MotionMeterFillProps {
  className?: string;
  percentage: number;
  reducedMotion: boolean;
  timing: MotionMeterFillTiming;
  tone: MotionMeterFillTone;
}

export function MotionMeterFill({
  className,
  percentage,
  reducedMotion,
  timing,
  tone,
}: MotionMeterFillProps) {
  return (
    <motion.span
      animate={{ width: `${percentage}%` }}
      aria-hidden="true"
      className={className}
      data-meter-tone={tone}
      data-slot="progress-indicator"
      initial={false}
      transition={reducedMotion ? MOTION_TWEEN.none : MOTION_TWEEN[timing]}
    />
  );
}
