import { Line, LineChart } from "recharts";

import type { ResourceMetricHistorySeries } from "../../features/resources/resourceMetricsHistoryContract";
import type { ResourceIdentity } from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";

export function ResourceSparkline({
  identity,
  name,
  onOpen,
  series,
}: {
  identity: ResourceIdentity;
  name: string;
  onOpen: (identity: ResourceIdentity) => void;
  series: ResourceMetricHistorySeries | null;
}) {
  const { t } = useI18n();
  const measured = series?.points.filter((point) => point.cpuMillicores !== null) ?? [];
  if (!series?.hasSparklinePoints || measured.length < 2) {
    return (
      <span
        aria-label={t("resources.table.trendUnavailable")}
        className="block h-6 w-24"
        data-slot="resource-trend-unavailable"
        role="img"
      />
    );
  }
  return (
    <Button
      aria-label={`${t("resources.table.openDetail", { name })}: ${t("resources.table.trend")}`}
      className="h-7 w-24 px-0"
      onClick={() => onOpen(identity)}
      title={series.completeness === "exact" ? undefined : t("common.state.partial")}
      type="button"
      variant="ghost"
    >
      <LineChart
        accessibilityLayer
        data={series.points}
        height={24}
        margin={{ bottom: 2, left: 2, right: 2, top: 2 }}
        width={96}
      >
        <Line
          connectNulls={false}
          dataKey="cpuMillicores"
          dot={false}
          isAnimationActive={false}
          stroke="var(--primary)"
          strokeWidth={1.5}
          type="monotone"
        />
      </LineChart>
    </Button>
  );
}
