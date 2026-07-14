import { Pause, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";

import type { PhysicalTopologyPod as PhysicalTopologyPodValue } from "../../features/resources/physicalTopologyContract";
import { podWaveDelay } from "../../motion/useStagger";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import {
  podAbnormalBadge,
  podUsageEvidence,
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
  const { t } = useI18n();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const smoothedUsage = useSmoothedUsageColor(pod.usagePercent, buttonRef);
  const tone = podUsageTone(smoothedUsage);
  const badge = podAbnormalBadge(pod);
  const disabled = !pod.matchesFilter;
  const delay = podWaveDelay(nodeIndex, podIndex);
  const color = smoothedUsage === null ? null : usageColor(smoothedUsage);
  const usageLabel = podUsageLabel(pod.usagePercent);
  const evidence = podUsageEvidence(pod);
  const usageDescription = evidence === null
    ? usageLabel
    : evidence.kind === "cpu"
      ? t("resources.graph.pod.request.cpu", {
          actual: formatMetric(evidence.actual / 1_000),
          request: formatMetric(evidence.request / 1_000),
          usage: usageLabel,
        })
      : t("resources.graph.pod.request.memory", {
          actual: formatMetric(evidence.actual),
          request: formatMetric(evidence.request),
          usage: usageLabel,
        });
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    button.style.animationDelay = `${delay}ms`;
    return () => {
      button.style.removeProperty("animation-delay");
    };
  }, [delay]);
  return (
    <button
      aria-label={t("resources.graph.pod.aria", {
        name: pod.name,
        phase: pod.phase,
        usage: usageLabel,
      })}
      className={cn(
        "motion-pod-pop relative grid size-9 place-items-center rounded-md border text-[0.625rem] font-semibold shadow-xs transition-[opacity,transform,box-shadow] duration-(--motion-instant) motion-reduce:transition-none",
        "enabled:hover:z-10 enabled:hover:scale-125 enabled:hover:shadow-md",
        tone !== "unknown" && "text-foreground",
        tone === "unknown" && "border-dashed border-border bg-background text-muted-foreground",
        disabled && "cursor-not-allowed opacity-20",
      )}
      data-matches-filter={String(pod.matchesFilter)}
      data-morph-id={`pod:${pod.id}`}
      data-slot="physical-topology-pod"
      data-usage-tone={tone}
      data-usage-value={smoothedUsage === null ? "unknown" : smoothedUsage.toFixed(3)}
      disabled={disabled}
      onClick={() => onOpen(pod)}
      ref={buttonRef}
      style={color === null ? undefined : {
        "--usage-color": color,
        backgroundColor: "color-mix(in oklch, var(--usage-color) 34%, var(--card))",
        borderColor: "color-mix(in oklch, var(--usage-color) 62%, var(--border))",
      } as CSSProperties}
      title={`${pod.namespace ?? "—"} · ${pod.name} · ${usageDescription}`}
      type="button"
    >
      {badge === null ? null : (
        <span
          aria-label={t(`resources.graph.pod.badge.${badge}`)}
          className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border bg-background text-destructive shadow-sm [&_svg]:size-2.5"
          data-pod-badge={badge}
          role="img"
        >
          {badge === "crash-loop" ? <X aria-hidden="true" /> : null}
          {badge === "pending" ? <Pause aria-hidden="true" /> : null}
          {badge === "restarting" ? <RotateCcw aria-hidden="true" /> : null}
        </span>
      )}
    </button>
  );
}

function formatMetric(value: number): string {
  return Number(value.toFixed(3)).toString();
}
