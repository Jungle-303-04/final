import {
  Activity,
  CircleAlert,
  Link2,
  ListTree,
  TriangleAlert,
} from "lucide-react";
import type {
  ResourceDetail,
  ResourceIdentity,
  ResourceSummary,
} from "../../features/resources/resourcesContract";
import type { ResourceMetricTimeRange } from "../../features/resources/resourceMetricsHistoryContract";
import {
  useI18n,
  type I18nController,
  type TranslationFunction,
} from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { StatusMark } from "../../shared/ui/StatusMark";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import { Badge } from "../../shared/ui/primitives/badge";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../shared/ui/primitives/tabs";
import { DefinitionGrid, ResourceFactsPanel } from "./ResourceFactsPanel";
import { ResourceDetailLoadingPreview } from "./ResourcesLoadingPreview";
import type { ResourcesResourceState } from "./resourcesPageStateModel";
import { ResourceMetricsCharts } from "./ResourceMetricsCharts";
import type { ResourceMetricsHistoryFrame } from "./useResourceMetricsHistoryDataFrame";
import { ProviderResourceDetailPanel } from "./ProviderResourceDetailPanel";
import type { ResourceIssuesFrame } from "./useResourceIssuesDataFrame";
import { ResourceIssuesSection } from "../../features/issues/ResourceIssuesSection";
import { ResourceAccessPanel } from "./ResourceAccessPanel";
import type { ChecksPort } from "../../features/checks/checksContract";
import { ResourceChecksSection } from "./ResourceChecksSection";

