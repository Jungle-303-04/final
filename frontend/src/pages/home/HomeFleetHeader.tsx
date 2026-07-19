import { Plus, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { TintChip } from "../../shared/ui/status";
import { Button } from "../../shared/ui/primitives/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";

export function HomeFleetHeader({
  clusters,
  editing,
  freshness,
  onEdit,
  onConnect,
  onPeriodChange,
  outOfSync,
  period,
}: {
  clusters: readonly HomeClusterChoice[];
  editing?: boolean;
  freshness?: ReactNode;
  onEdit?: () => void;
  onConnect?: () => void;
  onPeriodChange?: (period: HomeBoardPeriod) => void;
  outOfSync?: number | null;
  period?: HomeBoardPeriod;
}) {
  const { formatNumber, locale, t } = useI18n();
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
          {period && onPeriodChange ? (
            <Select
              onValueChange={(value) => {
                if (isHomeBoardPeriod(value)) onPeriodChange(value);
              }}
              value={period}
            >
              <SelectTrigger aria-label={t("timeline.strip.range")} size="sm">
                <SelectValue>{homePeriodLabel(period, locale)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">
                  {new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day")}
                </SelectItem>
                <SelectItem value="7d">{homePeriodLabel("7d", locale)}</SelectItem>
                <SelectItem value="30d">{homePeriodLabel("30d", locale)}</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {onEdit ? (
            <Button onClick={onEdit} size="sm" type="button" variant="ghost">
              <SlidersHorizontal aria-hidden="true" />
              {editing ? t("workflows.editor.save") : t("shell.ai.action.edit")}
            </Button>
          ) : null}
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
          value={outOfSync == null ? "—" : formatNumber(outOfSync)}
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

function homePeriodLabel(period: HomeBoardPeriod, locale: string): string {
  if (period === "today") {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day");
  }
  return period;
}

function isHomeBoardPeriod(value: unknown): value is HomeBoardPeriod {
  return value === "today" || value === "7d" || value === "30d";
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
