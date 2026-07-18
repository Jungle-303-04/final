export type ChartTone =
  | "critical"
  | "healthy"
  | "primary"
  | "stale"
  | "unknown"
  | "warning";

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
