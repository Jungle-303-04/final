import { CircleAlert, Settings } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import {
  ChecksPortFailure,
  type ChecksClusterScope,
  type ChecksDetailResponse,
  type ChecksFinding,
  type ChecksOverview,
  type ChecksPort,
  type ChecksScopeCoverage,
} from "../../features/checks/checksContract";
import { checksCopy, type ChecksCopy } from "../../features/checks/checksCopy";
import { alertEventResourceHref } from "../../features/filters/alertEventResourceHref";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { RefreshAction } from "../../motion/RefreshAction";
import { namespaceSelector, normalizeNamespaceRefs } from "../../features/filters/filterUrlSyntax";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { useChecksDetail, useChecksOverview } from "./useChecksData";
import { ChecksSettingsDialog } from "./ChecksSettingsDialog";

export function ChecksPage({ port }: { port: ChecksPort }) {
  const copy = useChecksCopy();
  const clusterScope = useClusterScope();
  const filters = useUnifiedFilter();
  const selection = scopeSelection(clusterScope);
  const namespaces = useMemo(
    () => normalizeNamespaceRefs(filters.state.common.namespaces).map(namespaceSelector),
    [filters.state.common.namespaces],
  );
  const checkId = checkDetailId(filters.detail.detail);

  if (selection.kind === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (selection.kind === "empty") return <ProductStateScreen kind="empty" placement="content" />;
  if (selection.kind === "error") {
    return <ProductStateScreen kind="error" issue={{ code: "unknown", safeDetail: copy.scopeSelectionUnavailable }} placement="content" />;
  }
  return <ChecksReadyPage checkId={checkId} clusterIds={selection.clusterIds} namespaces={namespaces} port={port} />;
}

function ChecksReadyPage({
  checkId,
  clusterIds,
  namespaces,
  port,
}: {
  checkId: string | null;
  clusterIds: readonly string[];
  namespaces: readonly string[];
  port: ChecksPort;
}) {
  const copy = useChecksCopy();
  const data = useChecksOverview(port, { clusterIds, namespaces });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const catalog = data.frame.phase === "ready" && data.frame.data.catalog.availability !== "unavailable"
    ? data.frame.data.catalog.entries
    : [];
  return (
    <ProductPageFrame className="gap-4">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{copy.description}</p>
        </div>
        <Button aria-label={copy.settingsAction} onClick={() => setSettingsOpen(true)} variant="outline">
          <Settings aria-hidden="true" />{copy.settingsAction}
        </Button>
      </header>
      <ChecksOverviewContent frame={data.frame} onRefresh={data.refresh} />
      {checkId === null ? null : <ChecksDetailPanel checkId={checkId} clusterIds={clusterIds} namespaces={namespaces} port={port} />}
      {settingsOpen ? (
        <ChecksSettingsDialog
          catalog={catalog}
          onOpenChange={setSettingsOpen}
          onSaved={data.refresh}
          open
          port={port}
        />
      ) : null}
    </ProductPageFrame>
  );
}

function ChecksOverviewContent({
  frame,
  onRefresh,
}: {
  frame: ReturnType<typeof useChecksOverview>["frame"];
  onRefresh: () => void;
}) {
  const copy = useChecksCopy();
  if (frame.phase === "idle" || frame.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (frame.phase === "failed") return <ChecksFailureScreen failure={frame.failure} onRefresh={onRefresh} />;
  const overview = frame.data;
  return (
    <section aria-labelledby="checks-overview-title" className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="sr-only" id="checks-overview-title">{copy.title}</h2>
        <p className="min-w-0 break-words text-sm text-muted-foreground">{overview.scopeCoverage.observedAt ?? copy.notObserved}</p>
        <RefreshAction
          hasFailed={frame.refreshFailure !== null}
          isRefreshing={frame.refreshing}
          label={copy.refresh}
          onRefresh={onRefresh}
          statusCopy={{
            cancelled: copy.refreshCancelled,
            failed: copy.refreshFailed,
            pending: copy.refreshPending,
            reconnecting: copy.refreshReconnecting,
            succeeded: copy.refreshSucceeded,
          }}
        />
      </div>
      {overview.resultSet.availability === "unavailable" ? (
        <UnavailableCard
          icon={<CircleAlert aria-hidden="true" />}
          reasons={overview.resultSet.reasonCodes}
          title={copy.resultStatus}
        >
          {copy.resultUnavailable}
        </UnavailableCard>
      ) : <FindingsCard resultSet={overview.resultSet} />}
      {overview.catalog.availability === "unavailable" ? (
        <UnavailableCard reasons={overview.catalog.reasonCodes} title={copy.catalogStatus}>
          {copy.catalogUnavailable}
        </UnavailableCard>
      ) : <CatalogCard catalog={overview.catalog} />}
      <VisibilityCard visibility={overview.visibility} />
      <ScopeCard coverage={overview.scopeCoverage} />
    </section>
  );
}

function ChecksDetailPanel({
  checkId,
  clusterIds,
  namespaces,
  port,
}: {
  checkId: string;
  clusterIds: readonly string[];
  namespaces: readonly string[];
  port: ChecksPort;
}) {
  const data = useChecksDetail(port, checkId, { clusterIds, namespaces });
  if (data.frame.phase === "idle" || data.frame.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (data.frame.phase === "failed") return <ChecksFailureScreen failure={data.frame.failure} onRefresh={data.refresh} />;
  return <ChecksDetailCard response={data.frame.data} />;
}

function ChecksDetailCard({ response }: { response: ChecksDetailResponse }) {
  const copy = useChecksCopy();
  if (response.detail.availability === "unavailable") {
    return (
      <Card aria-label={copy.detailStatus}>
        <CardHeader className="min-w-0 border-b">
          <CardTitle className="truncate" title={response.detail.requestedCheckId}>{copy.detailStatus}: {response.detail.requestedCheckId}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-2">
          <p className="text-sm text-muted-foreground">{copy.detailUnavailable}</p>
          <AvailabilityReasons reasons={response.detail.reasonCodes} />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card aria-label={copy.detailStatus}>
      <CardHeader className="min-w-0 border-b">
        <CardTitle className="break-words" title={response.detail.requestedCheckId}>{response.detail.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap gap-2">
          <Badge variant="outline">{response.detail.category}</Badge>
          <Badge variant={response.detail.effectiveSeverity === "danger" ? "destructive" : "secondary"}>
            {response.detail.effectiveSeverity}
          </Badge>
        </div>
        <p className="break-words text-sm">{response.detail.message}</p>
        <p className="break-words text-sm text-muted-foreground">{response.detail.remediation}</p>
        <FindingsList findings={response.detail.findings} />
        <AvailabilityReasons reasons={response.detail.reasonCodes} />
      </CardContent>
    </Card>
  );
}

function FindingsCard({ resultSet }: { resultSet: Extract<ChecksOverview["resultSet"], { availability: "available" | "partial" }> }) {
  const copy = useChecksCopy();
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{copy.resultStatus}</CardTitle>
        <p className="text-sm text-muted-foreground">{copy.findingCount}: {resultSet.totalFindingCount}</p>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {resultSet.checks.length === 0
          ? <p className="text-sm text-muted-foreground">{copy.noFindings}</p>
          : <FindingsList findings={resultSet.checks} />}
        <AvailabilityReasons reasons={resultSet.reasonCodes} />
      </CardContent>
    </Card>
  );
}

function FindingsList({ findings }: { findings: readonly ChecksFinding[] }) {
  const copy = useChecksCopy();
  return (
    <ul className="grid min-w-0 gap-2" aria-label={copy.resultStatus}>
      {findings.map((finding) => (
        <li className="grid min-w-0 gap-2 rounded-lg border p-3" key={`${finding.clusterId}:${finding.findingId}`}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant={finding.severity === "danger" ? "destructive" : "secondary"}>{finding.severity}</Badge>
            <Link
              className="min-w-0 break-words text-sm font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              to={alertEventResourceHref({
                cluster: finding.clusterId,
                kind: finding.resource.kind,
                name: finding.resource.name,
                namespace: finding.resource.namespace,
              })}
            >
              {finding.resource.kind}/{finding.resource.name}
            </Link>
          </div>
          <p className="break-words text-sm">{finding.message}</p>
          <p className="break-words text-xs text-muted-foreground">{finding.clusterId} · {finding.resource.namespace ?? copy.noNamespaces}</p>
        </li>
      ))}
    </ul>
  );
}

function CatalogCard({ catalog }: { catalog: Extract<ChecksOverview["catalog"], { availability: "available" | "partial" }> }) {
  const copy = useChecksCopy();
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>{copy.catalogStatus}</CardTitle></CardHeader>
      <CardContent className="grid min-w-0 gap-2">
        <ul className="grid min-w-0 gap-2" aria-label={copy.catalogStatus}>
          {catalog.entries.map((entry) => (
            <li className="grid min-w-0 gap-1 rounded-lg border p-3" key={entry.checkId}>
              <p className="break-words text-sm font-medium">{entry.title}</p>
              <p className="break-words text-xs text-muted-foreground">{entry.description}</p>
            </li>
          ))}
        </ul>
        <AvailabilityReasons reasons={catalog.reasonCodes} />
      </CardContent>
    </Card>
  );
}

