import { Server, ShipWheel } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import {
  type InfraMapTopologyCluster,
  type InfraMapTopologyNode,
  type InfraMapTopologyPodGroup,
} from "./resourcesInfraMapTopologyModel";
import { TopologyPodHex } from "./ResourcesInfraMapTopologyPodHex";

export function TopologyClusterDetail({
  cluster,
  metricMode,
  onBack,
  onOpenPod,
}: {
  cluster: InfraMapTopologyCluster;
  metricMode: InfraMapMetricMode;
  onBack: (() => void) | null;
  onOpenPod: (pod: InfraMapPod) => void;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <div
      aria-label={t("resources.infraMap.topology.detail.aria", { name: cluster.name })}
      className="mt-4 grid min-h-72 gap-4 rounded-lg border border-dashed bg-background/45 p-4"
      data-slot="infra-map-topology-detail"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-12 shrink-0 place-items-center rounded-full border bg-muted/35">
            <ShipWheel aria-hidden="true" className="size-6 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t("resources.infraMap.topology.cluster")}
            </p>
            <h3 className="truncate text-sm font-semibold">{cluster.name}</h3>
            <p className="text-[0.6875rem] text-muted-foreground">
              {clusterSummary(cluster, { formatNumber, t })}
            </p>
          </div>
        </div>
        {onBack ? (
          <Button onClick={onBack} size="sm" type="button" variant="outline">
            {t("resources.infraMap.topology.back")}
          </Button>
        ) : null}
      </div>

      <div aria-hidden="true" className="mx-auto h-6 w-px bg-border" />
      {cluster.nodes.length === 0 ? (
        <div className="grid min-h-32 place-items-center rounded-md border bg-background/50 px-4 text-center text-sm text-muted-foreground">
          {t("resources.infraMap.empty")}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
          {cluster.nodes.map((node) => (
            <TopologyNode
              key={node.id}
              metricMode={metricMode}
              node={node}
              onOpenPod={onOpenPod}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TopologyNode({
  metricMode,
  node,
  onOpenPod,
}: {
  metricMode: InfraMapMetricMode;
  node: InfraMapTopologyNode;
  onOpenPod: (pod: InfraMapPod) => void;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <article
      className="relative grid min-w-0 gap-3 rounded-lg border bg-card/80 p-3 shadow-sm"
      data-slot="infra-map-topology-node"
    >
      <span
        aria-hidden="true"
        className="absolute -top-4 left-1/2 h-4 w-px -translate-x-1/2 bg-border"
      />
      <header className="flex min-w-0 items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-background/75">
          <Server aria-hidden="true" className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t("resources.infraMap.nodeKind")}
          </p>
          <h4 className="truncate text-sm font-semibold" title={node.name}>
            {node.unassigned ? t("resources.infraMap.nodeUnassigned") : node.name}
          </h4>
        </div>
        <span className="ml-auto text-[0.6875rem] text-muted-foreground">
          {t("resources.infraMap.topology.nodePodCount", {
            count: formatNumber(node.podCount),
          })}
        </span>
      </header>
      {node.groups.length === 0 ? (
        <div className="grid min-h-24 place-items-center rounded-md border border-dashed bg-background/45 px-3 text-center text-xs text-muted-foreground">
          {t("resources.infraMap.noPods")}
        </div>
      ) : (
        <div className="grid gap-2">
          {node.groups.map((group) => (
            <TopologyPodGroup
              group={group}
              key={group.key}
              metricMode={metricMode}
              onOpenPod={onOpenPod}
            />
          ))}
          {node.hiddenPodCount > 0 ? (
            <span className="justify-self-start rounded-full border border-dashed bg-background px-2 py-0.5 text-[0.625rem] text-muted-foreground">
              {t("resources.infraMap.topology.hiddenPods", {
                count: formatNumber(node.hiddenPodCount),
              })}
            </span>
          ) : null}
        </div>
      )}
    </article>
  );
}

function TopologyPodGroup({
  group,
  metricMode,
  onOpenPod,
}: {
  group: InfraMapTopologyPodGroup;
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <section
      className="grid gap-2 rounded-md border bg-background/55 p-2"
      data-slot="infra-map-topology-pod-group"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-[0.6875rem] font-medium text-muted-foreground" title={group.label}>
          {group.label}
        </p>
        <span className="shrink-0 text-[0.625rem] text-muted-foreground">
          {t("resources.infraMap.topology.groupPodCount", {
            count: formatNumber(group.pods.length),
          })}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {group.pods.map((pod) => (
          <TopologyPodHex
            key={pod.id}
            metricMode={metricMode}
            onOpenPod={onOpenPod}
            pod={pod}
          />
        ))}
      </div>
    </section>
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
