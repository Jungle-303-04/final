import { Plus } from "lucide-react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type {
  HomeClusterChoice,
  HomeClusterOverview,
  HomeUsageSnapshot,
} from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import type { DisconnectPhase } from "../clusters/ClusterDisconnectDialog";
import { ClusterCard } from "../clusters/ClusterCard";
import { clusterResourcesHref } from "../clusters/clusterNavigation";
import type { HomeResourceState } from "./homePageStateModel";

export function HomeClusterGrid({
  clusters,
  disconnectClusterId,
  disconnectPhase,
  onDisconnect,
  onConnect,
  onRefresh,
  overviews = {},
}: {
  clusters: HomeClusterChoice[];
  disconnectClusterId?: string | null;
  disconnectPhase?: DisconnectPhase;
  onConnect?: () => void;
  onDisconnect?: (cluster: HomeClusterChoice) => void;
  onRefresh?: () => void;
  overviews?: Readonly<Record<string, HomeResourceState<HomeClusterOverview>>>;
}) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  return (
    <section
      aria-label={t("home.cluster.grid.aria")}
      className="min-w-0"
    >
      <div
        className="grid gap-3.5 md:grid-cols-2"
        data-slot="home-cluster-grid"
      >
        {clusters.map((cluster, index) => (
          <div
            className="min-w-0"
            data-slot="home-cluster-cell"
            key={cluster.id}
          >
            <ClusterCard
              cluster={{
                ...cluster,
                openIncidentCount: cluster.openIncidentCount ?? cluster.incidentCount,
              }}
              href={clusterResourcesHref(filter.state, cluster.id)}
              index={index}
              disconnectPhase={disconnectClusterId === cluster.id ? disconnectPhase : undefined}
              onDisconnect={onDisconnect ? () => onDisconnect(cluster) : undefined}
              onRefresh={onRefresh}
              usage={overviewUsage(overviews[cluster.id])}
            />
          </div>
        ))}
        {clusters.length % 2 === 1 && onConnect ? (
          <Button
            className="motion-node-land min-h-[12.75rem] min-w-0 flex-col justify-center gap-2.5 rounded-panel border-dashed bg-transparent text-foreground shadow-none transition-[background-color,border-color,transform] duration-(--motion-quick) ease-(--ease-soft) hover:border-primary/35 hover:bg-primary/5 active:scale-[0.995] motion-reduce:transform-none motion-reduce:transition-none"
            data-slot="home-cluster-connect-cell"
            onClick={onConnect}
            type="button"
            variant="outline"
          >
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
              <Plus className="size-5" />
            </span>
            <span className="text-label-2 font-bold">{t("clusters.action.add")}</span>
            <span className="max-w-64 whitespace-normal text-center text-caption font-normal leading-5 text-caption-foreground">
              {t("clusters.connect.description")}
            </span>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function overviewUsage(
  overview: HomeResourceState<HomeClusterOverview> | undefined,
): HomeUsageSnapshot | null {
  return overview?.phase === "ready" ? overview.data.usage : null;
}
