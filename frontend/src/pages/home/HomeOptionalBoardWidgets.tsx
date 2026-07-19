import {
  MiniBars,
  RankList,
  type ChartTone,
} from "../../shared/ui/charts";
import { cn } from "@/shared/lib/cn";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import { productResourceHealthHref } from "../../features/filters/filterUrl";
import { useI18n } from "../../shared/i18n";
import { formatCostMicros } from "../../features/cost/costFormat";
import type { ResourcesFilterResourceItem } from "../../features/resources/resourcesFilterContract";
import type { TimelineSnapshot } from "../../features/timeline/timelineContract";
import type {
  HomeBoardResource,
  HomeCriticalResourcesProjection,
  HomeCostProjection,
} from "./useHomeBoardData";
import { WidgetEmpty, WidgetResource } from "./HomeBoardWidgets";

export { NamespaceWidget } from "./HomeNamespaceWidget";

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
  return productResourceHealthHref(href, [health]);
}

function attentionResourcesHref(href: string): string {
  return productResourceHealthHref(href, ["critical", "warning"]);
}

function timelineSeverityTone(severity: "info" | "warning" | "critical" | "unknown"): ChartTone {
  if (severity === "info") return "primary";
  return severity;
}
