import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { ClusterCard } from "../clusters/ClusterCard";
import { clusterResourcesHref } from "../clusters/clusterNavigation";

export function HomeClusterGrid({ clusters }: { clusters: HomeClusterChoice[] }) {
  const filter = useUnifiedFilter();
  const { locale } = useI18n();
  return (
    <Surface
      aria-label={locale === "ko" ? "클러스터 한눈에 보기" : "Cluster overview"}
      className="min-w-0 overflow-hidden"
    >
      <div className="border-b px-4 py-3">
        <h1 className="text-base font-semibold">
          {locale === "ko" ? "클러스터" : "Clusters"}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {locale === "ko"
            ? "클러스터를 선택해 서버와 파드 상태를 확인하세요."
            : "Choose a cluster to inspect its servers and pods."}
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
          />
        ))}
      </div>
    </Surface>
  );
}
