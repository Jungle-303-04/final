import { Boxes, Cpu, MemoryStick, ServerCog, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type {
  HomeClusterChoice,
  HomeNodeCollection,
  HomeClusterOverview,
} from "../../features/home/homeContract";
import { ClusterProviderIcon } from "../../features/cluster-scope/ClusterProviderIcon";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { Metric } from "../../shared/ui/Metric";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";
import { Progress } from "../../shared/ui/primitives/progress";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { HomeRefreshFailure, HomeSectionFailure } from "./HomeSectionFeedback";
import type { HomeResourceState } from "./useHomePageState";

const HEALTH_BODY_CLASS_NAME =
  "grid min-h-[20.75rem] min-w-0 divide-y sm:min-h-[17.75rem] lg:min-h-[12.75rem]";
const HEALTH_METRICS_CLASS_NAME =
  "grid min-w-0 grid-cols-2 divide-x lg:grid-cols-4";
const HEALTH_USAGE_CLASS_NAME = "grid gap-4 p-4 sm:grid-cols-2";
const HEALTH_META_CLASS_NAME =
  "flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-xs text-muted-foreground";

export function HomeClusterHealth({
  cluster,
  links,
  nodes,
  overview,
  onRefresh,
}: {
  cluster: HomeClusterChoice | null;
  links: HomeClusterHealthLinks;
  nodes: HomeResourceState<HomeNodeCollection>;
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
        <div className="flex min-w-0 items-center gap-2">
          {cluster ? <ClusterProviderIcon provider={cluster.provider} /> : null}
          <h2 className="truncate text-base font-semibold" id="cluster-health-title">
            {t("home.section.clusterStatus")}
          </h2>
        </div>
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
          <HealthContent
            cluster={cluster}
            links={links}
            nodes={nodes}
            overview={overview.data}
          />
        </>
      )}
    </Surface>
  );
}

export interface HomeClusterHealthLinks {
  incidents: string;
  nodes: string;
  pods: string;
  restarts: string;
  warnings: string;
  workloads: string;
}

