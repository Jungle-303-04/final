import {
  Donut,
  MiniBars,
  RankList,
  type ChartTone,
} from "../../shared/ui/charts";
import { cn } from "@/shared/lib/cn";
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
  const { formatNumber, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => {
        if (data.items.length === 0) return <WidgetEmpty href={href} />;
        const top = data.items.slice(0, 5);
        const other = data.items.slice(5).reduce((sum, item) => sum + item.pods, 0);
        const visible = other > 0
          ? [...top, { namespace: "…", pods: other }]
          : top;
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
                centerLabel={formatNumber(visible.reduce((sum, item) => sum + item.pods, 0))}
                segments={visible.map((item, index) => ({
                  id: item.namespace,
                  tone: tones[index] ?? "unknown",
                  value: item.pods,
                }))}
              />
              <ul className="grid min-w-0 gap-1.5">
                {visible.map((item, index) => (
                  <li
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-caption"
                    key={item.namespace}
                  >
                    <span
                      aria-hidden="true"
                      className={toneDotClass(tones[index] ?? "unknown")}
                    />
                    <span className="truncate">{item.namespace}</span>
                    <strong className="font-mono tabular-nums">
                      {formatNumber(item.pods)}
                    </strong>
                  </li>
                ))}
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
        if (data.items.length === 0 && countStatus === null) return <WidgetEmpty href={emptyHref} />;
        return (
          <div className="grid gap-2">
            {countStatus ? (
              <p className="text-caption text-muted-foreground" role="status">
                {countStatus}
              </p>
            ) : null}
            {data.items.length > 0 ? (
              <RankList
                ariaLabel={`${t("status.tone.critical")} · ${t("resources.catalog.aria")}`}
                items={data.items.map((item) => ({
                  ariaLabel: `${item.resource.kind} ${item.resource.name}`,
                  description: [
                    item.resource.namespace,
                    item.resource.healthStatus || item.resource.status,
                  ].filter(Boolean).join(" · "),
                  displayValue: item.resource.status,
                  href: hrefForItem(item),
                  id: item.resource.inventoryKey,
                  indicator: "dot",
                  label: item.resource.name,
                  max: 1,
                  tone: "critical",
                  value: null,
                }))}
              />
            ) : <WidgetEmpty href={emptyHref} />}
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
  period: string;
  resource: HomeBoardResource<HomeCostProjection | null>;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => {
        if (data === null || data.values.length === 0) return <WidgetEmpty href={href} />;
        return (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <span className="flex items-baseline gap-[7px]">
                <span className="font-mono text-kpi font-extrabold tracking-[-0.02em] tabular-nums text-foreground">
                  {formatCostMicros(data.periodTotalMicros, data.currency, formatNumber)}
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
              </span>
              <span className="text-label text-muted-foreground">
                {`${t("timeline.strip.range")} · ${period}`}
              </span>
            </div>
            <MiniBars
              ariaLabel={t("cost.trend.title")}
              tone={data.changePercent !== null && data.changePercent > 0 ? "warning" : "primary"}
              values={data.values}
            />
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
                      <a
                        className="min-w-0 truncate rounded-md pb-3 pr-1 text-label-2 font-semibold text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60"
                        href={hrefForEvent(event.sourceKey)}
                        title={event.title}
                      >
                        {event.title}
                      </a>
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
