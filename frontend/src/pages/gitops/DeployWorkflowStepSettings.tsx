import { X } from "lucide-react";

import type {
  ReleaseApplication,
  ReleasePlan,
  ReleasePlanStep,
} from "../../features/gitops/gitOpsContract";
import {
  ENVIRONMENTS,
  STRATEGIES,
  applicationForStep,
  configString,
  settingString,
  stepSetupFields,
  syncSelectedApplications,
  updateStep,
  type StepSetupField,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import {
  FormField,
  NativeSelect,
  environmentLabel,
  gateLabel,
  strategyLabel,
} from "./WorkflowFormControls";

export function ReleaseStepSettings({
  applications,
  index,
  onChange,
  plan,
  step,
}: {
  applications: ReleaseApplication[];
  index: number;
  onChange: (plan: ReleasePlan) => void;
  plan: ReleasePlan;
  step: ReleasePlanStep;
}) {
  const { t } = useI18n();
  const application = applicationForStep(step, applications);
  const missingFields = new Set(stepSetupFields(plan, step, application));
  const fieldError = (field: StepSetupField) => (
    missingFields.has(field) ? t("workflows.editor.missingCount", { count: 1 }) : undefined
  );
  const changeConfig = (key: string, value: string) => onChange(updateStep(plan, index, (current) => ({
    ...current,
    config: { ...current.config, [key]: value },
  })));
  const remove = () => onChange(syncSelectedApplications(
    plan,
    plan.steps.filter((_, stepIndex) => stepIndex !== index).map((item) => item.application_id),
    applications,
  ));
  return (
    <div className="mt-3 flex min-w-0 animate-in flex-wrap items-end gap-3 rounded-xl border border-tint-blue-border bg-tint-blue-bg/40 p-3 fade-in-0 slide-in-from-top-1 duration-(--motion-soft) ease-(--ease-soft) motion-reduce:animate-none">
      <strong className="w-full text-label font-bold text-tint-blue-fg">{step.name || step.application_id}</strong>
      {missingFields.has("application_id") ? (
        <FormField className="min-w-48 flex-[1_1_14rem]" error={fieldError("application_id")} label={t("workflows.editor.application")}>
          <Input aria-invalid disabled value={step.application_id} />
        </FormField>
      ) : null}
      <SourceField
        error={fieldError("repo_ref")}
        label={t("workflows.detail.repository")}
        missing={missingFields.has("repo_ref")}
        onChange={(value) => changeConfig("repo_ref", value)}
        value={configString(step, "repo_ref", application?.repository || "")}
      />
      <SourceField
        error={fieldError("branch")}
        label={t("workflows.detail.branch")}
        missing={missingFields.has("branch")}
        onChange={(value) => changeConfig("branch", value)}
        value={configString(step, "branch", application?.branch || "")}
      />
      <SourceField
        error={fieldError("manifest_path")}
        label={t("workflows.detail.manifest")}
        missing={missingFields.has("manifest_path")}
        onChange={(value) => changeConfig("manifest_path", value)}
        value={configString(step, "manifest_path", application?.manifestPath || "")}
      />
      <FormField className="min-w-48 flex-[1_1_14rem]" label={t("workflows.editor.environment")}>
        <NativeSelect onChange={(value) => changeConfig("environment", value)} value={configString(step, "environment", "staging")}>
          {ENVIRONMENTS.map((environment) => (
            <option key={environment} value={environment}>{environmentLabel(environment, t)}</option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField className="min-w-48 flex-[1_1_14rem]" label={t("workflows.editor.strategy")}>
        <NativeSelect onChange={(value) => changeConfig("strategy", value)} value={configString(step, "strategy", settingString(plan, "default_strategy", "rolling"))}>
          {STRATEGIES.map((strategy) => (
            <option key={strategy} value={strategy}>{strategyLabel(strategy, t)}</option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField className="min-w-48 flex-[1_1_14rem]" error={fieldError("cluster_id")} label={t("workflows.editor.cluster")}>
        <Input
          aria-invalid={missingFields.has("cluster_id") || undefined}
          onChange={(event) => changeConfig("cluster_id", event.currentTarget.value)}
          placeholder={t("workflows.editor.clusterPlaceholder")}
          value={configString(step, "cluster_id", application?.clusterId || "")}
        />
      </FormField>
      <FormField className="min-w-48 flex-[1_1_14rem]" label={t("workflows.editor.namespace")}>
        <Input
          onChange={(event) => changeConfig("namespace", event.currentTarget.value)}
          value={typeof step.config.namespace === "string" ? step.config.namespace : "default"}
        />
      </FormField>
      <SourceField
        error={fieldError("commit_sha")}
        label={t("workflows.editor.commitSha")}
        missing={missingFields.has("commit_sha")}
        onChange={(value) => changeConfig("commit_sha", value)}
        placeholder={t("workflows.editor.commitShaPlaceholder")}
        value={configString(step, "commit_sha", settingString(plan, "commit_sha"))}
      />
      <SourceField
        error={fieldError("image")}
        label={t("workflows.editor.image")}
        missing={missingFields.has("image")}
        onChange={(value) => changeConfig("image", value)}
        placeholder={t("workflows.editor.imagePlaceholder")}
        value={configString(step, "image", settingString(plan, "image"))}
      />
      <FormField className="min-w-48 flex-[1_1_14rem]" label={t("workflows.editor.gate")}>
        <NativeSelect onChange={(value) => changeConfig("approval_gate", value)} value={configString(step, "approval_gate", "inherit")}>
          {(["inherit", "auto", "manual", "safe_pr"] as const).map((gate) => (
            <option key={gate} value={gate}>{gateLabel(gate, t)}</option>
          ))}
        </NativeSelect>
      </FormField>
      <Button className="self-end" onClick={remove} size="sm" type="button" variant="destructive">
        <X aria-hidden="true" />{t("workflows.editor.remove")}
      </Button>
    </div>
  );
}

function SourceField({
  error,
  label,
  missing,
  onChange,
  placeholder,
  value,
}: {
  error?: string;
  label: string;
  missing: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <FormField className="min-w-48 flex-[1_1_14rem]" error={error} label={label}>
      <Input
        aria-invalid={missing || undefined}
        className="font-mono"
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        value={value}
      />
    </FormField>
  );
}