function HealthContent({
  cluster,
  links,
  nodes,
  overview,
}: {
  cluster: HomeClusterChoice | null;
  links: HomeClusterHealthLinks;
  nodes: HomeResourceState<HomeNodeCollection>;
  overview: HomeClusterOverview;
}) {
  const { formatNumber, t } = useI18n();
  const usage = overview.usage;
  const nodeKubernetesVersions = nodes.phase === "ready"
    ? Array.from(new Set(
      nodes.data.nodes
        .map((node) => node.kubernetesVersion)
        .filter((version): version is string => version !== null),
    )).sort((left, right) => left.localeCompare(right))
    : [];
  const kubernetesVersions = nodeKubernetesVersions.length > 0
    ? nodeKubernetesVersions
    : cluster?.kubernetesVersion
      ? [cluster.kubernetesVersion]
      : [];
  return (
    <div
      className={HEALTH_BODY_CLASS_NAME}
      data-slot="home-cluster-health-body"
    >
      <div
        className={HEALTH_METRICS_CLASS_NAME}
        data-slot="home-cluster-health-metrics"
      >
        <MetricLink href={links.pods}>
          <Metric
            label={t("home.metric.pods")}
            unavailableLabel={t("common.value.unavailable")}
            value={usage
              ? t("home.metric.podValue", {
                running: formatNumber(usage.podsRunning),
                total: formatNumber(usage.podsTotal),
              })
              : cluster?.podCount == null
                ? null
                : formatNumber(cluster.podCount)}
          />
        </MetricLink>
        <MetricLink href={links.nodes}>
          <Metric
            label={t("home.metric.nodes")}
            unavailableLabel={t("common.value.unavailable")}
            value={usage
              ? t("home.metric.nodeValue", {
                ready: formatNumber(usage.nodesReady),
                total: formatNumber(usage.nodesTotal),
              })
              : cluster?.nodeCount == null
                ? null
                : formatNumber(cluster.nodeCount)}
          />
        </MetricLink>
        <MetricLink href={links.restarts}>
          <Metric
            label={t("home.metric.recentRestarts")}
            unavailableLabel={t("common.value.unavailable")}
            value={usage === null ? null : formatNumber(usage.restartCount)}
          />
        </MetricLink>
        <MetricLink href={links.incidents}>
          <Metric
            label={t("home.metric.activeIncidents")}
            note={t("home.metric.displayedWarnings", {
              warnings: formatNumber(overview.warnings.length),
            })}
            tone={(cluster?.incidentCount ?? 0) > 0 ? "critical" : "neutral"}
            unavailableLabel={t("common.value.unavailable")}
            value={cluster?.incidentCount == null
              ? null
              : formatNumber(cluster.incidentCount)}
          />
        </MetricLink>
      </div>
      <div className={HEALTH_USAGE_CLASS_NAME} data-slot="home-cluster-health-usage">
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
      <div className={HEALTH_META_CLASS_NAME} data-slot="home-cluster-health-meta">
        <a className="inline-flex items-center gap-1.5 hover:text-foreground" href={links.workloads}>
          <Boxes aria-hidden="true" className="size-3.5" />
          {t("home.metric.workloads", { count: formatNumber(overview.workloads.length) })}
        </a>
        <a className="inline-flex items-center gap-1.5 hover:text-foreground" href={links.warnings}>
          <TriangleAlert aria-hidden="true" className="size-3.5" />
          {t("home.metric.displayedWarnings", {
            warnings: formatNumber(overview.warnings.length),
          })}
        </a>
        <span
          className="inline-flex min-w-0 items-center gap-1.5"
          title={kubernetesVersions.join(", ") || undefined}
        >
          <ServerCog aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">
            {kubernetesVersions.length === 0
              ? t("home.metric.kubernetesVersionsUnavailable")
              : t("home.metric.kubernetesVersions", {
                versions: kubernetesVersions.join(", "),
              })}
          </span>
        </span>
      </div>
    </div>
  );
}

function MetricLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a
      className="min-w-0 rounded-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      {children}
    </a>
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
          className="[&_[data-slot=progress-indicator]]:duration-(--motion-value)"
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
    <div
      aria-atomic="true"
      aria-live="polite"
      className={HEALTH_BODY_CLASS_NAME}
      data-slot="home-cluster-health-body"
      role="status"
    >
      <div
        className={HEALTH_METRICS_CLASS_NAME}
        data-slot="home-cluster-health-metrics"
      >
        <span className="sr-only">
          {t("home.section.loading", { label: t("home.section.clusterSummary") })}
        </span>
        {Array.from({ length: 4 }, (_, index) => (
          <MetricSkeleton key={index} note={index === 3} />
        ))}
      </div>
      <div className={HEALTH_USAGE_CLASS_NAME} data-slot="home-cluster-health-usage">
        <UsageProgressSkeleton />
        <UsageProgressSkeleton />
      </div>
      <div className={HEALTH_META_CLASS_NAME} data-slot="home-cluster-health-meta">
        <Skeleton aria-hidden="true" className="h-4 w-24" />
      </div>
    </div>
  );
}

function MetricSkeleton({ note }: { note: boolean }) {
  return (
    <div className="grid min-w-0 gap-1 p-4">
      <Skeleton aria-hidden="true" className="h-4 w-16 max-w-full" />
      <Skeleton aria-hidden="true" className="h-7 w-24 max-w-full" />
      {note ? <Skeleton aria-hidden="true" className="h-4 w-20 max-w-full" /> : null}
    </div>
  );
}

function UsageProgressSkeleton() {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-3">
        <Skeleton aria-hidden="true" className="h-4 w-24 max-w-[70%]" />
        <Skeleton aria-hidden="true" className="h-4 w-10" />
      </div>
      <Skeleton aria-hidden="true" className="h-2 w-full rounded-full" />
    </div>
  );
}
