import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type {
  HomeClusterChoice,
  HomeClusterOverview,
  HomeUsageSnapshot,
} from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import type { DisconnectPhase } from "../clusters/ClusterDisconnectDialog";
import { ClusterCard } from "../clusters/ClusterCard";
import { clusterResourcesHref } from "../clusters/clusterNavigation";
import type { HomeResourceState } from "./homePageStateModel";

export function HomeClusterGrid({
  clusters,
  disconnectClusterId,
  disconnectPhase,
  onDisconnect,
  onRefresh,
  overviews = {},
}: {
  clusters: HomeClusterChoice[];
  disconnectClusterId?: string | null;
  disconnectPhase?: DisconnectPhase;
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
      </div>
    </section>
  );
}

function overviewUsage(
  overview: HomeResourceState<HomeClusterOverview> | undefined,
): HomeUsageSnapshot | null {
  return overview?.phase === "ready" ? overview.data.usage : null;
}
