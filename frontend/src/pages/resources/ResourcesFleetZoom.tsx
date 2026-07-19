import { useEffect, useRef } from "react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { useCameraMorph } from "../../motion/useCameraMorph";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { ClusterCard } from "../clusters/ClusterCard";
import { clusterResourcesHref } from "../clusters/clusterNavigation";

export function ResourcesFleetZoom({ clusters }: { clusters: HomeClusterChoice[] }) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const { play } = useCameraMorph(rootRef);
  useEffect(() => {
    const frame = requestAnimationFrame(() => play());
    return () => cancelAnimationFrame(frame);
  }, [play]);
  return (
    <Surface aria-label={t("resources.graph.clusterGrid.aria")} className="min-w-0 overflow-hidden">
      <div className="border-b px-4 py-3">
        <h2 className="font-medium">{t("resources.graph.clusterGrid.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("resources.graph.clusterGrid.description")}
        </p>
      </div>
      <div
        className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3"
        data-slot="resources-cluster-grid"
        ref={rootRef}
      >
        {clusters.map((cluster, index) => (
          <ClusterCard
            cluster={cluster}
            href={clusterResourcesHref(filter.state, cluster.id, undefined, filter.detail)}
            index={index}
            key={cluster.id}
          />
        ))}
      </div>
    </Surface>
  );
}
