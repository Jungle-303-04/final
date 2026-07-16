import { AlertTriangle, Hexagon, RotateCcw } from "lucide-react";
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
}: {
  className?: string;
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
  pod: InfraMapPod;
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

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <button
            aria-describedby={tooltipId}
            aria-label={`${pod.name} ${pod.phase} ${usageText ?? t("common.value.unavailable")}`}
            className={cn(
              "relative grid size-8 shrink-0 place-items-center outline-none transition-[transform,filter] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0",
              pressureTone === "unknown" && "opacity-70",
              className,
            )}
            data-health-tone={healthTone}
            data-metric={metricMode}
            data-slot="infra-map-topology-pod"
            data-usage-tone={pressureTone}
            onClick={() => onOpenPod(pod)}
            type="button"
          />
        )}
      >
        <Hexagon
          aria-hidden="true"
          className={cn(
            "size-8",
            TOPOLOGY_POD_FILL_CLASS[pressureTone],
            TOPOLOGY_POD_HEALTH_STROKE_CLASS[healthTone],
          )}
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
            {badge === "restarting" ? (
              <RotateCcw aria-hidden="true" className="size-2" />
            ) : (
              <AlertTriangle aria-hidden="true" className="size-2" />
            )}
          </span>
        )}
      </TooltipTrigger>
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

const TOPOLOGY_POD_FILL_CLASS: Record<PodResourcePressureTone, string> = {
  danger: "fill-orange-500/35 text-orange-500",
  healthy: "fill-emerald-500/25 text-emerald-500",
  unknown: "fill-muted/35 text-muted-foreground [stroke-dasharray:3_2]",
  warning: "fill-status-warning/30 text-status-warning",
};

const TOPOLOGY_POD_HEALTH_STROKE_CLASS: Record<PodHealthTone, string> = {
  critical: "stroke-destructive stroke-2",
  healthy: "stroke-border",
  unknown: "stroke-border",
  warning: "stroke-border",
};
