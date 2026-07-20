import { Boxes, CirclePlus, Server, Waypoints } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { ResourceSurfaceView } from "../../features/filters/filterContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type {
  HomeClusterChoice,
  HomeCollectionCompleteness,
} from "../../features/home/homeContract";
import { useCameraMorph } from "../../motion/useCameraMorph";
import { useI18n } from "../../shared/i18n";
import { connectionLabelKey } from "../../shared/ui/ClusterConnectionStatus";
import { Surface } from "../../shared/ui/Surface";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { TintChip } from "../../shared/ui/status/TintChip";
import {
  ResourceTable,
  type ResourceTableColumn,
} from "../../shared/ui/table";
import { ClusterCard } from "../clusters/ClusterCard";
import { clusterResourcesHref } from "../clusters/clusterNavigation";
import { ResourcesViewSwitcher } from "./ResourcesViewSwitcher";

export function ResourcesFleetZoom({
  clusters,
  completeness,
  onViewChange,
  view,
}: {
  clusters: HomeClusterChoice[];
  completeness: HomeCollectionCompleteness;
  onViewChange: (view: ResourceSurfaceView) => void;
  view: ResourceSurfaceView;
}) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const { play } = useCameraMorph(rootRef);
  useEffect(() => {
    const frame = requestAnimationFrame(() => play());
    return () => cancelAnimationFrame(frame);
  }, [play]);
  const aggregates = useMemo(
    () => fleetAggregates(clusters, completeness === "exact"),
    [clusters, completeness],
  );
  const homeHref = filter.navigationHref("/home");

  return (
    <section aria-label={t("resources.graph.clusterGrid.aria")} className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="[&_[data-slot=button-group]]:gap-0.5 [&_[data-slot=button-group]]:rounded-lg [&_[data-slot=button-group]]:bg-muted [&_[data-slot=button-group]]:p-0.5 [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:rounded-md! [&_[data-slot=button]]:border-transparent [&_[data-slot=button]]:px-6 [&_[data-slot=button]]:text-[0.8125rem] [&_[data-slot=button]_svg]:hidden [&_[data-slot=button][aria-pressed=true]]:border-border [&_[data-slot=button][aria-pressed=true]]:bg-card [&_[data-slot=button][aria-pressed=true]]:shadow-sm">
          <ResourcesViewSwitcher onChange={onViewChange} view={view} />
        </div>
        <Button nativeButton={false} render={<Link to={homeHref} />} size="sm">
          <CirclePlus aria-hidden="true" />
          {t("clusters.connect.title")}
        </Button>
      </div>
      <FleetSummaryChips aggregates={aggregates} formatNumber={formatNumber} />
      <div className="mt-2 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21.125rem]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1" ref={rootRef}>
          {view === "list" ? (
            <FleetKubernetesList clusters={clusters} />
          ) : (
            <div className="grid min-w-0 gap-6">
              <h2 className="text-body-strong font-bold" id="resources-fleet-cluster-title">{t("resources.category.cluster")}</h2>
              <div className="grid min-w-0 gap-3.5 md:grid-cols-2 [&_[data-slot=card]]:min-h-[16.625rem]" data-slot="resources-cluster-grid">
                {clusters.map((cluster, index) => (
                  <ClusterCard
                    cluster={cluster}
                    href={clusterResourcesHref(filter.state, cluster.id, undefined, filter.detail)}
                    index={index}
                    key={cluster.id}
                  />
                ))}
                {clusters.length % 2 === 1 ? (
                  <Button
                    className="motion-node-land min-h-[16.625rem] min-w-0 flex-col justify-center gap-2.5 whitespace-normal rounded-panel border-dashed bg-transparent text-foreground shadow-none transition-[background-color,border-color,transform] duration-(--motion-quick) ease-(--ease-soft) hover:border-primary/35 hover:bg-tint-blue-bg/35 active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none"
                    nativeButton={false}
                    render={<Link to={homeHref} />}
                    variant="outline"
                  >
                    <CirclePlus aria-hidden="true" className="size-6 text-primary" />
                    <span className="font-semibold">{t("clusters.connect.title")}</span>
                    <span className="min-w-0 max-w-64 text-center text-caption font-normal text-muted-foreground">
                      {t("clusters.connect.description")}
                    </span>
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <FleetConnectionPanel clusters={clusters} complete={completeness === "exact"} offset={view === "map"} />
      </div>
    </section>
  );
}

type FleetAggregates = {
  clusters: number;
  complete: boolean;
  connected: number;
  incidents: number | null;
  nodes: number | null;
  pods: number | null;
};

function fleetAggregates(clusters: readonly HomeClusterChoice[], complete: boolean): FleetAggregates {
  return {
    clusters: clusters.length,
    complete,
    connected: clusters.filter((cluster) => cluster.connectionState === "online").length,
    incidents: exactSum(clusters.map((cluster) => cluster.openIncidentCount ?? cluster.incidentCount)),
    nodes: exactSum(clusters.map((cluster) => cluster.nodeCount)),
    pods: exactSum(clusters.map((cluster) => cluster.podCount)),
  };
}

function exactSum(values: readonly (number | null | undefined)[]): number | null {
  if (values.some((value) => value == null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function FleetSummaryChips({
  aggregates,
  formatNumber,
}: {
  aggregates: FleetAggregates;
  formatNumber: (value: number) => string;
}) {
  const { t } = useI18n();
  const value = (metric: number | null) => metric === null
    ? "—"
    : `${aggregates.complete ? "" : "≥"}${formatNumber(metric)}`;
  const chips = [
    { icon: <Boxes className="size-3.5" />, label: t("resources.graph.clusterGrid.title"), value: value(aggregates.clusters) },
    { label: t("clusters.connection.online"), value: value(aggregates.connected) },
    { icon: <Server className="size-3.5" />, label: t("clusters.card.nodesLabel"), value: value(aggregates.nodes) },
    { label: t("clusters.card.podsLabel"), value: value(aggregates.pods) },
    {
      critical: aggregates.incidents !== null && aggregates.incidents > 0,
      label: t("clusters.card.criticalLabel"),
      value: value(aggregates.incidents),
    },
  ];
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]" aria-label={t("resources.graph.clusterGrid.title")}>
      {chips.map((chip) => (
        <TintChip
          className="h-9 shrink-0 rounded-full border-border bg-background px-3 text-label text-foreground tabular-nums"
          icon={chip.icon}
          key={chip.label}
          label={<>{chip.label} <strong className="font-mono">{chip.value}</strong></>}
          tone={chip.critical ? "critical" : "neutral"}
        />
      ))}
    </div>
  );
}

function FleetKubernetesList({ clusters }: { clusters: readonly HomeClusterChoice[] }) {
  const filter = useUnifiedFilter();
  const navigate = useNavigate();
  const { formatNumber, t } = useI18n();
  const columns = useMemo<readonly ResourceTableColumn<HomeClusterChoice>[]>(() => {
    const metric = (value: number | null | undefined) => value == null ? "—" : formatNumber(value);
    return [
      {
        cell: (cluster) => (
          <span className="min-w-0">
            <strong className="block truncate font-mono text-label-2" title={cluster.name}>{cluster.name}</strong>
            <span className="block truncate text-caption text-muted-foreground">{t(connectionLabelKey(cluster.connectionState))}</span>
          </span>
        ),
        header: t("resources.cluster.select"),
        id: "cluster",
        priority: "primary",
      },
      {
        cell: (cluster) => <span className="block truncate font-mono text-caption" title={cluster.kubernetesVersion ?? undefined}>{cluster.kubernetesVersion ?? "—"}</span>,
        header: t("clusters.card.kubernetesVersionUnavailable"),
        id: "version",
        priority: "secondary",
      },
      {
        align: "end",
        cell: (cluster) => <span className="font-mono tabular-nums">{metric(cluster.nodeCount)}</span>,
        header: t("clusters.card.nodesLabel"),
        id: "nodes",
      },
      {
        align: "end",
        cell: (cluster) => <span className="font-mono tabular-nums">{metric(cluster.podCount)}</span>,
        header: t("clusters.card.podsLabel"),
        id: "pods",
      },
      {
        align: "end",
        cell: (cluster) => <span className="font-mono tabular-nums">{metric(cluster.namespaceCount)}</span>,
        header: t("clusters.card.namespacesLabel"),
        id: "namespaces",
        priority: "tertiary",
      },
    ];
  }, [formatNumber, t]);
  return (
    <div className="grid min-w-0 gap-6">
      <h2 className="flex min-w-0 items-center gap-2 text-body-strong font-bold" id="resources-fleet-kubernetes-title">
        <Boxes aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="truncate">{t("resources.surface.view.list")}</span>
      </h2>
      <ResourceTable
        ariaLabel={t("resources.surface.view.list")}
        columns={columns}
        emptyState={<p className="text-label text-muted-foreground">{t("resources.empty")}</p>}
        getRowKey={(cluster) => cluster.id}
        getRowLabel={(cluster) => cluster.name}
        onRowActivate={(cluster) => navigate(clusterResourcesHref(filter.state, cluster.id, undefined, filter.detail))}
        rows={clusters}
      />
    </div>
  );
}

function FleetConnectionPanel({
  clusters,
  complete,
  offset,
}: {
  clusters: readonly HomeClusterChoice[];
  complete: boolean;
  offset: boolean;
}) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  return (
    <Surface
      aria-labelledby="resources-fleet-connections-title"
      className={`min-w-0 overflow-hidden lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100svh-8.5rem)] ${offset ? "lg:mt-12" : ""}`}
      data-slot="resources-connection-rail"
    >
      <header className="flex min-w-0 items-center gap-2 border-b px-3 py-2.5">
        <Waypoints aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <h2 className="truncate text-body-strong font-bold tracking-[-0.02em]" id="resources-fleet-connections-title">
          {t("resources.cluster.available")}
        </h2>
        <Badge className="ml-auto" variant="outline">{complete ? clusters.length : `≥${clusters.length}`}</Badge>
      </header>
      <ul className="min-w-0 overflow-y-auto p-2 [scrollbar-gutter:stable]">
        {clusters.map((cluster) => (
          <li className="min-w-0" key={cluster.id}>
            <Link
              className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-lg px-2.5 py-2 outline-none transition-colors duration-(--motion-quick) hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"
              to={clusterResourcesHref(filter.state, cluster.id, undefined, filter.detail)}
            >
              <span
                aria-hidden="true"
                className={cluster.connectionState === "online" ? "size-2 rounded-[3px] bg-status-healthy" : cluster.connectionState === "stale" || cluster.connectionState === "pending" ? "size-2 rounded-[3px] bg-status-warning" : "size-2 rounded-[3px] bg-status-unknown"}
              />
              <span className="min-w-0">
                <strong className="block truncate font-mono text-label-2" title={cluster.name}>{cluster.name}</strong>
                <span className="block truncate text-caption text-muted-foreground">
                  {t(connectionLabelKey(cluster.connectionState))}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
