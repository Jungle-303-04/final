import {
  Activity,
  Gauge,
  HardDrive,
  MemoryStick,
  Network,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
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
import type {
  ResourceMetricsHistoryFrame,
  ResourceMetricsUnavailableRetry,
} from "./useResourceMetricsHistoryDataFrame";
import type {
  ResourceMetricContainerHistorySeries,
  ResourceMetricContainerObservation,
  ResourceMetricTimeRange,
} from "../../features/resources/resourceMetricsHistoryContract";
import { TimelineRangeSelect } from "./ResourcesGraphChrome";

interface MetricPoint {
  cpu: number | null;
  memory: number | null;
  volume: number | null;
  networkRx: number | null;
  networkTx: number | null;
  filesystem: number | null;
  restarts: number | null;
  hpaCurrent: number | null;
  hpaDesired: number | null;
  time: number;
}

const CPU_CONFIG = {
  value: { color: "var(--primary)", label: "CPU" },
} satisfies ChartConfig;

const MEMORY_CONFIG = {
  value: { color: "var(--chart-2)", label: "Memory" },
} satisfies ChartConfig;

const VOLUME_CONFIG = {
  value: { color: "var(--chart-3)", label: "Storage" },
} satisfies ChartConfig;

const NETWORK_RX_CONFIG = {
  value: { color: "var(--chart-4)", label: "Network receive" },
} satisfies ChartConfig;

const NETWORK_TX_CONFIG = {
  value: { color: "var(--chart-5)", label: "Network transmit" },
} satisfies ChartConfig;

const FILESYSTEM_CONFIG = {
  value: { color: "var(--chart-3)", label: "Filesystem" },
} satisfies ChartConfig;

const RESTART_CONFIG = {
  value: { color: "var(--warning)", label: "Restarts" },
} satisfies ChartConfig;

const HPA_CURRENT_CONFIG = {
  value: { color: "var(--primary)", label: "Current replicas" },
} satisfies ChartConfig;

const HPA_DESIRED_CONFIG = {
  value: { color: "var(--chart-2)", label: "Desired replicas" },
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
  if (frame.phase === "failed") return <ResourceMetricsUnavailable retry={null} />;

  const series = frame.data.series.find((item) => item.resourceId === resourceId);
  if (!series || series.points.length === 0) {
    return <ResourceMetricsUnavailable retry={frame.unavailableRetry} />;
  }

  const points = series.points.map((point) => ({
    cpu: point.cpuMillicores,
    memory: point.memoryMebibytes,
    volume: point.volumeUsagePercent ?? null,
    networkRx: point.networkReceiveBytesPerSecond ?? null,
    networkTx: point.networkTransmitBytesPerSecond ?? null,
    filesystem: point.filesystemBytes ?? null,
    restarts: point.restartCount ?? null,
    hpaCurrent: point.hpaCurrentReplicas ?? null,
    hpaDesired: point.hpaDesiredReplicas ?? null,
    time: Date.parse(point.observedAt),
  })).filter((point) => Number.isFinite(point.time));
  if (points.length === 0) {
    return <ResourceMetricsUnavailable retry={frame.unavailableRetry} />;
  }
  const hasCpu = points.some((point) => point.cpu !== null);
  const hasMemory = points.some((point) => point.memory !== null);
  const hasVolume = points.some((point) => point.volume !== null);
  const hasNetworkRx = points.some((point) => point.networkRx !== null);
  const hasNetworkTx = points.some((point) => point.networkTx !== null);
  const hasFilesystem = points.some((point) => point.filesystem !== null);
  const hasRestarts = points.some((point) => point.restarts !== null);
  const hasHpaCurrent = points.some((point) => point.hpaCurrent !== null);
  const hasHpaDesired = points.some((point) => point.hpaDesired !== null);
  if (
    !hasCpu && !hasMemory && !hasVolume && !hasNetworkRx && !hasNetworkTx &&
    !hasFilesystem && !hasRestarts && !hasHpaCurrent && !hasHpaDesired
  ) {
    return <ResourceMetricsUnavailable retry={frame.unavailableRetry} />;
  }

  const partial = frame.data.completeness !== "exact" || series.completeness !== "exact";
  return (
    <div className="grid gap-4" data-slot="resource-metrics-charts">
      <header className="flex justify-end">
        {series.currentObservation ? (
          <p className="mr-auto min-w-0 truncate text-xs text-muted-foreground">
            {t("resources.detail.metricsCurrentObservation", {
              time: formatDateTime(Date.parse(series.currentObservation.observedAt)),
              window: series.currentObservation.measurementWindow,
            })}
          </p>
        ) : null}
        <TimelineRangeSelect onChange={onRangeChange} value={range} />
      </header>
      {partial ? (
        <Badge className="w-fit" variant="outline">
          {t("resources.detail.metricsPartial")}
        </Badge>
      ) : null}
      <div className={cn("grid gap-4", wide && "xl:grid-cols-2")}>
        {hasCpu ? (
          <ResourceMetricChart
            config={CPU_CONFIG}
            currentValue={series.currentObservation?.cpuMillicores}
            data={points}
            dataKey="cpu"
            icon={Activity}
            title={t("resources.detail.metricsCpu")}
            unit="m"
          />
        ) : null}
        {hasMemory ? (
          <ResourceMetricChart
            config={MEMORY_CONFIG}
            currentValue={series.currentObservation?.memoryMebibytes}
            data={points}
            dataKey="memory"
            icon={MemoryStick}
            title={t("resources.detail.metricsMemory")}
            unit="MiB"
          />
        ) : null}
        {hasVolume ? (
          <ResourceMetricChart
            config={VOLUME_CONFIG}
            data={points}
            dataKey="volume"
            icon={HardDrive}
            title={t("resources.detail.metricsVolume")}
            unit="%"
          />
        ) : null}
        {hasNetworkRx ? (
          <ResourceMetricChart
            config={NETWORK_RX_CONFIG}
            data={points}
            dataKey="networkRx"
            icon={Network}
            title={t("resources.detail.metricsNetworkReceive")}
            unit="B/s"
          />
        ) : null}
        {hasNetworkTx ? (
          <ResourceMetricChart
            config={NETWORK_TX_CONFIG}
            data={points}
            dataKey="networkTx"
            icon={Network}
            title={t("resources.detail.metricsNetworkTransmit")}
            unit="B/s"
          />
        ) : null}
        {hasFilesystem ? (
          <ResourceMetricChart
            config={FILESYSTEM_CONFIG}
            data={points}
            dataKey="filesystem"
            icon={HardDrive}
            title={t("resources.detail.metricsFilesystem")}
            unit="B"
          />
        ) : null}
        {hasRestarts ? (
          <ResourceMetricChart
            config={RESTART_CONFIG}
            data={points}
            dataKey="restarts"
            icon={RotateCcw}
            title={t("resources.detail.metricsRestarts")}
            unit=""
          />
        ) : null}
        {hasHpaCurrent ? (
          <ResourceMetricChart
            config={HPA_CURRENT_CONFIG}
            data={points}
            dataKey="hpaCurrent"
            icon={Gauge}
            title={t("resources.detail.metricsHpaCurrent")}
            unit=""
          />
        ) : null}
        {hasHpaDesired ? (
          <ResourceMetricChart
            config={HPA_DESIRED_CONFIG}
            data={points}
            dataKey="hpaDesired"
            icon={Gauge}
            title={t("resources.detail.metricsHpaDesired")}
            unit=""
          />
        ) : null}
      </div>
      {series.resourceType === "pod" && series.currentObservation ? (
        <ContainerMetrics
          complete={series.currentObservation.containerMetricsComplete}
          containers={series.currentObservation.containers}
        />
      ) : null}
      {series.resourceType === "pod" && series.containerSeries !== undefined ? (
        <ContainerMetricsHistory
          completeness={series.containerHistoryCompleteness ?? "unavailable"}
          series={series.containerSeries}
        />
      ) : null}
    </div>
  );
}

function ContainerMetricsHistory({
  completeness,
  series,
}: {
  completeness: "exact" | "partial" | "unavailable";
  series: ResourceMetricContainerHistorySeries[];
}) {
  const { t } = useI18n();
  if (series.length === 0) {
    return completeness === "unavailable" ? (
      <section
        className="grid min-w-0 gap-2 rounded-xl border bg-card p-4 shadow-xs"
        data-slot="resource-container-metric-history"
      >
        <h3 className="truncate text-sm font-medium">
          {t("resources.detail.metricsContainerHistory")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("resources.detail.metricsContainersUnavailable")}
        </p>
      </section>
    ) : null;
  }
  return (
    <section
      className="grid min-w-0 gap-3 rounded-xl border bg-card p-4 shadow-xs"
      data-slot="resource-container-metric-history"
    >
      <header className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="truncate text-sm font-medium">
          {t("resources.detail.metricsContainerHistory")}
        </h3>
        {completeness === "exact" ? null : (
          <Badge variant="outline">
            {t("resources.detail.metricsContainersPartial")}
          </Badge>
        )}
      </header>
      <div className="grid min-w-0 gap-3">
        {series.map((container) => (
          <article className="grid min-w-0 gap-3 rounded-lg border p-3" key={container.name}>
            <h4 className="truncate text-sm font-medium" title={container.name}>
              {container.name}
            </h4>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <ContainerMetricHistoryChart
                config={CPU_CONFIG}
                data={container.points.map((point) => ({
                  time: Date.parse(point.observedAt),
                  value: point.cpuMillicores,
                }))}
                title={t("resources.detail.metricsCpu")}
                unit="m"
              />
              <ContainerMetricHistoryChart
                config={MEMORY_CONFIG}
                data={container.points.map((point) => ({
                  time: Date.parse(point.observedAt),
                  value: point.memoryMebibytes,
                }))}
                title={t("resources.detail.metricsMemory")}
                unit="MiB"
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ContainerMetricHistoryChart({
  config,
  data,
  title,
  unit,
}: {
  config: ChartConfig;
  data: Array<{ time: number; value: number | null }>;
  title: string;
  unit: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const points = data.filter((point) => Number.isFinite(point.time));
  const hasValue = points.some((point) => point.value !== null);
  const formatValue = (value: number) => `${formatNumber(value)}${unit}`;
  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-xs text-muted-foreground">{title}</span>
      {hasValue ? (
        <ChartContainer className="h-24 w-full aspect-auto" config={config}>
          <AreaChart accessibilityLayer data={points} margin={{ left: 0, right: 4, top: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              axisLine={false}
              dataKey="time"
              domain={["dataMin", "dataMax"]}
              hide
              type="number"
            />
            <YAxis axisLine={false} hide />
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
              dataKey="value"
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
              stroke="var(--color-value)"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}

function ContainerMetrics({
  complete,
  containers,
}: {
  complete: boolean;
  containers: ResourceMetricContainerObservation[];
}) {
  const { t } = useI18n();
  if (containers.length === 0) {
    return complete ? null : (
      <p className="text-xs text-muted-foreground">
        {t("resources.detail.metricsContainersUnavailable")}
      </p>
    );
  }
  const unavailable = t("common.value.unavailable");
  return (
    <section className="grid min-w-0 gap-2 rounded-xl border bg-card p-4 shadow-xs">
      <header className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="truncate text-sm font-medium">
          {t("resources.detail.metricsContainers")}
        </h3>
        {complete ? null : (
          <Badge variant="outline">
            {t("resources.detail.metricsContainersPartial")}
          </Badge>
        )}
      </header>
      <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
        {containers.map((container) => (
          <li
            className="flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2"
            key={container.name}
          >
            <span className="truncate text-sm font-medium" title={container.name}>
              {container.name}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {t("resources.detail.metricsContainerValue", {
                cpu: container.cpuMillicores === null
                  ? unavailable
                  : `${formatNumber(container.cpuMillicores)}m`,
                memory: container.memoryMebibytes === null
                  ? unavailable
                  : `${formatNumber(container.memoryMebibytes)}MiB`,
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResourceMetricChart({
  config,
  currentValue,
  data,
  dataKey,
  icon: Icon,
  title,
  unit,
}: {
  config: ChartConfig;
  currentValue?: number | null;
  data: MetricPoint[];
  dataKey: MetricDataKey;
  icon: LucideIcon;
  title: string;
  unit: string;
}) {
  const { t } = useI18n();
  const gradientId = useId().replace(/:/g, "");
  const stats = useMemo(
    () => metricStats(data, dataKey, currentValue),
    [currentValue, data, dataKey],
  );
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

function ResourceMetricsUnavailable({ retry }: { retry: ResourceMetricsUnavailableRetry | null }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-48 place-items-center rounded-xl border border-dashed p-6 text-center">
      <div className="grid justify-items-center gap-2 text-sm text-muted-foreground">
        <Activity aria-hidden="true" className="size-6" />
        <p>{t("resources.detail.metricsUnavailable")}</p>
        {retry === null ? null : (
          <p role="status">
            {retry.exhausted
              ? t("resources.detail.metricsRetryExhausted")
              : t("resources.detail.metricsRetrying", {
                  attempt: retry.attempt,
                  limit: retry.limit,
                })}
          </p>
        )}
      </div>
    </div>
  );
}

function metricStats(
  data: MetricPoint[],
  key: MetricDataKey,
  currentValue?: number | null,
) {
  const values = data.map((point) => point[key]).filter((value): value is number => value !== null);
  return {
    current: currentValue === undefined ? values[values.length - 1] ?? null : currentValue,
    peak: values.length === 0 ? null : Math.max(...values),
  };
}

type MetricDataKey = Exclude<keyof MetricPoint, "time">;

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
