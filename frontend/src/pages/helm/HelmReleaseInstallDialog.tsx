import { useEffect, useRef, useState } from "react";

import { type HelmPort, type HelmUpgradeTarget } from "../../features/helm/helmContract";
import { useHelmCopy } from "../../features/helm/helmCopy";
import { useOptionalOperationStatusStore } from "../../features/operations/OperationStatusStore";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { ConfirmationDialog } from "../../shared/ui/primitives/confirmation-dialog";
import { Input } from "../../shared/ui/primitives/input";
import {
  initialValues,
  typedValues,
  UpgradeInputField,
  valuesAreValid,
  type HelmFormValues,
} from "./HelmReleaseUpgradeDialog";

export function HelmReleaseInstallDialog({
  clusterId,
  port,
  preferredTarget,
  triggerLabel,
}: {
  clusterId: string;
  port: HelmPort;
  preferredTarget?: Pick<HelmUpgradeTarget, "itemId" | "version">;
  triggerLabel?: string;
}) {
  const copy = useHelmCopy();
  const resolvedTriggerLabel = triggerLabel ?? copy.install;
  const operationStore = useOptionalOperationStatusStore();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [namespace, setNamespace] = useState("");
  const [targets, setTargets] = useState<readonly HelmUpgradeTarget[]>([]);
  const [targetKey, setTargetKey] = useState("");
  const [releaseName, setReleaseName] = useState("");
  const [values, setValues] = useState<HelmFormValues>({});
  const requestRef = useRef<AbortController | null>(null);
  const target = targets.find((item) => key(item) === targetKey) ?? targets[0] ?? null;

  useEffect(() => () => requestRef.current?.abort(), []);

  const show = async () => {
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setPending(true);
    setFailure(null);
    setOpen(true);
    try {
      const result = await port.listInstallTargets(controller.signal);
      const first = result.targets.find((item) => preferredTarget
        && item.itemId === preferredTarget.itemId
        && item.version === preferredTarget.version) ?? result.targets[0] ?? null;
      setNamespace(result.namespace);
      setTargets(result.targets);
      setTargetKey(first ? key(first) : "");
      setValues(first ? initialValues(first) : {});
    } catch {
      if (!controller.signal.aborted) setFailure(copy.installTargetsFailed);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  };
  const selectTarget = (value: string) => {
    const next = targets.find((item) => key(item) === value) ?? null;
    setTargetKey(value);
    setValues(next ? initialValues(next) : {});
  };
  const confirm = async () => {
    const canonicalName = releaseName.trim();
    if (pending || target === null || canonicalName === "" || !valuesAreValid(target, values)) return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setPending(true);
    setFailure(null);
    try {
      const receipt = await port.installRelease({
        clusterId,
        namespace,
        applicationName: canonicalName,
        releaseName: canonicalName,
        catalogItemId: target.itemId,
        catalogVersion: target.version,
        values: typedValues(target, values),
        confirmation: true,
        idempotencyKey: globalThis.crypto.randomUUID(),
      }, controller.signal);
      operationStore?.start(receipt.commandId);
      if (!operationStore) setFailure(copy.operationStreamUnavailable);
      setOpen(false);
    } catch {
      setFailure(copy.installFailed);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  };

  return (
    <>
      <Button onClick={() => void show()} size="sm" type="button">{resolvedTriggerLabel}</Button>
      <ConfirmationDialog
        cancelLabel={copy.chartSourceCancel}
        confirmDisabled={target === null || releaseName.trim() === "" || !valuesAreValid(target, values)}
        confirmLabel={pending ? copy.installPending : copy.installConfirm}
        description={copy.installDescription}
        details={target ? `${clusterId} · ${namespace} · ${releaseName.trim()} · ${target.name} ${target.version}` : undefined}
        onConfirm={() => void confirm()}
        onOpenChange={(next) => { if (!pending) setOpen(next); }}
        open={open}
        pending={pending}
        title={copy.installTitle}
        variant="warning"
      >
        <div className="grid min-w-0 gap-3">
          <label className="grid gap-1 text-sm" htmlFor="helm-install-target">
            <span className="font-medium">{copy.installTarget}</span>
            <select className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm" id="helm-install-target" onChange={(event) => selectTarget(event.target.value)} value={target ? key(target) : ""}>
              {targets.map((item) => <option key={key(item)} value={key(item)}>{item.name} {item.version}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm" htmlFor="helm-install-release">
            <span className="font-medium">{copy.installReleaseName}</span>
            <Input id="helm-install-release" onChange={(event) => setReleaseName(event.target.value)} value={releaseName} />
          </label>
          {target?.inputs.map((input) => (
            <UpgradeInputField input={input} key={input.name} onChange={(value) => setValues((current) => ({ ...current, [input.name]: value }))} value={values[input.name] ?? ""} />
          ))}
          {failure ? <Alert variant="destructive"><AlertDescription>{failure}</AlertDescription></Alert> : null}
        </div>
      </ConfirmationDialog>
    </>
  );
}

function key(target: HelmUpgradeTarget): string {
  return `${target.itemId}\u001f${target.version}`;
}
