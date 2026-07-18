import { useEffect, useRef, useState } from "react";

import {
  HelmPortFailure,
  type HelmPort,
  type HelmReleaseDetail,
  type HelmReleaseVersionList,
  type HelmUpgradeInput,
  type HelmUpgradeTarget,
} from "../../features/helm/helmContract";
import { toHelmValuesPreviewOperationResult } from "../../features/helm/createHelmAdapter";
import {
  useOptionalOperationStatus,
  useOptionalOperationStatusStore,
} from "../../features/operations/OperationStatusStore";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { ConfirmationDialog } from "../../shared/ui/primitives/confirmation-dialog";
import { Input } from "../../shared/ui/primitives/input";
import { HelmResourcesDiffView } from "./HelmResourcesDiffView";
import { useI18n } from "../../shared/i18n/I18nProvider";
import type { TranslationFunction } from "../../shared/i18n/types";

export type HelmFormValues = Readonly<Record<string, string>>;

export function HelmReleaseUpgradeDialog({
  availableVersions,
  detail,
  onAccepted,
  port,
}: {
  availableVersions: HelmReleaseVersionList;
  detail: HelmReleaseDetail;
  onAccepted: () => void;
  port: HelmPort;
}) {
  const { t } = useI18n();
  const commands = detail.commands;
  const operationStore = useOptionalOperationStatusStore();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [previewFailure, setPreviewFailure] = useState<string | null>(null);
  const [previewCommandId, setPreviewCommandId] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [values, setValues] = useState<HelmFormValues>({});
  const requestRef = useRef<AbortController | null>(null);
  const previewRequestRef = useRef<AbortController | null>(null);
  const previewSnapshot = useOptionalOperationStatus(previewCommandId);
  const authorizedVersions = new Set(
    availableVersions.availability !== "unavailable"
    && availableVersions.chartName === detail.release.chart
    && chartVersionsEqual(availableVersions.currentVersion, detail.release.chartVersion)
      ? availableVersions.versions
        .filter((item) => !item.deprecated)
        .map((item) => comparableChartVersion(item.version))
        .filter((item): item is string => item !== null)
      : [],
  );
  const targets = commands.availability === "available"
    ? commands.upgradeTargets.filter((item) => {
      const version = comparableChartVersion(item.chartVersion);
      return version !== null && authorizedVersions.has(version);
    })
    : [];
  const target = targets.find((item) => upgradeTargetKey(item) === targetKey) ?? targets[0] ?? null;

  useEffect(() => () => {
    requestRef.current?.abort();
    previewRequestRef.current?.abort();
  }, []);

  if (commands.availability !== "available" || targets.length === 0) return null;

  const changeOpen = (next: boolean) => {
    if (pending) return;
    if (!next) {
      requestRef.current?.abort();
      previewRequestRef.current?.abort();
    }
    setFailure(null);
    setPreviewFailure(null);
    setPreviewCommandId("");
    if (next) {
      const first = targets[0] ?? null;
      setTargetKey(first ? upgradeTargetKey(first) : "");
      setValues(first ? initialValues(first) : {});
    }
    setOpen(next);
  };
  const selectTarget = (nextKey: string) => {
    previewRequestRef.current?.abort();
    const next = targets.find((item) => upgradeTargetKey(item) === nextKey) ?? null;
    setTargetKey(nextKey);
    setValues(next ? initialValues(next) : {});
    setFailure(null);
    setPreviewFailure(null);
    setPreviewCommandId("");
  };
  const changeValue = (name: string, value: string) => {
    previewRequestRef.current?.abort();
    setValues((current) => ({ ...current, [name]: value }));
    setPreviewFailure(null);
    setPreviewCommandId("");
  };
  const previewChanges = async () => {
    if (target === null || detail.release.revision === null || !valuesAreValid(target, values)) {
      setPreviewFailure(t("helm.upgrade.inputRequired"));
      return;
    }
    const controller = new AbortController();
    previewRequestRef.current?.abort();
    previewRequestRef.current = controller;
    setPreviewFailure(null);
    setPreviewCommandId("");
    try {
      const receipt = await port.previewReleaseValues({
        clusterId: detail.release.scope.clusterId,
        namespace: detail.release.storageNamespace,
        releaseName: detail.release.name,
        expectedRevision: detail.release.revision,
        catalogItemId: target.itemId,
        catalogVersion: target.version,
        values: typedValues(target, values),
      }, controller.signal);
      if (!operationStore) {
        setPreviewFailure(t("helm.upgrade.previewStreamUnavailable"));
        return;
      }
      setPreviewCommandId(receipt.commandId);
      operationStore.start(receipt.commandId);
    } catch (error) {
      if (!controller.signal.aborted) setPreviewFailure(previewFailureCopy(error, t));
    } finally {
      if (previewRequestRef.current === controller) previewRequestRef.current = null;
    }
  };
  const confirm = async () => {
    if (pending || target === null || detail.release.revision === null) return;
    if (!valuesAreValid(target, values)) {
      setFailure(t("helm.upgrade.inputRequired"));
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
        reason: t("helm.upgrade.reason", { release: detail.release.name, target: target.name, version: target.version }),
      }, controller.signal);
      operationStore?.start(receipt.commandId);
      if (!operationStore) setFailure(t("helm.upgrade.streamUnavailable"));
      onAccepted();
      setOpen(false);
    } catch (error) {
      setFailure(upgradeFailureCopy(error, t));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setPending(false);
    }
  };
  const previewResult = previewSnapshot?.status === "completed"
    ? toHelmValuesPreviewOperationResult(previewSnapshot.event?.payload)
    : null;
  const previewMatches = previewResult !== null
    && target !== null
    && previewResult.namespace === detail.release.storageNamespace
    && previewResult.releaseName === detail.release.name
    && previewResult.expectedRevision === detail.release.revision
    && previewResult.catalogItemId === target.itemId
    && previewResult.catalogVersion === target.version;
  const previewStatusFailure = previewCommandId && previewSnapshot
    && ["failed", "cancelled", "forbidden", "invalid", "unavailable"].includes(previewSnapshot.status)
      ? t("helm.upgrade.previewFailed")
      : previewSnapshot?.status === "completed" && !previewMatches
        ? t("helm.upgrade.previewInvalid")
        : null;
  const previewRunning = previewCommandId !== ""
    && previewSnapshot !== null
    && ["connecting", "running", "reconnecting"].includes(previewSnapshot.status);

  return (
    <>
      <Button onClick={() => changeOpen(true)} size="sm" type="button">
        {t("helm.upgrade.action")}
      </Button>
      <ConfirmationDialog
        cancelLabel={t("common.action.cancel")}
        className="sm:max-w-3xl"
        confirmDisabled={target === null || detail.release.revision === null || !valuesAreValid(target, values)}
        confirmLabel={pending ? t("helm.upgrade.pending") : t("helm.upgrade.confirm")}
        description={t("helm.upgrade.description")}
        details={target ? upgradeDiff(detail, target, t) : undefined}
        onConfirm={() => void confirm()}
        onOpenChange={changeOpen}
        open={open}
        pending={pending}
        title={t("helm.upgrade.title")}
        variant="warning"
      >
        <div className="grid min-w-0 gap-3">
          <label className="grid gap-1 text-sm" htmlFor="helm-upgrade-target">
            <span className="font-medium">{t("helm.upgrade.target")}</span>
            <select
              className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm text-foreground"
              id="helm-upgrade-target"
              onChange={(event) => selectTarget(event.target.value)}
              value={target ? upgradeTargetKey(target) : ""}
            >
              {targets.map((item) => (
                <option key={upgradeTargetKey(item)} value={upgradeTargetKey(item)}>
                  {t("helm.upgrade.option", { name: item.name, version: item.version, chartVersion: item.chartVersion })}
                </option>
              ))}
            </select>
          </label>
          {target?.inputs.map((input) => (
            <UpgradeInputField
              input={input}
              key={input.name}
              onChange={(value) => changeValue(input.name, value)}
              value={values[input.name] ?? ""}
            />
          ))}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              disabled={previewRunning || target === null || !valuesAreValid(target, values)}
              onClick={() => void previewChanges()}
              size="sm"
              type="button"
              variant="outline"
            >
              {previewRunning ? t("helm.upgrade.previewPending") : t("helm.upgrade.preview")}
            </Button>
            {previewRunning ? (
              <span aria-live="polite" className="text-xs text-muted-foreground">
                {t("helm.upgrade.previewRunning")}
              </span>
            ) : null}
          </div>
          {previewMatches && previewResult ? (
            <section className="grid max-h-80 min-w-0 gap-3 overflow-auto border-t pt-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t("helm.upgrade.previewReady")}</h3>
                <span className="text-xs text-muted-foreground">
                  {previewResult.chartName} {previewResult.chartVersion}
                </span>
              </div>
              <HelmResourcesDiffView diff={previewResult.resources} />
            </section>
          ) : null}
          {previewFailure ?? previewStatusFailure ? (
            <Alert>
              <AlertDescription>{previewFailure ?? previewStatusFailure}</AlertDescription>
            </Alert>
          ) : null}
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

export function UpgradeInputField({
  input,
  onChange,
  value,
}: {
  input: HelmUpgradeInput;
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useI18n();
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
          <option value="">{t("helm.upgrade.selectValue")}</option>
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

function chartVersionsEqual(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  const normalizedLeft = comparableChartVersion(left);
  return normalizedLeft !== null && normalizedLeft === comparableChartVersion(right);
}

function comparableChartVersion(value: string): string | null {
  const normalized = value.trim().replace(/_/g, "+");
  const match = normalized.match(
    /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  return match?.[1] ?? null;
}

export function initialValues(target: HelmUpgradeTarget): HelmFormValues {
  return Object.fromEntries(target.inputs.map((input) => [
    input.name,
    input.defaultValue === null ? "" : String(input.defaultValue),
  ]));
}

export function valuesAreValid(target: HelmUpgradeTarget | null, values: HelmFormValues): boolean {
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

export function typedValues(target: HelmUpgradeTarget, values: HelmFormValues): Record<string, unknown> {
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

function upgradeDiff(detail: HelmReleaseDetail, target: HelmUpgradeTarget, t: TranslationFunction): string {
  return [
    t("helm.upgrade.diff.release", {
      cluster: detail.release.scope.clusterId,
      namespace: detail.release.storageNamespace,
      release: detail.release.name,
      revision: detail.release.revision ?? t("common.state.unknown"),
    }),
    t("helm.upgrade.diff.target", { target: target.name, version: target.version, chartVersion: target.chartVersion }),
    t("helm.upgrade.diff.values", { count: target.inputs.length }),
  ].join("\n");
}

function upgradeFailureCopy(error: unknown, t: TranslationFunction): string {
  if (error instanceof HelmPortFailure) {
    if (error.code === "forbidden" || error.code === "unauthorized") {
      return t("helm.upgrade.forbidden");
    }
    if (error.code === "invalid-request" || error.code === "not-found") {
      return t("helm.upgrade.stale");
    }
  }
  return t("helm.upgrade.failed");
}

function previewFailureCopy(error: unknown, t: TranslationFunction): string {
  if (error instanceof HelmPortFailure) {
    if (error.code === "forbidden" || error.code === "unauthorized") {
      return t("helm.upgrade.forbidden");
    }
    if (error.code === "invalid-request" || error.code === "not-found") {
      return t("helm.upgrade.stale");
    }
  }
  return t("helm.upgrade.previewFailed");
}
