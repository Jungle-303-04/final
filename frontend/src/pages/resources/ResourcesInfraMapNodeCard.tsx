import { Server } from "lucide-react";
import type { CSSProperties } from "react";

import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
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
  onShowMorePods,
  selectionActive,
}: {
  metricMode: InfraMapMetricMode;
  node: InfraMapNode;
  onShowMorePods: (node: InfraMapNode) => void;
  selectionActive: boolean;
}) {
  const { t } = useI18n();
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
          metricMode={metricMode}
          node={node}
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
  onShowMorePods,
  selectionActive,
}: {
  metricMode: InfraMapMetricMode;
  node: InfraMapNode;
  onShowMorePods: (node: InfraMapNode) => void;
  selectionActive: boolean;
}) {
  const { formatNumber, t } = useI18n();
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
          "overflow-hidden",
        ].join(" ")}
        data-slot="infra-map-pod-scroll"
      >
        {node.visiblePods.map((pod) => (
          <InfraMapPodSlot key={pod.id} metricMode={metricMode} pod={pod} />
        ))}
      </div>
      {node.hiddenPodCount > 0 ? (
        <button
          className="mt-1.5 flex min-h-6 items-center justify-center rounded-sm border bg-background/80 px-2 text-[0.6875rem] font-semibold text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onShowMorePods(node)}
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
  const healthVisualTone = healthTone(pod.health);
  const usageTone = podVisualTone(pod.health, selectedMetric.ratio);
  const style = {
    "--infra-map-pod-fill-width": fillPercent === null ? "0%" : `${fillPercent}%`,
    "--infra-map-pod-usage-color": podUsageColor(selectedMetric.ratio, usageTone),
  } as CSSProperties;
  return (
    <article
      aria-label={`${pod.name} ${pod.phase} ${selectedMetric.label} ${selectedMetric.displayText}`}
      className={cn(
        "relative flex h-10 min-w-0 items-center gap-1.5 overflow-hidden rounded-sm border px-2 shadow-xs transition-colors",
        POD_TONE_CLASS[usageTone],
        pod.selected && "ring-2 ring-primary/45",
      )}
      data-metric={metricMode}
      data-metric-available={fillPercent === null ? "false" : "true"}
      data-selected={pod.selected || undefined}
      data-slot="infra-map-pod"
      data-usage-tone={usageTone}
      style={style}
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
    </article>
  );
}

type PodVisualTone = "critical" | "danger" | "healthy" | "unknown" | "warning";

const POD_TONE_CLASS: Record<PodVisualTone, string> = {
  critical: "border-destructive/60 bg-destructive/10 text-foreground",
  danger: "border-orange-500/55 bg-orange-500/10 text-foreground",
  healthy: "border-emerald-500/35 bg-emerald-500/5 text-foreground",
  unknown: "border-dashed border-border bg-background/80 text-muted-foreground",
  warning: "border-status-warning/55 bg-status-warning/10 text-foreground",
};

const TONE_WEIGHT: Record<PodVisualTone, number> = {
  critical: 4,
  danger: 3,
  warning: 2,
  healthy: 1,
  unknown: 0,
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

function podVisualTone(health: string, ratio: number | null): PodVisualTone {
  const statusTone = healthTone(health);
  if (ratio === null) {
    return statusTone === "healthy" ? "unknown" : statusTone;
  }
  return strongerTone(statusTone, usageTone(ratio));
}

function healthTone(health: string): PodVisualTone {
  const normalized = health.toLowerCase();
  if (
    normalized.includes("critical") ||
    normalized.includes("crash") ||
    normalized.includes("error") ||
    normalized.includes("fail") ||
    normalized.includes("oom") ||
    normalized === "notready"
  ) return "critical";
  if (
    normalized.includes("degraded") ||
    normalized.includes("pending") ||
    normalized.includes("stale") ||
    normalized.includes("warn")
  ) return "warning";
  if (
    normalized === "healthy" ||
    normalized === "ok" ||
    normalized === "ready" ||
    normalized === "running"
  ) return "healthy";
  return "unknown";
}

function usageTone(ratio: number | null): PodVisualTone {
  if (ratio === null) return "unknown";
  if (ratio >= 0.95) return "critical";
  if (ratio >= 0.8) return "danger";
  if (ratio >= 0.6) return "warning";
  return "healthy";
}

function strongerTone(left: PodVisualTone, right: PodVisualTone): PodVisualTone {
  return TONE_WEIGHT[left] >= TONE_WEIGHT[right] ? left : right;
}

function podUsageColor(ratio: number | null, fallbackTone: PodVisualTone): string {
  if (ratio === null) return fallbackColor(fallbackTone);
  const percent = clampPercent(ratio * 100);
  if (percent <= 60) return "var(--color-emerald-500)";
  if (percent <= 80) {
    const warningWeight = (percent - 60) * 5;
    return `color-mix(in oklch, var(--color-emerald-500) ${100 - warningWeight}%, var(--status-warning) ${warningWeight}%)`;
  }
  if (percent <= 95) {
    const dangerWeight = (percent - 80) * (100 / 15);
    return `color-mix(in oklch, var(--status-warning) ${100 - dangerWeight}%, var(--destructive) ${dangerWeight}%)`;
  }
  return "var(--destructive)";
}

function fallbackColor(tone: PodVisualTone): string {
  if (tone === "critical") return "var(--destructive)";
  if (tone === "danger") return "var(--color-orange-500)";
  if (tone === "healthy") return "var(--color-emerald-500)";
  if (tone === "warning") return "var(--status-warning)";
  return "var(--muted-foreground)";
}

function shortPodName(name: string): string {
  const parts = name.split("-");
  if (parts.length <= 2) return name;
  return `${parts.slice(0, 2).join("-")}...`;
}
