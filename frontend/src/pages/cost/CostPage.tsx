import { Activity } from "lucide-react";

import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import {
  CostPortFailure,
  type CostClusterScope,
  type CostOverview,
  type CostPort,
} from "../../features/cost/costContract";
import { COST_COPY } from "../../features/cost/costCopy";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { RefreshAction } from "../../shared/ui/RefreshFeedback";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { useCostOverview } from "./useCostOverviewData";

export function CostPage({ port }: { port: CostPort }) {
  const selection = scopeSelection(useClusterScope());
  if (selection.kind === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (selection.kind === "empty") return <ProductStateScreen kind="empty" placement="content" />;
  if (selection.kind === "error") {
    return <ProductStateScreen kind="error" issue={{ code: "unknown", safeDetail: COST_COPY.scopeSelectionUnavailable }} placement="content" />;
  }
  return <CostReadyPage clusterIds={selection.clusterIds} port={port} />;
}

function CostReadyPage({ clusterIds, port }: { clusterIds: readonly string[]; port: CostPort }) {
  const data = useCostOverview(port, { clusterIds });
  return (
    <ProductPageFrame className="gap-4">
      <header className="grid min-w-0 gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{COST_COPY.title}</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{COST_COPY.description}</p>
      </header>
      <CostContent frame={data.frame} onRefresh={data.refresh} />
    </ProductPageFrame>
  );
}

function CostContent({
  frame,
  onRefresh,
}: {
  frame: ReturnType<typeof useCostOverview>["frame"];
  onRefresh: () => void;
}) {
  if (frame.phase === "idle" || frame.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (frame.phase === "failed") return <CostFailureScreen failure={frame.failure} onRefresh={onRefresh} />;

  const overview = frame.data;
  return (
    <section aria-labelledby="cost-overview-title" className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="sr-only" id="cost-overview-title">{COST_COPY.title}</h2>
        <p className="min-w-0 break-words text-sm text-muted-foreground">{scopeDescription(overview)}</p>
        <RefreshAction
          hasFailed={frame.refreshFailure !== null}
          isRefreshing={frame.refreshing}
          label={COST_COPY.refresh}
          onRefresh={onRefresh}
        />
      </div>
      <ObservationNotice overview={overview} />
      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={COST_COPY.summary}>
        <SummaryCard label={COST_COPY.hourlyCost} value={overview.summary.hourlyCost} />
        <SummaryCard label={COST_COPY.monthlyProjection} value={overview.summary.monthlyProjection} />
        <SummaryCard label={COST_COPY.storageCost} value={overview.summary.storageCost} />
        <SummaryCard label={COST_COPY.idleCost} value={overview.summary.idleCost} />
        <SummaryCard label={COST_COPY.efficiency} value={overview.summary.efficiency} />
        <SummaryCard label={COST_COPY.savings} value={overview.summary.savingsRecommendations} />
      </section>
      <ScopeCard overview={overview} />
      {frame.refreshFailure ? <p className="text-sm text-destructive">{COST_COPY.refreshFailed}</p> : null}
    </section>
  );
}

function ObservationNotice({ overview }: { overview: CostOverview }) {
  return (
    <Alert>
      <Activity aria-hidden="true" />
      <AlertTitle>{COST_COPY.status}</AlertTitle>
      <AlertDescription>
        <p>{COST_COPY.statusUnavailable}</p>
        <AvailabilityReasons reasons={overview.observation.reasonCodes} />
      </AlertDescription>
    </Alert>
  );
}

function SummaryCard({ label, value }: { label: string; value: null }) {
  return (
    <Card size="sm">
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent><p className="text-lg font-semibold">{value ?? COST_COPY.notObserved}</p></CardContent>
    </Card>
  );
}

function ScopeCard({ overview }: { overview: CostOverview }) {
  const coverage = overview.scopeCoverage;
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{COST_COPY.scope}</CardTitle>
        {coverage.availability === "available" ? null : <p className="text-sm text-muted-foreground">{COST_COPY.scopeUnavailable}</p>}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {coverage.scopes.length === 0 ? <p className="text-sm text-muted-foreground">{COST_COPY.notObserved}</p> : (
          <ul className="grid min-w-0 gap-2" aria-label={COST_COPY.scope}>
            {coverage.scopes.map((scope) => <ScopeRow key={scope.clusterId} scope={scope} />)}
          </ul>
        )}
        <AvailabilityReasons reasons={coverage.reasonCodes} />
      </CardContent>
    </Card>
  );
}

function ScopeRow({ scope }: { scope: CostClusterScope }) {
  return (
    <li className="grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium" title={scope.clusterId}>{scope.clusterId}</p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">{COST_COPY.allNamespaces}</p>
      </div>
      <Badge variant={scope.freshness === "live" ? "secondary" : "outline"}>{scope.freshness}</Badge>
    </li>
  );
}

function AvailabilityReasons({ reasons }: { reasons: readonly string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="grid gap-1 pt-1 text-xs text-muted-foreground" aria-label="Availability reasons">
      {humanAvailabilityReasons(reasons).map((reason) => <li key={reason}>{reason}</li>)}
    </ul>
  );
}

function humanAvailabilityReasons(reasons: readonly string[]): readonly string[] {
  const messages = new Set<string>();
  for (const reason of reasons) {
    if (reason === "authorization_scope_empty") messages.add(COST_COPY.scopeReasonAuthorization);
    else if (reason.startsWith("inventory_snapshot_unavailable:")) messages.add(COST_COPY.scopeReasonUnavailable);
    else if (reason.startsWith("inventory_snapshot_incomplete:") || reason === "agent_snapshot_truncated") messages.add(COST_COPY.scopeReasonPartial);
    else if (reason !== "cost_observation_not_integrated") messages.add(COST_COPY.scopeReasonGeneric);
  }
  return [...messages];
}

function CostFailureScreen({ failure, onRefresh }: { failure: CostPortFailure; onRefresh: () => void }) {
  if (failure.code === "forbidden") {
    return <ProductStateScreen kind="forbidden" issue={{ code: "forbidden", safeDetail: COST_COPY.refreshFailed }} placement="content" />;
  }
  if (failure.code === "offline") {
    return <ProductStateScreen kind="offline" issue={{ code: "network", safeDetail: COST_COPY.refreshFailed }} placement="content" retry={{ pending: false, onRetry: onRefresh }} />;
  }
  return <ProductStateScreen kind="error" issue={{ code: failure.code === "invalid-response" ? "invalid-response" : "unknown", safeDetail: COST_COPY.refreshFailed }} placement="content" retry={{ pending: false, onRetry: onRefresh }} />;
}

function scopeDescription(overview: CostOverview): string {
  return overview.scopeCoverage.observedAt ?? COST_COPY.notObserved;
}

function scopeSelection(scope: ReturnType<typeof useClusterScope>):
  | { kind: "ready"; clusterIds: readonly string[] }
  | { kind: "loading"; clusterIds: readonly string[] }
  | { kind: "empty"; clusterIds: readonly string[] }
  | { kind: "error"; clusterIds: readonly string[] } {
  if (scope.selection.kind === "resolving") return { kind: "loading", clusterIds: [] };
  if (scope.selection.kind === "empty") return { kind: "empty", clusterIds: [] };
  if (scope.selection.kind === "unavailable") return { kind: "error", clusterIds: [] };
  if (scope.selection.kind === "unknown") return { kind: "error", clusterIds: [] };
  if (scope.selection.kind === "multiple" && scope.selection.unresolvedIds.length > 0) {
    return { kind: "error", clusterIds: [] };
  }
  if (scope.selection.kind === "unfiltered") return { kind: "ready", clusterIds: [] };
  if (scope.selection.kind === "multiple") return { kind: "ready", clusterIds: scope.selection.clusters.map((cluster) => cluster.id) };
  return { kind: "ready", clusterIds: [scope.selection.cluster.id] };
}
