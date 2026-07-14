import { Box, Pause, RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { PhysicalTopologyPod as PhysicalTopologyPodValue } from "../../features/resources/physicalTopologyContract";
import { podWaveDelay } from "../../motion/useStagger";
import { useI18n } from "../../shared/i18n";
import { cn } from "@/shared/lib/cn";
import {
  podAbnormalBadge,
  podUsageLabel,
  podUsageTone,
} from "./physicalTopologyViewModel";

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
  const tone = podUsageTone(pod.usagePercent);
  const badge = podAbnormalBadge(pod);
  const disabled = !pod.matchesFilter;
  const delay = podWaveDelay(nodeIndex, podIndex);
  const buttonRef = useRef<HTMLButtonElement>(null);
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
        usage: podUsageLabel(pod.usagePercent),
      })}
      className={cn(
        "motion-pod-pop relative grid size-9 place-items-center rounded-md border text-[0.625rem] font-semibold shadow-xs transition-[opacity,transform,box-shadow] duration-(--motion-instant) motion-reduce:transition-none",
        "enabled:hover:z-10 enabled:scale-125 enabled:shadow-md",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
        tone === "amber" && "border-amber-500/50 bg-amber-500/30 text-amber-950 dark:text-amber-100",
        tone === "red" && "border-destructive/60 bg-destructive/35 text-destructive-foreground",
        tone === "unknown" && "border-dashed border-border bg-background text-muted-foreground",
        disabled && "cursor-not-allowed opacity-20",
      )}
      data-matches-filter={String(pod.matchesFilter)}
      data-morph-id={`pod:${pod.id}`}
      data-slot="physical-topology-pod"
      data-usage-tone={tone}
      disabled={disabled}
      onClick={() => onOpen(pod)}
      ref={buttonRef}
      title={`${pod.namespace ?? "—"} · ${pod.name} · ${podUsageLabel(pod.usagePercent)}`}
      type="button"
    >
      <Box aria-hidden="true" className="size-3.5" />
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
