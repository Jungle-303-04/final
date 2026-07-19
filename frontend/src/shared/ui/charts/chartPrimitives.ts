import { MOTION_DURATION_MS, RECHARTS_EASE_DRAW } from "@/motion";

export type ChartTone =
  | "critical"
  | "healthy"
  | "primary"
  | "stale"
  | "unknown"
  | "warning";

export const RECHARTS_DRAW_ANIMATION = Object.freeze({
  animationDuration: MOTION_DURATION_MS.draw,
  animationEasing: RECHARTS_EASE_DRAW,
});

export const RECHARTS_METER_ANIMATION = Object.freeze({
  animationDuration: MOTION_DURATION_MS.meter,
  animationEasing: RECHARTS_EASE_DRAW,
});

export function finitePositive(value: number | undefined, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function normalizedRatio(value: null | number, max: number) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value / finitePositive(max)));
}

export function chartToneColor(tone: ChartTone) {
  if (tone === "primary") return "var(--color-primary)";
  return `var(--color-status-${tone})`;
}
