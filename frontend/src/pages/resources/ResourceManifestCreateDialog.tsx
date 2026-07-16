import { FilePlus2, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  useOptionalOperationStatusSnapshots,
  useOptionalOperationStatusStore,
  type OperationStatusSnapshot,
} from "../../features/operations/OperationStatusStore";
import {
  ResourceManifestPortFailure,
  type ResourceManifestCreateCapability,
  type ResourceManifestCreatePort,
} from "../../features/resources/resourceManifestContract";
import type { CommandReceipt } from "../../shared/parity/referenceParity";
import { useI18n } from "../../shared/i18n";
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
import { Spinner } from "../../shared/ui/primitives/spinner";

type Phase = "idle" | "loading" | "ready" | "dry-running" | "creating" | "failed";

export function ResourceManifestCreateDialog({
  clusterId,
  namespace,
  onInvalidate,
  onUnauthorized,
  port,
}: {
  clusterId: string;
  namespace: string;
  onInvalidate: () => void;
  onUnauthorized?: () => void;
  port: ResourceManifestCreatePort;
}) {
  const { t } = useI18n();
  const operationStore = useOptionalOperationStatusStore();
  const snapshots = useOptionalOperationStatusSnapshots();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [capability, setCapability] = useState<ResourceManifestCreateCapability | null>(null);
  const [yaml, setYaml] = useState("");
  const [reason, setReason] = useState("");
  const [force, setForce] = useState(false);
  const [forceConfirmed, setForceConfirmed] = useState(false);
  const [dryRunReceipt, setDryRunReceipt] = useState<CommandReceipt | null>(null);
  const [createReceipt, setCreateReceipt] = useState<CommandReceipt | null>(null);
  const [failure, setFailure] = useState(false);
  const invalidatedCommand = useRef<string | null>(null);

  const dryRunSnapshot = findSnapshot(snapshots, dryRunReceipt?.commandId);
  const createSnapshot = findSnapshot(snapshots, createReceipt?.commandId);
  const dryRunResult = exactDryRunResult(dryRunSnapshot);

  useEffect(() => {
    if (!createReceipt || !createSnapshot || !isTerminal(createSnapshot.status)) return;
    if (invalidatedCommand.current === createReceipt.commandId) return;
    invalidatedCommand.current = createReceipt.commandId;
    onInvalidate();
  }, [createReceipt, createSnapshot, onInvalidate]);

  const load = async () => {
    setPhase("loading");
    setFailure(false);
    setCapability(null);
    try {
      const value = await port.loadCreateCapability(clusterId, namespace);
      setCapability(value);
      setPhase("ready");
    } catch (error) {
      handleFailure(error);
    }
  };

  const resetValidation = () => {
    setDryRunReceipt(null);
    setCreateReceipt(null);
    setFailure(false);
  };

  const dryRun = async () => {
    if (!capability?.snapshotId || !canRequest(yaml, reason, force, forceConfirmed)) return;
    setPhase("dry-running");
    setFailure(false);
    try {
      const receipt = await port.dryRunCreate({
        clusterId,
        namespace,
        snapshotId: capability.snapshotId,
        editedYaml: yaml,
        force,
        reason: reason.trim(),
      });
      setDryRunReceipt(receipt);
      operationStore?.start(receipt.commandId);
      setPhase("ready");
    } catch (error) {
      handleFailure(error);
    }
  };

  const create = async () => {
    if (!capability?.snapshotId || !dryRunReceipt || !dryRunResult) return;
    setPhase("creating");
    setFailure(false);
    try {
      const receipt = await port.createResources({
        clusterId,
        namespace,
        snapshotId: capability.snapshotId,
        editedYaml: yaml,
        desiredSha256: dryRunResult.desiredSha256,
        dryRunCommandId: dryRunReceipt.commandId,
        force,
        forceConfirmation: force && forceConfirmed,
        reason: reason.trim(),
      });
      setCreateReceipt(receipt);
      operationStore?.start(receipt.commandId);
      setPhase("ready");
    } catch (error) {
      handleFailure(error);
    }
  };

  function handleFailure(error: unknown) {
    if (error instanceof ResourceManifestPortFailure && error.code === "unauthorized") {
      onUnauthorized?.();
    }
    setFailure(true);
    setPhase("failed");
  }

  const busy = ["loading", "dry-running", "creating"].includes(phase);
  const available = capability?.available === true && capability.snapshotId !== null;
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          setYaml("");
          setReason("");
          setForce(false);
          setForceConfirmed(false);
          resetValidation();
          void load();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <FilePlus2 aria-hidden="true" />
        {t("resources.manifestCreate.open")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="grid max-h-[92svh] w-[min(94vw,64rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{t("resources.manifestCreate.title")}</DialogTitle>
            <DialogDescription>
              {t("resources.manifestCreate.description", { cluster: clusterId, namespace })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
            {phase === "loading" ? (
              <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
                <Spinner className="size-4" decorative />
                {t("resources.manifestCreate.loading")}
              </p>
            ) : capability ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {capability.resources.map((item) => (
                    <Badge key={`${item.apiVersion}:${item.kind}`} variant="outline">
                      {item.kind} · {item.apiVersion}
                    </Badge>
                  ))}
                </div>
                {!available ? (
                  <Alert variant="destructive">
                    <AlertTitle>{t("resources.manifestCreate.unavailable")}</AlertTitle>
                    <AlertDescription>{capability.reasonCodes.join(", ")}</AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="resource-create-yaml">{t("resources.manifestCreate.yaml")}</Label>
                      <textarea
                        aria-label={t("resources.manifestCreate.yaml")}
                        className="min-h-[20rem] w-full resize-y rounded-lg border border-input bg-[#0d1117] p-4 font-mono text-xs leading-5 text-[#e6edf3] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        disabled={busy || createReceipt !== null}
                        id="resource-create-yaml"
                        onChange={(event) => {
                          setYaml(event.currentTarget.value);
                          resetValidation();
                        }}
                        spellCheck={false}
                        value={yaml}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="resource-create-reason">{t("resources.manifestCreate.reason")}</Label>
                      <Input
                        disabled={busy || createReceipt !== null}
                        id="resource-create-reason"
                        maxLength={500}
                        onChange={(event) => {
                          setReason(event.currentTarget.value);
                          resetValidation();
                        }}
                        placeholder={t("resources.manifestCreate.reasonPlaceholder")}
                        value={reason}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        checked={force}
                        disabled={busy || createReceipt !== null}
                        onChange={(event) => {
                          setForce(event.currentTarget.checked);
                          setForceConfirmed(false);
                          resetValidation();
                        }}
                        type="checkbox"
                      />
                      {t("resources.manifestCreate.force")}
                    </label>
                    {force ? (
                      <Alert variant="destructive">
                        <ShieldAlert aria-hidden="true" />
                        <AlertTitle>{t("resources.manifestCreate.forceRisk")}</AlertTitle>
                        <AlertDescription>
                          <label className="mt-2 flex items-center gap-2">
                            <input
                              checked={forceConfirmed}
                              disabled={busy || createReceipt !== null}
                              onChange={(event) => {
                                setForceConfirmed(event.currentTarget.checked);
                                resetValidation();
                              }}
                              type="checkbox"
                            />
                            {t("resources.manifestCreate.forceConfirm")}
                          </label>
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    {dryRunReceipt ? (
                      <Alert variant={dryRunResult ? "default" : "destructive"}>
                        <AlertTitle>{t(dryRunResult ? "resources.manifestCreate.dryRunPassed" : "resources.manifestCreate.dryRunPending")}</AlertTitle>
                        <AlertDescription className="grid gap-2">
                          <span>{dryRunSnapshot?.status ?? dryRunReceipt.status}</span>
                          {documentResults(dryRunSnapshot).map((item) => (
                            <span key={`${item.resource}:${item.namespace}`}>
                              {item.resource} · {item.namespace} · {item.status}
                            </span>
                          ))}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    {createReceipt ? (
                      <Alert variant={createSnapshot?.status === "failed" ? "destructive" : "default"}>
                        <AlertTitle>{t("resources.manifestCreate.accepted")}</AlertTitle>
                        <AlertDescription className="grid gap-2">
                          <span>{createSnapshot?.status ?? createReceipt.status}</span>
                          {documentResults(createSnapshot).map((item) => (
                            <span key={`${item.resource}:${item.namespace}`}>
                              {item.resource} · {item.namespace} · {item.status}
                            </span>
                          ))}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    {failure ? (
                      <Alert variant="destructive">
                        <AlertTitle>{t("resources.manifestCreate.failed")}</AlertTitle>
                      </Alert>
                    ) : null}
                  </>
                )}
              </>
            ) : null}
          </div>
          <DialogFooter>
            {available && !createReceipt ? (
              <Button
                aria-busy={phase === "dry-running"}
                disabled={busy || !canRequest(yaml, reason, force, forceConfirmed)}
                onClick={() => void dryRun()}
                type="button"
                variant="outline"
              >
                {phase === "dry-running" ? <Spinner decorative /> : null}
                {t("resources.manifestCreate.dryRun")}
              </Button>
            ) : null}
            {dryRunResult && !createReceipt ? (
              <Button
                aria-busy={phase === "creating"}
                disabled={busy}
                onClick={() => void create()}
                type="button"
                variant={force ? "destructive" : "default"}
              >
                {phase === "creating" ? <Spinner decorative /> : <FilePlus2 aria-hidden="true" />}
                {t("resources.manifestCreate.submit")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function canRequest(yaml: string, reason: string, force: boolean, forceConfirmed: boolean) {
  return yaml.trim().length > 0
    && reason.trim().length >= 3
    && (!force || forceConfirmed);
}

function findSnapshot(
  snapshots: readonly OperationStatusSnapshot[],
  commandId: string | undefined,
) {
  return commandId
    ? snapshots.find((snapshot) => snapshot.commandId === commandId) ?? null
    : null;
}

function exactDryRunResult(snapshot: OperationStatusSnapshot | null) {
  if (snapshot?.status !== "completed") return null;
  const result = snapshot.event?.payload.result;
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const desiredSha256 = record.desired_sha256;
  if (
    record.dry_run !== true
    || record.completeness !== "exact"
    || typeof desiredSha256 !== "string"
  ) return null;
  return { desiredSha256 };
}

function isTerminal(status: OperationStatusSnapshot["status"]) {
  return ["completed", "failed", "cancelled", "forbidden", "invalid", "unavailable"].includes(status);
}

function documentResults(snapshot: OperationStatusSnapshot | null) {
  const result = snapshot?.event?.payload.result;
  if (!result || typeof result !== "object") return [];
  const resources = (result as Record<string, unknown>).resources;
  if (!Array.isArray(resources)) return [];
  return resources.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (
      typeof value.resource !== "string"
      || typeof value.namespace !== "string"
      || typeof value.status !== "string"
    ) return [];
    return [{
      resource: value.resource,
      namespace: value.namespace,
      status: value.status,
    }];
  });
}
