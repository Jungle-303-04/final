import { Activity, RefreshCw } from "lucide-react";
import { useMemo } from "react";

import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { namespaceSelector, normalizeNamespaceRefs } from "../../features/filters/filterUrlSyntax";
import {
  TrafficPortFailure,
  type TrafficClusterScope,
  type TrafficOverview,
  type TrafficPort,
} from "../../features/traffic/trafficContract";
import { TRAFFIC_COPY } from "../../features/traffic/trafficCopy";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { useTrafficOverview } from "./useTrafficOverviewData";

export function TrafficPage({ port }: { port: TrafficPort }) {
  const clusterScope = useClusterScope();
  const filters = useUnifiedFilter();
  const selection = scopeSelection(clusterScope);
  const namespaces = useMemo(
    () => normalizeNamespaceRefs(filters.state.common.namespaces).map(namespaceSelector),
    [filters.state.common.namespaces],
  );

  if (selection.kind === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (selection.kind === "empty") return <ProductStateScreen kind="empty" placement="content" />;
  if (selection.kind === "error") {
    return <ProductStateScreen kind="error" issue={{ code: "unknown", safeDetail: selection.detail }} placement="content" />;
  }

  return <TrafficReadyPage clusterIds={selection.clusterIds} namespaces={namespaces} port={port} />;
}

function TrafficReadyPage({
  clusterIds,
  namespaces,
  port,
}: {
  clusterIds: readonly string[];
  namespaces: readonly string[];
  port: TrafficPort;
}) {
  const data = useTrafficOverview(port, { clusterIds, namespaces });

  return (
    <ProductPageFrame className="gap-4">
      <header className="grid min-w-0 gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{TRAFFIC_COPY.title}</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{TRAFFIC_COPY.description}</p>
      </header>
      <TrafficContent frame={data.frame} onRefresh={data.refresh} />
    </ProductPageFrame>
  );
}

function TrafficContent({
  frame,
  onRefresh,
}: {
  frame: ReturnType<typeof useTrafficOverview>["frame"];
  onRefresh: () => void;
}) {
  if (frame.phase === "idle" || frame.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (frame.phase === "failed") return <TrafficFailureScreen failure={frame.failure} onRefresh={onRefresh} />;

  const overview = frame.data;
  return (
    <section aria-labelledby="traffic-overview-title" className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="sr-only" id="traffic-overview-title">{TRAFFIC_COPY.title}</h2>
        <p className="min-w-0 break-words text-sm text-muted-foreground">{scopeDescription(overview)}</p>
        <Button onClick={onRefresh} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />{TRAFFIC_COPY.refresh}
        </Button>
      </div>
      <ObservationNotice overview={overview} />
      <section className="grid min-w-0 gap-3 xl:grid-cols-3" aria-label={TRAFFIC_COPY.summary}>
        <SummaryCard label={TRAFFIC_COPY.totalFlows} value={overview.summary.totalFlowCount} />
        <SummaryCard label={TRAFFIC_COPY.deniedFlows} value={overview.summary.deniedFlowCount} />
        <SummaryCard label={TRAFFIC_COPY.externalFlows} value={overview.summary.externalFlowCount} />
      </section>
      <ScopeCard overview={overview} />
      <RelationshipsCard overview={overview} />
      {frame.refreshFailure ? <p className="text-sm text-destructive">{TRAFFIC_COPY.refreshFailed}</p> : null}
    </section>
  );
}

function ObservationNotice({ overview }: { overview: TrafficOverview }) {
  return (
    <Alert>
      <Activity aria-hidden="true" />
      <AlertTitle>{TRAFFIC_COPY.status}</AlertTitle>
      <AlertDescription>
        <p>{TRAFFIC_COPY.statusUnavailable}</p>
        <ReasonCodes reasons={overview.observation.reasonCodes} />
      </AlertDescription>
    </Alert>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | null }) {
  return (
    <Card size="sm">
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent><p className="text-lg font-semibold">{value ?? TRAFFIC_COPY.notObserved}</p></CardContent>
    </Card>
  );
}

function ScopeCard({ overview }: { overview: TrafficOverview }) {
  const coverage = overview.scopeCoverage;
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{TRAFFIC_COPY.scope}</CardTitle>
        {coverage.availability === "available" ? null : <p className="text-sm text-muted-foreground">{TRAFFIC_COPY.scopeUnavailable}</p>}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {coverage.scopes.length === 0 ? <p className="text-sm text-muted-foreground">{TRAFFIC_COPY.notObserved}</p> : (
          <ul className="grid min-w-0 gap-2" aria-label={TRAFFIC_COPY.scope}>
            {coverage.scopes.map((scope) => <ScopeRow key={scope.clusterId} scope={scope} />)}
          </ul>
        )}
        <ReasonCodes reasons={coverage.reasonCodes} />
      </CardContent>
    </Card>
  );
}

function ScopeRow({ scope }: { scope: TrafficClusterScope }) {
  const namespaces = scope.namespaces.length === 0
    ? TRAFFIC_COPY.noNamespaces
    : scope.namespaces.join(", ");
  return (
    <li className="grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium" title={scope.clusterId}>{scope.clusterId}</p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">{namespaces}</p>
      </div>
      <Badge variant={scope.freshness === "live" ? "secondary" : "outline"}>{scope.freshness}</Badge>
    </li>
  );
}

function RelationshipsCard({ overview }: { overview: TrafficOverview }) {
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>{TRAFFIC_COPY.relationships}</CardTitle></CardHeader>
      <CardContent className="grid gap-2">
        <p className="text-sm text-muted-foreground">{TRAFFIC_COPY.relationshipsUnavailable}</p>
        <ReasonCodes reasons={overview.relationships.reasonCodes} />
      </CardContent>
    </Card>
  );
}

