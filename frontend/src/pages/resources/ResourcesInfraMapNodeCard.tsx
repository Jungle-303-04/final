import { AlertTriangle, Box, RotateCcw, Server } from "lucide-react";
import { useId, type CSSProperties } from "react";

import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import {
  Tooltip,
  TooltipTrigger,
} from "../../shared/ui/primitives/tooltip";
import { PodEvidenceTooltipContent } from "./PodEvidenceTooltipContent";
import {
  CountMetric,
  type InfraMapMetricMode,
  RatioMetric,
} from "./ResourcesInfraMapMetrics";
import {
  INFRA_MAP_DEFAULT_VISIBLE_PODS_PER_NODE,
  type InfraMapNode,
  type InfraMapPod,
} from "./resourcesInfraMapModel";
import {
  orderInfraMapPodsForMetric,
} from "./resourcesInfraMapPodOrdering";
import {
  PERCENT_SCALE,
  podAbnormalBadge,
  podAbnormalBadgeTone,
  podHealthTone,
  podResourcePressureTone,
  podUsageColorFromRatio,
  type PodAbnormalBadge,
  type PodHealthTone,
  type PodResourcePressureTone,
} from "./podVisualState";

const POD_DISTRIBUTION_VISIBLE_LIMIT = 19;

export function InfraMapNodeCard({
  metricMode,
  node,
  onOpenPod,
  onShowMorePods,
  selectionActive,
}: {
  metricMode: InfraMapMetricMode;
  node: InfraMapNode;
  onOpenPod: (pod: InfraMapPod) => void;
  onShowMorePods: (node: InfraMapNode) => void;
  selectionActive: boolean;
}) {
  const { t } = useI18n();
  return (
    <section
      className="grid min-h-96 min-w-0 grid-rows-[auto_auto_auto] overflow-hidden rounded-lg border bg-linear-to-b from-muted/35 via-background/90 to-muted/25 shadow-sm"
      data-metric={metricMode}
      data-slot="infra-map-node"
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-background/75 shadow-xs">
          <Server aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t("resources.infraMap.nodeKind")}
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

      <div className="p-3">
        <InfraMapPodArea
          metricMode={metricMode}
          node={node}
          onOpenPod={onOpenPod}
          onShowMorePods={onShowMorePods}
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
  metricMode,
  node,
  onOpenPod,
  onShowMorePods,
  selectionActive,
}: {
  metricMode: InfraMapMetricMode;
  node: InfraMapNode;
  onOpenPod: (pod: InfraMapPod) => void;
  onShowMorePods: (node: InfraMapNode) => void;
  selectionActive: boolean;
}) {
  const { formatNumber, t } = useI18n();
  const knownPods = [...node.visiblePods, ...node.hiddenPods];
  const orderedPods = orderInfraMapPodsForMetric(knownPods, metricMode);
  const representativePods = orderedPods.slice(0, INFRA_MAP_DEFAULT_VISIBLE_PODS_PER_NODE);
  const unobservedPodCount = Math.max(0, node.hiddenPodCount - node.hiddenPods.length);
  const additionalPodCount = Math.max(
    0,
    orderedPods.length - representativePods.length,
  ) + unobservedPodCount;
  if (orderedPods.length === 0) {
    return (
      <div className="grid h-full min-h-24 place-items-center rounded-md border border-dashed bg-muted/10 px-3 text-center text-xs text-muted-foreground">
        {selectionActive
          ? t("resources.infraMap.noSelectedPods")
          : t("resources.infraMap.noPods")}
      </div>
    );
  }
  return (
    <div className="grid min-h-48 gap-2 rounded-md border border-dashed bg-muted/10 p-2 shadow-inner">
      <div className="flex items-center justify-between gap-2 px-0.5 pb-1 text-[0.625rem] font-medium text-muted-foreground">
        <span>{t("resources.infraMap.representativePods")}</span>
        <span>{t("resources.infraMap.podDistributionCount", { count: formatNumber(node.assignedPodCount) })}</span>
      </div>
      <div className="grid gap-2">
        <div
          className="grid grid-cols-1 content-start gap-1.5 sm:grid-cols-2"
          data-slot="infra-map-representative-pods"
        >
          {representativePods.map((pod) => (
            <InfraMapPodSlot
              key={pod.id}
              metricMode={metricMode}
              onOpenPod={onOpenPod}
              pod={pod}
            />
          ))}
        </div>
        <InfraMapPodDistribution
          metricMode={metricMode}
          node={node}
          onOpenPod={onOpenPod}
          pods={orderedPods}
        />
      </div>
      {additionalPodCount > 0 ? (
        <button
          className="mt-1.5 flex min-h-6 items-center justify-center rounded-sm border bg-background/80 px-2 text-[0.6875rem] font-semibold text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onShowMorePods(node)}
          type="button"
        >
          {t("resources.infraMap.morePods", {
            count: formatNumber(additionalPodCount),
          })}
        </button>
      ) : null}
    </div>
  );
}

