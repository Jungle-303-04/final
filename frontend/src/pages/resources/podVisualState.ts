export const POD_RESOURCE_PRESSURE_WARNING_RATIO = 0.8;
export const POD_RESOURCE_PRESSURE_DANGER_RATIO = 0.95;
export const PERCENT_SCALE = 100;
const POD_SHORT_LABEL_CHARACTER_COUNT = 2;
const POD_USAGE_UNKNOWN_LABEL = "\u2014";

const POD_PROBLEM_PRIORITY = {
  criticalHealth: 0,
  warningHealth: 1,
  dangerPressure: 2,
  warningPressure: 3,
  healthy: 4,
  unknownPressure: 5,
} as const;

export type PodAbnormalBadge = "crash-loop" | "error" | "pending" | null;
export type PodHealthTone = "critical" | "healthy" | "unknown" | "warning";
export type PodResourcePressureTone = "danger" | "healthy" | "unknown" | "warning";
export type PodVisualTone = "critical" | PodResourcePressureTone;

export interface PodStatusEvidence {
  health?: string | null;
  phase?: string | null;
  restartCount?: number | null;
}

export function podAbnormalBadge(pod: PodStatusEvidence): PodAbnormalBadge {
  const phase = normalizeStatus(pod.phase);
  const health = normalizeStatus(pod.health);
  const combined = `${phase} ${health}`;
  if (combined.includes("crashloop")) return "crash-loop";
  if (
    combined.includes("imagepull") ||
    combined.includes("errimagepull") ||
    combined.includes("backoff") ||
    combined.includes("critical") ||
    combined.includes("error") ||
    combined.includes("failed") ||
    combined.includes("fail") ||
    combined.includes("notready") ||
    combined.includes("not ready") ||
    combined.includes("oom") ||
    combined.includes("unhealthy")
  ) return "error";
  if (phase === "pending") return "pending";
  return null;
}

export function podAbnormalBadgeTone(badge: PodAbnormalBadge): PodHealthTone {
  if (badge === "pending") return "warning";
  if (badge === null) return "healthy";
  return "critical";
}

export function podHealthTone(pod: PodStatusEvidence): PodHealthTone {
  const badge = podAbnormalBadge(pod);
  if (badge !== null) return podAbnormalBadgeTone(badge);

  const health = normalizeStatus(pod.health);
  const phase = normalizeStatus(pod.phase);
  const combined = `${health} ${phase}`;
  if (combined.trim() === "") return "unknown";
  if (
    combined.includes("critical") ||
    combined.includes("crash") ||
    combined.includes("error") ||
    combined.includes("failed") ||
    combined.includes("fail") ||
    combined.includes("imagepull") ||
    combined.includes("errimagepull") ||
    combined.includes("backoff") ||
    combined.includes("oom") ||
    combined.includes("notready") ||
    combined.includes("not ready") ||
    combined.includes("unhealthy")
  ) return "critical";
  if (
    combined.includes("degraded") ||
    combined.includes("pending") ||
    combined.includes("stale") ||
    combined.includes("warn")
  ) return "warning";
  if (
    health === "healthy" ||
    health === "ok" ||
    health === "ready" ||
    health === "running" ||
    phase === "running" ||
    phase === "ready"
  ) return "healthy";
  if (combined.includes("unknown")) return "unknown";
  return "unknown";
}

export function podResourcePressureTone(
  ratio: number | null,
): PodResourcePressureTone {
  if (ratio === null || !Number.isFinite(ratio)) return "unknown";
  if (ratio >= POD_RESOURCE_PRESSURE_DANGER_RATIO) return "danger";
  if (ratio >= POD_RESOURCE_PRESSURE_WARNING_RATIO) return "warning";
  return "healthy";
}

export function podResourcePressureToneFromPercent(
  percent: number | null,
): PodResourcePressureTone {
  if (percent === null || !Number.isFinite(percent)) return "unknown";
  return podResourcePressureTone(percent / PERCENT_SCALE);
}

export function podVisualTone(
  pod: PodStatusEvidence,
  ratio: number | null,
): PodVisualTone {
  const healthTone = podHealthTone(pod);
  if (healthTone === "critical") return "critical";
  const pressureTone = podResourcePressureTone(ratio);
  if (pressureTone === "unknown") {
    return healthTone === "healthy" ? "unknown" : healthTone;
  }
  if (healthTone === "warning" && pressureTone === "healthy") return "warning";
  return pressureTone;
}

export function podUsageColorFromRatio(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "var(--muted-foreground)";
  const percent = clampPercent(ratio * PERCENT_SCALE);
  const warningPercent = POD_RESOURCE_PRESSURE_WARNING_RATIO * PERCENT_SCALE;
  const dangerPercent = POD_RESOURCE_PRESSURE_DANGER_RATIO * PERCENT_SCALE;
  if (percent < warningPercent) return "var(--color-emerald-500)";
  if (percent <= dangerPercent) {
    const orangeWeight = ((percent - warningPercent) /
      (dangerPercent - warningPercent)) * PERCENT_SCALE;
    return `color-mix(in oklch, var(--status-warning) ${PERCENT_SCALE - orangeWeight}%, var(--color-orange-500) ${orangeWeight}%)`;
  }
  return "color-mix(in oklch, var(--color-orange-500) 82%, var(--foreground) 18%)";
}

export function podUsageColorFromPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return "var(--muted-foreground)";
  return podUsageColorFromRatio(percent / PERCENT_SCALE);
}

export function podUsageLabel(usagePercent: number | null): string {
  if (usagePercent === null) return POD_USAGE_UNKNOWN_LABEL;
  const measured = Math.round(usagePercent * 10) / 10;
  return `${measured}%`;
}

export function podShortLabel(name: string): string {
  return Array.from(name.normalize("NFKC"))
    .filter((character) => /[\p{L}\p{N}]/u.test(character))
    .slice(0, POD_SHORT_LABEL_CHARACTER_COUNT)
    .join("")
    .toUpperCase();
}

export function podProblemPriority(pod: PodStatusEvidence & { usagePercent?: number | null }): number {
  const healthTone = podHealthTone(pod);
  if (healthTone === "critical") return POD_PROBLEM_PRIORITY.criticalHealth;
  if (healthTone === "warning") return POD_PROBLEM_PRIORITY.warningHealth;
  const pressureTone = podResourcePressureToneFromPercent(optionalPercent(pod.usagePercent));
  if (pressureTone === "danger") return POD_PROBLEM_PRIORITY.dangerPressure;
  if (pressureTone === "warning") return POD_PROBLEM_PRIORITY.warningPressure;
  if (pressureTone === "unknown") return POD_PROBLEM_PRIORITY.unknownPressure;
  return POD_PROBLEM_PRIORITY.healthy;
}

function optionalPercent(value: number | null | undefined): number | null {
  return value === undefined ? null : value;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(PERCENT_SCALE, value));
}

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}
