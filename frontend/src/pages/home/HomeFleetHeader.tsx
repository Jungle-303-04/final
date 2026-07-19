import { Box, CircleAlert, Cpu, GitBranch, Plus, Server, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import type { HomeFleetUsageSummary } from "./useHomeClusterCardsData";
import { useI18n } from "../../shared/i18n";
import { TintChip } from "../../shared/ui/status";
import { Button } from "../../shared/ui/primitives/button";
import { ButtonGroup } from "../../shared/ui/primitives/button-group";

export function HomeFleetHeader({
  clusters,
  criticalCount,
  criticalHref,
  editing,
  freshness,
  fleetUsage,
  onEdit,
  onConnect,
  onPeriodChange,
  outOfSync,
  period,
}: {
  clusters: readonly HomeClusterChoice[];
  criticalCount?: number | null;
  criticalHref?: string;
  editing?: boolean;
  freshness?: ReactNode;
  fleetUsage?: HomeFleetUsageSummary | null;
  onEdit?: () => void;
  onConnect?: () => void;
  onPeriodChange?: (period: HomeBoardPeriod) => void;
  outOfSync?: number | null;
  period?: HomeBoardPeriod;
}) {
  const { formatNumber, locale, t } = useI18n();
  const nodes = fleetUsage === undefined
    ? formatMetric(exactSum(clusters.map((cluster) => cluster.nodeCount)), formatNumber)
    : fleetUsage === null
      ? "—"
      : `${formatNumber(fleetUsage.nodesReady)}/${formatNumber(fleetUsage.nodesTotal)}`;
  const pods = fleetUsage === undefined
    ? formatMetric(exactSum(clusters.map((cluster) => cluster.podCount)), formatNumber)
    : fleetUsage === null
      ? "—"
      : formatNumber(fleetUsage.podsTotal);
  const criticalChip = (
    <FleetMetric
      icon={<CircleAlert />}
      label={t("status.tone.critical")}
      tone={criticalCount == null ? "neutral" : criticalCount > 0 ? "critical" : "healthy"}
      value={criticalCount == null ? "—" : formatNumber(criticalCount)}
    />
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <h1 className="sr-only">{t("home.cluster.available")}</h1>
      <div
        aria-label={t("home.cluster.grid.aria")}
        className="flex min-w-0 flex-wrap items-center gap-2"
        role="group"
      >
        <FleetMetric
          icon={<Server />}
          label={t("home.cluster.label")}
          value={formatNumber(clusters.length)}
        />
        <FleetMetric
          icon={<Cpu />}
          label={t("home.metric.nodes")}
          value={nodes}
        />
        <FleetMetric
          icon={<Box />}
          label={t("home.metric.pods")}
          value={pods}
        />
        <FleetMetric
          icon={<GitBranch />}
          label={t("workflows.sync.status.outOfSync")}
          tone={outOfSync == null ? "neutral" : outOfSync > 0 ? "warning" : "healthy"}
          value={outOfSync == null ? "—" : formatNumber(outOfSync)}
        />
        {criticalHref ? (
          <Link
            aria-label={`${t("status.tone.critical")} ${
              criticalCount == null ? "—" : formatNumber(criticalCount)
            }`}
            className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            to={criticalHref}
          >
            {criticalChip}
          </Link>
        ) : (
          criticalChip
        )}
      </div>
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        {freshness}
        {period && onPeriodChange ? (
          <ButtonGroup aria-label={t("timeline.strip.range")} className="rounded-lg bg-muted p-0.5">
            {(["today", "7d", "30d"] as const).map((value) => (
              <Button
                aria-pressed={period === value}
                className="h-auto border-0 px-2.5 py-[3px] text-caption-2 font-semibold"
                key={value}
                onClick={() => onPeriodChange(value)}
                size="sm"
                type="button"
                variant={period === value ? "outline" : "ghost"}
              >
                {homePeriodLabel(value, locale)}
              </Button>
            ))}
          </ButtonGroup>
        ) : null}
        {onEdit ? (
          <Button onClick={onEdit} size="sm" type="button" variant="outline">
            <SlidersHorizontal aria-hidden="true" />
            {editing ? t("workflows.editor.save") : t("shell.ai.action.edit")}
          </Button>
        ) : null}
        {onConnect ? (
          <Button className="rounded-[9px] text-label-2 font-bold" onClick={onConnect} type="button">
            <Plus aria-hidden="true" />
            {t("clusters.action.add")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function homePeriodLabel(period: HomeBoardPeriod, locale: string): string {
  if (period === "today") {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day");
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "day",
    unitDisplay: "short",
  }).format(period === "7d" ? 7 : 30);
}

function FleetMetric({ icon, label, tone = "neutral", value }: {
  icon: ReactNode;
  label: string;
  tone?: "neutral" | "healthy" | "warning" | "critical";
  value: string;
}) {
  return (
    <TintChip
      className="gap-[5px] rounded-full px-[11px] py-[5px] text-label font-semibold"
      icon={<span className="text-caption-foreground [&_svg]:size-[11px]">{icon}</span>}
      label={<span className="inline-flex items-baseline gap-1"><span>{label}</span><strong className="font-mono text-label font-bold tabular-nums text-foreground">{value}</strong></span>}
      tone={tone}
    />
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
