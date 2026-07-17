import { AlertTriangle, Pause, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";

import type { PhysicalTopologyPod as PhysicalTopologyPodValue } from "../../features/resources/physicalTopologyContract";
import { useFirstAppearanceMotion } from "../../motion/useFirstAppearanceMotion";
import { podWaveDelay } from "../../motion/useStagger";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import {
  Tooltip,
  TooltipTrigger,
} from "../../shared/ui/primitives/tooltip";
import { PodEvidenceTooltipContent } from "./PodEvidenceTooltipContent";
import {
  podAbnormalBadge,
  podShortLabel,
  podUsageLabel,
  podUsageTone,
} from "./physicalTopologyViewModel";
import { podAbnormalBadgeTone } from "./podVisualState";
import { usageColor, useSmoothedUsageColor } from "./useSmoothedUsageColor";

export function PhysicalTopologyPod({
  nodeIndex,
  onOpen,
  pod,
  podIndex,
}: {
  nodeIndex: number;
  onOpen: (pod: PhysicalTopologyPodValue) => void;
  pod: PhysicalTopologyPodValue;
  podIndex: number;
}) {
  const { t } = useI18n();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const smoothedUsage = useSmoothedUsageColor(pod.usagePercent, buttonRef);
  const tone = podUsageTone(smoothedUsage);
  const badge = podAbnormalBadge(pod);
  const badgeTone = podAbnormalBadgeTone(badge);
  const entering = useFirstAppearanceMotion(`pod:${pod.id}`);
  const delay = podWaveDelay(nodeIndex, podIndex);
  const color = smoothedUsage === null ? null : usageColor(smoothedUsage);
  const usageLabel = podUsageLabel(pod.usagePercent);
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button || !entering) return;
    button.style.animationDelay = `${delay}ms`;
    return () => {
      button.style.removeProperty("animation-delay");
    };
  }, [delay, entering]);
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    if (color === null) {
      button.style.removeProperty("--usage-color");
      button.style.removeProperty("background-color");
      return;
    }
    button.style.setProperty("--usage-color", color);
    button.style.backgroundColor = "color-mix(in oklch, var(--usage-color) 34%, var(--card))";
  }, [color]);
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <button
            aria-describedby={tooltipId}
            aria-label={t("resources.graph.pod.aria", {
              name: pod.name,
              phase: pod.phase,
              usage: usageLabel,
            })}
            className={cn(
              "relative grid size-9 place-items-center rounded-md border border-border text-[0.625rem] font-semibold shadow-xs outline-none transition-[opacity,transform,background-color] duration-(--motion-instant) hover:z-10 hover:-translate-y-0.5 hover:shadow-md focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0",
              entering && "motion-pod-pop",
              tone !== "unknown" && "text-foreground",
              tone === "unknown" && "border-dashed border-border bg-background text-muted-foreground",
              !pod.matchesFilter && "opacity-45 hover:opacity-100 focus-visible:opacity-100",
            )}
            data-matches-filter={String(pod.matchesFilter)}
            data-health-tone={badgeTone === "critical" ? "critical" : pod.health}
            data-morph-id={`pod:${pod.id}`}
            data-slot="physical-topology-pod"
            data-usage-tone={tone}
            data-usage-value={smoothedUsage === null ? "unknown" : smoothedUsage.toFixed(3)}
            onClick={() => onOpen(pod)}
            ref={buttonRef}
            type="button"
          />
        )}
      >
        <span aria-hidden="true" className="max-w-7 truncate leading-none">
          {podShortLabel(pod.name)}
        </span>
        {badge === null ? null : (
          <Badge
            aria-label={t(`resources.graph.pod.badge.${badge}`)}
            className={cn(
              "absolute -right-1 -top-1 size-4 p-0 shadow-sm",
              badgeTone !== "critical" && "border-border",
            )}
            data-pod-badge={badge}
            role="img"
            variant={badgeTone === "critical" ? "destructive" : "warning"}
          >
            {badge === "crash-loop" ? <X aria-hidden="true" /> : null}
            {badge === "error" ? <AlertTriangle aria-hidden="true" /> : null}
            {badge === "pending" ? <Pause aria-hidden="true" /> : null}
          </Badge>
        )}
      </TooltipTrigger>
      <PodEvidenceTooltipContent
        align="start"
        id={tooltipId}
        pod={pod}
        side="top"
        slot="physical-topology-pod-tooltip"
      />
    </Tooltip>
  );
}
