import {
  Donut,
  MiniBars,
  RankList,
  type ChartTone,
} from "../../shared/ui/charts";
import { cn } from "@/shared/lib/cn";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import { serializeProductFilterUrl } from "../../features/filters/filterUrl";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n } from "../../shared/i18n";
import { formatCostMicros } from "../../features/cost/costFormat";
import type { ResourcesFilterResourceItem } from "../../features/resources/resourcesFilterContract";
import type { TimelineSnapshot } from "../../features/timeline/timelineContract";
import type {
  HomeBoardResource,
  HomeCriticalResourcesProjection,
  HomeCostProjection,
  HomeNamespacePodProjection,
} from "./useHomeBoardData";
import { WidgetEmpty, WidgetResource } from "./HomeBoardWidgets";

export function NamespaceWidget({
  href,
  resource,
}: {
  href: string;
  resource: HomeBoardResource<HomeNamespacePodProjection>;
}) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => {
        if (data.items.length === 0) return <WidgetEmpty href={href} />;
        const top = data.items.slice(0, 5);
        const other = data.items.slice(5).reduce((sum, item) => sum + item.pods, 0);
        const visible = other > 0
          ? [...top, { clusterIds: [], namespace: "…", pods: other }]
          : top;
        const total = visible.reduce((sum, item) => sum + item.pods, 0);
        const tones: readonly ChartTone[] = [
          "primary",
          "healthy",
          "warning",
          "critical",
          "stale",
          "unknown",
        ];
        return (
          <div className="grid gap-2">
            {data.incompleteClusterIds.length > 0 ? (
              <p className="text-caption text-muted-foreground" role="status">
                {t("common.state.partial")}
              </p>
            ) : null}
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-4">
              <Donut
                ariaLabel={t("metrics.preset.namespacePodCount.name")}
                segments={visible.map((item, index) => ({
                  id: item.namespace,
                  tone: tones[index] ?? "unknown",
                  value: item.pods,
                }))}
              />
              <ul className="grid min-w-0 gap-1.5">
                {visible.map((item, index) => {
                  const namespaceHref = item.namespace === "…"
                    ? null
                    : namespaceFilterHref(filter, item.clusterIds, item.namespace);
                  return (
                    <NamespaceLegendRow
                      count={formatNumber(item.pods)}
                      href={namespaceHref}
                      key={item.namespace}
                      label={item.namespace}
                      percent={total > 0
                        ? `${formatNumber(Math.round((item.pods / total) * 100))}%`
                        : "—"}
                      tone={tones[index] ?? "unknown"}
                    />
                  );
                })}
              </ul>
            </div>
          </div>
        );
      }}
    </WidgetResource>
  );
}

export function CriticalResourcesWidget({
  emptyHref,
  hrefForItem,
  resource,
}: {
  emptyHref: string;
  hrefForItem: (item: ResourcesFilterResourceItem) => string;
  resource: HomeBoardResource<HomeCriticalResourcesProjection>;
}) {
  const { t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => {
        const countStatus = data.filteredCountCompleteness === "partial"
          ? t("common.state.partial")
          : data.filteredCountCompleteness === "unavailable" || data.filteredCount === null
          ? t("resources.list.unknownTotal")
          : null;
        if (data.items.length === 0 && countStatus === null) {
          return <WidgetEmpty href={attentionResourcesHref(emptyHref)} />;
        }
        const items = [...data.items].sort(compareAttentionResources);
        return (
          <div className="grid gap-2">
            {countStatus ? (
              <p className="text-caption text-muted-foreground" role="status">
                {countStatus}
              </p>
            ) : null}
            {items.length > 0 ? (
              <RankList
                ariaLabel={t("shell.home.widget.attentionResources")}
                items={items.map((item) => ({
                  ariaLabel: `${item.resource.kind} ${item.resource.name}`,
                  description: [
                    item.resource.namespace,
                    item.resource.healthStatus || item.resource.status,
                  ].filter(Boolean).join(" · "),
                  displayValue: item.resource.status,
                  href: resourceHealthDetailHref(hrefForItem(item), item.resource.health),
                  id: item.resource.inventoryKey,
                  indicator: "dot",
                  label: item.resource.name,
                  max: 1,
                  tone: item.resource.health,
                  value: null,
                }))}
              />
            ) : <WidgetEmpty href={attentionResourcesHref(emptyHref)} />}
          </div>
        );
      }}
    </WidgetResource>
  );
}

