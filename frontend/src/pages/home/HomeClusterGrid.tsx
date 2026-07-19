import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { Plus } from "lucide-react";
import type {
  HomeClusterChoice,
  HomeUsageSnapshot,
} from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import type { DisconnectPhase } from "../clusters/ClusterDisconnectDialog";
import { ClusterCard } from "../clusters/ClusterCard";
import { clusterResourcesHref } from "../clusters/clusterNavigation";

export function HomeClusterGrid({
  clusters,
  disconnectClusterId,
  disconnectPhase,
  onConnect,
  onDisconnect,
  onRefresh,
  selectedClusterId,
  selectedUsage,
}: {
  clusters: HomeClusterChoice[];
  disconnectClusterId?: string | null;
  disconnectPhase?: DisconnectPhase;
  onConnect?: () => void;
  onDisconnect?: (cluster: HomeClusterChoice) => void;
  onRefresh?: () => void;
  selectedClusterId?: string | null;
  selectedUsage?: HomeUsageSnapshot | null;
}) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  return (
    <Surface
      aria-label={t("home.cluster.grid.aria")}
      className="min-w-0 overflow-hidden"
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">{t("home.cluster.grid.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("home.cluster.grid.description")}
        </p>
      </div>
      <div
        className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3"
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
            usage={selectedClusterId === cluster.id ? selectedUsage : null}
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
    </Surface>
  );
}
