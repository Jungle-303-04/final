import { useState } from "react";
import { Server } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import {
  CountMetric,
  type InfraMapMetricMode,
  RatioMetric,
  ratioSplitText,
} from "./ResourcesInfraMapMetrics";
import type { InfraMapNode, InfraMapPod } from "./resourcesInfraMapModel";

export function InfraMapNodeCard({
  metricMode,
  node,
  selectionActive,
}: {
  metricMode: InfraMapMetricMode;
  node: InfraMapNode;
  selectionActive: boolean;
}) {
  const { t } = useI18n();
  const [podsExpanded, setPodsExpanded] = useState(false);
  return (
    <section
      className="grid h-72 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border bg-linear-to-b from-muted/35 via-background/90 to-muted/25 shadow-sm"
      data-metric={metricMode}
      data-slot="infra-map-node"
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-background/75 shadow-xs">
          <Server aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Node
          </p>
          <h3 className="truncate text-sm font-semibold leading-tight" title={node.name}>
            {node.unassigned
              ? t("resources.infraMap.nodeUnassigned")
              : node.name}
          </h3>
          <p className="text-[0.6875rem] leading-tight text-muted-foreground">
            {node.unassigned
              ? t("resources.infraMap.nodeUnobserved")
              : nodeStatusText(node.ready, t)}
          </p>
        </div>
        <HealthDot tone={node.health} />
      </div>

      <div className="min-h-0 p-3">
        <InfraMapPodArea
          expanded={podsExpanded}
          metricMode={metricMode}
          node={node}
          onExpandedChange={setPodsExpanded}
          selectionActive={selectionActive}
        />
      </div>

      <div className="grid gap-1.5 border-t bg-muted/15 px-3 py-2">
        <RatioMetric
          label={t("resources.infraMap.metric.cpu")}
          ratio={node.cpuRatio}
        />
        <RatioMetric
          label={t("resources.infraMap.metric.memory")}
          ratio={node.memoryRatio}
        />
        <CountMetric
          label={t("resources.infraMap.metric.pods")}
          total={node.podCapacity}
          value={node.assignedPodCount}
        />
      </div>
    </section>
  );
}

function InfraMapPodArea({
  expanded,
  metricMode,
  node,
  onExpandedChange,
  selectionActive,
}: {
  expanded: boolean;
  metricMode: InfraMapMetricMode;
  node: InfraMapNode;
  onExpandedChange: (expanded: boolean) => void;
  selectionActive: boolean;
}) {
  const { formatNumber, t } = useI18n();
  const pods = expanded
    ? [...node.visiblePods, ...node.hiddenPods]
    : node.visiblePods;
  if (node.visiblePods.length === 0) {
    return (
      <div className="grid h-full min-h-24 place-items-center rounded-md border border-dashed bg-muted/10 px-3 text-center text-xs text-muted-foreground">
        {selectionActive
          ? t("resources.infraMap.noSelectedPods")
          : t("resources.infraMap.noPods")}
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-24 grid-rows-[minmax(0,1fr)_auto] rounded-md border border-dashed bg-muted/10 p-2 shadow-inner">
      <div
        className={[
          "grid min-h-0 grid-cols-2 content-start gap-1.5 pr-1",
          expanded ? "overflow-y-auto" : "overflow-hidden",
        ].join(" ")}
        data-expanded={expanded || undefined}
        data-slot="infra-map-pod-scroll"
      >
        {pods.map((pod) => (
          <InfraMapPodSlot key={pod.id} metricMode={metricMode} pod={pod} />
        ))}
      </div>
      {node.hiddenPodCount > 0 ? (
        <button
          aria-expanded={expanded}
          className="mt-1.5 flex min-h-6 items-center justify-center rounded-sm border bg-background/75 px-2 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[expanded=true]:bg-muted data-[expanded=true]:text-foreground"
          data-expanded={expanded || undefined}
          onClick={() => onExpandedChange(!expanded)}
          type="button"
        >
          {t("resources.infraMap.morePods", {
            count: formatNumber(node.hiddenPodCount),
          })}
        </button>
      ) : null}
    </div>
  );
}

function InfraMapPodSlot({
  metricMode,
  pod,
}: {
  metricMode: InfraMapMetricMode;
  pod: InfraMapPod;
}) {
  const { formatNumber, t } = useI18n();
  const selectedMetric = podMetricForMode(pod, metricMode, { formatNumber, t });
  const fillPercent = selectedMetric.ratio === null
    ? null
    : clampPercent(selectedMetric.ratio * 100);
  return (
    <article
      aria-label={`${pod.name} ${pod.phase} ${selectedMetric.label} ${selectedMetric.displayText}`}
      className="relative flex h-10 min-w-0 items-center gap-1.5 overflow-hidden rounded-sm border bg-background/80 px-2 shadow-xs data-[selected=true]:border-primary data-[selected=true]:bg-primary/10"
      data-metric={metricMode}
      data-metric-available={fillPercent === null ? "false" : "true"}
      data-selected={pod.selected || undefined}
      data-slot="infra-map-pod"
    >
      {fillPercent === null ? null : (
        <progress
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent [&::-moz-progress-bar]:bg-primary/15 [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-primary/15"
          data-slot="infra-map-pod-fill"
          max={100}
          value={fillPercent}
        />
      )}
      <HealthDot tone={pod.health} />
      <div className="relative z-10 min-w-0 flex-1" title={pod.name}>
        <h4 className="truncate text-[0.6875rem] font-semibold leading-none">
          {shortPodName(pod.name)}
        </h4>
      </div>
      <span
        className="relative z-10 hidden shrink-0 text-[0.625rem] tabular-nums text-muted-foreground sm:inline"
        title={`${selectedMetric.label} ${selectedMetric.displayText}`}
      >
        {selectedMetric.displayText}
      </span>
    </article>
  );
}

function HealthDot({ tone }: { tone: string }) {
  const className = {
    critical: "bg-destructive",
    healthy: "bg-emerald-500",
    stale: "bg-muted-foreground",
    unknown: "bg-muted-foreground",
    warning: "bg-amber-500",
  }[tone] ?? "bg-muted-foreground";
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${className}`} />;
}

function nodeStatusText(
  ready: boolean | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (ready === true) return t("resources.infraMap.nodeReady");
  if (ready === false) return t("resources.infraMap.nodeNotReady");
  return t("common.state.unknown");
}

function podMetricForMode(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
  helpers: Pick<ReturnType<typeof useI18n>, "formatNumber" | "t">,
): {
  displayText: string;
  label: string;
  ratio: number | null;
} {
  const { formatNumber, t } = helpers;
  if (metricMode === "cpu") {
    return {
      displayText: ratioDisplay(pod.cpu.ratio, helpers),
      label: t("resources.infraMap.metric.cpu"),
      ratio: pod.cpu.ratio,
    };
  }
  return {
    displayText: ratioDisplay(pod.memory.ratio, helpers),
    label: t("resources.infraMap.metric.memory"),
    ratio: pod.memory.ratio,
  };
}

function ratioDisplay(
  ratio: number | null,
  { formatNumber, t }: Pick<ReturnType<typeof useI18n>, "formatNumber" | "t">,
): string {
  if (ratio === null) return t("common.value.unavailable");
  return ratioSplitText(ratio, formatNumber);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function shortPodName(name: string): string {
  const parts = name.split("-");
  if (parts.length <= 2) return name;
  return `${parts.slice(0, 2).join("-")}...`;
}
