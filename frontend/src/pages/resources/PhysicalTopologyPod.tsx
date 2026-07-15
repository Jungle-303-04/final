import { Pause, RotateCcw, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

import type { PhysicalTopologyPod as PhysicalTopologyPodValue } from "../../features/resources/physicalTopologyContract";
import { useFirstAppearanceMotion } from "../../motion/useFirstAppearanceMotion";
import { podWaveDelay } from "../../motion/useStagger";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../shared/ui/primitives/tooltip";
import {
  podAbnormalBadge,
  podShortLabel,
  podUsageLabel,
  podUsageTone,
} from "./physicalTopologyViewModel";
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
  const { formatNumber, t } = useI18n();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const smoothedUsage = useSmoothedUsageColor(pod.usagePercent, buttonRef);
  const tone = podUsageTone(smoothedUsage);
  const badge = podAbnormalBadge(pod);
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
            className="absolute -right-1 -top-1 size-4 p-0 shadow-sm"
            data-pod-badge={badge}
            role="img"
            variant="destructive"
          >
            {badge === "crash-loop" ? <X aria-hidden="true" /> : null}
            {badge === "pending" ? <Pause aria-hidden="true" /> : null}
            {badge === "restarting" ? <RotateCcw aria-hidden="true" /> : null}
          </Badge>
        )}
      </TooltipTrigger>
      <TooltipContent
        align="start"
        className="w-72 max-w-[calc(100vw-1rem)] overflow-hidden p-0"
        data-slot="physical-topology-pod-tooltip"
        id={tooltipId}
        role="tooltip"
        side="top"
      >
        <div className="border-b border-background/15 px-3 py-2.5">
          <p className="break-all text-xs font-semibold leading-snug">{pod.name}</p>
          <p className="mt-0.5 text-[0.6875rem] text-background/70">
            {[pod.namespace, pod.phase].filter(Boolean).join(" · ")}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
          {pod.usagePercent === null ? null : (
            <EvidenceRow
              label={t("resources.graph.pod.evidence.usage")}
              value={usageLabel}
            />
          )}
          <MetricEvidenceRow
            actual={pod.cpuMillicores}
            label={t("resources.graph.pod.evidence.cpu")}
            request={pod.cpuRequestMillicores}
            unit="m"
          />
          <MetricEvidenceRow
            actual={pod.memoryMebibytes}
            label={t("resources.graph.pod.evidence.memory")}
            request={pod.memoryRequestMebibytes}
            unit=" MiB"
          />
          <EvidenceRow
            label={t("resources.graph.pod.evidence.restarts")}
            value={formatNumber(pod.restartCount)}
          />
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

function MetricEvidenceRow({
  actual,
  label,
  request,
  unit,
}: {
  actual: number | null;
  label: string;
  request: number | null;
  unit: string;
}) {
  const { formatNumber, t } = useI18n();
  if (actual === null && request === null) return null;
  const numberOptions: Intl.NumberFormatOptions = { maximumFractionDigits: 3 };
  return (
    <EvidenceRow
      label={label}
      value={(
        <span className="flex min-w-0 justify-end gap-x-1 whitespace-nowrap">
          {actual === null ? null : (
            <span>{formatNumber(actual, numberOptions)}{unit}</span>
          )}
          {request === null ? null : (
            <span className="text-background/65">
              {t("resources.graph.pod.evidence.request", {
                value: `${formatNumber(request, numberOptions)}${unit}`,
              })}
            </span>
          )}
        </span>
      )}
    />
  );
}

function EvidenceRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <>
      <dt className="text-background/65">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{value}</dd>
    </>
  );
}
