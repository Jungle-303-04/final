import { ShipWheel } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../shared/ui/primitives/tooltip";
import {
  InfraMapTooltipHeader,
  InfraMapTooltipRow,
} from "./InfraMapHoverCard";
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
      <div className="flex flex-wrap gap-3">
        {clusters.map((cluster) => (
          <Tooltip key={cluster.id}>
            <TooltipTrigger
              render={(
                <button
                  aria-label={t("resources.infraMap.topology.cluster.aria", {
                    name: cluster.name,
                  })}
                  className="relative grid size-[4.5rem] place-items-center rounded-full border border-blue-400/45 bg-blue-500/10 text-blue-500 outline-none shadow-sm shadow-blue-500/10 transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-400/70 hover:bg-blue-500/15 hover:shadow-blue-500/20 focus-visible:ring-2 focus-visible:ring-ring/60 dark:border-blue-300/35 dark:bg-blue-400/15 dark:text-blue-300 dark:shadow-blue-900/20 motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  onClick={() => onSelect(cluster.id)}
                  title={clusterTooltip(cluster, { formatNumber, t })}
                  type="button"
                />
              )}
            >
              <ShipWheel aria-hidden="true" className="size-10" />
              <TopologyHealthDot tone={cluster.health} />
            </TooltipTrigger>
            <TooltipContent className="w-64 max-w-[calc(100vw-1rem)] p-0" side="top">
              <InfraMapTooltipHeader
                eyebrow={t("resources.infraMap.topology.cluster")}
                title={cluster.name}
              />
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
                <InfraMapTooltipRow
                  label={t("resources.infraMap.nodeKind")}
                  value={formatNumber(cluster.nodeCount)}
                />
                <InfraMapTooltipRow
                  label={t("resources.infraMap.metric.pods")}
                  value={formatNumber(cluster.podCount)}
                />
                <InfraMapTooltipRow
                  label={t("status.tone.warning")}
                  value={formatNumber(cluster.warningCount)}
                />
                <InfraMapTooltipRow
                  label={t("status.tone.critical")}
                  value={formatNumber(cluster.criticalCount)}
                />
              </dl>
            </TooltipContent>
          </Tooltip>
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
  return <span aria-hidden="true" className={`absolute right-2 top-2 size-2.5 shrink-0 rounded-full ${className}`} />;
}
