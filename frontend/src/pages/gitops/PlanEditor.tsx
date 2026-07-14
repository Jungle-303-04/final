import { GitBranch, Plus, Save } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type {
  ReleaseApplication,
  ReleasePlan,
  ReleasePlanStatus,
} from "../../features/gitops/gitOpsContract";
import {
  APPROVAL_POLICIES,
  planValidationCodes,
  settingString,
  syncSelectedApplications,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import { Surface } from "../../shared/ui/Surface";
import { PlanStepEditor } from "./PlanStepEditor";
import {
  FormField,
  NativeSelect,
  policyLabel,
} from "./WorkflowFormControls";

export function PlanEditor({
  plan,
  applications,
  pending,
  onChange,
  onSave,
}: {
  plan: ReleasePlan;
  applications: ReleaseApplication[];
  pending: boolean;
  onChange: (plan: ReleasePlan) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const [targetToAdd, setTargetToAdd] = useState("");
  const validationCodes = planValidationCodes(plan);
  const availableTargets = useMemo(() => {
    const selected = new Set(plan.steps.map((step) => step.application_id));
    return applications.filter((application) => !selected.has(application.id));
  }, [applications, plan.steps]);
  const addTarget = () => {
    const applicationId = targetToAdd || availableTargets[0]?.id;
    if (!applicationId) return;
    onChange(syncSelectedApplications(
      plan,
      [...plan.steps.map((step) => step.application_id), applicationId],
      applications,
    ));
    setTargetToAdd("");
  };

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-col items-stretch gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="grid min-w-0 gap-0.5">
          <h2 className="m-0 text-base font-semibold [overflow-wrap:anywhere]">{t("workflows.editor.title")}</h2>
          <p className="m-0 text-xs leading-5 text-muted-foreground">{t("workflows.editor.description")}</p>
        </div>
        <Button disabled={pending || validationCodes.length > 0} onClick={onSave}>
          <Save aria-hidden="true" />
          {pending ? t("workflows.editor.saving") : t("workflows.editor.save")}
        </Button>
      </div>

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
          <div className="grid min-w-0 gap-0.5">
            <h2 className="m-0 text-sm font-semibold" id="workflow-editor-steps">{t("workflows.editor.steps")}</h2>
            <p className="m-0 text-xs leading-5 text-muted-foreground">{t("workflows.editor.stepsDescription")}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <NativeSelect
              ariaLabel={t("workflows.editor.application")}
              className="w-full min-w-0 sm:w-64"
              disabled={!availableTargets.length}
              onChange={setTargetToAdd}
              value={targetToAdd || availableTargets[0]?.id || ""}
            >
              {availableTargets.map((application) => <option key={application.id} value={application.id}>{application.name}</option>)}
            </NativeSelect>
            <Button disabled={!availableTargets.length} onClick={addTarget} variant="outline">
              <Plus aria-hidden="true" />{t("workflows.editor.addTarget")}
            </Button>
          </div>
        </div>
        {plan.steps.length ? (
          <div className="grid min-w-0 gap-2">
            {plan.steps.map((step, index) => (
              <PlanStepEditor
                applications={applications}
                index={index}
                key={step.step_id || step.application_id}
                onChange={onChange}
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
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">{icon}</span>
      <h2 className="m-0 text-sm font-semibold">{title}</h2>
    </div>
  );
}

type T = ReturnType<typeof useI18n>["t"];

function validationMessage(code: string, t: T): string {
  if (code === "name") return t("workflows.validation.name");
  if (code === "steps") return t("workflows.validation.steps");
  if (code === "duplicate") return t("workflows.validation.duplicate");
  return t("workflows.validation.dependency");
}

export { FormField, NativeSelect, policyLabel } from "./WorkflowFormControls";
