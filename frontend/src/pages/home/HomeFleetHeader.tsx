import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import type { HomeClusterChoice } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { TintChip } from "../../shared/ui/status";
import { Button } from "../../shared/ui/primitives/button";

export function HomeFleetHeader({
  clusters,
  freshness,
  onConnect,
}: {
  clusters: readonly HomeClusterChoice[];
  freshness?: ReactNode;
  onConnect?: () => void;
}) {
  const { formatNumber, t } = useI18n();
  const nodes = exactSum(clusters.map((cluster) => cluster.nodeCount));
  const pods = exactSum(clusters.map((cluster) => cluster.podCount));
  const critical = exactSum(
    clusters.map((cluster) => cluster.openIncidentCount ?? cluster.incidentCount),
  );

  return (
    <Surface as="div" className="grid gap-4 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title1">{t("home.cluster.available")}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {freshness}
          {onConnect ? (
            <Button onClick={onConnect} type="button">
              <Plus aria-hidden="true" />
              {t("clusters.action.add")}
            </Button>
          ) : null}
        </div>
      </div>
      <div
        aria-label={t("home.cluster.grid.aria")}
        className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4"
        role="group"
      >
        <FleetMetric
          label={t("home.cluster.label")}
          value={formatNumber(clusters.length)}
        />
        <FleetMetric
          label={t("home.metric.nodes")}
          value={formatMetric(nodes, formatNumber)}
        />
        <FleetMetric
          label={t("home.metric.pods")}
          value={formatMetric(pods, formatNumber)}
        />
        <FleetMetric
          label={t("workflows.sync.status.outOfSync")}
          value="—"
        />
        <TintChip
          label={(
            <>
              <span>{t("status.tone.critical")}</span>
              <span className="font-mono tabular-nums">
                {critical === null ? "—" : formatNumber(critical)}
              </span>
            </>
          )}
          tone={critical === null ? "neutral" : critical > 0 ? "critical" : "healthy"}
        />
      </div>
    </Surface>
  );
}

function FleetMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-label text-caption-foreground">{label}</span>
      <strong className="font-mono text-bodyStrong tabular-nums">{value}</strong>
    </span>
  );
}

function exactSum(values: readonly (number | null | undefined)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value == null) return null;
    total += value;
  }
  return total;
}

function formatMetric(
  value: number | null,
  formatNumber: (value: number) => string,
): string {
  return value === null ? "—" : formatNumber(value);
}
