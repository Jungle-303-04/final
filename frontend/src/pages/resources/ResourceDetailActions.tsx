import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  ResourceActionCapability,
  ResourceActionReceipt,
  ResourceActionsPort,
} from "../../features/resources/resourceCapabilitiesContract";
import {
  EMPTY_OPERATION_EVENTS_PORT,
  type OperationEvent,
  type OperationEventsPort,
} from "../../features/operations/operationEventsContract";
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
  operationEventsPort = EMPTY_OPERATION_EVENTS_PORT,
}: {
  actionsPort: ResourceActionsPort;
  capabilities: ResourceCapabilitiesFrame;
  detail: ResourceDetail;
  operationEventsPort?: OperationEventsPort;
}) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<ResourceActionCapability | null>(null);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<ResourceActionReceipt | null>(null);
  const [failed, setFailed] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [operation, setOperation] = useState<OperationEvent | null>(null);
  const enabled = useMemo(() => enabledActions(capabilities, detail), [capabilities, detail]);

  useEffect(() => {
    if (!receipt?.commandId) return;
    const controller = new AbortController();
    void consumeOperationEvents(operationEventsPort, receipt.commandId, controller.signal, setOperation);
    return () => controller.abort();
  }, [operationEventsPort, receipt?.commandId]);

  if (enabled.length === 0) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (dialog === null || pending) return;
    setPending(true);
    setFailed(false);
    try {
      const result = await actionsPort.execute(dialog, actionValues(dialog, values));
      setReceipt(result);
      setOperation(null);
      setDialog(null);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-2" data-slot="resource-detail-actions">
      <div className="flex flex-wrap items-center gap-2">
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
        <output className="text-xs text-muted-foreground">
          {t("resources.detail.action.accepted", { id: receipt.correlationId })}
          {operation ? ` · ${String(operation.payload.status ?? operation.kind)}` : ""}
        </output>
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
    </div>
  );

  function open(capability: ResourceActionCapability) {
    setFailed(false);
    setReceipt(null);
    setValues(defaultInputValues(capability));
    setDialog(capability);
  }
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

async function consumeOperationEvents(
  port: OperationEventsPort,
  commandId: string,
  signal: AbortSignal,
  onEvent: (event: OperationEvent) => void,
): Promise<void> {
  try {
    for await (const event of port.subscribeOperationEvents(commandId, signal)) {
      onEvent(event);
    }
  } catch {
    // The accepted command remains auditable even when its live transport is unavailable.
  }
}
