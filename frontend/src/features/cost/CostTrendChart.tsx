import { TrendingUp } from "lucide-react";
import { useMemo, useRef, type KeyboardEvent } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { ChartContainer, type ChartConfig } from "../../shared/ui/primitives/chart";
import type { CostObservedTrend, CostTimeRange, CostTrend } from "./costContract";
import { projectCostTrend } from "./costTrendProjection";

const COST_TIME_RANGES: readonly CostTimeRange[] = ["6h", "24h", "7d"];
export const COST_TREND_ANIMATION_ENABLED = false;
const CHART_COLORS = [
  "var(--primary)",
  "var(--status-healthy)",
  "var(--status-warning)",
  "var(--status-stale)",
  "var(--status-unknown)",
] as const;
const CHART_SWATCH_CLASSES = [
  "bg-primary",
  "bg-status-healthy",
  "bg-status-warning",
  "bg-status-stale",
  "bg-status-unknown",
] as const;

export function CostTrendChart({
  onTimeRangeChange,
  timeRange,
  trend,
}: {
  onTimeRangeChange(value: CostTimeRange): void;
  timeRange: CostTimeRange;
  trend: CostTrend;
}) {
  const { t } = useI18n();
  return (
    <Card id="cost-panel-trend" role="tabpanel" aria-labelledby="cost-tab-trend">
      <CardHeader className="grid gap-3 border-b sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp aria-hidden="true" className="size-4 text-muted-foreground" />
            {t("cost.trend.title")}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("cost.trend.description")}</p>
        </div>
        <CostTimeRangeSelector onChange={onTimeRangeChange} value={timeRange} />
      </CardHeader>
      <CardContent className="min-w-0">
        {trend.availability === "unavailable" || trend.series.length === 0 ? (
          <div className="grid min-h-56 place-items-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("cost.trend.unavailable")}
          </div>
        ) : <ObservedCostTrend trend={trend} />}
      </CardContent>
    </Card>
  );
}

function ObservedCostTrend({ trend }: { trend: CostObservedTrend }) {
  const { formatDate, formatNumber, t } = useI18n();
  const projected = useMemo(() => projectCostTrend(trend.series), [trend.series]);
  const config = useMemo(() => Object.fromEntries(projected.series.map((series, index) => [
    series.dataKey,
    { color: CHART_COLORS[index % CHART_COLORS.length], label: series.label },
  ])) as ChartConfig, [projected.series]);
  const labels = useMemo(() => new Map<string, string>(
    projected.series.map((series) => [series.dataKey, series.label]),
  ), [projected.series]);
  const formatMoney = (value: number) => formatNumber(value, {
    currency: trend.currency,
    maximumFractionDigits: value >= 1 ? 2 : 4,
    style: "currency",
  });
  if (projected.rows.length < 2) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("cost.trend.unavailable")}</p>;
  }
  return (
    <div className="grid min-w-0 gap-3">
      {trend.availability === "partial" ? (
        <Badge className="w-fit" variant="outline">{t("cost.trend.partial")}</Badge>
      ) : null}
      <ChartContainer
        aria-label={t("cost.trend.title")}
        className="h-64 w-full aspect-auto"
        config={config}
        role="img"
      >
        <AreaChart accessibilityLayer data={projected.rows} margin={{ left: 8, right: 12, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="timestamp"
            minTickGap={32}
            tickFormatter={(value: number) => formatDate(value * 1_000, { hour: "2-digit", minute: "2-digit" })}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            tickFormatter={(value: number) => formatMoney(value)}
            tickLine={false}
            width={76}
          />
          <Tooltip
            content={({ active, label, payload }) => {
              if (!active || payload === undefined || payload.length === 0) return null;
              return (
                <div className="grid min-w-44 gap-1 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                  <time className="text-muted-foreground">
                    {formatDate(Number(label) * 1_000, {
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "short",
                    })}
                  </time>
                  {payload.map((item) => typeof item.value === "number" ? (
                    <div className="flex items-center justify-between gap-4" key={String(item.dataKey)}>
                      <span className="min-w-0 truncate">{labels.get(String(item.dataKey)) ?? String(item.name)}</span>
                      <strong className="shrink-0 tabular-nums">{formatMoney(item.value)}</strong>
                    </div>
                  ) : null)}
                </div>
              );
            }}
            cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
          />
          {projected.series.map((series) => (
            <Area
              connectNulls={false}
              dataKey={series.dataKey}
              fill={`var(--color-${series.dataKey})`}
              fillOpacity={0.16}
              isAnimationActive={COST_TREND_ANIMATION_ENABLED}
              key={series.key}
              stackId="cost"
              stroke={`var(--color-${series.dataKey})`}
              strokeWidth={2}
              type="monotone"
            />
          ))}
        </AreaChart>
      </ChartContainer>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {projected.series.map((series, index) => (
          <li className="flex min-w-0 items-center gap-1.5" key={series.key}>
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                CHART_SWATCH_CLASSES[index % CHART_SWATCH_CLASSES.length],
              )}
            />
            <span className="max-w-48 truncate" title={series.label}>{series.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CostTimeRangeSelector({
  onChange,
  value,
}: {
  onChange(value: CostTimeRange): void;
  value: CostTimeRange;
}) {
  const { t } = useI18n();
  const refs = useRef<Partial<Record<CostTimeRange, HTMLButtonElement>>>({});
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: CostTimeRange) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const index = COST_TIME_RANGES.indexOf(current);
    const next = COST_TIME_RANGES[(index + offset + COST_TIME_RANGES.length) % COST_TIME_RANGES.length]!;
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div aria-label={t("cost.trend.range.label")} className="flex items-center gap-1" role="group">
      {COST_TIME_RANGES.map((range) => (
        <button
          aria-pressed={range === value}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            range === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          key={range}
          onClick={() => onChange(range)}
          onKeyDown={(event) => handleKeyDown(event, range)}
          ref={(node) => { refs.current[range] = node ?? undefined; }}
          type="button"
        >
          {t(`cost.trend.range.${range}`)}
        </button>
      ))}
    </div>
  );
}
