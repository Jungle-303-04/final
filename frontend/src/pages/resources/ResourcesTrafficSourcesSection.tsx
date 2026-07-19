import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { OperationStatusFeedback } from "../../features/operations/OperationStatusFeedback";
import { useOptionalOperationStatusStore } from "../../features/operations/OperationStatusStore";
import type {
  TrafficClusterSourceCatalog,
  TrafficPort,
  TrafficSourceActionDescriptor,
  TrafficSourceDescriptor,
} from "../../features/traffic/trafficContract";
import { trafficCopy, type TrafficCopy } from "../../features/traffic/trafficCopy";
import type { CommandReceipt } from "../../shared/parity/referenceParity";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { SurfaceSection } from "../../shared/ui/Surface";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
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
import type { useTrafficOverview } from "../traffic/useTrafficOverviewData";

interface PendingSourceAction {
  catalog: TrafficClusterSourceCatalog;
  source: TrafficSourceDescriptor;
  action: TrafficSourceActionDescriptor;
}

export function ResourcesTrafficSourcesSection({
  frame,
  onRefresh,
  port,
}: {
  frame: ReturnType<typeof useTrafficOverview>["sourcesFrame"];
  onRefresh: () => void;
  port: TrafficPort;
}) {
  const { t } = useI18n();
  const copy = useTrafficSourceCopy();
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
      <SurfaceSection className="grid min-w-0 gap-3 p-4">
        <h2 className="text-lg font-semibold" id="traffic-sources-title">{copy.sources}</h2>
        <ProductStateScreen kind="loading" placement="content" />
      </SurfaceSection>
    );
  }
  if (frame.phase === "failed") {
    return (
      <SurfaceSection className="grid min-w-0 gap-3 p-4">
        <h2 className="text-lg font-semibold" id="traffic-sources-title">{copy.sources}</h2>
        <p className="text-sm text-destructive">{copy.sourceObservationFailed}</p>
        <Button onClick={onRefresh} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />{copy.refresh}
        </Button>
      </SurfaceSection>
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
    <>
      <SurfaceSection className="grid min-w-0 gap-3 p-4">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-lg font-semibold" id="traffic-sources-title">{copy.sources}</h2>
          <p className="text-sm text-muted-foreground">{copy.sourcesDescription}</p>
        </div>
        {sources.availability === "available" ? null : (
          <Alert>
            <AlertTitle>{copy.sourcesUnavailable}</AlertTitle>
            <AlertDescription><SourceReasonCodes reasons={sources.reasonCodes} /></AlertDescription>
          </Alert>
        )}
        {sources.clusters.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.notObserved}</p>
        ) : null}
      </SurfaceSection>
      {sources.clusters.map((catalog) => (
        <TrafficSourceCatalogSection
          catalog={catalog}
          key={catalog.scope.clusterId}
          onAction={(source, action) => {
            setCommandFailed(false);
            setReason("");
            setPendingAction({ catalog, source, action });
          }}
        />
      ))}
      {frame.refreshFailure || commandFailed || receipt ? (
        <SurfaceSection className="grid min-w-0 gap-2 p-4">
          {frame.refreshFailure ? <p className="text-sm text-destructive">{copy.sourceObservationFailed}</p> : null}
          {commandFailed ? <p className="text-sm text-destructive">{copy.commandFailed}</p> : null}
          {receipt ? (
            operationStore
              ? <OperationStatusFeedback commandId={receipt.commandId} correlationId={receipt.correlationId} />
              : <output className="break-all text-xs text-muted-foreground">
                  {t("traffic.sources.accepted", { id: receipt.correlationId })}
                </output>
          ) : null}
        </SurfaceSection>
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
    </>
  );
}

function TrafficSourceCatalogSection({
  catalog,
  onAction,
}: {
  catalog: TrafficClusterSourceCatalog;
  onAction: (source: TrafficSourceDescriptor, action: TrafficSourceActionDescriptor) => void;
}) {
  const copy = useTrafficSourceCopy();
  return (
    <SurfaceSection className="grid min-w-0 gap-3 p-4">
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h3 className="truncate text-base font-semibold" title={catalog.scope.clusterId}>{catalog.scope.clusterId}</h3>
          <Badge variant={catalog.freshness === "live" ? "secondary" : "outline"}>{catalog.freshness}</Badge>
        </div>
        {catalog.cluster ? (
          <p className="break-words text-xs text-muted-foreground">
            {copy.clusterEnvironment}: {catalog.cluster.platform} · {catalog.cluster.cni}
            {catalog.cluster.kubernetesVersion ? ` · ${catalog.cluster.kubernetesVersion}` : ""}
          </p>
        ) : null}
      </div>
      <ul className="min-w-0 divide-y">
        {catalog.sources.map((source) => (
          <li className="grid min-w-0 gap-2 py-3 first:pt-0 last:pb-0" key={source.key}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate font-medium" title={source.label}>{source.label}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {catalog.activeSource === source.key ? <Badge>{copy.active}</Badge> : null}
                <Badge variant="outline">{sourceStatusLabel(source.status, copy)}</Badge>
              </div>
            </div>
            <p className="break-words text-xs text-muted-foreground">{source.message}</p>
            {source.version ? <p className="text-xs text-muted-foreground">{copy.version}: {source.version}</p> : null}
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
          </li>
        ))}
      </ul>
      <SourceReasonCodes reasons={catalog.reasonCodes} />
    </SurfaceSection>
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
  const copy = useTrafficSourceCopy();
  return (
    <Dialog onOpenChange={onOpenChange} open={action !== null}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action?.action.label ?? copy.sources}</DialogTitle>
          <DialogDescription>{copy.actionDescription}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="traffic-source-action-reason">{copy.reason}</Label>
            <Input
              autoFocus
              id="traffic-source-action-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder={copy.reasonPlaceholder}
              required
              value={reason}
            />
          </div>
          <DialogFooter>
            <Button disabled={submitting || !reason.trim()} type="submit">
              {submitting ? copy.commandPending : `${copy.confirm} ${action?.action.label ?? ""}`.trim()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SourceReasonCodes({ reasons }: { reasons: readonly string[] }) {
  const { t } = useI18n();
  if (reasons.length === 0) return null;
  return (
    <ul className="grid gap-1 pt-1" aria-label={t("traffic.reasons.label")}>
      {reasons.map((reason) => <li className="break-all font-mono text-xs text-muted-foreground" key={reason}>{reason}</li>)}
    </ul>
  );
}

function sourceStatusLabel(status: TrafficSourceDescriptor["status"], copy: TrafficCopy): string {
  if (status === "available") return copy.available;
  if (status === "not_detected") return copy.notDetected;
  return copy.sourceError;
}

function useTrafficSourceCopy(): TrafficCopy {
  return trafficCopy(useI18n().t);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
