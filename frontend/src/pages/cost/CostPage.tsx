import { Activity, Coins } from "lucide-react";

import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import {
  CostPortFailure,
  type CostOverview,
  type CostPort,
  type CostTimeRange,
} from "../../features/cost/costContract";
import { CostTrendChart } from "../../features/cost/CostTrendChart";
import { CostViewTabs, type CostView } from "../../features/cost/CostViewTabs";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { NamespaceFilterRef } from "../../features/filters/filterContract";
import { namespaceSelector, normalizeNamespaceRefs } from "../../features/filters/filterUrlSyntax";
import type { RightsizingPort } from "../../features/rightsizing/rightsizingContract";
import type { RightsizingClusterScope } from "../../features/rightsizing/useRightsizingScans";
import { RefreshAction } from "../../motion/RefreshAction";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { AvailabilityReasons, CostScopeCard } from "./CostScopeCard";
import { useCostOverview } from "./useCostOverviewData";
import { CostNodesPanel } from "./CostNodesPanel";
import { RightsizingScanView } from "./RightsizingScanView";

export function CostPage({
  port,
  rightsizingPort,
}: {
  port: CostPort;
  rightsizingPort: RightsizingPort;
}) {
  const { t } = useI18n();
  const filter = useUnifiedFilter();
  const view = filter.detail.tab === "trend"
    ? "trend"
    : filter.detail.tab === "rightsizing"
      ? "rightsizing"
      : "overview";
  const timeRange = filter.detail.costRange ?? "24h";
  const clusterScope = useClusterScope();
  const selection = scopeSelection(clusterScope);
  if (selection.kind === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (selection.kind === "empty") return <ProductStateScreen kind="empty" placement="content" />;
  if (selection.kind === "error") {
    return <ProductStateScreen kind="error" issue={{ code: "unknown", safeDetail: t("cost.scope.selectionUnavailable") }} placement="content" />;
  }
  return (
    <CostReadyPage
      clusterIds={selection.clusterIds}
      onTimeRangeChange={(value) => filter.updateDetail((current) => ({
        ...current,
        costRange: value === "24h" ? undefined : value,
      }), "time-range")}
      onViewChange={(value) => filter.updateDetail((current) => ({
        ...current,
        tab: value === "overview" ? null : value,
      }), "detail-tab")}
      port={port}
      namespaces={normalizeNamespaceRefs(filter.state.common.namespaces).map(namespaceSelector)}
      rightsizingPort={rightsizingPort}
      rightsizingScopes={rightsizingScopes(
        selection.rightsizingClusterIds,
        filter.state.common.namespaces,
      )}
      timeRange={timeRange}
      view={view}
    />
  );
}

function CostReadyPage({
  clusterIds,
  onTimeRangeChange,
  onViewChange,
  port,
  namespaces,
  rightsizingPort,
  rightsizingScopes: scanScopes,
  timeRange,
  view,
}: {
  clusterIds: readonly string[];
  onTimeRangeChange(value: CostTimeRange): void;
  onViewChange(value: CostView): void;
  port: CostPort;
  namespaces: readonly string[];
  rightsizingPort: RightsizingPort;
  rightsizingScopes: readonly RightsizingClusterScope[];
  timeRange: CostTimeRange;
  view: CostView;
}) {
  const { t } = useI18n();
  return (
    <ProductPageFrame className="gap-4">
      <header className="flex min-w-0 items-center gap-2.5">
        <Coins aria-hidden="true" className="size-[1.0625rem] shrink-0 text-primary" /><h1 className="min-w-0 truncate font-heading text-heading font-extrabold tracking-[-0.02em]">{t("cost.title")}</h1>
        <p className="sr-only">{t("cost.description")}</p>
      </header>
      <CostViewTabs onSelect={onViewChange} value={view} />
      {view === "rightsizing" ? (
        <RightsizingScanView port={rightsizingPort} scopes={scanScopes} />
      ) : (
        <CostObservedContent
          clusterIds={clusterIds}
          namespaces={namespaces}
          onTimeRangeChange={onTimeRangeChange}
          port={port}
          timeRange={timeRange}
          view={view}
        />
      )}
    </ProductPageFrame>
  );
}

function CostObservedContent({
  clusterIds,
  namespaces,
  onTimeRangeChange,
  port,
  timeRange,
  view,
}: {
  clusterIds: readonly string[];
  namespaces: readonly string[];
  onTimeRangeChange(value: CostTimeRange): void;
  port: CostPort;
  timeRange: CostTimeRange;
  view: Exclude<CostView, "rightsizing">;
}) {
  const data = useCostOverview(
    port,
    { clusterIds, namespaces, timeRange },
    view === "trend" ? "trend" : "summary",
  );
  return <>
    <CostContent
      frame={data.frame}
      onRefresh={data.refresh}
      onTimeRangeChange={onTimeRangeChange}
      timeRange={timeRange}
      view={view}
    />
    {view === "overview" ? (
      <CostNodesPanel
        clusterIds={clusterIds}
        namespaces={namespaces}
        port={port}
        visible={data.frame.phase === "ready"}
      />
    ) : null}
  </>;
}

function CostContent({
  frame,
  onRefresh,
  onTimeRangeChange,
  timeRange,
  view,
}: {
  frame: ReturnType<typeof useCostOverview>["frame"];
  onRefresh: () => void;
  onTimeRangeChange(value: CostTimeRange): void;
  timeRange: CostTimeRange;
  view: Exclude<CostView, "rightsizing">;
}) {
  const { t } = useI18n();
  if (frame.phase === "idle" || frame.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (frame.phase === "failed") return <CostFailureScreen failure={frame.failure} onRefresh={onRefresh} />;

  const overview = frame.data;
  return (
    <section aria-labelledby="cost-overview-title" className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h2 className="sr-only" id="cost-overview-title">{t("cost.title")}</h2>
        <p className="min-w-0 truncate text-caption text-muted-foreground" title={scopeDescription(overview, t("cost.value.notObserved"))}>{scopeDescription(overview, t("cost.value.notObserved"))}</p>
        <span className="ml-auto" /><RefreshAction
          hasFailed={frame.refreshFailure !== null}
          isRefreshing={frame.refreshing}
          label={t("common.action.refresh")}
          onRefresh={onRefresh}
          statusCopy={{
            cancelled: t("cost.refresh.cancelled"),
            failed: t("cost.refresh.failed"),
            pending: t("cost.refresh.pending"),
            reconnecting: t("cost.refresh.reconnecting"),
            succeeded: t("cost.refresh.succeeded"),
          }}
        />
      </div>
      {view === "trend" ? (
        overview.trend.timeRange === timeRange ? (
          <CostTrendChart
            onTimeRangeChange={onTimeRangeChange}
            timeRange={timeRange}
            trend={overview.trend}
          />
        ) : <ProductStateScreen kind="loading" placement="content" />
      ) : (
        <div aria-labelledby="cost-tab-overview" className="grid min-w-0 gap-4" id="cost-panel-overview" role="tabpanel">
          <ObservationNotice overview={overview} />
          <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("cost.summary.title")}>
            <SummaryCard currency={overview.observation.currency} label={t("cost.summary.hourly")} value={overview.summary.hourlyCost} />
            <SummaryCard currency={overview.observation.currency} label={t("cost.summary.monthly")} value={overview.summary.monthlyProjection} />
            <SummaryCard currency={overview.observation.currency} label={t("cost.summary.storage")} value={overview.summary.storageCost} />
            <SummaryCard currency={overview.observation.currency} label={t("cost.summary.idle")} value={overview.summary.idleCost} />
            <SummaryCard currency={null} kind="percent" label={t("cost.summary.efficiency")} value={overview.summary.efficiency} />
            <SummaryCard currency={null} label={t("cost.summary.savings")} value={overview.summary.savingsRecommendations} />
          </section>
          <CostScopeCard overview={overview} />
        </div>
      )}
    </section>
  );
}

function ObservationNotice({ overview }: { overview: CostOverview }) {
  const { t } = useI18n();
  return (
    <Alert>
      <Activity aria-hidden="true" />
      <AlertTitle>{t("cost.status.title")}</AlertTitle>
      <AlertDescription>
        <p>{observationStatusCopy(overview, t)}</p>
        <AvailabilityReasons reasons={overview.observation.reasonCodes} />
      </AlertDescription>
    </Alert>
  );
}

function SummaryCard({
  currency,
  kind = "currency",
  label,
  value,
}: {
  currency: string | null;
  kind?: "currency" | "percent";
  label: string;
  value: number | null;
}) {
  const { formatNumber, t } = useI18n();
  const rendered = value === null
    ? t("cost.value.notObserved")
    : kind === "percent"
      ? `${formatNumber(value / 100, { maximumFractionDigits: 2 })}%`
      : currency === null
        ? t("cost.value.notObserved")
        : formatNumber(value / 1_000_000, {
          currency,
          maximumFractionDigits: value >= 1_000_000 ? 2 : 4,
          style: "currency",
        });
  return (
    <Card className="min-h-28 justify-between transition-[border-color,box-shadow] hover:border-border-hover hover:shadow-product-hover motion-reduce:transition-none" size="sm">
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent><p className="truncate font-mono text-title-2 font-semibold tabular-nums" title={rendered}>{rendered}</p></CardContent>
    </Card>
  );
}

function observationStatusCopy(
  overview: CostOverview,
  t: TranslationFunction,
): string {
  if (overview.observation.availability === "available") return t("cost.status.available");
  if (overview.observation.availability === "partial") return t("cost.status.partial");
  return t("cost.status.unavailable");
}

function CostFailureScreen({ failure, onRefresh }: { failure: CostPortFailure; onRefresh: () => void }) {
  const { t } = useI18n();
  if (failure.code === "forbidden") {
    return <ProductStateScreen kind="forbidden" issue={{ code: "forbidden", safeDetail: t("cost.refresh.failed") }} placement="content" />;
  }
  if (failure.code === "offline") {
    return <ProductStateScreen kind="offline" issue={{ code: "network", safeDetail: t("cost.refresh.failed") }} placement="content" retry={{ pending: false, onRetry: onRefresh }} />;
  }
  return <ProductStateScreen kind="error" issue={{ code: failure.code === "invalid-response" ? "invalid-response" : "unknown", safeDetail: t("cost.refresh.failed") }} placement="content" retry={{ pending: false, onRetry: onRefresh }} />;
}

function scopeDescription(overview: CostOverview, notObserved: string): string {
  return overview.scopeCoverage.observedAt ?? notObserved;
}

function scopeSelection(scope: ReturnType<typeof useClusterScope>):
  | { kind: "ready"; clusterIds: readonly string[]; rightsizingClusterIds: readonly string[] }
  | { kind: "loading"; clusterIds: readonly string[]; rightsizingClusterIds: readonly string[] }
  | { kind: "empty"; clusterIds: readonly string[]; rightsizingClusterIds: readonly string[] }
  | { kind: "error"; clusterIds: readonly string[]; rightsizingClusterIds: readonly string[] } {
  if (scope.selection.kind === "resolving") return { kind: "loading", clusterIds: [], rightsizingClusterIds: [] };
  if (scope.selection.kind === "empty") return { kind: "empty", clusterIds: [], rightsizingClusterIds: [] };
  if (scope.selection.kind === "unavailable") return { kind: "error", clusterIds: [], rightsizingClusterIds: [] };
  if (scope.selection.kind === "unknown") return { kind: "error", clusterIds: [], rightsizingClusterIds: [] };
  if (scope.selection.kind === "multiple" && scope.selection.unresolvedIds.length > 0) {
    return { kind: "error", clusterIds: [], rightsizingClusterIds: [] };
  }
  if (scope.selection.kind === "unfiltered") {
    const allClusterIds = scope.collection?.phase === "ready"
      ? scope.collection.data.clusters.map((cluster) => cluster.id)
      : [];
    return { kind: "ready", clusterIds: [], rightsizingClusterIds: allClusterIds };
  }
  if (scope.selection.kind === "multiple") {
    const clusterIds = scope.selection.clusters.map((cluster) => cluster.id);
    return { kind: "ready", clusterIds, rightsizingClusterIds: clusterIds };
  }
  return {
    kind: "ready",
    clusterIds: [scope.selection.cluster.id],
    rightsizingClusterIds: [scope.selection.cluster.id],
  };
}

function rightsizingScopes(
  clusterIds: readonly string[],
  namespaces: readonly NamespaceFilterRef[],
): readonly RightsizingClusterScope[] {
  return clusterIds.map((clusterId) => ({
    clusterId,
    namespaces: namespaces
      .filter((namespace) => namespace.clusterId === clusterId)
      .map((namespace) => namespace.namespace),
  }));
}
