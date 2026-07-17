import { AlertTriangle, Hexagon } from "lucide-react";
import type { CSSProperties } from "react";
import { useId } from "react";

import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import {
  Tooltip,
  TooltipTrigger,
} from "../../shared/ui/primitives/tooltip";
import { PodEvidenceTooltipContent } from "./PodEvidenceTooltipContent";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import { infraMapPodMetricRatio } from "./resourcesInfraMapPodOrdering";
import {
  podAbnormalBadge,
  podAbnormalBadgeTone,
  podHealthTone,
  podResourcePressureTone,
  type PodHealthTone,
  type PodResourcePressureTone,
} from "./podVisualState";

export function TopologyPodHex({
  className,
  metricMode,
  onOpenPod,
  pod,
  showTooltip = true,
  size,
}: {
  className?: string;
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
  pod: InfraMapPod;
  showTooltip?: boolean;
  size?: number;
}) {
  const { formatNumber, t } = useI18n();
  const tooltipId = useId();
  const ratio = infraMapPodMetricRatio(pod, metricMode);
  const pressureTone = podResourcePressureTone(ratio);
  const healthTone = podHealthTone(pod);
  const badge = podAbnormalBadge(pod);
  const usageText = ratio === null
    ? null
    : formatNumber(ratio, { maximumFractionDigits: 1, style: "percent" });
  const trigger = (
    <button
      aria-describedby={showTooltip ? tooltipId : undefined}
      aria-label={`${pod.name} ${pod.phase} ${usageText ?? t("common.value.unavailable")}`}
      className={cn(
        "nodrag nopan relative grid size-8 shrink-0 place-items-center outline-none transition-[transform,filter] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        pressureTone === "unknown" && "opacity-70",
        className,
      )}
      data-health-tone={healthTone}
      data-metric={metricMode}
      data-slot="infra-map-topology-pod"
      data-usage-tone={pressureTone}
      onClick={() => onOpenPod(pod)}
      style={topologyPodHexStyle(size)}
      type="button"
    >
      <Hexagon
        aria-hidden="true"
        className={cn(
          "size-8",
          topologyPodFillClass(pressureTone, healthTone),
          TOPOLOGY_POD_HEALTH_STROKE_CLASS[healthTone],
        )}
        style={topologyPodHexStyle(size)}
      />
      {badge === null ? null : (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full border bg-background shadow-xs",
            podAbnormalBadgeTone(badge) === "critical"
              ? "border-destructive/70 text-destructive"
              : "border-border text-status-warning",
          )}
          data-pod-badge={badge}
        >
          <AlertTriangle aria-hidden="true" className="size-2" />
        </span>
      )}
    </button>
  );

  if (!showTooltip) {
    return trigger;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <PodEvidenceTooltipContent
        id={tooltipId}
        pod={{
          cpuMillicores: pod.cpu.value,
          cpuRequestMillicores: pod.cpu.request,
          memoryMebibytes: pod.memory.value,
          memoryRequestMebibytes: pod.memory.request,
          name: pod.name,
          namespace: pod.namespace,
          phase: pod.phase,
          restartCount: pod.restartCount,
          usagePercent: pod.usagePercent,
        }}
        slot="infra-map-topology-pod-tooltip"
        usageText={usageText}
      />
    </Tooltip>
  );
}

function topologyPodHexStyle(size: number | undefined): CSSProperties | undefined {
  if (size === undefined) return undefined;
  return {
    height: size,
    width: size,
  };
}

const TOPOLOGY_POD_FILL_CLASS: Record<PodResourcePressureTone, string> = {
  danger: "fill-orange-500/35 text-orange-500",
  healthy: "fill-emerald-500/25 text-emerald-500",
  unknown: "fill-muted/35 text-muted-foreground [stroke-dasharray:3_2]",
  warning: "fill-status-warning/30 text-status-warning",
};

const TOPOLOGY_POD_UNKNOWN_FILL_CLASS: Record<PodHealthTone, string> = {
  critical: "fill-destructive/12 text-destructive [stroke-dasharray:3_2]",
  healthy: "fill-emerald-500/10 text-emerald-500 [stroke-dasharray:3_2]",
  unknown: TOPOLOGY_POD_FILL_CLASS.unknown,
  warning: "fill-status-warning/12 text-status-warning [stroke-dasharray:3_2]",
};

const TOPOLOGY_POD_HEALTH_STROKE_CLASS: Record<PodHealthTone, string> = {
  critical: "stroke-destructive stroke-2",
  healthy: "stroke-emerald-600/85 dark:stroke-emerald-400/85",
  unknown: "stroke-muted-foreground/80",
  warning: "stroke-status-warning",
};

function topologyPodFillClass(
  pressureTone: PodResourcePressureTone,
  healthTone: PodHealthTone,
): string {
  if (pressureTone !== "unknown") return TOPOLOGY_POD_FILL_CLASS[pressureTone];
  return TOPOLOGY_POD_UNKNOWN_FILL_CLASS[healthTone];
}