export function CostOverviewWidget({
  href,
  period,
  resource,
}: {
  href: string;
  period: HomeBoardPeriod;
  resource: HomeBoardResource<HomeCostProjection | null>;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => {
        if (data === null) return <WidgetEmpty href={href} />;
        const values = data.values.slice(-8);
        const trendRange = period === "today"
          ? t("cost.trend.range.24h")
          : period === "7d"
            ? t("cost.trend.range.7d")
            : t("cost.trend.range.home30d");
        return (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <span className="font-mono text-kpi font-extrabold tracking-[-0.02em] tabular-nums text-foreground">
                {formatCostMicros(data.periodTotalMicros, data.currency, formatNumber)}
              </span>
              <span className="text-label text-muted-foreground">
                {t("cost.summary.monthly")}
              </span>
            </div>
            {values.length > 0 ? (
              <>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-caption text-caption-foreground">
                    {t("cost.trend.title")} · {trendRange}
                  </span>
                  {data.changePercent !== null ? (
                    <span
                      className={
                        data.changePercent > 0
                          ? "rounded-full bg-status-warning/15 px-2 py-0.5 font-mono text-caption-2 font-bold tabular-nums text-warning-foreground"
                          : "rounded-full bg-status-healthy/12 px-2 py-0.5 font-mono text-caption-2 font-bold tabular-nums text-status-healthy"
                      }
                    >
                      {`${data.changePercent > 0 ? "+" : ""}${formatNumber(data.changePercent, { maximumFractionDigits: 1 })}%`}
                    </span>
                  ) : null}
                </div>
                <MiniBars
                  ariaLabel={t("cost.trend.title")}
                  currentIndex={values.length - 1}
                  tone={data.changePercent !== null && data.changePercent > 0 ? "warning" : "primary"}
                  values={values}
                />
              </>
            ) : (
              <span className="text-caption text-caption-foreground">
                {t("cost.trend.unavailable")}
              </span>
            )}
          </div>
        );
      }}
    </WidgetResource>
  );
}

