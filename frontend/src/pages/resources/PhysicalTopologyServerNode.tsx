import type { NodeProps } from "@xyflow/react";
import { Server } from "lucide-react";
import { useEffect, useRef } from "react";

import { useFirstAppearanceMotion } from "../../motion/useFirstAppearanceMotion";
import { STAGGER_MS, staggerDelay } from "../../motion/useStagger";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { cn } from "@/shared/lib/cn";
import { PhysicalTopologyPod } from "./PhysicalTopologyPod";
import type { PhysicalServerNode } from "./physicalTopologyGraphTypes";
import { usageColor, useSmoothedUsageColor } from "./useSmoothedUsageColor";

export function PhysicalTopologyServerNode({ data }: NodeProps<PhysicalServerNode>) {
  return <PhysicalTopologyServerCard data={data} />;
}

export function PhysicalTopologyServerCard({
  data,
}: {
  data: PhysicalServerNode["data"];
}) {
  const { formatNumber, t } = useI18n();
  const { clusterId, index, onOpenPod, onRevealServer, placement } = data;
  const { server } = placement;
  const serverName = placement.unassigned
    ? t("resources.graph.server.unassigned")
    : server.name;
  const cardRef = useRef<HTMLElement>(null);
  const entering = useFirstAppearanceMotion(`server:${clusterId}:${server.id}`);
  const delay = staggerDelay(index, STAGGER_MS.node);
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !entering) return;
    card.style.animationDelay = `${delay}ms`;
    return () => {
      card.style.removeProperty("animation-delay");
    };
  }, [delay, entering]);
  return (
    <article
      aria-label={t("resources.graph.server.aria", { name: serverName })}
      className={cn(
        "grid h-52 w-full grid-rows-[auto_auto_1fr_auto] overflow-hidden rounded-xl border bg-card/95 shadow-sm backdrop-blur transition-transform duration-(--motion-quick) hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-md motion-reduce:transition-none",
        entering && "motion-node-land",
      )}
      data-morph-id={placement.unassigned ? undefined : `server:${clusterId}:${server.id}`}
      data-server-id={server.id}
      data-slot="physical-topology-server"
      ref={cardRef}
    >
      <header className="flex min-w-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Server aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t("resources.graph.server.label")}
            </p>
            <h3 className="truncate text-xs font-semibold" title={serverName}>{serverName}</h3>
          </div>
        </div>
        <span className="max-w-20 truncate text-[0.625rem] text-muted-foreground" title={server.status}>
          {server.status}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 border-b px-3 py-2">
        <MetricBar label="CPU" value={server.cpuPercent} />
        <MetricBar label={t("resources.graph.metric.memory.short")} value={server.memoryPercent} />
      </div>

      <div className="grid grid-cols-6 content-start gap-1.5 px-3 py-2" data-slot="physical-topology-pods">
        {placement.pods.map((pod, podIndex) => (
          <PhysicalTopologyPod
            key={pod.id}
            nodeIndex={index}
            onOpen={onOpenPod}
            pod={pod}
            podIndex={podIndex}
          />
        ))}
      </div>

      <footer className="flex min-h-8 items-center justify-between gap-2 border-t bg-muted/20 px-3 py-1.5 text-[0.6875rem] text-muted-foreground">
        <ServerPodCount placement={placement} />
        {placement.omittedCount > 0 ? (
          <Button
            className="h-6 px-1.5 text-[0.6875rem]"
            onClick={() => onRevealServer(server.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("resources.graph.server.more", {
              count: formatNumber(placement.omittedCount),
            })}
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

function MetricBar({ label, value }: { label: string; value: number | null }) {
  const rounded = value === null ? null : Math.round(value);
  const metricRef = useRef<HTMLDivElement>(null);
  const smoothedUsage = useSmoothedUsageColor(value, metricRef);
  const displayedBarValue = value ?? smoothedUsage;
  return (
    <div
      className="grid min-w-0 gap-1"
      data-metric={label.toLowerCase()}
      data-usage-value={smoothedUsage === null ? "unknown" : smoothedUsage.toFixed(3)}
      ref={metricRef}
    >
      <span className="flex items-center justify-between gap-1 text-[0.625rem] text-muted-foreground">
        <span>{label}</span>
        <span>{rounded === null ? "—" : `${rounded}%`}</span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
        {displayedBarValue === null || smoothedUsage === null ? null : (
          <span
            aria-label={`${label} ${rounded === null ? "—" : `${rounded}%`}`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={rounded === null ? undefined : Math.min(rounded, 100)}
            className="block h-full rounded-full"
            role="progressbar"
            style={{
              backgroundColor: usageColor(smoothedUsage),
              width: `${Math.min(Math.max(displayedBarValue, 0), 100)}%`,
            }}
          />
        )}
      </span>
    </div>
  );
}

function ServerPodCount({ placement }: { placement: PhysicalServerNode["data"]["placement"] }) {
  const { formatNumber, t } = useI18n();
  if (
    placement.matchedCount === null ||
    placement.totalCount === null ||
    placement.countCompleteness === "unavailable"
  ) {
    return <span>{t("resources.graph.server.countUnavailable")}</span>;
  }
  return (
    <span className={cn(placement.countCompleteness === "partial" && "after:content-['+']")}>
      {t("resources.graph.server.count", {
        matched: formatNumber(placement.matchedCount),
        total: formatNumber(placement.totalCount),
      })}
    </span>
  );
}
