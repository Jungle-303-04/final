import type { ResourceHealthTone } from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { RatioMetric, PodMetric } from "./ResourcesInfraMapMetrics";
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
    <section className="min-w-0 rounded-lg border bg-background/65 p-3" data-slot="infra-map-node">
      <div className="min-h-32 rounded-lg border border-dashed bg-muted/20 p-2">
        <InfraMapPodArea node={node} selectionActive={selectionActive} />
      </div>

      <div className="mt-3 border-t pt-3">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
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
          <HealthDot tone={node.health} />
        </div>
        <div className="grid gap-2">
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
      <div className="grid min-h-24 place-items-center px-3 text-center text-xs text-muted-foreground">
        {selectionActive
          ? t("resources.infraMap.noSelectedPods")
          : t("resources.infraMap.noPods")}
      </div>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {node.visiblePods.map((pod) => <InfraMapPodCard key={pod.id} pod={pod} />)}
      {node.hiddenPodCount > 0 ? (
        <div className="grid min-h-24 place-items-center rounded-lg border bg-background/70 px-3 text-center text-xs font-medium text-muted-foreground">
          {t("resources.infraMap.morePods", {
            count: formatNumber(node.hiddenPodCount),
          })}
        </div>
      ) : null}
    </div>
  );
}

function InfraMapPodCard({ pod }: { pod: InfraMapPod }) {
  const { t } = useI18n();
  return (
    <article
      className="min-w-0 rounded-lg border bg-background/85 p-2 shadow-sm"
      data-selected={pod.selected || undefined}
      data-slot="infra-map-pod"
    >
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-xs font-semibold" title={pod.name}>{pod.name}</h4>
          <p className="truncate text-[11px] text-muted-foreground">
            {t("resources.infraMap.podSubtitle", {
              namespace: pod.namespace ?? t("resources.detail.clusterScope"),
              status: pod.status,
            })}
          </p>
        </div>
        <HealthDot tone={pod.health} />
      </div>
      <div className="grid gap-1.5">
        <PodMetric label={t("resources.infraMap.metric.cpu")} metric={pod.cpu} unit="m" />
        <PodMetric
          label={t("resources.infraMap.metric.memory")}
          metric={pod.memory}
          unit="MiB"
        />
      </div>
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
