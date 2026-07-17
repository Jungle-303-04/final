import { ShipWheel } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../shared/ui/primitives/tooltip";
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
                  className="relative grid size-16 place-items-center rounded-full border border-primary/25 bg-primary/8 text-primary outline-none transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  onClick={() => onSelect(cluster.id)}
                  title={clusterTooltip(cluster, { formatNumber, t })}
                  type="button"
                />
              )}
            >
              <ShipWheel aria-hidden="true" className="size-8" />
              <TopologyHealthDot tone={cluster.health} />
            </TooltipTrigger>
            <TooltipContent className="w-64 max-w-[calc(100vw-1rem)] p-0" side="top">
              <TopologyTooltipHeader
                eyebrow={t("resources.infraMap.topology.cluster")}
                title={cluster.name}
              />
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
                <TopologyTooltipRow
                  label={t("resources.infraMap.nodeKind")}
                  value={formatNumber(cluster.nodeCount)}
                />
                <TopologyTooltipRow
                  label={t("resources.infraMap.metric.pods")}
                  value={formatNumber(cluster.podCount)}
                />
                <TopologyTooltipRow
                  label={t("status.tone.warning")}
                  value={formatNumber(cluster.warningCount)}
                />
                <TopologyTooltipRow
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

function TopologyTooltipHeader({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="border-b border-background/15 px-3 py-2.5">
      <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-background/65">
        {eyebrow}
      </p>
      <p className="mt-0.5 break-all text-xs font-semibold leading-snug">{title}</p>
    </div>
  );
}

function TopologyTooltipRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <>
      <dt className="text-background/65">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{value}</dd>
    </>
  );
}
