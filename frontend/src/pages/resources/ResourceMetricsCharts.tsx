import { Activity, MemoryStick } from "lucide-react";
import { useId, useMemo } from "react";
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
import {
  ChartContainer,
  type ChartConfig,
} from "../../shared/ui/primitives/chart";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import type { ResourceMetricsHistoryFrame } from "./useResourceMetricsHistoryDataFrame";
import type { ResourceMetricTimeRange } from "../../features/resources/resourceMetricsHistoryContract";
import { TimelineRangeSelect } from "./ResourcesGraphChrome";

interface MetricPoint {
  cpu: number | null;
  memory: number | null;
  time: number;
}

const CPU_CONFIG = {
  value: { color: "var(--primary)", label: "CPU" },
} satisfies ChartConfig;

const MEMORY_CONFIG = {
  value: { color: "var(--chart-2)", label: "Memory" },
} satisfies ChartConfig;

export function ResourceMetricsCharts({
  frame,
  onRangeChange,
  range,
  resourceId,
  wide,
}: {
  frame: ResourceMetricsHistoryFrame;
  onRangeChange: (range: ResourceMetricTimeRange) => void;
  range: ResourceMetricTimeRange;
  resourceId: string;
  wide: boolean;
}) {
  const { t } = useI18n();
  if (frame.phase === "idle" || frame.phase === "loading") {
    return <ResourceMetricsChartsLoading wide={wide} />;
  }
  if (frame.phase === "failed") return <ResourceMetricsUnavailable />;

  const series = frame.data.series.find((item) => item.resourceId === resourceId);
  if (!series || series.points.length === 0) return <ResourceMetricsUnavailable />;

  const points = series.points.map((point) => ({
    cpu: point.cpuMillicores,
    memory: point.memoryMebibytes,
    time: Date.parse(point.observedAt),
  })).filter((point) => Number.isFinite(point.time));
  if (points.length === 0) return <ResourceMetricsUnavailable />;

  const partial = frame.data.completeness !== "exact" || series.completeness !== "exact";
  return (
    <div className="grid gap-4" data-slot="resource-metrics-charts">
      <header className="flex justify-end">
        <TimelineRangeSelect onChange={onRangeChange} value={range} />
      </header>
      {partial ? (
        <Badge className="w-fit" variant="outline">
          {t("resources.detail.metricsPartial")}
        </Badge>
      ) : null}
      <div className={cn("grid gap-4", wide && "xl:grid-cols-2")}>
        <ResourceMetricChart
          config={CPU_CONFIG}
          data={points}
          dataKey="cpu"
          icon={Activity}
          title={t("resources.detail.metricsCpu")}
          unit="m"
        />
        <ResourceMetricChart
          config={MEMORY_CONFIG}
          data={points}
          dataKey="memory"
          icon={MemoryStick}
          title={t("resources.detail.metricsMemory")}
          unit="MiB"
        />
      </div>
    </div>
  );
}

function ResourceMetricChart({
  config,
  data,
  dataKey,
  icon: Icon,
  title,
  unit,
}: {
  config: ChartConfig;
  data: MetricPoint[];
  dataKey: "cpu" | "memory";
  icon: typeof Activity;
  title: string;
  unit: string;
}) {
  const { t } = useI18n();
  const gradientId = useId().replace(/:/g, "");
  const stats = useMemo(() => metricStats(data, dataKey), [data, dataKey]);
  const formatValue = (value: number) => `${formatNumber(value)}${unit}`;

  return (
    <section className="min-w-0 rounded-xl border bg-card p-4 shadow-xs" data-slot="resource-metric-card">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
            {title}
          </h3>
          <p className="text-xs text-muted-foreground">
            {formatTimeRange(data)}
          </p>
        </div>
        <div className="flex items-baseline gap-3 text-right">
          <MetricStat
            label={t("resources.detail.metricsCurrent")}
            value={stats.current === null ? "—" : formatValue(stats.current)}
          />
          <MetricStat
            label={t("resources.detail.metricsPeak")}
            value={stats.peak === null ? "—" : formatValue(stats.peak)}
          />
        </div>
      </header>
      <ChartContainer className="h-56 w-full aspect-auto" config={config}>
        <AreaChart accessibilityLayer data={data} margin={{ left: 0, right: 12, top: 8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="time"
            domain={["dataMin", "dataMax"]}
            minTickGap={28}
            tickFormatter={formatTime}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            tickFormatter={(value: number) => formatValue(value)}
            tickLine={false}
            width={58}
          />
          <Tooltip
            content={({ active, label, payload }) => {
              const value = payload?.[0]?.value;
              if (!active || typeof value !== "number") return null;
              return (
                <div className="grid gap-1 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                  <span className="text-muted-foreground">{formatDateTime(Number(label))}</span>
                  <strong className="font-mono text-sm tabular-nums">{formatValue(value)}</strong>
                </div>
              );
            }}
            cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
          />
          <Area
            connectNulls={false}
            dataKey={dataKey}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            stroke="var(--color-value)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ChartContainer>
    </section>
  );
}

function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="grid gap-0.5">
      <span className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">{label}</span>
      <strong className="font-mono text-sm tabular-nums">{value}</strong>
    </span>
  );
}

function ResourceMetricsChartsLoading({ wide }: { wide: boolean }) {
  return (
    <div
      className={cn("grid gap-4", wide && "xl:grid-cols-2")}
      data-slot="resource-metrics-loading"
    >
      {["cpu", "memory"].map((metric) => (
        <div className="grid h-72 gap-4 rounded-xl border p-4" key={metric}>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-56 w-full" />
        </div>
      ))}
    </div>
  );
}

function ResourceMetricsUnavailable() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-48 place-items-center rounded-xl border border-dashed p-6 text-center">
      <div className="grid justify-items-center gap-2 text-sm text-muted-foreground">
        <Activity aria-hidden="true" className="size-6" />
        <p>{t("resources.detail.metricsUnavailable")}</p>
      </div>
    </div>
  );
}

function metricStats(data: MetricPoint[], key: "cpu" | "memory") {
  const values = data.map((point) => point[key]).filter((value): value is number => value !== null);
  return {
    current: values[values.length - 1] ?? null,
    peak: values.length === 0 ? null : Math.max(...values),
  };
}

function formatNumber(value: number): string {
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value: number): string {
  return new Date(value).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function formatTimeRange(data: MetricPoint[]): string {
  const first = data[0];
  const last = data[data.length - 1];
  return first && last ? `${formatTime(first.time)} – ${formatTime(last.time)}` : "";
}
