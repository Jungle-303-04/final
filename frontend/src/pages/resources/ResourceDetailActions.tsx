import { Sparkles } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import type {
  ResourceActionCapability,
  ResourceActionExecutionContext,
  ResourceActionReceipt,
  ResourceActionsPort,
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

export function ResourceDetailActions({
  actionsPort,
  capabilities,
  detail,
  onInvalidate,
}: {
  actionsPort: ResourceActionsPort;
  capabilities: ResourceCapabilitiesFrame;
  detail: ResourceDetail;
  onInvalidate?: (context: ResourceActionExecutionContext) => void;
}) {
  const { t } = useI18n();
  const session = useOptionalProductSession();
  const diagnose = useOptionalDiagnoseSession();
  const operationStatusStore = useOptionalOperationStatusStore();
  const [dialog, setDialog] = useState<ResourceActionCapability | null>(null);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<ResourceActionReceipt | null>(null);
  const [failed, setFailed] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [executionKey, setExecutionKey] = useState<string | null>(null);
  const [diagnoseConsent, setDiagnoseConsent] = useState<{
    capabilities: DiagnoseCapabilities;
    target: DiagnoseResourceTarget;
  } | null>(null);
  const enabled = useMemo(() => enabledActions(capabilities, detail), [capabilities, detail]);
  const diagnoseTarget = diagnoseTargetFrom(detail);

  if (enabled.length === 0 && (!diagnose || !diagnoseTarget || !session)) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (dialog === null || pending) return;
    setPending(true);
    setFailed(false);
    try {
      const context = cronjobExecutionContext(
        capabilities,
        detail,
        dialog,
        executionKey,
      );
      if (dialog.capabilityId.startsWith("cronjob.") && context === null) {
        throw new Error("CronJob action identity is incomplete");
      }
      const result = context
        ? await actionsPort.execute(dialog, actionValues(dialog, values), context)
        : await actionsPort.execute(dialog, actionValues(dialog, values));
      setReceipt(result);
      if (result.commandId) operationStatusStore?.start(result.commandId);
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
            key={capability.capabilityId}
            onClick={() => open(capability)}
            size="sm"
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
                <Input
                  id={`resource-action-${input.key}`}
                  max={input.maximum ?? undefined}
                  min={input.minimum ?? undefined}
                  onChange={(event) => setValues((current) => ({
                    ...current,
                    [input.key]: event.currentTarget.value,
                  }))}
                  required={input.required}
                  type={input.type === "integer" ? "number" : "text"}
                  value={values[input.key] ?? defaultInputValue(input.default)}
                />
              </div>
            ))}
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
                  <Button type="submit">{t("common.action.confirm")}</Button>
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

  function open(capability: ResourceActionCapability) {
    setFailed(false);
    setValues(defaultInputValues(capability));
    setExecutionKey(capability.capabilityId.startsWith("cronjob.")
      ? resourceActionIdempotencyKey()
      : null);
    setDialog(capability);
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

function cronjobExecutionContext(
  frame: ResourceCapabilitiesFrame,
  detail: ResourceDetail,
  capability: ResourceActionCapability,
  idempotencyKey: string | null,
): ResourceActionExecutionContext | null {
  if (!capability.capabilityId.startsWith("cronjob.")) return null;
  if (frame.phase !== "ready" || idempotencyKey === null) return null;
  const uid = detail.resource.uid;
  const apiIdentity = splitApiVersion(detail.resource.apiVersion);
  if (!uid || apiIdentity === null) return null;
  return {
    capabilityId: capability.capabilityId,
    idempotencyKey,
    resourceId: frame.data.subject.resourceId,
    snapshotId: frame.data.subject.snapshotId,
    revision: frame.data.revision,
    resource: {
      apiGroup: apiIdentity.apiGroup,
      version: apiIdentity.apiVersion,
      kind: detail.identity.kind,
      namespace: detail.identity.namespace,
      name: detail.identity.name,
      uid,
    },
  };
}

function resourceActionIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `resource-action-${crypto.randomUUID()}`;
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint32Array(4));
    return `resource-action-${Array.from(bytes, (value) => value.toString(16).padStart(8, "0")).join("")}`;
  }
  throw new Error("Secure resource action identity is unavailable");
}

function diagnoseTargetFrom(detail: ResourceDetail): DiagnoseResourceTarget | null {
  const uid = detail.resource.uid;
  if (!uid) return null;
  const apiIdentity = splitApiVersion(detail.resource.apiVersion);
  if (apiIdentity === null) return null;
  return {
    clusterId: detail.clusterId,
    resourceType: detail.resource.resourceType,
    apiGroup: apiIdentity.apiGroup,
    apiVersion: apiIdentity.apiVersion,
    kind: detail.identity.kind,
    namespace: detail.identity.namespace,
    name: detail.identity.name,
    uid,
  };
}

function splitApiVersion(value: string): { apiGroup: string; apiVersion: string } | null {
  const normalized = value.trim().replace(/^\/+|\/+$/gu, "");
  if (!normalized) return null;
  const segments = normalized.split("/");
  if (segments.length === 1) return { apiGroup: "", apiVersion: segments[0] ?? "" };
  if (segments.length === 2 && segments[0] && segments[1]) {
    return { apiGroup: segments[0], apiVersion: segments[1] };
  }
  return null;
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

function defaultInputValues(capability: ResourceActionCapability): Record<string, string> {
  return Object.fromEntries(capability.inputSchema.map((input) => [
    input.key,
    defaultInputValue(input.default),
  ]));
}

function defaultInputValue(value: number | string | null): string {
  return value === null ? "" : String(value);
}

function actionValues(
  capability: ResourceActionCapability,
  values: Readonly<Record<string, string>>,
): Record<string, unknown> {
  return Object.fromEntries(capability.inputSchema.map((input) => {
    const value = values[input.key] ?? defaultInputValue(input.default);
    return [input.key, input.type === "integer" ? Number(value) : value];
  }));
}
