import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  type ResourceActionCapability,
  type ResourceActionExecutionContext,
  type ResourceDeletionPreview,
  type ResourceActionReceipt,
  type ResourceActionsPort,
  type WorkloadRollbackPreview,
  type WorkloadRollbackRevision,
} from "../../features/resources/resourceCapabilitiesContract";
import {
  useOptionalOperationStatusStore,
} from "../../features/operations/OperationStatusStore";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import { useOptionalDiagnoseSession } from "../../features/diagnose/DiagnoseSessionContext";
import type {
  DiagnoseCapabilities,
  DiagnoseResourceTarget,
} from "../../features/diagnose/diagnoseContract";
import { OperationStatusFeedback } from "../../features/operations/OperationStatusFeedback";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
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
import type { ResourceCapabilitiesFrame } from "./useResourceCapabilitiesDataFrame";
import type { PodTerminalCoordinates } from "../../features/pod-terminal/podTerminalContract";
import { exactResourceRef } from "../../features/resources/resourceApiIdentity";

export function ResourceDetailActions({
  actionsPort,
  capabilities,
  detail,
  disabledReason = null,
  onInvalidate,
  onTerminalReady,
}: {
  actionsPort: ResourceActionsPort;
  capabilities: ResourceCapabilitiesFrame;
  detail: ResourceDetail;
  disabledReason?: string | null;
  onInvalidate?: (context: ResourceActionExecutionContext) => void;
  onTerminalReady?: (target: PodTerminalCoordinates) => void;
}) {
  const { t } = useI18n();
  const session = useOptionalProductSession();
  const diagnose = useOptionalDiagnoseSession();
  const operationStatusStore = useOptionalOperationStatusStore();
  const [dialog, setDialog] = useState<ResourceActionCapability | null>(null);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<ResourceActionReceipt | null>(null);
  const [failed, setFailed] = useState(false);
  const [values, setValues] = useState<Record<string, boolean | string>>({});
  const [executionKey, setExecutionKey] = useState<string | null>(null);
  const [deletePreview, setDeletePreview] = useState<ResourceDeletionPreview | null>(null);
  const [deletePreviewPending, setDeletePreviewPending] = useState(false);
  const [deleteIdempotencyKey, setDeleteIdempotencyKey] = useState("");
  const [rollbackPreview, setRollbackPreview] = useState<WorkloadRollbackPreview | null>(null);
  const [rollbackPreviewPending, setRollbackPreviewPending] = useState(false);
  const [selectedRollbackUid, setSelectedRollbackUid] = useState("");
  const [diagnoseConsent, setDiagnoseConsent] = useState<{
    capabilities: DiagnoseCapabilities;
    target: DiagnoseResourceTarget;
  } | null>(null);
  const [terminalInvalidation, setTerminalInvalidation] = useState<{
    commandId: string;
    context: ResourceActionExecutionContext;
  } | null>(null);
  const [latestResult, setLatestResult] = useState<Readonly<Record<string, unknown>> | null>(null);
  const enabled = useMemo(() => enabledActions(capabilities, detail), [capabilities, detail]);
  const diagnoseTarget = diagnoseTargetFrom(detail);

  useEffect(() => {
    if (!operationStatusStore || !terminalInvalidation) return undefined;
    const invalidateWhenTerminal = () => {
      const snapshot = operationStatusStore.getSnapshot(terminalInvalidation.commandId);
      const status = snapshot.status;
      if (!isTerminalOperationStatus(status)) return;
      onInvalidate?.(terminalInvalidation.context);
      if (status === "completed") {
        const result = operationResult(snapshot.event?.payload);
        if (result) {
          setLatestResult(result);
          if (terminalInvalidation.context.resultIntent === "terminal-session") {
            const target = terminalTarget(result);
            if (target) onTerminalReady?.(target);
          }
        }
      }
      setTerminalInvalidation(null);
    };
    invalidateWhenTerminal();
    return operationStatusStore.subscribe(terminalInvalidation.commandId, invalidateWhenTerminal);
  }, [onInvalidate, onTerminalReady, operationStatusStore, terminalInvalidation]);

  if (enabled.length === 0 && (!diagnose || !diagnoseTarget || !session)) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (dialog === null || pending) return;
    setPending(true);
    setFailed(false);
    try {
      const context = resourceActionExecutionContext(
        capabilities,
        detail,
        dialog,
        executionKey,
        rollbackPreview,
        selectedRollbackUid,
      );
      if (dialog.requestContext === "rollback" && context?.rollback === undefined) {
        throw new Error("Workload rollback identity is incomplete");
      }
      if (dialog.requestContext !== "simple" && context === null) {
        throw new Error("Resource action identity is incomplete");
      }
      const deleteValues = dialog.capabilityId === "resource.delete"
        ? {
            preview_revision: deletePreview?.revision,
            idempotency_key: deleteIdempotencyKey,
            reason: dialog.description,
          }
        : {};
      if (dialog.capabilityId === "resource.delete" && deletePreview === null) return;
      const submittedValues = {
        ...actionValues(dialog, values),
        ...deleteValues,
      };
      const result = context
        ? await actionsPort.execute(dialog, submittedValues, context)
        : await actionsPort.execute(dialog, submittedValues);
      setReceipt(result);
      if (result.commandId) operationStatusStore?.start(result.commandId);
      if (result.commandId && context && operationStatusStore) {
        setTerminalInvalidation({ commandId: result.commandId, context });
      }
      if (context) onInvalidate?.(context);
      setDialog(null);
      setExecutionKey(null);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-2" data-slot="resource-detail-actions">
      <div className="flex flex-wrap items-center gap-2">
        {diagnose && diagnoseTarget && session ? (
          <Button
            disabled={pending}
            onClick={() => void prepareDiagnose(diagnoseTarget)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Sparkles aria-hidden="true" />
            {t("shell.ai.title")}
          </Button>
        ) : null}
        {enabled.map((capability) => (
          <Button
            disabled={pending || disabledReason !== null}
            key={capability.capabilityId}
            onClick={() => void open(capability)}
            size="sm"
            title={disabledReason ?? capability.description}
            type="button"
            variant="outline"
          >
            {capability.label}
          </Button>
        ))}
      </div>
      {receipt ? (
        receipt.commandId && operationStatusStore ? (
          <OperationStatusFeedback
            commandId={receipt.commandId}
            correlationId={receipt.correlationId}
          />
        ) : (
          <output className="text-xs text-muted-foreground">
            {t("resources.detail.action.accepted", { id: receipt.correlationId })}
          </output>
        )
      ) : null}
      {failed && dialog === null && diagnoseConsent === null ? (
        <Alert variant="destructive">
          <AlertDescription>{t("shell.ai.failed")}</AlertDescription>
        </Alert>
      ) : null}
      <Dialog onOpenChange={(open) => !open && !pending && setDialog(null)} open={dialog !== null}>
        <DialogContent showCloseButton={!pending}>
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{dialog?.label}</DialogTitle>
              <DialogDescription>
                {dialog?.description} {t("resources.detail.action.confirm", { name: detail.identity.name })}
              </DialogDescription>
            </DialogHeader>
            {dialog?.inputSchema.map((input) => (
              <div className="grid gap-2" key={input.key}>
                <Label htmlFor={`resource-action-${input.key}`}>{input.label}</Label>
                {input.type === "boolean" ? (
                  <input
                    checked={values[input.key] === true}
                    className="size-4 rounded border border-input accent-primary"
                    id={`resource-action-${input.key}`}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setValues((current) => ({ ...current, [input.key]: checked }));
                    }}
                    type="checkbox"
                  />
                ) : (
                  <Input
                    id={`resource-action-${input.key}`}
                    max={input.maximum ?? undefined}
                    min={input.minimum ?? undefined}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setValues((current) => ({
                        ...current,
                        [input.key]: value,
                      }));
                    }}
                    required={input.required}
                    type={input.type === "integer" ? "number" : "text"}
                    value={String(values[input.key] ?? defaultInputValue(input.default))}
                  />
                )}
              </div>
            ))}
            {dialog?.capabilityId === "resource.delete" ? (
              <div className="grid gap-2" data-slot="resource-delete-cascade">
                {deletePreviewPending ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {t("resources.detail.action.cascadeLoading")}
                  </p>
                ) : deletePreview ? (
                  <>
                    <p className="text-sm font-medium">
                      {deletePreview.dependents.length > 0
                        ? t("resources.detail.action.cascadeAffected", {
                            count: deletePreview.dependents.length,
                          })
                        : t("resources.detail.action.cascadeEmpty")}
                    </p>
                    {deletePreview.dependents.length > 0 ? (
                      <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-3 text-sm">
                        {deletePreview.dependents.map((item) => (
                          <li key={`${item.uid}:${item.resourceVersion}`}>
                            {item.kind}/{item.name}
                            {item.namespace ? ` · ${item.namespace}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {t("resources.detail.action.cascadeUnavailable")}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}
            {dialog?.requestContext === "rollback" ? (
              <div className="grid gap-3" data-slot="workload-rollback-preview">
                {rollbackPreviewPending ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {t("resources.detail.action.rollbackLoading")}
                  </p>
                ) : rollbackPreview?.availability === "available" ? (
                  <>
                    <Label htmlFor="workload-rollback-revision">
                      {t("resources.detail.action.rollbackRevision")}
                    </Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      id="workload-rollback-revision"
                      onChange={(event) => setSelectedRollbackUid(event.currentTarget.value)}
                      value={selectedRollbackUid}
                    >
                      {rollbackPreview.revisions.map((item) => (
                        <option key={`${item.resource.uid}:${item.resourceVersion}`} value={item.resource.uid}>
                          {item.revision} · {item.resource.name}
                        </option>
                      ))}
                    </select>
                    <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-3 text-sm">
                      {selectedRollback(rollbackPreview, selectedRollbackUid)?.changes.map((change) => (
                        <li key={change.path}>
                          <span className="font-mono text-xs text-muted-foreground">{change.path}</span>
                          <span className="block">{change.before} → {change.after}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {t("resources.detail.action.rollbackUnavailable", {
                        reason: rollbackPreview?.reason ?? "revision_history_unavailable",
                      })}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}
            {failed ? (
              <Alert variant="destructive">
                <AlertDescription>{t("resources.detail.action.failed")}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              {pending ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {t("resources.detail.action.submitting")}
                </p>
              ) : (
                <>
                  <Button onClick={() => setDialog(null)} type="button" variant="outline">
                    {t("common.action.cancel")}
                  </Button>
                  <Button
                    disabled={
                      dialog?.capabilityId === "resource.delete" &&
                      (deletePreviewPending || deletePreview === null)
                      || dialog?.requestContext === "rollback" &&
                      (rollbackPreviewPending || selectedRollback(rollbackPreview, selectedRollbackUid) === null)
                    }
                    type="submit"
                  >
                    {t("common.action.confirm")}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(open) => !open && !pending && setDiagnoseConsent(null)}
        open={diagnoseConsent !== null}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>
              {t("shell.ai.title")}
            </DialogTitle>
            <DialogDescription>
              {t("shell.ai.description")} {detail.identity.kind}/{detail.identity.name}
            </DialogDescription>
          </DialogHeader>
          {failed ? (
            <Alert variant="destructive">
              <AlertDescription>{t("shell.ai.failed")}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => setDiagnoseConsent(null)}
              type="button"
              variant="outline"
            >
              {t("common.action.cancel")}
            </Button>
            <Button
              disabled={pending}
              onClick={() => void grantAndLaunchDiagnose()}
              type="button"
            >
              {t("common.action.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  async function open(capability: ResourceActionCapability) {
    if (disabledReason !== null) return;
    setFailed(false);
    setValues(defaultInputValues(capability, latestResult));
    setExecutionKey(capability.requestContext !== "simple"
      ? resourceActionIdempotencyKey()
      : null);
    setDeletePreview(null);
    setDeletePreviewPending(false);
    setDeleteIdempotencyKey("");
    setRollbackPreview(null);
    setRollbackPreviewPending(false);
    setSelectedRollbackUid("");
    setDialog(capability);
    if (capability.capabilityId === "resource.delete") {
      setDeletePreviewPending(true);
      setDeleteIdempotencyKey(resourceActionIdempotencyKey("resource-delete"));
      try {
        setDeletePreview(await actionsPort.previewDeletion(capability));
      } catch {
        setFailed(true);
      } finally {
        setDeletePreviewPending(false);
      }
    }
    if (capability.requestContext === "rollback") {
      setRollbackPreviewPending(true);
      setExecutionKey(resourceActionIdempotencyKey("workload-rollback"));
      try {
        const preview = await actionsPort.previewRollback?.(capability);
        if (preview === undefined) throw new Error("Rollback preview is unavailable");
        setRollbackPreview(preview);
        setSelectedRollbackUid(preview.revisions[0]?.resource.uid ?? "");
      } catch {
        setFailed(true);
      } finally {
        setRollbackPreviewPending(false);
      }
    }
  }

  async function prepareDiagnose(target: DiagnoseResourceTarget) {
    if (!diagnose) return;
    setPending(true);
    setFailed(false);
    try {
      const agentCapabilities = await diagnose.port.getCapabilities();
      if (!agentCapabilities.enabled) throw new Error("Diagnose is unavailable");
      if (!agentCapabilities.consented) {
        setDiagnoseConsent({ capabilities: agentCapabilities, target });
        return;
      }
      await launchDiagnose(target, agentCapabilities);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  async function grantAndLaunchDiagnose() {
    if (!diagnose || !diagnoseConsent || !session) return;
    setPending(true);
    setFailed(false);
    try {
      await diagnose.port.grantBrowserConsent(
        session.workspaceId,
        diagnoseConsent.target.clusterId,
        diagnoseConsent.capabilities,
      );
      await launchDiagnose(diagnoseConsent.target, {
        ...diagnoseConsent.capabilities,
        consented: true,
      });
      setDiagnoseConsent(null);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  async function launchDiagnose(
    target: DiagnoseResourceTarget,
    agentCapabilities: DiagnoseCapabilities,
  ) {
    if (!diagnose) return;
    const result = await diagnose.port.startResourceRun(target, agentCapabilities);
    diagnose.openRun(result.run.runId);
  }
}

function operationResult(payload: Readonly<Record<string, unknown>> | undefined) {
  const result = payload?.result;
  return result && typeof result === "object" && !Array.isArray(result)
    ? result as Readonly<Record<string, unknown>>
    : null;
}

function terminalTarget(result: Readonly<Record<string, unknown>>): PodTerminalCoordinates | null {
  const terminal = result.terminal;
  if (!terminal || typeof terminal !== "object" || Array.isArray(terminal)) return null;
  const candidate = terminal as Readonly<Record<string, unknown>>;
  if (
    typeof candidate.namespace !== "string" || candidate.namespace.length === 0
    || typeof candidate.pod !== "string" || candidate.pod.length === 0
    || typeof candidate.container !== "string" || candidate.container.length === 0
  ) return null;
  return {
    namespace: candidate.namespace,
    pod: candidate.pod,
    container: candidate.container,
  };
}

function isTerminalOperationStatus(status: string) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function resourceActionExecutionContext(
  frame: ResourceCapabilitiesFrame,
  detail: ResourceDetail,
  capability: ResourceActionCapability,
  idempotencyKey: string | null,
  rollbackPreview: WorkloadRollbackPreview | null,
  selectedRollbackUid: string,
): ResourceActionExecutionContext | null {
  const rollback = capability.requestContext === "rollback";
  if (capability.requestContext === "simple") return null;
  if (frame.phase !== "ready" || idempotencyKey === null) return null;
  const resource = exactResourceRef(detail);
  if (resource === null) return null;
  const context: ResourceActionExecutionContext = {
    capabilityId: capability.capabilityId,
    idempotencyKey,
    requestContext: capability.requestContext,
    resourceId: frame.data.subject.resourceId,
    resultIntent: capability.resultIntent,
    snapshotId: frame.data.subject.snapshotId,
    revision: frame.data.revision,
    resource: {
      apiGroup: resource.apiGroup ?? "",
      version: resource.version ?? "",
      kind: resource.kind,
      namespace: resource.namespace,
      name: resource.name,
      uid: resource.uid,
    },
  };
  if (!rollback) return context;
  const selected = selectedRollback(rollbackPreview, selectedRollbackUid);
  if (rollbackPreview === null || selected === null) return null;
  return {
    ...context,
    resource: rollbackPreview.current.resource,
    snapshotId: rollbackPreview.snapshotId,
    rollback: {
      workloadResourceVersion: rollbackPreview.current.resourceVersion,
      targetRevision: selected.resource,
      targetResourceVersion: selected.resourceVersion,
      previewRevision: selected.previewRevision,
    },
  };
}

function selectedRollback(
  preview: WorkloadRollbackPreview | null,
  uid: string,
): WorkloadRollbackRevision | null {
  return preview?.revisions.find((item) => item.resource.uid === uid) ?? null;
}

function resourceActionIdempotencyKey(prefix = "resource-action"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint32Array(4));
    return `${prefix}-${Array.from(bytes, (value) => value.toString(16).padStart(8, "0")).join("")}`;
  }
  throw new Error("Secure resource action identity is unavailable");
}

function diagnoseTargetFrom(detail: ResourceDetail): DiagnoseResourceTarget | null {
  const resource = exactResourceRef(detail);
  if (resource === null) return null;
  return {
    clusterId: detail.clusterId,
    resourceType: detail.resource.resourceType,
    apiGroup: resource.apiGroup ?? "",
    apiVersion: resource.version ?? "",
    kind: resource.kind,
    namespace: resource.namespace,
    name: resource.name,
    uid: resource.uid,
  };
}

function enabledActions(
  frame: ResourceCapabilitiesFrame,
  detail: ResourceDetail,
): ResourceActionCapability[] {
  if (frame.phase !== "ready") return [];
  const subject = frame.data.subject;
  if (
    subject.resourceId !== detail.resource.inventoryKey ||
    subject.clusterId !== detail.clusterId ||
    subject.kind !== detail.identity.kind ||
    subject.namespace !== detail.identity.namespace ||
    subject.name !== detail.identity.name
  ) return [];
  return frame.data.capabilities.filter((capability) => (
    capability.execution === "command" && capability.method === "POST"
  ));
}

function defaultInputValues(
  capability: ResourceActionCapability,
  result: Readonly<Record<string, unknown>> | null = null,
): Record<string, boolean | string> {
  return Object.fromEntries(capability.inputSchema.map((input) => {
    const preferred = input.prefillResultKey ? result?.[input.prefillResultKey] : undefined;
    return [
      input.key,
      inputValueFromResult(preferred, input.type) ?? defaultInputValue(input.default),
    ];
  }));
}

function inputValueFromResult(
  value: unknown,
  type: ResourceActionCapability["inputSchema"][number]["type"],
): boolean | string | null {
  if (type === "boolean") return typeof value === "boolean" ? value : null;
  if (type === "integer") return typeof value === "number" && Number.isInteger(value)
    ? String(value)
    : null;
  return typeof value === "string" ? value : null;
}

function defaultInputValue(value: boolean | number | string | null): boolean | string {
  if (typeof value === "boolean") return value;
  return value === null ? "" : String(value);
}

function actionValues(
  capability: ResourceActionCapability,
  values: Readonly<Record<string, boolean | string>>,
): Record<string, unknown> {
  return Object.fromEntries(capability.inputSchema.map((input) => {
    const value = values[input.key] ?? defaultInputValue(input.default);
    if (input.type === "boolean") return [input.key, value === true];
    return [input.key, input.type === "integer" ? Number(value) : value];
  }));
}