function VisibilityCard({ visibility }: { visibility: ChecksOverview["visibility"] }) {
  const copy = useChecksCopy();
  if (visibility.availability === "unavailable") {
    return (
      <UnavailableCard reasons={visibility.reasonCodes} title={copy.visibilityStatus}>
        {copy.visibilityUnavailable}
      </UnavailableCard>
    );
  }
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>{copy.visibilityStatus}</CardTitle></CardHeader>
      <CardContent className="grid min-w-0 gap-2">
        <ul className="grid min-w-0 gap-2" aria-label={copy.visibilityStatus}>
          {visibility.clusters.map((cluster) => (
            <li className="grid min-w-0 gap-2 rounded-lg border p-3" key={cluster.clusterId}>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words text-sm font-medium">{cluster.clusterId}</span>
                <Badge variant={cluster.state === "ok" ? "secondary" : "outline"}>{cluster.state}</Badge>
              </div>
              <p className="break-words text-xs text-muted-foreground">
                {copy.observedNamespaces}: {cluster.namespaceScope.length === 0 ? copy.noNamespaces : cluster.namespaceScope.join(", ")}
              </p>
              <div className="flex min-w-0 flex-wrap gap-2">
                {Object.entries(cluster.core).map(([kind, access]) => (
                  <Badge key={kind} variant={access === "allowed" ? "secondary" : "outline"}>{kind}: {access}</Badge>
                ))}
              </div>
              {cluster.missingOptionalKinds.length === 0 ? null : (
                <p className="break-words text-xs text-muted-foreground">
                  {copy.missingOptionalKinds}: {cluster.missingOptionalKinds.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
        <AvailabilityReasons reasons={visibility.reasonCodes} />
      </CardContent>
    </Card>
  );
}

function UnavailableCard({
  children,
  icon,
  reasons,
  title,
}: {
  children: string;
  icon?: ReactNode;
  reasons: readonly string[];
  title: string;
}) {
  return (
    <Alert>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{children}</p>
        <AvailabilityReasons reasons={reasons} />
      </AlertDescription>
    </Alert>
  );
}

function ScopeCard({ coverage }: { coverage: ChecksScopeCoverage }) {
  const copy = useChecksCopy();
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{copy.scope}</CardTitle>
        {coverage.availability === "available" ? null : <p className="text-sm text-muted-foreground">{copy.scopeUnavailable}</p>}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {coverage.scopes.length === 0 ? <p className="text-sm text-muted-foreground">{copy.notObserved}</p> : (
          <ul className="grid min-w-0 gap-2" aria-label={copy.scope}>
            {coverage.scopes.map((scope) => <ScopeRow key={scope.clusterId} scope={scope} />)}
          </ul>
        )}
        <AvailabilityReasons reasons={coverage.reasonCodes} />
      </CardContent>
    </Card>
  );
}

function ScopeRow({ scope }: { scope: ChecksClusterScope }) {
  const copy = useChecksCopy();
  const namespaces = scope.namespaces.length === 0 ? copy.noNamespaces : scope.namespaces.join(", ");
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

function AvailabilityReasons({ reasons }: { reasons: readonly string[] }) {
  const copy = useChecksCopy();
  if (reasons.length === 0) return null;
  return (
    <ul className="grid gap-1 pt-1 text-xs text-muted-foreground" aria-label={copy.reasonsLabel}>
      {humanAvailabilityReasons(reasons, copy).map((reason) => <li key={reason}>{reason}</li>)}
    </ul>
  );
}

function humanAvailabilityReasons(reasons: readonly string[], copy: ChecksCopy): readonly string[] {
  const messages = new Set<string>();
  for (const reason of reasons) {
    if (reason === "authorization_scope_empty") messages.add(copy.scopeReasonAuthorization);
    else if (reason.startsWith("inventory_snapshot_unavailable:")) messages.add(copy.scopeReasonUnavailable);
    else if (reason.startsWith("inventory_snapshot_incomplete:") || reason === "agent_snapshot_truncated") messages.add(copy.scopeReasonPartial);
    else if (reason !== "checks_result_projection_not_integrated" && reason !== "checks_catalog_not_integrated") {
      messages.add(copy.scopeReasonGeneric);
    }
  }
  return [...messages];
}

function ChecksFailureScreen({
  failure,
  onRefresh,
}: {
  failure: ChecksPortFailure;
  onRefresh: () => void;
}) {
  const copy = useChecksCopy();
  if (failure.code === "forbidden") {
    return <ProductStateScreen kind="forbidden" issue={{ code: "forbidden", safeDetail: copy.refreshFailed }} placement="content" />;
  }
  if (failure.code === "offline") {
    return <ProductStateScreen kind="offline" issue={{ code: "network", safeDetail: copy.refreshFailed }} placement="content" retry={{ pending: false, onRetry: onRefresh }} />;
  }
  return <ProductStateScreen kind="error" issue={{ code: failure.code === "invalid-response" ? "invalid-response" : "unknown", safeDetail: copy.refreshFailed }} placement="content" retry={{ pending: false, onRetry: onRefresh }} />;
}

function useChecksCopy(): ChecksCopy {
  return checksCopy(useI18n().t);
}

function checkDetailId(value: string | null): string | null {
  if (!value?.startsWith("check:")) return null;
  const checkId = value.slice("check:".length);
  return checkId.length > 0 ? checkId : null;
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
  if (scope.selection.kind === "multiple") {
    return { kind: "ready", clusterIds: scope.selection.clusters.map((cluster) => cluster.id) };
  }
  return { kind: "ready", clusterIds: [scope.selection.cluster.id] };
}
