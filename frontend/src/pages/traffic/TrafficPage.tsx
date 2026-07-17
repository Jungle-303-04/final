import { Activity, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { namespaceSelector, normalizeNamespaceRefs } from "../../features/filters/filterUrlSyntax";
import { OperationStatusFeedback } from "../../features/operations/OperationStatusFeedback";
import { useOptionalOperationStatusStore } from "../../features/operations/OperationStatusStore";
import {
  TrafficPortFailure,
  type TrafficClusterSourceCatalog,
  type TrafficClusterScope,
  type TrafficOverview,
  type TrafficPort,
  type TrafficSourceActionDescriptor,
  type TrafficSourceDescriptor,
} from "../../features/traffic/trafficContract";
import { TRAFFIC_COPY } from "../../features/traffic/trafficCopy";
import type { CommandReceipt } from "../../shared/parity/referenceParity";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import { Label } from "../../shared/ui/primitives/label";
import { useTrafficOverview } from "../../features/traffic/useTrafficOverview";

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
      <TrafficSourcesSection
        frame={data.sourcesFrame}
        onRefresh={data.refresh}
        port={port}
      />
      <TrafficContent frame={data.frame} onRefresh={data.refresh} />
    </ProductPageFrame>
  );
}

interface PendingSourceAction {
  catalog: TrafficClusterSourceCatalog;
  source: TrafficSourceDescriptor;
  action: TrafficSourceActionDescriptor;
}

