import { Activity } from "lucide-react";

import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import {
  CostPortFailure,
  type CostClusterScope,
  type CostOverview,
  type CostPort,
  type CostTimeRange,
} from "../../features/cost/costContract";
import { CostTrendChart } from "../../features/cost/CostTrendChart";
import { CostViewTabs, type CostView } from "../../features/cost/CostViewTabs";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { NamespaceFilterRef } from "../../features/filters/filterContract";
import type { RightsizingPort } from "../../features/rightsizing/rightsizingContract";
import type { RightsizingClusterScope } from "../../features/rightsizing/useRightsizingScans";
import { RefreshAction } from "../../motion/RefreshAction";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { useCostOverview } from "./useCostOverviewData";
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
  rightsizingPort,
  rightsizingScopes: scanScopes,
  timeRange,
  view,
}: {
  clusterIds: readonly string[];
  onTimeRangeChange(value: CostTimeRange): void;
  onViewChange(value: CostView): void;
  port: CostPort;
  rightsizingPort: RightsizingPort;
  rightsizingScopes: readonly RightsizingClusterScope[];
  timeRange: CostTimeRange;
  view: CostView;
}) {
  const { t } = useI18n();
  return (
    <ProductPageFrame className="gap-4">
      <header className="grid min-w-0 gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("cost.title")}</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("cost.description")}</p>
      </header>
      <CostViewTabs onSelect={onViewChange} value={view} />
      {view === "rightsizing" ? (
        <RightsizingScanView port={rightsizingPort} scopes={scanScopes} />
      ) : (
        <CostObservedContent
          clusterIds={clusterIds}
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
  onTimeRangeChange,
  port,
  timeRange,
  view,
}: {
  clusterIds: readonly string[];
  onTimeRangeChange(value: CostTimeRange): void;
  port: CostPort;
  timeRange: CostTimeRange;
  view: Exclude<CostView, "rightsizing">;
}) {
  const data = useCostOverview(port, { clusterIds, timeRange });
  return (
    <CostContent
      frame={data.frame}
      onRefresh={data.refresh}
      onTimeRangeChange={onTimeRangeChange}
      timeRange={timeRange}
      view={view}
    />
  );
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
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="sr-only" id="cost-overview-title">{t("cost.title")}</h2>
        <p className="min-w-0 break-words text-sm text-muted-foreground">{scopeDescription(overview, t("cost.value.notObserved"))}</p>
        <RefreshAction
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
          <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={t("cost.summary.title")}>
            <SummaryCard label={t("cost.summary.hourly")} value={overview.summary.hourlyCost} />
            <SummaryCard label={t("cost.summary.monthly")} value={overview.summary.monthlyProjection} />
            <SummaryCard label={t("cost.summary.storage")} value={overview.summary.storageCost} />
            <SummaryCard label={t("cost.summary.idle")} value={overview.summary.idleCost} />
            <SummaryCard label={t("cost.summary.efficiency")} value={overview.summary.efficiency} />
            <SummaryCard label={t("cost.summary.savings")} value={overview.summary.savingsRecommendations} />
          </section>
          <ScopeCard overview={overview} />
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
        <p>{t("cost.status.unavailable")}</p>
        <AvailabilityReasons reasons={overview.observation.reasonCodes} />
      </AlertDescription>
    </Alert>
  );
}

function SummaryCard({ label, value }: { label: string; value: null }) {
  const { t } = useI18n();
  return (
    <Card size="sm">
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent><p className="text-lg font-semibold">{value ?? t("cost.value.notObserved")}</p></CardContent>
    </Card>
  );
}

function ScopeCard({ overview }: { overview: CostOverview }) {
  const { t } = useI18n();
  const coverage = overview.scopeCoverage;
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t("cost.scope.title")}</CardTitle>
        {coverage.availability === "available" ? null : <p className="text-sm text-muted-foreground">{t("cost.scope.unavailable")}</p>}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {coverage.scopes.length === 0 ? <p className="text-sm text-muted-foreground">{t("cost.value.notObserved")}</p> : (
          <ul className="grid min-w-0 gap-2" aria-label={t("cost.scope.title")}>
            {coverage.scopes.map((scope) => <ScopeRow key={scope.clusterId} scope={scope} />)}
          </ul>
        )}
        <AvailabilityReasons reasons={coverage.reasonCodes} />
      </CardContent>
    </Card>
  );
}

function ScopeRow({ scope }: { scope: CostClusterScope }) {
  const { t } = useI18n();
  return (
    <li className="grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium" title={scope.clusterId}>{scope.clusterId}</p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">{t("cost.scope.allNamespaces")}</p>
      </div>
      <Badge variant={scope.freshness === "live" ? "secondary" : "outline"}>{scope.freshness}</Badge>
    </li>
  );
}

function AvailabilityReasons({ reasons }: { reasons: readonly string[] }) {
  const { t } = useI18n();
  if (reasons.length === 0) return null;
  return (
    <ul className="grid gap-1 pt-1 text-xs text-muted-foreground" aria-label={t("cost.reasons.label")}>
      {humanAvailabilityReasons(reasons, t).map((reason) => <li key={reason}>{reason}</li>)}
    </ul>
  );
}

function humanAvailabilityReasons(reasons: readonly string[], t: TranslationFunction): readonly string[] {
  const messages = new Set<string>();
  for (const reason of reasons) {
    if (reason === "authorization_scope_empty") messages.add(t("cost.scope.reason.authorization"));
    else if (reason.startsWith("inventory_snapshot_unavailable:")) messages.add(t("cost.scope.reason.unavailable"));
    else if (reason.startsWith("inventory_snapshot_incomplete:") || reason === "agent_snapshot_truncated") messages.add(t("cost.scope.reason.partial"));
    else if (reason !== "cost_observation_not_integrated") messages.add(t("cost.scope.reason.generic"));
  }
  return [...messages];
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
