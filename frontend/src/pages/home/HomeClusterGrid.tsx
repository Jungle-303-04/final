import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { Plus } from "lucide-react";
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
  onConnect,
  onDisconnect,
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
        className="grid max-w-6xl gap-4 md:grid-cols-2"
        data-slot="home-cluster-grid"
      >
        {clusters.map((cluster, index) => (
          <ClusterCard
            cluster={{
              ...cluster,
              openIncidentCount: cluster.openIncidentCount ?? cluster.incidentCount,
            }}
            href={clusterResourcesHref(filter.state, cluster.id)}
            index={index}
            key={cluster.id}
            disconnectPhase={disconnectClusterId === cluster.id ? disconnectPhase : undefined}
            onDisconnect={onDisconnect ? () => onDisconnect(cluster) : undefined}
            onRefresh={onRefresh}
            usage={overviewUsage(overviews[cluster.id])}
          />
        ))}
        {onConnect ? (
          <button
            className="motion-node-land grid min-h-52 place-items-center gap-3 rounded-xl border border-dashed bg-card/35 p-6 text-center text-muted-foreground outline-none transition-[border-color,background-color,color] duration-(--motion-quick) ease-(--ease-out) hover:border-primary/45 hover:bg-primary/5 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
            onClick={onConnect}
            type="button"
          >
            <span className="grid size-10 place-items-center rounded-full border border-dashed">
              <Plus aria-hidden="true" className="size-5" />
            </span>
            <span className="text-bodyStrong">{t("clusters.action.add")}</span>
          </button>
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