function TrafficSourcesSection({
  frame,
  onRefresh,
  port,
}: {
  frame: ReturnType<typeof useTrafficOverview>["sourcesFrame"];
  onRefresh: () => void;
  port: TrafficPort;
}) {
  const operationStore = useOptionalOperationStatusStore();
  const commandController = useRef<AbortController | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingSourceAction | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commandFailed, setCommandFailed] = useState(false);
  const [receipt, setReceipt] = useState<CommandReceipt | null>(null);
  useEffect(() => () => commandController.current?.abort(), []);

  if (frame.phase === "idle" || frame.phase === "loading") {
    return (
      <Card aria-labelledby="traffic-sources-title">
        <CardHeader>
          <CardTitle id="traffic-sources-title">{TRAFFIC_COPY.sources}</CardTitle>
        </CardHeader>
        <CardContent><ProductStateScreen kind="loading" placement="content" /></CardContent>
      </Card>
    );
  }
  if (frame.phase === "failed") {
    return (
      <Card aria-labelledby="traffic-sources-title">
        <CardHeader><CardTitle id="traffic-sources-title">{TRAFFIC_COPY.sources}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-destructive">{TRAFFIC_COPY.sourceObservationFailed}</p>
          <Button onClick={onRefresh} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" />{TRAFFIC_COPY.refresh}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sources = frame.data;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pendingAction || submitting || !reason.trim()) return;
    commandController.current?.abort();
    const controller = new AbortController();
    commandController.current = controller;
    setSubmitting(true);
    setCommandFailed(false);
    const input = {
      scope: pendingAction.catalog.scope,
      sourceKey: pendingAction.source.key,
      capabilityRevision: pendingAction.catalog.capabilityRevision,
      confirmation: true as const,
      idempotencyKey: crypto.randomUUID(),
      reason: reason.trim(),
    };
    try {
      const next = pendingAction.action.kind === "select"
        ? await port.selectSource(input, controller.signal)
        : await port.connectSource(input, controller.signal);
      setReceipt(next);
      operationStore?.start(next.commandId);
      setPendingAction(null);
      setReason("");
      onRefresh();
    } catch (error: unknown) {
      if (!isAbortError(error)) setCommandFailed(true);
    } finally {
      if (commandController.current === controller) commandController.current = null;
      setSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="traffic-sources-title" className="grid min-w-0 gap-3">
      <div className="grid min-w-0 gap-1">
        <h2 className="text-lg font-semibold" id="traffic-sources-title">{TRAFFIC_COPY.sources}</h2>
        <p className="text-sm text-muted-foreground">{TRAFFIC_COPY.sourcesDescription}</p>
      </div>
      {sources.availability === "available" ? null : (
        <Alert>
          <AlertTitle>{TRAFFIC_COPY.sourcesUnavailable}</AlertTitle>
          <AlertDescription><ReasonCodes reasons={sources.reasonCodes} /></AlertDescription>
        </Alert>
      )}
      {sources.clusters.length === 0 ? (
        <p className="text-sm text-muted-foreground">{TRAFFIC_COPY.notObserved}</p>
      ) : (
        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          {sources.clusters.map((catalog) => (
            <TrafficSourceCatalogCard
              catalog={catalog}
              key={catalog.scope.clusterId}
              onAction={(source, action) => {
                setCommandFailed(false);
                setReason("");
                setPendingAction({ catalog, source, action });
              }}
            />
          ))}
        </div>
      )}
      {frame.refreshFailure ? <p className="text-sm text-destructive">{TRAFFIC_COPY.sourceObservationFailed}</p> : null}
      {commandFailed ? <p className="text-sm text-destructive">{TRAFFIC_COPY.commandFailed}</p> : null}
      {receipt ? (
        operationStore
          ? <OperationStatusFeedback commandId={receipt.commandId} correlationId={receipt.correlationId} />
          : <output className="break-all text-xs text-muted-foreground">
              {TRAFFIC_COPY.accepted.replace("{id}", receipt.correlationId)}
            </output>
      ) : null}
      <TrafficSourceActionDialog
        action={pendingAction}
        onOpenChange={(open) => {
          if (!open && !submitting) setPendingAction(null);
        }}
        onSubmit={submit}
        reason={reason}
        setReason={setReason}
        submitting={submitting}
      />
    </section>
  );
}

function TrafficSourceCatalogCard({
  catalog,
  onAction,
}: {
  catalog: TrafficClusterSourceCatalog;
  onAction: (source: TrafficSourceDescriptor, action: TrafficSourceActionDescriptor) => void;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="border-b">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <CardTitle className="truncate" title={catalog.scope.clusterId}>{catalog.scope.clusterId}</CardTitle>
          <Badge variant={catalog.freshness === "live" ? "secondary" : "outline"}>{catalog.freshness}</Badge>
        </div>
        {catalog.cluster ? (
          <p className="break-words text-xs text-muted-foreground">
            {TRAFFIC_COPY.clusterEnvironment}: {catalog.cluster.platform} · {catalog.cluster.cni}
            {catalog.cluster.kubernetesVersion ? ` · ${catalog.cluster.kubernetesVersion}` : ""}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {catalog.sources.map((source) => (
          <div className="grid min-w-0 gap-2 rounded-lg border p-3" key={source.key}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate font-medium" title={source.label}>{source.label}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {catalog.activeSource === source.key ? <Badge>{TRAFFIC_COPY.active}</Badge> : null}
                <Badge variant="outline">{sourceStatusLabel(source.status)}</Badge>
              </div>
            </div>
            <p className="break-words text-xs text-muted-foreground">{source.message}</p>
            {source.version ? (
              <p className="text-xs text-muted-foreground">{TRAFFIC_COPY.version}: {source.version}</p>
            ) : null}
            {source.actions.length === 0 ? null : (
              <div className="flex min-w-0 flex-wrap gap-2">
                {source.actions.map((action) => (
                  <Button
                    disabled={!action.enabled}
                    key={action.id}
                    onClick={() => onAction(source, action)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
        <ReasonCodes reasons={catalog.reasonCodes} />
      </CardContent>
    </Card>
  );
}

function TrafficSourceActionDialog({
  action,
  onOpenChange,
  onSubmit,
  reason,
  setReason,
  submitting,
}: {
  action: PendingSourceAction | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent) => void;
  reason: string;
  setReason: (reason: string) => void;
  submitting: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={action !== null}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action?.action.label ?? TRAFFIC_COPY.sources}</DialogTitle>
          <DialogDescription>{TRAFFIC_COPY.actionDescription}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="traffic-source-action-reason">{TRAFFIC_COPY.reason}</Label>
            <Input
              autoFocus
              id="traffic-source-action-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder={TRAFFIC_COPY.reasonPlaceholder}
              required
              value={reason}
            />
          </div>
          <DialogFooter>
            <Button disabled={submitting || !reason.trim()} type="submit">
              {submitting
                ? TRAFFIC_COPY.commandPending
                : `${TRAFFIC_COPY.confirm} ${action?.action.label ?? ""}`.trim()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function sourceStatusLabel(status: TrafficSourceDescriptor["status"]): string {
  if (status === "available") return TRAFFIC_COPY.available;
  if (status === "not_detected") return TRAFFIC_COPY.notDetected;
  return TRAFFIC_COPY.sourceError;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
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

function SummaryCard({ label, value }: { label: string; value: null }) {
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
