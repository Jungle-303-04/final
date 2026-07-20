import { Activity, Coins, TrendingUp, type LucideIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Tooltip } from "recharts";

import type { CostOverview, CostObservedTrend } from "../../features/cost/costContract";
import { projectCostTrend } from "../../features/cost/costTrendProjection";
import { serializeProductFilterUrl } from "../../features/filters/filterUrl";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import { useI18n } from "../../shared/i18n";
import { ChartContainer, type ChartConfig } from "../../shared/ui/primitives/chart";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { TintChip } from "../../shared/ui/status";

const TOTAL_CHART_CONFIG = {
  total: { color: "var(--primary)" },
} satisfies ChartConfig;

export function CostOverviewBoard({ overview }: { overview: CostOverview }) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t("cost.summary.title")}
      className="grid min-w-0 gap-3 lg:grid-cols-3"
    >
      <ProjectionPanel overview={overview} />
      <TrendPreviewPanel overview={overview} />
      <ConsumptionPanel overview={overview} />
    </section>
  );
}

function ProjectionPanel({ overview }: { overview: CostOverview }) {
  const { t } = useI18n();
  const currency = overview.observation.currency;
  return (
    <ParityPanel icon={Coins} title={t("cost.summary.monthly")}>
      <MoneyValue currency={currency} value={overview.summary.monthlyProjection} />
      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border-subtle pt-3">
        <CompactFact
          label={t("cost.summary.hourly")}
          value={<MoneyText currency={currency} value={overview.summary.hourlyCost} />}
        />
        <CompactFact
          label={t("cost.summary.storage")}
          value={<MoneyText currency={currency} value={overview.summary.storageCost} />}
        />
        <CompactFact
          label={t("cost.summary.idle")}
          value={<MoneyText currency={currency} value={overview.summary.idleCost} />}
        />
      </dl>
    </ParityPanel>
  );
}

function TrendPreviewPanel({ overview }: { overview: CostOverview }) {
  const { t } = useI18n();
  return (
    <ParityPanel icon={TrendingUp} title={t("cost.trend.title")}>
      {overview.trend.availability === "unavailable" || overview.trend.series.length === 0 ? (
        <div className="grid min-h-28 flex-1 place-items-center rounded-lg border border-dashed px-4 text-center text-label text-muted-foreground">
          {t("cost.trend.unavailable")}
        </div>
      ) : (
        <TrendPreview trend={overview.trend} />
      )}
    </ParityPanel>
  );
}

function TrendPreview({ trend }: { trend: CostObservedTrend }) {
  const { formatDate, formatNumber } = useI18n();
  const reduceMotion = usePrefersReducedMotion();
  const rows = useMemo(() => {
    const projected = projectCostTrend(trend.series);
    return projected.rows.map((row) => ({
      timestamp: row.timestamp,
      total: projected.series.reduce((sum, series) => {
        const value = row[series.dataKey];
        return sum + (typeof value === "number" ? value : 0);
      }, 0),
    }));
  }, [trend.series]);
  const currency = trend.currency;
  return (
    <div className="grid min-h-0 flex-1 gap-2">
      <ChartContainer
        aria-label={trend.series.map(({ label }) => label).join(", ")}
        className="h-28 w-full aspect-auto"
        config={TOTAL_CHART_CONFIG}
        role="img"
      >
        <AreaChart data={rows} margin={{ bottom: 2, left: 1, right: 1, top: 3 }}>
          <Tooltip
            content={({ active, payload }) => {
              const item = payload?.[0]?.payload as { timestamp?: number; total?: number } | undefined;
              if (!active || item?.timestamp === undefined || item.total === undefined) return null;
              return (
                <div className="grid gap-1 rounded-lg border bg-popover px-3 py-2 text-caption shadow-product-overlay">
                  <time className="text-muted-foreground">
                    {formatDate(item.timestamp * 1_000, { hour: "2-digit", minute: "2-digit" })}
                  </time>
                  <strong className="font-mono tabular-nums">
                    {formatNumber(item.total / 1_000_000, {
                      currency,
                      maximumFractionDigits: 3,
                      style: "currency",
                    })}
                  </strong>
                </div>
              );
            }}
            cursor={{ stroke: "var(--border)" }}
          />
          <Area
            dataKey="total"
            fill="var(--color-total)"
            fillOpacity={0.12}
            isAnimationActive={!reduceMotion}
            stroke="var(--color-total)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ChartContainer>
      <p className="truncate text-caption text-muted-foreground" title={trend.series.map(({ label }) => label).join(" · ")}>
        {trend.series.map(({ label }) => label).join(" · ")}
      </p>
    </div>
  );
}

