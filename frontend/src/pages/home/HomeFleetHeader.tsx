import { Activity, Box, Cpu, Pencil, Server } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Link } from "react-router-dom";

import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import type { HomeFleetUsageSummary } from "./useHomeClusterCardsData";
import { useI18n } from "../../shared/i18n";
import { GitHubBrandIcon } from "../../shared/ui/brand/BrandIcon";
import { TintChip } from "../../shared/ui/status";
import { Button } from "../../shared/ui/primitives/button";
import { ButtonGroup } from "../../shared/ui/primitives/button-group";

export function HomeFleetHeader({
  clusters,
  connectButtonRef,
  criticalCount,
  criticalHref,
  editing,
  fleetUsage,
  onEdit,
  onConnect,
  onPeriodChange,
  outOfSync,
  period,
}: {
  clusters: readonly HomeClusterChoice[];
  connectButtonRef?: RefObject<HTMLButtonElement | null>;
  criticalCount?: number | null;
  criticalHref?: string;
  editing?: boolean;
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
      icon={<Activity />}
      label={t("clusters.card.criticalLabel")}
      tone={criticalCount == null ? "neutral" : criticalCount > 0 ? "critical" : "healthy"}
      value={criticalCount == null ? "—" : formatNumber(criticalCount)}
    />
  );

  return (
    <div
      className="-mb-0.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3"
      data-slot="home-fleet-header"
    >
      <h1 className="sr-only">{t("home.cluster.available")}</h1>
      <div
        aria-label={t("home.cluster.grid.aria")}
        className="scrollbar-thin flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain py-0.5"
        role="group"
      >
        <FleetMetric
          icon={<Server />}
          label={t("home.cluster.label")}
          value={formatNumber(clusters.length)}
        />
        <FleetMetric
          icon={<Cpu />}
          label={t("clusters.card.nodesLabel")}
          value={nodes}
        />
        <FleetMetric
          icon={<Box />}
          label={t("clusters.card.podsLabel")}
          value={pods}
        />
        <FleetMetric
          icon={<GitHubBrandIcon label={t("shell.brand.github")} />}
          label={t("workflows.sync.status.outOfSync")}
          tone={outOfSync == null ? "neutral" : outOfSync > 0 ? "warning" : "healthy"}
          value={outOfSync == null ? "—" : formatNumber(outOfSync)}
        />
        {criticalHref ? (
          <Link
            aria-label={`${t("clusters.card.criticalLabel")} ${
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
      <div className="scrollbar-thin flex min-w-0 max-w-[min(57vw,45rem)] flex-nowrap items-center justify-end gap-2 overflow-x-auto overscroll-x-contain py-0.5">
        {period && onPeriodChange ? (
          <ButtonGroup aria-label={t("timeline.strip.range")} className="rounded-lg bg-muted p-0.5">
            {(["today", "7d", "30d"] as const).map((value) => (
              <Button
                aria-pressed={period === value}
                className="border-0"
                key={value}
                onClick={() => onPeriodChange(value)}
                size="compact-segment"
                type="button"
                variant={period === value ? "outline" : "ghost"}
              >
                {homePeriodLabel(value, locale)}
              </Button>
            ))}
          </ButtonGroup>
        ) : null}
        {onEdit ? (
          <Button onClick={onEdit} size="page-secondary" type="button" variant="outline">
            <Pencil aria-hidden="true" />
            {editing ? t("shell.home.layout.done") : t("shell.home.layout.edit")}
          </Button>
        ) : null}
        {onConnect ? (
          <Button
            className="gap-0"
            onClick={onConnect}
            ref={connectButtonRef}
            size="page-action"
            type="button"
          >
            <span aria-hidden="true" className="mr-[0.15625rem]">+</span>
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
      className="shrink-0 gap-[5px] whitespace-nowrap rounded-full px-[11px] py-[5px] text-label font-semibold"
      icon={<span className="text-caption-foreground [&_svg]:size-[11px]">{icon}</span>}
      label={<span className="inline-flex items-baseline gap-1"><span>{label}</span><strong className="inline-block min-w-[3ch] text-right font-mono text-label font-bold tabular-nums text-foreground">{value}</strong></span>}
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
