import { GitBranch, Save } from "lucide-react";
import { useState, type ReactNode } from "react";
import type {
  ReleaseApplication,
  ReleasePlan,
  ReleasePlanStatus,
} from "../../features/gitops/gitOpsContract";
import {
  APPROVAL_POLICIES,
  planValidationCodes,
  settingString,
  stepKey,
  type StepSetupField,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import { Surface } from "../../shared/ui/Surface";
import { PlanStepEditor } from "./PlanStepEditor";
import { WorkflowInlineHeading } from "./WorkflowInlineHeading";
import { WorkflowTargetAddControl } from "./WorkflowTargetAddControl";
import { WorkflowWorkspaceHeader } from "./WorkflowWorkspaceHeader";
import {
  FormField,
  NativeSelect,
  policyLabel,
} from "./WorkflowFormControls";

export function PlanEditor({
  plan,
  applications,
  pending,
  focusedStepId,
  focusedField,
  onChange,
  onSave,
}: {
  plan: ReleasePlan;
  applications: ReleaseApplication[];
  pending: boolean;
  focusedStepId?: string;
  focusedField?: StepSetupField;
  onChange: (plan: ReleasePlan) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const [expandedStepId, setExpandedStepId] = useState(
    focusedStepId || (plan.steps[0] ? stepKey(plan.steps[0], 0) : ""),
  );
  const validationCodes = planValidationCodes(plan);
  const effectiveExpandedStepId = plan.steps.some(
    (step, index) => stepKey(step, index) === expandedStepId,
  )
    ? expandedStepId
    : plan.steps[0]
      ? stepKey(plan.steps[0], 0)
      : "";
  return (
    <div className="grid min-w-0 gap-4">
      <WorkflowWorkspaceHeader
        actions={<Button disabled={pending || validationCodes.length > 0} onClick={onSave}>
          <Save aria-hidden="true" />
          {pending ? t("workflows.editor.saving") : t("workflows.editor.save")}
        </Button>}
        sticky
        title={t("workflows.editor.title")}
      />

      {validationCodes.length ? (
        <div className="grid min-w-0 gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-foreground">
          {validationCodes.map((code) => <span key={code}>{validationMessage(code, t)}</span>)}
        </div>
      ) : null}

      <Surface aria-label={t("workflows.editor.general")} className="grid min-w-0 gap-4 p-4">
        <SectionHeading icon={<GitBranch aria-hidden="true" />} title={t("workflows.editor.general")} />
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <FormField label={t("workflows.editor.name")}>
            <Input onChange={(event) => onChange({ ...plan, name: event.target.value })} value={plan.name} />
          </FormField>
          <FormField label={t("workflows.editor.status")}>
            <NativeSelect onChange={(value) => onChange({ ...plan, status: value as ReleasePlanStatus })} value={plan.status}>
              {(["draft", "active", "paused", "archived"] as const).map((status) => (
                <option key={status} value={status}>{t(`workflows.status.${status}`)}</option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField className="md:col-span-2" label={t("workflows.editor.descriptionLabel")}>
            <textarea
              className="min-h-20 w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              onChange={(event) => onChange({ ...plan, description: event.target.value })}
              value={plan.description}
            />
          </FormField>
          <FormField label={t("workflows.editor.policy")}>
            <NativeSelect
              onChange={(value) => onChange({ ...plan, settings: { ...plan.settings, approval_policy: value } })}
              value={settingString(plan, "approval_policy", "manual_each_step")}
            >
              {APPROVAL_POLICIES.map((policy) => <option key={policy} value={policy}>{policyLabel(policy, t)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField label={t("workflows.editor.runtime")}>
            <NativeSelect
              onChange={(value) => onChange({ ...plan, settings: { ...plan.settings, runtime_mode: value } })}
              value={settingString(plan, "runtime_mode", "review")}
            >
              <option value="review">{t("workflows.option.runtime.review")}</option>
              <option value="live">{t("workflows.option.runtime.live")}</option>
            </NativeSelect>
          </FormField>
        </div>
      </Surface>

      <section aria-labelledby="workflow-editor-steps" className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <WorkflowInlineHeading
            className="flex-1"
            title={t("workflows.editor.steps")}
            titleId="workflow-editor-steps"
            variant="compact"
          />
          <WorkflowTargetAddControl
            applications={applications}
            onAdded={setExpandedStepId}
            onChange={onChange}
            plan={plan}
          />
        </div>
        {plan.steps.length ? (
          <div className="grid min-w-0 gap-2">
            {plan.steps.map((step, index) => (
              <PlanStepEditor
                applications={applications}
                expanded={effectiveExpandedStepId === stepKey(step, index)}
                focusField={focusedStepId === stepKey(step, index) ? focusedField : undefined}
                index={index}
                key={step.step_id || step.application_id}
                onChange={onChange}
                onToggle={() => setExpandedStepId((current) => current === stepKey(step, index) ? "" : stepKey(step, index))}
                plan={plan}
              />
            ))}
          </div>
        ) : (
          <div className="grid min-h-32 place-items-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
            {t("workflows.editor.noTargets")}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return <WorkflowInlineHeading icon={icon} title={title} variant="compact" />;
}

type T = ReturnType<typeof useI18n>["t"];

function validationMessage(code: string, t: T): string {
  if (code === "name") return t("workflows.validation.name");
  if (code === "steps") return t("workflows.validation.steps");
  if (code === "duplicate") return t("workflows.validation.duplicate");
  return t("workflows.validation.dependency");
}

export { FormField, NativeSelect, policyLabel } from "./WorkflowFormControls";