export function RecentTimelineWidget({
  href,
  hrefForEvent,
  resource,
}: {
  href: string;
  hrefForEvent: (sourceKey: string) => string;
  resource: HomeBoardResource<TimelineSnapshot | null>;
}) {
  const { formatDate, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(snapshot) => {
        if (snapshot === null || snapshot.events.length === 0) return <WidgetEmpty href={href} />;
        const events = [...snapshot.events]
          .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
          .slice(0, 5);
        const stacks = [events.slice(0, Math.ceil(events.length / 2)), events.slice(Math.ceil(events.length / 2))]
          .filter((stack) => stack.length > 0);
        return (
          <div
            aria-label={t("timeline.list.label")}
            className="grid min-w-0 grid-cols-1 gap-x-7 min-[1024px]:grid-cols-2"
            role="list"
          >
            {stacks.map((stack, stackIndex) => (
              <div className="grid min-w-0 content-start" key={stackIndex}>
                {stack.map((event, index) => {
                  const tone = timelineSeverityTone(event.severity);
                  return (
                    <div className="flex min-w-0 items-start gap-2.5" key={event.sourceKey} role="listitem">
                      <span className="w-[52px] shrink-0 pt-0.5 text-right font-mono text-micro tabular-nums text-caption-foreground">
                        {formatDate(new Date(event.occurredAt), { timeStyle: "short" })}
                      </span>
                      <span className="flex shrink-0 flex-col items-center self-stretch">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-[3px] size-[9px] rounded-full border-2",
                            tone === "critical" && "border-status-critical bg-status-critical",
                            tone === "warning" && "border-status-warning bg-transparent",
                            tone === "primary" && "border-primary bg-transparent",
                            tone === "unknown" && "border-status-unknown bg-transparent",
                          )}
                        />
                        {index < stack.length - 1 ? (
                          <span aria-hidden="true" className="min-h-3.5 w-px flex-1 border-l-[1.5px] border-dashed border-border" />
                        ) : null}
                      </span>
                      <Link
                        className="min-w-0 truncate rounded-md pb-3 pr-1 text-label-2 font-semibold text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60"
                        to={hrefForEvent(event.sourceKey)}
                        title={event.title}
                      >
                        {event.title}
                        <ChevronRight aria-hidden="true" className="ml-0.5 inline size-[11px] text-caption-foreground" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      }}
    </WidgetResource>
  );
}

function NamespaceLegendRow({
  count,
  href,
  label,
  percent,
  tone,
}: {
  count: string;
  href: string | null;
  label: string;
  percent: string;
  tone: ChartTone;
}) {
  const className = [
    "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center",
    "gap-2 rounded-md px-1 py-0.5 text-caption",
  ].join(" ");
  const content = (
    <>
      <span aria-hidden="true" className={toneDotClass(tone)} />
      <span className="truncate">{label}</span>
      <strong className="font-mono tabular-nums">{count}</strong>
      <span className="w-8 text-right font-mono tabular-nums text-caption-foreground">
        {percent}
      </span>
    </>
  );
  return (
    <li className="min-w-0">
      {href ? (
        <Link
          aria-label={`${label} · ${count} · ${percent}`}
          className={cn(className, "outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60")}
          to={href}
        >
          {content}
        </Link>
      ) : (
        <span className={className}>{content}</span>
      )}
    </li>
  );
}

function namespaceFilterHref(
  filter: ReturnType<typeof useUnifiedFilter>,
  scopedClusterIds: readonly string[],
  namespace: string,
): string | null {
  const clusterIds = [...new Set(scopedClusterIds)];
  if (clusterIds.length === 0) return null;
  return `/resources${serializeProductFilterUrl({
    ...filter.state,
    common: {
      ...filter.state.common,
      clusters: clusterIds,
      namespaces: clusterIds.map((clusterId) => ({ clusterId, namespace })),
    },
    resources: {
      ...filter.state.resources,
      view: "table",
    },
  }, {
    ...filter.detail,
    resourceSurfaceView: "list",
  })}`;
}

const ATTENTION_PRIORITY = {
  critical: 0,
  warning: 1,
  stale: 2,
  unknown: 3,
  healthy: 4,
} as const;

function compareAttentionResources(
  left: ResourcesFilterResourceItem,
  right: ResourcesFilterResourceItem,
): number {
  const priority = ATTENTION_PRIORITY[left.resource.health]
    - ATTENTION_PRIORITY[right.resource.health];
  if (priority !== 0) return priority;
  const recency = resourceObservationTime(right) - resourceObservationTime(left);
  if (recency !== 0) return recency;
  return left.resource.name.localeCompare(right.resource.name);
}

function resourceObservationTime(item: ResourcesFilterResourceItem): number {
  const value = Date.parse(item.resource.lastSeenAt ?? item.resource.observedAt ?? "");
  return Number.isFinite(value) ? value : 0;
}

function resourceHealthDetailHref(
  href: string,
  health: ResourcesFilterResourceItem["resource"]["health"],
): string {
  return resourceHealthHref(href, health);
}

function attentionResourcesHref(href: string): string {
  return resourceHealthHref(href, "critical,warning");
}

function resourceHealthHref(href: string, health: string): string {
  const [pathAndQuery = "", hash] = href.split("#", 2);
  const [path = "", query] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("resources.health", health);
  const serialized = params.toString();
  return `${path}${serialized ? `?${serialized}` : ""}${hash ? `#${hash}` : ""}`;
}

function toneDotClass(tone: ChartTone): string {
  const classes: Record<ChartTone, string> = {
    critical: "size-2 rounded-full bg-status-critical",
    healthy: "size-2 rounded-full bg-status-healthy",
    primary: "size-2 rounded-full bg-primary",
    stale: "size-2 rounded-full bg-status-stale",
    unknown: "size-2 rounded-full bg-status-unknown",
    warning: "size-2 rounded-full bg-status-warning",
  };
  return classes[tone];
}

function timelineSeverityTone(severity: "info" | "warning" | "critical" | "unknown"): ChartTone {
  if (severity === "info") return "primary";
  return severity;
}
