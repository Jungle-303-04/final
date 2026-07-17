import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import { infraMapPodMetricRatio } from "./resourcesInfraMapPodOrdering";
import {
  podHealthTone,
  podResourcePressureTone,
  podUsageColorFromRatio,
  type PodHealthTone,
  type PodResourcePressureTone,
} from "./podVisualState";

export interface InfraMapPodToneState {
  healthTone: PodHealthTone;
  pressureTone: PodResourcePressureTone;
  ratio: number | null;
}

export interface InfraMapPodSvgVisual {
  fill: string;
  stroke: string;
  strokeDasharray?: string;
}

export function infraMapPodToneState(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
): InfraMapPodToneState {
  const ratio = infraMapPodMetricRatio(pod, metricMode);
  return {
    healthTone: podHealthTone(pod),
    pressureTone: podResourcePressureTone(ratio),
    ratio,
  };
}

export function infraMapPodSvgVisual(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
): InfraMapPodSvgVisual {
  const tone = infraMapPodToneState(pod, metricMode);
  const fill = infraMapPodFillColor(tone);
  return {
    fill,
    stroke: tone.healthTone === "critical"
      ? "var(--destructive)"
      : tone.pressureTone === "unknown"
      ? infraMapPodUnknownStrokeColor(tone.healthTone)
      : fill,
    strokeDasharray: tone.pressureTone === "unknown" ? "3 3" : undefined,
  };
}

export function infraMapPodFillColor({
  healthTone,
  pressureTone,
  ratio,
}: InfraMapPodToneState): string {
  if (healthTone === "critical") return "var(--destructive)";
  if (pressureTone === "unknown") {
    return infraMapPodUnknownStrokeColor(healthTone);
  }
  return podUsageColorFromRatio(ratio);
}

export function infraMapPodUnknownStrokeColor(healthTone: PodHealthTone): string {
  if (healthTone === "healthy") return "var(--color-emerald-500)";
  if (healthTone === "warning") return "var(--status-warning)";
  if (healthTone === "critical") return "var(--destructive)";
  return "var(--muted-foreground)";
}

export const INFRA_MAP_POD_PRESSURE_CLASS: Record<PodResourcePressureTone, string> = {
  danger: "border-border bg-orange-500/10 text-foreground",
  healthy: "border-border bg-emerald-500/5 text-foreground",
  unknown: "border-dashed border-border bg-background/80 text-muted-foreground",
  warning: "border-border bg-status-warning/10 text-foreground",
};

export const INFRA_MAP_POD_HEALTH_BORDER_CLASS: Record<PodHealthTone, string> = {
  critical: "border-destructive/70 ring-1 ring-destructive/25",
  healthy: "border-border",
  unknown: "border-border",
  warning: "border-border",
};

export const INFRA_MAP_POD_CUBE_PRESSURE_CLASS: Record<PodResourcePressureTone, string> = {
  danger: "border-border bg-orange-500/15 text-foreground",
  healthy: "border-border bg-emerald-500/12 text-foreground",
  unknown: "border-dashed border-border bg-background text-muted-foreground",
  warning: "border-border bg-status-warning/15 text-foreground",
};

export const INFRA_MAP_POD_CUBE_HEALTH_BORDER_CLASS: Record<PodHealthTone, string> = {
  critical: "border-destructive/75 ring-1 ring-destructive/30",
  healthy: "border-border",
  unknown: "border-border",
  warning: "border-border",
};

const INFRA_MAP_POD_UNKNOWN_HEALTH_SLOT_CLASS: Record<PodHealthTone, string> = {
  critical: "border-dashed border-destructive/65 bg-destructive/5 text-foreground",
  healthy: "border-dashed border-emerald-500/50 bg-emerald-500/5 text-foreground",
  unknown: INFRA_MAP_POD_PRESSURE_CLASS.unknown,
  warning: "border-dashed border-status-warning/60 bg-status-warning/5 text-foreground",
};

const INFRA_MAP_POD_UNKNOWN_HEALTH_CUBE_CLASS: Record<PodHealthTone, string> = {
  critical: "border-dashed border-destructive/70 bg-destructive/10 text-destructive",
  healthy: "border-dashed border-emerald-500/60 bg-emerald-500/10 text-emerald-500",
  unknown: INFRA_MAP_POD_CUBE_PRESSURE_CLASS.unknown,
  warning: "border-dashed border-status-warning/70 bg-status-warning/10 text-status-warning",
};

export const INFRA_MAP_TOPOLOGY_POD_FILL_CLASS: Record<PodResourcePressureTone, string> = {
  danger: "fill-orange-500/35 text-orange-500",
  healthy: "fill-emerald-500/25 text-emerald-500",
  unknown: "fill-muted/35 text-muted-foreground [stroke-dasharray:3_2]",
  warning: "fill-status-warning/30 text-status-warning",
};

const INFRA_MAP_TOPOLOGY_POD_UNKNOWN_FILL_CLASS: Record<PodHealthTone, string> = {
  critical: "fill-destructive/12 text-destructive [stroke-dasharray:3_2]",
  healthy: "fill-emerald-500/10 text-emerald-500 [stroke-dasharray:3_2]",
  unknown: INFRA_MAP_TOPOLOGY_POD_FILL_CLASS.unknown,
  warning: "fill-status-warning/12 text-status-warning [stroke-dasharray:3_2]",
};

export const INFRA_MAP_TOPOLOGY_POD_HEALTH_STROKE_CLASS: Record<PodHealthTone, string> = {
  critical: "stroke-destructive stroke-2",
  healthy: "stroke-emerald-600/85 dark:stroke-emerald-400/85",
  unknown: "stroke-muted-foreground/80",
  warning: "stroke-status-warning",
};

export function infraMapPodSlotShellClass(
  pressureTone: PodResourcePressureTone,
  healthTone: PodHealthTone,
): string {
  if (pressureTone !== "unknown") return INFRA_MAP_POD_PRESSURE_CLASS[pressureTone];
  return INFRA_MAP_POD_UNKNOWN_HEALTH_SLOT_CLASS[healthTone];
}

export function infraMapPodCubeShellClass(
  pressureTone: PodResourcePressureTone,
  healthTone: PodHealthTone,
): string {
  if (pressureTone !== "unknown") return INFRA_MAP_POD_CUBE_PRESSURE_CLASS[pressureTone];
  return INFRA_MAP_POD_UNKNOWN_HEALTH_CUBE_CLASS[healthTone];
}

export function infraMapTopologyPodFillClass(
  pressureTone: PodResourcePressureTone,
  healthTone: PodHealthTone,
): string {
  if (pressureTone !== "unknown") return INFRA_MAP_TOPOLOGY_POD_FILL_CLASS[pressureTone];
  return INFRA_MAP_TOPOLOGY_POD_UNKNOWN_FILL_CLASS[healthTone];
}

export function infraMapHealthDotClass(tone: string): string {
  return {
    critical: "bg-destructive",
    danger: "bg-orange-500",
    healthy: "bg-emerald-500",
    stale: "bg-muted-foreground",
    unknown: "bg-muted-foreground",
    warning: "bg-status-warning",
  }[tone] ?? "bg-muted-foreground";
}
