import { Pause, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";

import type { PhysicalTopologyPod as PhysicalTopologyPodValue } from "../../features/resources/physicalTopologyContract";
import { useFirstAppearanceMotion } from "../../motion/useFirstAppearanceMotion";
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
  const entering = useFirstAppearanceMotion(`pod:${pod.id}`);
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
    if (!button || !entering) return;
    button.style.animationDelay = `${delay}ms`;
    return () => {
      button.style.removeProperty("animation-delay");
    };
  }, [delay, entering]);
  return (
    <button
      aria-label={t("resources.graph.pod.aria", {
        name: pod.name,
        phase: pod.phase,
        usage: usageLabel,
      })}
      className={cn(
        "relative grid size-9 place-items-center rounded-md border border-border text-[0.625rem] font-semibold shadow-xs transition-[opacity,transform,background-color] duration-(--motion-instant) motion-reduce:transition-none",
        entering && "motion-pod-pop",
        "hover:z-10 hover:scale-125 hover:shadow-md",
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
      style={color === null ? undefined : {
        "--usage-color": color,
        backgroundColor: "color-mix(in oklch, var(--usage-color) 34%, var(--card))",
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
