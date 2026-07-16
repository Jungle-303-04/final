import { ShipWheel } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import type { InfraMapTopologyCluster } from "./resourcesInfraMapTopologyModel";

export function TopologyClusterOverview({
  clusters,
  onSelect,
}: {
  clusters: readonly InfraMapTopologyCluster[];
  onSelect: (clusterId: string) => void;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <div
      className="mt-4 grid min-h-52 gap-3 rounded-lg border border-dashed bg-background/45 p-4"
      data-slot="infra-map-topology-overview"
    >
      <div>
        <h3 className="text-sm font-semibold">
          {t("resources.infraMap.topology.overview.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("resources.infraMap.topology.overview.description")}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        {clusters.map((cluster) => (
          <button
            aria-label={t("resources.infraMap.topology.cluster.aria", {
              name: cluster.name,
            })}
            className="grid min-w-0 gap-2 rounded-lg border bg-background/70 p-3 text-left outline-none transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            key={cluster.id}
            onClick={() => onSelect(cluster.id)}
            title={clusterTooltip(cluster, { formatNumber, t })}
            type="button"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-md border bg-muted/35">
                <ShipWheel aria-hidden="true" className="size-5 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{cluster.name}</p>
                <p className="text-[0.6875rem] text-muted-foreground">
                  {cluster.provider ?? t("common.state.unknown")}
                </p>
              </div>
              <TopologyHealthDot tone={cluster.health} />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {clusterSummary(cluster, { formatNumber, t })}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

type TopologyI18n = Pick<ReturnType<typeof useI18n>, "formatNumber" | "t">;

function clusterSummary(cluster: InfraMapTopologyCluster, helpers: TopologyI18n): string {
  const { formatNumber, t } = helpers;
  return t("resources.infraMap.topology.clusterSummary", {
    errors: formatNumber(cluster.criticalCount),
    nodes: formatNumber(cluster.nodeCount),
    pods: formatNumber(cluster.podCount),
    warnings: formatNumber(cluster.warningCount),
  });
}

function clusterTooltip(cluster: InfraMapTopologyCluster, helpers: TopologyI18n): string {
  const { t } = helpers;
  return [
    cluster.name,
    cluster.provider ?? t("common.state.unknown"),
    clusterSummary(cluster, helpers),
  ].join("\n");
}

function TopologyHealthDot({ tone }: { tone: string }) {
  const className = {
    critical: "bg-destructive",
    healthy: "bg-emerald-500",
    unknown: "bg-muted-foreground",
    warning: "bg-status-warning",
  }[tone] ?? "bg-muted-foreground";
  return <span aria-hidden="true" className={`ml-auto size-2 shrink-0 rounded-full ${className}`} />;
}
