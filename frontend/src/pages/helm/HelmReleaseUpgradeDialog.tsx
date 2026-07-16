import { useEffect, useRef, useState } from "react";

import {
  HelmPortFailure,
  type HelmPort,
  type HelmReleaseDetail,
  type HelmUpgradeInput,
  type HelmUpgradeTarget,
} from "../../features/helm/helmContract";
import { HELM_COPY } from "../../features/helm/helmCopy";
import { useOptionalOperationStatusStore } from "../../features/operations/OperationStatusStore";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { ConfirmationDialog } from "../../shared/ui/primitives/confirmation-dialog";
import { Input } from "../../shared/ui/primitives/input";

type FormValues = Readonly<Record<string, string>>;

export function HelmReleaseUpgradeDialog({
  detail,
  onAccepted,
  port,
}: {
  detail: HelmReleaseDetail;
  onAccepted: () => void;
  port: HelmPort;
}) {
  const commands = detail.commands;
  const operationStore = useOptionalOperationStatusStore();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [targetKey, setTargetKey] = useState("");
  const [values, setValues] = useState<FormValues>({});
  const requestRef = useRef<AbortController | null>(null);
  const targets = commands.availability === "available" ? commands.upgradeTargets : [];
  const target = targets.find((item) => upgradeTargetKey(item) === targetKey) ?? targets[0] ?? null;

  useEffect(() => () => requestRef.current?.abort(), []);

  if (commands.availability !== "available") return null;

  const changeOpen = (next: boolean) => {
    if (pending) return;
    if (!next) requestRef.current?.abort();
    setFailure(null);
    if (next) {
      const first = targets[0] ?? null;
      setTargetKey(first ? upgradeTargetKey(first) : "");
      setValues(first ? initialValues(first) : {});
    }
    setOpen(next);
  };
  const selectTarget = (nextKey: string) => {
    const next = targets.find((item) => upgradeTargetKey(item) === nextKey) ?? null;
    setTargetKey(nextKey);
    setValues(next ? initialValues(next) : {});
    setFailure(null);
  };
  const confirm = async () => {
    if (pending || target === null || detail.release.revision === null) return;
    if (!valuesAreValid(target, values)) {
      setFailure(HELM_COPY.upgradeInputRequired);
      return;
    }
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setPending(true);
    setFailure(null);
    try {
      const receipt = await port.upgradeRelease({
        clusterId: detail.release.scope.clusterId,
        namespace: detail.release.storageNamespace,
        releaseName: detail.release.name,
        expectedRevision: detail.release.revision,
        catalogItemId: target.itemId,
        catalogVersion: target.version,
        values: typedValues(target, values),
        confirmation: true,
        reason: `Upgrade ${detail.release.name} to ${target.name} ${target.version}`,
      }, controller.signal);
      operationStore?.start(receipt.commandId);
      if (!operationStore) setFailure(HELM_COPY.upgradeStreamUnavailable);
      onAccepted();
      setOpen(false);
    } catch (error) {
      setFailure(upgradeFailureCopy(error));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setPending(false);
    }
  };

  return (
    <>
      <Button onClick={() => changeOpen(true)} size="sm" type="button">
        {HELM_COPY.upgrade}
      </Button>
      <ConfirmationDialog
        cancelLabel={HELM_COPY.chartSourceCancel}
        confirmDisabled={target === null || detail.release.revision === null || !valuesAreValid(target, values)}
        confirmLabel={pending ? HELM_COPY.upgradePending : HELM_COPY.upgradeConfirm}
        description={HELM_COPY.upgradeDescription}
        details={target ? upgradeDiff(detail, target) : undefined}
        onConfirm={() => void confirm()}
        onOpenChange={changeOpen}
        open={open}
        pending={pending}
        title={HELM_COPY.upgradeTitle}
        variant="warning"
      >
        <div className="grid min-w-0 gap-3">
          <label className="grid gap-1 text-sm" htmlFor="helm-upgrade-target">
            <span className="font-medium">{HELM_COPY.upgradeTarget}</span>
            <select
              className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm text-foreground"
              id="helm-upgrade-target"
              onChange={(event) => selectTarget(event.target.value)}
              value={target ? upgradeTargetKey(target) : ""}
            >
              {targets.map((item) => (
                <option key={upgradeTargetKey(item)} value={upgradeTargetKey(item)}>
                  {item.name} {item.version} (chart {item.chartVersion})
                </option>
              ))}
            </select>
          </label>
          {target?.inputs.map((input) => (
            <UpgradeInputField
              input={input}
              key={input.name}
              onChange={(value) => setValues((current) => ({ ...current, [input.name]: value }))}
              value={values[input.name] ?? ""}
            />
          ))}
          {failure ? (
            <Alert variant="destructive">
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </ConfirmationDialog>
    </>
  );
}

function UpgradeInputField({
  input,
  onChange,
  value,
}: {
  input: HelmUpgradeInput;
  onChange: (value: string) => void;
  value: string;
}) {
  const label = input.required ? `${input.name} *` : input.name;
  if (input.allowedValues.length > 0 || input.valueType === "boolean") {
    const options = input.allowedValues.length > 0
      ? input.allowedValues.map(String)
      : ["true", "false"];
    return (
      <label className="grid gap-1 text-sm" htmlFor={`helm-upgrade-${input.name}`}>
        <span className="break-all font-medium">{label}</span>
        <select
          aria-label={input.name}
          className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm text-foreground"
          id={`helm-upgrade-${input.name}`}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          <option value="">Select a value</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label className="grid gap-1 text-sm" htmlFor={`helm-upgrade-${input.name}`}>
      <span className="break-all font-medium">{label}</span>
      <Input
        aria-label={input.name}
        id={`helm-upgrade-${input.name}`}
        inputMode={input.valueType === "string" ? undefined : "decimal"}
        onChange={(event) => onChange(event.target.value)}
        required={input.required}
        value={value}
      />
    </label>
  );
}

function upgradeTargetKey(target: HelmUpgradeTarget): string {
  return `${target.itemId}\u001f${target.version}`;
}

function initialValues(target: HelmUpgradeTarget): FormValues {
  return Object.fromEntries(target.inputs.map((input) => [
    input.name,
    input.defaultValue === null ? "" : String(input.defaultValue),
  ]));
}

function valuesAreValid(target: HelmUpgradeTarget | null, values: FormValues): boolean {
  if (target === null) return false;
  return target.inputs.every((input) => {
    const value = values[input.name]?.trim() ?? "";
    if (input.required && value === "") return false;
    if (value === "") return true;
    if (input.valueType === "integer") return /^-?\d+$/.test(value);
    if (input.valueType === "number") return Number.isFinite(Number(value));
    if (input.valueType === "boolean") return value === "true" || value === "false";
    return true;
  });
}

function typedValues(target: HelmUpgradeTarget, values: FormValues): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const input of target.inputs) {
    const raw = values[input.name]?.trim() ?? "";
    if (raw === "") continue;
    if (input.valueType === "integer") result[input.name] = Number.parseInt(raw, 10);
    else if (input.valueType === "number") result[input.name] = Number(raw);
    else if (input.valueType === "boolean") result[input.name] = raw === "true";
    else result[input.name] = raw;
  }
  return result;
}

function upgradeDiff(detail: HelmReleaseDetail, target: HelmUpgradeTarget): string {
  return [
    `${detail.release.scope.clusterId} · ${detail.release.storageNamespace} · ${detail.release.name} · revision ${detail.release.revision ?? "unknown"}`,
    `Target: ${target.name} ${target.version} · chart ${target.chartVersion}`,
    `Values: ${target.inputs.length}`,
  ].join("\n");
}

function upgradeFailureCopy(error: unknown): string {
  if (error instanceof HelmPortFailure) {
    if (error.code === "forbidden" || error.code === "unauthorized") {
      return HELM_COPY.upgradeForbidden;
    }
    if (error.code === "invalid-request" || error.code === "not-found") {
      return HELM_COPY.upgradeStale;
    }
  }
  return HELM_COPY.upgradeFailed;
}