function ReasonCodes({ reasons }: { reasons: readonly string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="grid gap-1 pt-1" aria-label="Availability reasons">
      {reasons.map((reason) => <li className="break-all font-mono text-xs text-muted-foreground" key={reason}>{reason}</li>)}
    </ul>
  );
}

function TrafficFailureScreen({
  failure,
  onRefresh,
}: {
  failure: TrafficPortFailure;
  onRefresh: () => void;
}) {
  if (failure.code === "forbidden") {
    return <ProductStateScreen kind="forbidden" issue={{ code: "forbidden", safeDetail: TRAFFIC_COPY.refreshFailed }} placement="content" />;
  }
  if (failure.code === "offline") {
    return (
      <ProductStateScreen
        kind="offline"
        issue={{ code: "network", safeDetail: TRAFFIC_COPY.refreshFailed }}
        placement="content"
        retry={{ pending: false, onRetry: onRefresh }}
      />
    );
  }
  return (
    <ProductStateScreen
      kind="error"
      issue={{ code: stateIssueCode(failure), safeDetail: TRAFFIC_COPY.refreshFailed }}
      placement="content"
      retry={{ pending: false, onRetry: onRefresh }}
    />
  );
}

function stateIssueCode(failure: TrafficPortFailure): "unknown" | "invalid-response" | "server" {
  if (failure.code === "invalid-response") return "invalid-response";
  return "unknown";
}

function scopeDescription(overview: TrafficOverview): string {
  const observedAt = overview.scopeCoverage.observedAt;
  return observedAt === null ? TRAFFIC_COPY.notObserved : observedAt;
}

function scopeSelection(scope: ReturnType<typeof useClusterScope>):
  | { kind: "ready"; clusterIds: readonly string[] }
  | { kind: "loading"; clusterIds: readonly string[] }
  | { kind: "empty"; clusterIds: readonly string[] }
  | { kind: "error"; clusterIds: readonly string[]; detail: string } {
  if (scope.selection.kind === "resolving") return { kind: "loading", clusterIds: [] };
  if (scope.selection.kind === "empty") return { kind: "empty", clusterIds: [] };
  if (scope.selection.kind === "unavailable") return { kind: "error", clusterIds: [], detail: scope.selection.failure.code };
  if (scope.selection.kind === "unknown") return { kind: "error", clusterIds: [], detail: scope.selection.requestedId };
  if (scope.selection.kind === "multiple" && scope.selection.unresolvedIds.length > 0) {
    return { kind: "error", clusterIds: [], detail: scope.selection.unresolvedIds.join(", ") };
  }
  if (scope.selection.kind === "unfiltered") return { kind: "ready", clusterIds: [] };
  if (scope.selection.kind === "multiple") {
    return { kind: "ready", clusterIds: scope.selection.clusters.map((cluster) => cluster.id) };
  }
  return { kind: "ready", clusterIds: [scope.selection.cluster.id] };
}
