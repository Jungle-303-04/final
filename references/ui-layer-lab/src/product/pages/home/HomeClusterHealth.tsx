import { Boxes, Cpu, MemoryStick } from "lucide-react";
import type { ReactNode } from "react";
import type {
  HomeClusterChoice,
  HomeClusterOverview,
} from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { Metric } from "../../shared/ui/Metric";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";
import { Progress } from "../../shared/ui/primitives/progress";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { HomeRefreshFailure, HomeSectionFailure } from "./HomeSectionFeedback";
import type { HomeResourceState } from "./useHomePageState";

export function HomeClusterHealth({
  cluster,
  overview,
  onRefresh,
}: {
  cluster: HomeClusterChoice | null;
  overview: HomeResourceState<HomeClusterOverview>;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const busy = overview.phase === "loading" || overview.phase === "idle" ||
    (overview.phase === "ready" && overview.refreshing);
  return (
    <Surface
      aria-busy={busy || undefined}
      aria-labelledby="cluster-health-title"
      className="grid min-w-0 gap-0 overflow-hidden"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b p-4">
        <h2 className="truncate text-base font-semibold" id="cluster-health-title">
          {t("home.section.clusterStatus")}
        </h2>
        {overview.phase === "ready" ? (
          <StatusMark tone={overview.data.health} />
        ) : overview.phase === "failed" ? (
          <StatusMark label={t("home.section.clusterSummaryError")} tone="critical" />
        ) : cluster ? (
          <StatusMark label={t("home.section.statusChecking")} tone="unknown" />
        ) : null}
      </div>

      {overview.phase === "loading" || overview.phase === "idle" ? (
        <HealthSkeleton />
      ) : overview.phase === "failed" ? (
        <HomeSectionFailure
          failure={overview.failure}
          label={t("home.section.clusterSummary")}
          onRetry={onRefresh}
        />
      ) : (
        <>
          <HomeRefreshFailure
            failure={overview.refreshFailure}
            label={t("home.section.clusterSummary")}
            onRetry={onRefresh}
          />
          <HealthContent cluster={cluster} overview={overview.data} />
        </>
      )}
    </Surface>
  );
}

function HealthContent({
  cluster,
  overview,
}: {
  cluster: HomeClusterChoice | null;
  overview: HomeClusterOverview;
}) {
  const { formatNumber, t } = useI18n();
  const usage = overview.usage;
  return (
    <div className="grid min-w-0 divide-y">
      <div className="grid min-w-0 grid-cols-2 divide-x lg:grid-cols-4">
        <Metric
          label={t("home.metric.pods")}
          unavailableLabel={t("common.value.unavailable")}
          value={usage
            ? t("home.metric.podValue", {
              running: formatNumber(usage.podsRunning),
              total: formatNumber(usage.podsTotal),
            })
            : cluster?.podCount === undefined
              ? null
              : formatNumber(cluster.podCount)}
        />
        <Metric
          label={t("home.metric.nodes")}
          unavailableLabel={t("common.value.unavailable")}
          value={usage
            ? t("home.metric.nodeValue", {
              ready: formatNumber(usage.nodesReady),
              total: formatNumber(usage.nodesTotal),
            })
            : cluster?.nodeCount === undefined
              ? null
              : formatNumber(cluster.nodeCount)}
        />
        <Metric
          label={t("home.metric.recentRestarts")}
          unavailableLabel={t("common.value.unavailable")}
          value={usage === null ? null : formatNumber(usage.restartCount)}
        />
        <Metric
          label={t("home.metric.activeIncidents")}
          note={t("home.metric.displayedWarnings", {
            warnings: formatNumber(overview.warnings.length),
          })}
          tone={(cluster?.incidentCount ?? 0) > 0 ? "critical" : "neutral"}
          unavailableLabel={t("common.value.unavailable")}
          value={cluster?.incidentCount === undefined
            ? null
            : formatNumber(cluster.incidentCount)}
        />
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <UsageProgress
          icon={<Cpu aria-hidden="true" />}
          label={t("home.metric.cpuUsage")}
          value={usage?.cpuPercent ?? null}
        />
        <UsageProgress
          icon={<MemoryStick aria-hidden="true" />}
          label={t("home.metric.memoryUsage")}
          value={usage?.memoryPercent ?? null}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Boxes aria-hidden="true" className="size-3.5" />
          {t("home.metric.workloads", { count: formatNumber(overview.workloads.length) })}
        </span>
      </div>
    </div>
  );
}

function UsageProgress({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | null;
}) {
  const { formatNumber, t } = useI18n();
  const formattedValue = value === null ? null : formatNumber(value, { maximumFractionDigits: 2 });
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className="[&_svg]:size-3.5">{icon}</span>{label}
        </span>
        <span className="font-mono text-muted-foreground">
          {value === null ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t("common.state.unavailable")}</span>
            </>
          ) : `${formattedValue}%`}
        </span>
      </div>
      {value === null ? (
        <div aria-hidden="true" className="h-2 w-full rounded-full bg-secondary" />
      ) : (
        <Progress
          aria-label={label}
          value={Math.max(0, Math.min(value, 100))}
          valueText={value > 100
            ? t("home.metric.progressCapped", { value: formattedValue ?? "" })
            : `${formattedValue}%`}
        />
      )}
    </div>
  );
}

function HealthSkeleton() {
  const { t } = useI18n();
  return (
    <div aria-atomic="true" aria-live="polite" className="grid gap-4 p-4" role="status">
      <span className="sr-only">
        {t("home.section.loading", { label: t("home.section.clusterSummary") })}
      </span>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-16" key={index} />
        ))}
      </div>
      <Skeleton aria-hidden="true" className="h-10" />
    </div>
  );
}