function InfraMapPodDistribution({
  metricMode,
  node,
  onOpenPod,
  pods,
}: {
  metricMode: InfraMapMetricMode;
  node: InfraMapNode;
  onOpenPod: (pod: InfraMapPod) => void;
  pods: readonly InfraMapPod[];
}) {
  const { formatNumber, t } = useI18n();
  const unobservedPodCount = Math.max(0, node.hiddenPodCount - node.hiddenPods.length);
  const visiblePods = pods.slice(0, POD_DISTRIBUTION_VISIBLE_LIMIT);
  const clippedPodCount = Math.max(0, pods.length - visiblePods.length);
  const remainingPodCount = clippedPodCount + unobservedPodCount;
  return (
    <div
      aria-label={t("resources.infraMap.podDistribution")}
      className="grid gap-1 rounded-sm border bg-background/45 px-2 py-1.5"
      data-slot="infra-map-pod-distribution"
    >
      <div className="flex min-w-0 items-center gap-2 text-[0.625rem] text-muted-foreground">
        <span>{t("resources.infraMap.podDistribution")}</span>
      </div>
      <div className="flex min-w-0 flex-wrap content-start gap-1.5">
        {visiblePods.map((pod) => (
          <InfraMapPodCube
            key={pod.id}
            metricMode={metricMode}
            onOpenPod={onOpenPod}
            pod={pod}
          />
        ))}
        {remainingPodCount > 0 ? (
          <span
            className="inline-flex h-4 min-w-5 items-center justify-center rounded-sm border border-dashed bg-background px-1 text-[0.5625rem] font-medium text-muted-foreground"
            title={t("resources.infraMap.podDistributionMore", { count: formatNumber(remainingPodCount) })}
          >
            +{formatNumber(remainingPodCount)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function InfraMapPodCube({
  metricMode,
  onOpenPod,
  pod,
}: {
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
  pod: InfraMapPod;
}) {
  const { formatNumber, t } = useI18n();
  const tooltipId = useId();
  const selectedMetric = podMetricForMode(pod, metricMode, { formatNumber, t });
  const pressureTone = podResourcePressureTone(selectedMetric.ratio);
  const healthVisualTone = podHealthTone(pod);
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <button
            aria-describedby={tooltipId}
            aria-label={`${pod.name} ${pod.phase} ${selectedMetric.label} ${selectedMetric.displayText}`}
            className={cn(
              "inline-grid size-4 shrink-0 place-items-center rounded-sm border outline-none transition-[background-color,border-color,box-shadow,transform]",
              "hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0",
              POD_CUBE_PRESSURE_CLASS[pressureTone],
              POD_CUBE_HEALTH_BORDER_CLASS[healthVisualTone],
              pod.selected && "ring-1 ring-primary/50",
            )}
            data-health-tone={healthVisualTone}
            data-metric={metricMode}
            data-slot="infra-map-pod-cube"
            data-usage-tone={pressureTone}
            onClick={() => onOpenPod(pod)}
            type="button"
          />
        )}
      >
        <Box aria-hidden="true" className="size-3" />
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
        slot="infra-map-pod-tooltip"
        usageText={selectedMetric.ratio === null ? null : selectedMetric.displayText}
      />
    </Tooltip>
  );
}

function InfraMapPodSlot({
  metricMode,
  onOpenPod,
  pod,
}: {
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
  pod: InfraMapPod;
}) {
  const { formatNumber, t } = useI18n();
  const tooltipId = useId();
  const selectedMetric = podMetricForMode(pod, metricMode, { formatNumber, t });
  const fillPercent = selectedMetric.ratio === null
    ? null
    : clampPercent(selectedMetric.ratio * PERCENT_SCALE);
  const pressureTone = podResourcePressureTone(selectedMetric.ratio);
  const healthVisualTone = podHealthTone(pod);
  const abnormalBadge = podAbnormalBadge(pod);
  const style = {
    "--infra-map-pod-fill-width": fillPercent === null ? "0%" : `${fillPercent}%`,
    "--infra-map-pod-usage-color": podUsageColorFromRatio(selectedMetric.ratio),
  } as CSSProperties;
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <button
            aria-describedby={tooltipId}
            aria-label={`${pod.name} ${pod.phase} ${selectedMetric.label} ${selectedMetric.displayText}`}
            className={cn(
              "relative flex h-10 min-w-0 items-center gap-1.5 overflow-hidden rounded-sm border px-2 text-left shadow-xs outline-none transition-[background-color,border-color,box-shadow,transform]",
              "hover:-translate-y-0.5 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0",
              POD_PRESSURE_CLASS[pressureTone],
              POD_HEALTH_BORDER_CLASS[healthVisualTone],
              pod.selected && "ring-2 ring-primary/45",
            )}
            data-health-tone={healthVisualTone}
            data-metric={metricMode}
            data-metric-available={fillPercent === null ? "false" : "true"}
            data-selected={pod.selected || undefined}
            data-slot="infra-map-pod"
            data-usage-tone={pressureTone}
            onClick={() => onOpenPod(pod)}
            style={style}
            type="button"
          />
        )}
      >
        {fillPercent === null ? null : (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-[var(--infra-map-pod-fill-width)] bg-[var(--infra-map-pod-usage-color)] opacity-20 transition-[width,background-color]"
            data-slot="infra-map-pod-fill"
          />
        )}
        {fillPercent === null ? null : (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-[var(--infra-map-pod-fill-width)] bg-[var(--infra-map-pod-usage-color)] transition-[width,background-color]"
            data-slot="infra-map-pod-risk-bar"
          />
        )}
        <HealthDot tone={healthVisualTone} />
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
        <PodStatusBadge badge={abnormalBadge} />
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
        slot="infra-map-pod-tooltip"
        usageText={selectedMetric.ratio === null ? null : selectedMetric.displayText}
      />
    </Tooltip>
  );
}

