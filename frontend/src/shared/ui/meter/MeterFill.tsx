import {
  MotionMeterFill,
  type MotionMeterFillTiming,
  type MotionMeterFillTone,
} from "../../../motion/MotionMeterFill";
import { usePrefersReducedMotion } from "../../../motion/usePrefersReducedMotion";
import { cn } from "../../lib/cn";

export type MeterTone = Exclude<MotionMeterFillTone, "primary" | "stale">;

export interface MeterFillProps {
  className?: string;
  timing?: MotionMeterFillTiming;
  tone: MotionMeterFillTone;
  value: number;
}

/** Shared meter fill matching demo-freeze-v3's tokenized draw motion. */
export function MeterFill({ className, timing = "meter", tone, value }: MeterFillProps) {
  const reducedMotion = usePrefersReducedMotion();
  const normalizedValue = clampMeterValue(value);

  return (
    <MotionMeterFill
      className={cn("motion-meter-fill block h-full rounded-full", className)}
      percentage={normalizedValue}
      reducedMotion={reducedMotion}
      timing={timing}
      tone={tone}
    />
  );
}

function clampMeterValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