export function ResourceDetailBody({
  detail,
  full,
  identity,
  metricHistory,
  metricRange,
  onMetricRangeChange,
  onNavigateResource,
  resourceIssues,
  checksPort,
  onTabChange,
  tab,
}: {
  detail: ResourcesResourceState<ResourceDetail>;
  full: boolean;
  identity: ResourceIdentity | null;
  metricHistory: ResourceMetricsHistoryFrame;
  metricRange: ResourceMetricTimeRange;
  onMetricRangeChange: (range: ResourceMetricTimeRange) => void;
  onNavigateResource: (identity: ResourceIdentity) => void;
  resourceIssues: ResourceIssuesFrame;
  checksPort?: ChecksPort;
  onTabChange: (tab: string) => void;
  tab: string;
}) {
  const { formatDate, t } = useI18n();
  if (!identity) {
    return (
      <DetailAlert title={t("resources.detail.invalid.title")}>
        {t("resources.detail.invalid.description")}
      </DetailAlert>
    );
  }
  if (detail.phase === "idle" || detail.phase === "loading") {
    return (
      <ProductStateScreen
        kind="loading"
        loadingPreview={<ResourceDetailLoadingPreview />}
        placement="content"
      />
    );
  }
  if (detail.phase === "failed") {
    if (detail.failure.code === "not-found") {
      return (
        <DetailAlert title={t("resources.detail.notFound.title")}>
          {t("resources.detail.notFound.description")}
        </DetailAlert>
      );
    }
    if (detail.failure.code === "forbidden") {
      return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
    }
    return (
      <DetailAlert title={t("resources.detail.failed.title")}>
        {t("resources.detail.failed.description")}
      </DetailAlert>
    );
  }
  const resource = detail.data.resource;
  const selectedTab = ["overview", "relations", "metrics", "events"].includes(tab)
    ? tab
    : "overview";
  return (
    <Tabs
      className="min-w-0 pt-4"
      onValueChange={(value) => { if (value) onTabChange(value); }}
      value={selectedTab}
    >
      <TabsList aria-label={t("resources.detail.tabs.aria")} className="w-full" variant="line">
        <TabsTrigger value="overview">{t("resources.detail.overview")}</TabsTrigger>
        <TabsTrigger value="relations">
          {t("resources.detail.relatedCount", { count: detail.data.related.length })}
        </TabsTrigger>
        <TabsTrigger value="metrics">{t("resources.detail.metrics")}</TabsTrigger>
        <TabsTrigger value="events">
          {t("resources.detail.eventsCount", { count: detail.data.events.length })}
        </TabsTrigger>
      </TabsList>
      <TabsContent className="grid gap-5 py-4" value="overview">
        {detail.refreshFailure ? (
          <DetailAlert title={t("resources.detail.refreshFailed.title")}>
            {t("resources.detail.refreshFailed.description")}
          </DetailAlert>
        ) : null}
        <section
          aria-labelledby="resource-status-title"
          className="relative isolate grid gap-4 overflow-hidden rounded-xl border bg-linear-to-br from-primary/8 via-card to-muted/40 p-4 shadow-xs"
          data-slot="resource-detail-summary"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 -z-10 size-48 rounded-full bg-primary/8 blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {resource.kind}
              </p>
              <OverflowIdentity
                className="font-heading text-lg font-semibold"
                render={<h3 aria-label={resource.name} id="resource-status-title" />}
                value={resource.name}
              />
            </div>
            <StatusMark label={resource.healthStatus} tone={resource.health} />
          </div>
          <DefinitionGrid entries={[
            [t("resources.detail.status"), resource.status || t("common.state.unknown")],
            [t("resources.detail.apiVersion"), resource.apiVersion || t("resources.detail.notProvided")],
            [t("resources.detail.observedAt"), formatObservedAt(resource.observedAt, formatDate, t)],
            [
              t("resources.detail.identity"),
              resource.identityStability === "uid"
                ? t("resources.detail.identity.uid")
                : t("resources.detail.identity.nameFallback"),
            ],
            ...(resource.uid ? [[t("resources.detail.uid"), resource.uid] as [string, string]] : []),
          ]} />
        </section>
        <ResourceFactsPanel facts={resource.facts} />
        {detail.data.access ? <ResourceAccessPanel access={detail.data.access} /> : null}
        {detail.data.providerDetail ? (
          <ProviderResourceDetailPanel
            detail={detail.data.providerDetail}
            metricHistory={metricHistory}
            resourceId={resource.inventoryKey}
          />
        ) : null}
        <ResourceIssuesSection frame={resourceIssues} />
        {checksPort ? <ResourceChecksSection detail={detail.data} port={checksPort} /> : null}
        {hasMetricPoints(metricHistory, resource.inventoryKey) ? (
          <ResourceMetricsCharts
            frame={metricHistory}
            onRangeChange={onMetricRangeChange}
            range={metricRange}
            resourceId={resource.inventoryKey}
            wide={full}
          />
        ) : <PointInTimeEvidenceUnavailable />}
      </TabsContent>
      <TabsContent className="grid gap-3 py-4" value="relations">
        {detail.data.related.length === 0 ? (
          <EmptySection icon={Link2} text={t("resources.detail.relatedEmpty")} />
        ) : detail.data.related.map((group) => (
          <section className="min-w-0 rounded-lg border p-4" key={group.name}>
            <h3 className="mb-3 min-w-0 font-medium [overflow-wrap:anywhere]">{group.name}</h3>
            <ul className="grid gap-2">
              {group.items.map((item) => (
                <li
                  className="flex min-w-0 items-center justify-between gap-3 text-sm"
                  key={item.id}
                >
                  <OverflowIdentity
                    className="h-auto min-w-0 flex-1 justify-start px-0 text-left"
                    render={(
                      <Button
                        data-slot="resource-related-identity"
                        onClick={() => onNavigateResource(resourceIdentity(item))}
                        type="button"
                        variant="link"
                      />
                    )}
                    value={`${item.kind} · ${item.namespace ?? t("resources.detail.clusterScope")}/${item.name}`}
                  />
                  <StatusMark label={item.healthStatus} tone={item.health} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <CompletenessNote />
      </TabsContent>
      <TabsContent className="grid gap-3 py-4" value="metrics">
        <ResourceMetricsCharts
          frame={metricHistory}
          onRangeChange={onMetricRangeChange}
          range={metricRange}
          resourceId={resource.inventoryKey}
          wide={full}
        />
      </TabsContent>
      <TabsContent className="grid gap-3 py-4" value="events">
        {detail.data.events.length === 0 ? (
          <EmptySection icon={ListTree} text={t("resources.detail.eventsEmpty")} />
        ) : detail.data.events.map((event) => (
          <section className="relative grid min-w-0 gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-xs" key={event.id}>
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-1 bg-warning"
            />
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <OverflowIdentity
                className="min-w-0 font-medium"
                render={<h3 data-slot="resource-event-title" />}
                value={event.facts.type === "event" && event.facts.reason
                  ? event.facts.reason
                  : event.name}
              />
              <StatusMark label={event.healthStatus} tone={event.health} />
            </div>
            {event.facts.type === "event" && event.facts.message ? (
              <p
                className="min-w-0 whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]"
                data-slot="resource-event-message"
              >
                {event.facts.message}
              </p>
            ) : null}
            {event.facts.type === "event" ? (
              <div className="flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
                {event.facts.reportingComponent ? (
                  <Badge variant="outline">{event.facts.reportingComponent}</Badge>
                ) : null}
                {event.facts.occurrenceCount === null ? null : (
                  <Badge variant="outline">
                    {t("resources.detail.fact.count")} · {event.facts.occurrenceCount}
                  </Badge>
                )}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {formatObservedAt(event.observedAt, formatDate, t)}
            </p>
          </section>
        ))}
        <CompletenessNote />
      </TabsContent>
    </Tabs>
  );
}

function resourceIdentity(resource: ResourceSummary): ResourceIdentity {
  return {
    resourceType: resource.resourceType,
    kind: resource.kind,
    namespace: resource.namespace,
    name: resource.name,
  };
}

function hasMetricPoints(frame: ResourceMetricsHistoryFrame, resourceId: string): boolean {
  return frame.phase === "ready" && frame.data.series.some(
    (series) => series.resourceId === resourceId && series.points.length > 0,
  );
}

function PointInTimeEvidenceUnavailable() {
  const { t } = useI18n();
  const rows = [
    { icon: Activity, label: t("resources.detail.history.metrics") },
    { icon: TriangleAlert, label: t("resources.detail.history.incident") },
  ];
  return (
    <section
      aria-labelledby="resource-history-title"
      className="grid gap-3 rounded-lg border p-4"
      data-slot="resource-history-unavailable"
    >
      <div className="grid gap-1">
        <h3 className="font-medium" id="resource-history-title">
          {t("resources.detail.history.title")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("resources.detail.history.description")}
        </p>
      </div>
      <ul className="grid gap-2">
        {rows.map(({ icon: Icon, label }) => (
          <li className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2" key={label}>
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </span>
            <Badge variant="outline">{t("common.state.unavailable")}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptySection({ icon: Icon, text }: { icon: typeof Link2; text: string }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center">
      <div className="grid justify-items-center gap-2 text-sm text-muted-foreground">
        <Icon aria-hidden="true" className="size-6" />
        <p>{text}</p>
      </div>
    </div>
  );
}

function CompletenessNote() {
  const { t } = useI18n();
  return <p className="text-xs text-muted-foreground">{t("resources.detail.completeness")}</p>;
}

function DetailAlert({ children, title }: { children: string; title: string }) {
  return (
    <Alert className="mt-4">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

function formatObservedAt(
  value: string | null,
  formatDate: I18nController["formatDate"],
  t: TranslationFunction,
): string {
  if (!value) return t("resources.detail.observedAtMissing");
  return formatDate(new Date(value), { dateStyle: "short", timeStyle: "short" });
}