const POD_PRESSURE_CLASS: Record<PodResourcePressureTone, string> = {
  danger: "border-border bg-orange-500/10 text-foreground",
  healthy: "border-border bg-emerald-500/5 text-foreground",
  unknown: "border-dashed border-border bg-background/80 text-muted-foreground",
  warning: "border-border bg-status-warning/10 text-foreground",
};

const POD_HEALTH_BORDER_CLASS: Record<PodHealthTone, string> = {
  critical: "border-destructive/70 ring-1 ring-destructive/25",
  healthy: "border-border",
  unknown: "border-border",
  warning: "border-border",
};

const POD_CUBE_PRESSURE_CLASS: Record<PodResourcePressureTone, string> = {
  danger: "border-border bg-orange-500/15 text-foreground",
  healthy: "border-border bg-emerald-500/12 text-foreground",
  unknown: "border-dashed border-border bg-background text-muted-foreground",
  warning: "border-border bg-status-warning/15 text-foreground",
};

const POD_CUBE_HEALTH_BORDER_CLASS: Record<PodHealthTone, string> = {
  critical: "border-destructive/75 ring-1 ring-destructive/30",
  healthy: "border-border",
  unknown: "border-border",
  warning: "border-border",
};

function HealthDot({ tone }: { tone: string }) {
  const className = {
    critical: "bg-destructive",
    danger: "bg-orange-500",
    healthy: "bg-emerald-500",
    stale: "bg-muted-foreground",
    unknown: "bg-muted-foreground",
    warning: "bg-status-warning",
  }[tone] ?? "bg-muted-foreground";
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${className}`} />;
}

function PodStatusBadge({ badge }: { badge: PodAbnormalBadge }) {
  if (badge === null) return null;
  const tone = podAbnormalBadgeTone(badge);
  const className = tone === "critical"
    ? "border-destructive/45 bg-background text-destructive"
    : "border-border bg-background text-status-warning";
  return (
    <span
      aria-hidden="true"
      className={`relative z-10 grid size-4 shrink-0 place-items-center rounded-full border shadow-xs ${className}`}
      data-pod-badge={badge}
    >
      {badge === "restarting" ? (
        <RotateCcw aria-hidden="true" className="size-2.5" />
      ) : (
        <AlertTriangle aria-hidden="true" className="size-2.5" />
      )}
    </span>
  );
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
  const { t } = helpers;
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
  return formatNumber(ratio, {
    maximumFractionDigits: 1,
    style: "percent",
  });
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
