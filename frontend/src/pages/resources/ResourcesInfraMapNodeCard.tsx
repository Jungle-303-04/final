import { Server } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import { type InfraMapMetricMode, RatioMetric } from "./ResourcesInfraMapMetrics";
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
  const { formatNumber, t } = useI18n();
  return (
    <section
      className="min-w-0 overflow-hidden rounded-lg border bg-linear-to-b from-muted/20 via-background/70 to-muted/30 p-3 shadow-sm"
      data-metric={metricMode}
      data-slot="infra-map-node"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border bg-background/75">
            <Server aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">
              {node.unassigned
                ? t("resources.infraMap.nodeUnassigned")
                : t("resources.infraMap.nodeLabel", { name: node.name })}
            </h3>
            <p className="text-xs text-muted-foreground">
              {node.unassigned
                ? t("resources.infraMap.nodeUnobserved")
                : nodeStatusText(node.ready, t)}
            </p>
          </div>
        </div>
        <HealthDot tone={node.health} />
      </div>

      <div className="mt-3 rounded-md border border-dashed bg-background/50 p-2">
        <InfraMapPodArea
          metricMode={metricMode}
          node={node}
          selectionActive={selectionActive}
        />
      </div>

      <div className="mt-3 grid gap-2 border-t pt-3">
        <RatioMetric
          label={t("resources.infraMap.metric.cpu")}
          ratio={node.cpuRatio}
          valueText={null}
        />
        <RatioMetric
          label={t("resources.infraMap.metric.memory")}
          ratio={node.memoryRatio}
          valueText={null}
        />
        <RatioMetric
          label={t("resources.infraMap.metric.pods")}
          ratio={node.podCapacity && node.podCapacity > 0
            ? node.assignedPodCount / node.podCapacity
            : null}
          valueText={node.podCapacity === null
            ? formatNumber(node.assignedPodCount)
            : t("resources.infraMap.podCapacityValue", {
                capacity: formatNumber(node.podCapacity),
                count: formatNumber(node.assignedPodCount),
              })}
        />
      </div>
    </section>
  );
}

function InfraMapPodArea({
  metricMode,
  node,
  selectionActive,
}: {
  metricMode: InfraMapMetricMode;
  node: InfraMapNode;
  selectionActive: boolean;
}) {
  const { formatNumber, t } = useI18n();
  if (node.visiblePods.length === 0) {
    return (
      <div className="grid min-h-20 place-items-center px-3 text-center text-xs text-muted-foreground">
        {selectionActive
          ? t("resources.infraMap.noSelectedPods")
          : t("resources.infraMap.noPods")}
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      {node.visiblePods.map((pod) => (
        <InfraMapPodSlot key={pod.id} metricMode={metricMode} pod={pod} />
      ))}
      {node.hiddenPodCount > 0 ? (
        <div className="flex h-8 min-w-0 items-center justify-center rounded-md border bg-background/70 px-3 text-xs font-medium text-muted-foreground">
          {t("resources.infraMap.morePods", {
            count: formatNumber(node.hiddenPodCount),
          })}
        </div>
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
      className="relative flex h-8 min-w-0 items-center gap-2 overflow-hidden rounded-md border bg-background/80 px-2 shadow-sm data-[selected=true]:border-primary data-[selected=true]:bg-primary/10"
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
        <h4 className="truncate text-xs font-semibold">{pod.name}</h4>
      </div>
      <span
        className="relative z-10 shrink-0 text-[11px] tabular-nums text-muted-foreground"
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
    const valueText = pod.cpu.value === null
      ? null
      : t("resources.infraMap.cpuValue", {
          value: formatNumber(pod.cpu.value, { maximumFractionDigits: 1 }),
        });
    return {
      displayText: ratioDisplay(pod.cpu.ratio, valueText, helpers),
      label: t("resources.infraMap.metric.cpu"),
      ratio: pod.cpu.ratio,
    };
  }
  const valueText = pod.memory.value === null
    ? null
    : t("resources.infraMap.memoryValue", {
        value: formatNumber(pod.memory.value, { maximumFractionDigits: 1 }),
      });
  return {
    displayText: ratioDisplay(pod.memory.ratio, valueText, helpers),
    label: t("resources.infraMap.metric.memory"),
    ratio: pod.memory.ratio,
  };
}

function ratioDisplay(
  ratio: number | null,
  valueText: string | null,
  { formatNumber, t }: Pick<ReturnType<typeof useI18n>, "formatNumber" | "t">,
): string {
  if (ratio === null) return valueText ?? t("common.value.unavailable");
  return t("resources.infraMap.percentWithValue", {
    percent: formatNumber(ratio, {
      maximumFractionDigits: 0,
      style: "percent",
    }),
    value: valueText ?? "",
  });
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