function ConsumptionPanel({ overview }: { overview: CostOverview }) {
  const { formatNumber, t } = useI18n();
  const filter = useUnifiedFilter();
  const ranked = useMemo(() => {
    if (overview.trend.availability === "unavailable") return [];
    return overview.trend.series.map((series) => ({
      key: series.key,
      label: series.label,
      value: [...series.points].sort((left, right) => right.timestamp - left.timestamp)[0]?.rateMicros ?? null,
    })).filter((item): item is { key: string; label: string; value: number } => item.value !== null)
      .sort((left, right) => right.value - left.value)
      .slice(0, 3);
  }, [overview.trend]);
  const currency = overview.observation.currency;
  return (
    <ParityPanel icon={Activity} title={t("cost.summary.title")}>
      {ranked.length === 0 || currency === null ? (
        <div className="grid min-h-24 flex-1 place-items-center text-label text-muted-foreground">
          {t("cost.value.notObserved")}
        </div>
      ) : (
        <ol className="grid gap-1.5">
          {ranked.map((item, index) => (
            <li className="min-w-0" key={item.key}>
              {costSeriesHref(item.key, filter) ? (
                <Link
                  className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  to={costSeriesHref(item.key, filter) ?? "/resources"}
                >
                  <RankedConsumptionContent currency={currency} index={index} item={item} />
                </Link>
              ) : (
                <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5">
                  <RankedConsumptionContent currency={currency} index={index} item={item} />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
        <TintChip
          className="rounded-full px-2.5 py-1 text-caption font-bold"
          icon={<Activity aria-hidden="true" className="size-3" />}
          label={`${t("cost.summary.efficiency")} ${percentage(overview.summary.efficiency, t("cost.value.notObserved"), formatNumber)}`}
          tone="healthy"
        />
        <span className="min-w-0 truncate text-caption text-muted-foreground">
          {t("cost.summary.savings")} · {overview.summary.savingsRecommendations ?? t("cost.value.notObserved")}
        </span>
      </div>
    </ParityPanel>
  );
}

function RankedConsumptionContent({
  currency,
  index,
  item,
}: {
  currency: string;
  index: number;
  item: { key: string; label: string; value: number };
}) {
  const { formatNumber } = useI18n();
  return <>
    <span className="grid size-5 place-items-center rounded-full bg-tint-blue-bg font-mono text-micro font-bold text-tint-blue-fg">{index + 1}</span>
    <span className="truncate text-label-2 font-semibold" title={item.label}>{item.label}</span>
    <strong className="font-mono text-label tabular-nums">
      {formatNumber(item.value / 1_000_000, { currency, maximumFractionDigits: 3, style: "currency" })}
    </strong>
  </>;
}

function costSeriesHref(
  key: string,
  filter: ReturnType<typeof useUnifiedFilter>,
): string | null {
  const separator = key.indexOf("/");
  if (separator <= 0 || separator === key.length - 1) return null;
  const clusterId = key.slice(0, separator);
  const namespace = key.slice(separator + 1);
  return `/resources${serializeProductFilterUrl({
    ...filter.state,
    common: {
      ...filter.state.common,
      clusters: [clusterId],
      namespaces: [{ clusterId, namespace }],
    },
    resources: {
      ...filter.state.resources,
      view: "table",
    },
  }, {
    ...filter.detail,
    detail: null,
    resource: null,
    resourceKind: null,
    resourceSurfaceView: "list",
  })}`;
}

function ParityPanel({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card className="min-h-52 min-w-0 gap-0 overflow-hidden transition-[border-color,box-shadow] hover:border-border-hover hover:shadow-product-hover motion-reduce:transition-none" size="sm">
      <CardHeader className="flex-row items-center gap-2 pb-2">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        <CardTitle className="truncate" title={title}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function MoneyValue({ currency, value }: { currency: string | null; value: number | null }) {
  const { formatNumber, t } = useI18n();
  const rendered = money(value, currency, formatNumber, t("cost.value.notObserved"));
  return <strong className="truncate font-mono text-title-1 font-bold tabular-nums" title={rendered}>{rendered}</strong>;
}

function MoneyText({ currency, value }: { currency: string | null; value: number | null }) {
  const { formatNumber, t } = useI18n();
  return money(value, currency, formatNumber, t("cost.value.notObserved"));
}

function CompactFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="line-clamp-2 min-h-8 text-caption leading-4 text-muted-foreground" title={label}>{label}</dt>
      <dd className="mt-1 truncate font-mono text-label font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function money(
  value: number | null,
  currency: string | null,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
  unavailable: string,
): string {
  if (value === null || currency === null) return unavailable;
  return formatNumber(value / 1_000_000, {
    currency,
    maximumFractionDigits: value >= 1_000_000 ? 2 : 4,
    style: "currency",
  });
}

function percentage(
  value: number | null,
  unavailable: string,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
  if (value === null) return unavailable;
  return `${formatNumber(value / 100, { maximumFractionDigits: 1 })}%`;
}
