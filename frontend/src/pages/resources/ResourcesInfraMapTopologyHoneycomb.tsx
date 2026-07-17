import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import { TopologyPodHex } from "./ResourcesInfraMapTopologyPodHex";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import { honeycombRows } from "./resourcesInfraMapTopologyLayout";

export function TopologyPodHoneycomb({
  ariaLabel,
  metricMode,
  onOpenPod,
  pods,
}: {
  ariaLabel: string;
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
  pods: readonly InfraMapPod[];
}) {
  const { formatNumber, t } = useI18n();
  const rows = honeycombRows(pods);

  return (
    <div
      aria-label={ariaLabel}
      className="grid justify-start overflow-hidden py-1"
      data-slot="infra-map-topology-honeycomb"
    >
      {rows.map((row, rowIndex) => (
        <div
          className={cn(
            "flex min-w-0 items-center",
            rowIndex > 0 && "-mt-1",
            rowIndex % 2 === 1 && "pl-4",
          )}
          key={row.map((pod) => pod.id).join("|")}
        >
          {row.map((pod, podIndex) => (
            <TopologyPodHex
              className={cn(podIndex > 0 && "-ml-1")}
              key={pod.id}
              metricMode={metricMode}
              onOpenPod={onOpenPod}
              pod={pod}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">
        {t("resources.infraMap.topology.groupPodCount", {
          count: formatNumber(pods.length),
        })}
      </span>
    </div>
  );
}
