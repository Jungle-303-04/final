import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Button } from "../../shared/ui/primitives/button";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import { ResourcesInfraMapTopologyFlow } from "./ResourcesInfraMapTopologyFlow";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import type { InfraMapTopologyCluster } from "./resourcesInfraMapTopologyModel";

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
  const { t } = useI18n();
  return (
    <section
      aria-label={t("resources.infraMap.topology.detail.aria", { name: cluster.name })}
      className={cn(
        "mt-4 grid h-80 min-h-0 gap-2 overflow-hidden rounded-lg border border-dashed bg-background/45 p-2 sm:h-96",
        onBack ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)]",
      )}
      data-slot="infra-map-topology-detail"
    >
      {onBack ? (
        <header className="flex min-w-0 justify-end px-1">
          <Button onClick={onBack} size="sm" type="button" variant="outline">
            {t("resources.infraMap.topology.back")}
          </Button>
        </header>
      ) : null}

      <ResourcesInfraMapTopologyFlow
        cluster={cluster}
        metricMode={metricMode}
        onOpenPod={onOpenPod}
      />
    </section>
  );
}
