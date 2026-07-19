import {
  Donut,
  MiniBars,
  RankList,
  type ChartTone,
} from "../../shared/ui/charts";
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
import { Metric, WidgetEmpty, WidgetResource } from "./HomeBoardWidgets";

export function NamespaceWidget({
  resource,
}: {
  resource: HomeBoardResource<HomeNamespacePodProjection>;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => {
        if (data.items.length === 0) return <WidgetEmpty />;
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
  hrefForItem,
  resource,
}: {
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
        if (data.items.length === 0 && countStatus === null) return <WidgetEmpty />;
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
            ) : <WidgetEmpty />}
          </div>
        );
      }}
    </WidgetResource>
  );
}

export function CostOverviewWidget({
  period,
  resource,
}: {
  period: string;
  resource: HomeBoardResource<HomeCostProjection | null>;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => {
        if (data === null || data.values.length === 0) return <WidgetEmpty />;
        return (
          <div className="grid gap-3">
            <div className="flex items-end justify-between gap-3">
              <Metric
                label={`${t("timeline.strip.range")} · ${period}`}
                value={formatCostMicros(data.periodTotalMicros, data.currency, formatNumber)}
              />
              <Metric
                label={t("cost.trend.title")}
                value={data.changePercent === null
                  ? "—"
                  : `${data.changePercent > 0 ? "+" : ""}${formatNumber(data.changePercent, {
                    maximumFractionDigits: 1,
                  })}%`}
              />
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
  hrefForEvent,
  resource,
}: {
  hrefForEvent: (sourceKey: string) => string;
  resource: HomeBoardResource<TimelineSnapshot | null>;
}) {
  const { formatDate, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(snapshot) => {
        if (snapshot === null || snapshot.events.length === 0) return <WidgetEmpty />;
        const events = [...snapshot.events]
          .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
          .slice(0, 5);
        return (
          <RankList
            ariaLabel={t("timeline.list.label")}
            items={events.map((event) => ({
              ariaLabel: event.title,
              description: [
                event.resource?.kind ?? event.source,
                event.resource?.name ?? event.scope.clusterId,
              ].join(" · "),
              displayValue: formatDate(new Date(event.occurredAt), {
                dateStyle: "short",
                timeStyle: "short",
              }),
              href: hrefForEvent(event.sourceKey),
              id: event.sourceKey,
              indicator: "dot",
              label: event.title,
              max: 1,
              tone: timelineSeverityTone(event.severity),
              value: null,
            }))}
          />
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
