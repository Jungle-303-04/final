import { Server } from "lucide-react";
import type { ResourceHealthTone } from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { RatioMetric } from "./ResourcesInfraMapMetrics";
import type { InfraMapNode, InfraMapPod } from "./resourcesInfraMapModel";

export function InfraMapNodeCard({
  node,
  selectionActive,
}: {
  node: InfraMapNode;
  selectionActive: boolean;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <section
      className="min-w-0 overflow-hidden rounded-lg border bg-linear-to-b from-muted/20 via-background/70 to-muted/30 p-3 shadow-sm"
      data-slot="infra-map-node"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border bg-background/75">
            <Server aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">
              {t("resources.infraMap.nodeLabel", { name: node.name })}
            </h3>
            <p className="text-xs text-muted-foreground">
              {node.observed
                ? nodeStatusText(node.ready, t)
                : t("resources.infraMap.nodeUnobserved")}
            </p>
          </div>
        </div>
        <HealthDot tone={node.health} />
      </div>

      <div className="mt-3 rounded-md border border-dashed bg-background/50 p-2">
        <InfraMapPodArea node={node} selectionActive={selectionActive} />
      </div>

      <div className="mt-3 grid gap-2 border-t pt-3">
        <RatioMetric
          label={t("resources.infraMap.metric.cpu")}
          valueText={node.cpuMillicores === null
            ? null
            : t("resources.infraMap.cpuValue", {
                value: formatNumber(node.cpuMillicores, { maximumFractionDigits: 1 }),
              })}
          ratio={node.cpuRatio}
        />
        <RatioMetric
          label={t("resources.infraMap.metric.memory")}
          valueText={node.memoryMebibytes === null
            ? null
            : t("resources.infraMap.memoryValue", {
                value: formatNumber(node.memoryMebibytes, { maximumFractionDigits: 1 }),
              })}
          ratio={node.memoryRatio}
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
  node,
  selectionActive,
}: {
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
      {node.visiblePods.map((pod) => <InfraMapPodSlot key={pod.id} pod={pod} />)}
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

function InfraMapPodSlot({ pod }: { pod: InfraMapPod }) {
  return (
    <article
      aria-label={`${pod.name} ${pod.status}`}
      className="flex h-8 min-w-0 items-center gap-2 rounded-md border bg-background/80 px-2 shadow-sm data-[selected=true]:border-primary data-[selected=true]:bg-primary/10"
      data-selected={pod.selected || undefined}
      data-slot="infra-map-pod"
    >
      <HealthDot tone={pod.health} />
      <div className="min-w-0 flex-1" title={pod.name}>
        <h4 className="truncate text-xs font-semibold">
          {pod.name}
        </h4>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground">{pod.status}</span>
    </article>
  );
}

function HealthDot({ tone }: { tone: ResourceHealthTone }) {
  const className = {
    critical: "bg-destructive",
    healthy: "bg-emerald-500",
    stale: "bg-muted-foreground",
    unknown: "bg-muted-foreground",
    warning: "bg-amber-500",
  }[tone];
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
