import { Plus } from "lucide-react";
import { useState } from "react";

import type { ReleaseApplication, ReleasePlan } from "../../features/gitops/gitOpsContract";
import {
  configString,
  settingString,
  syncSelectedApplications,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { FormField, NativeSelect } from "./WorkflowFormControls";

export function QuickPlanActions({
  onChange,
  plan,
}: {
  onChange: (plan: ReleasePlan) => void;
  plan: ReleasePlan;
}) {
  const { t } = useI18n();
  const manual = settingString(plan, "approval_policy", "manual_each_step") !== "auto_safe";
  const canary = plan.steps.some((step) => (
    configString(step, "strategy", settingString(plan, "default_strategy", "rolling")) === "canary"
  ));
  return (
    <>
      {!manual ? (
        <Button
          onClick={() => onChange({ ...plan, settings: { ...plan.settings, approval_policy: "manual_each_step" } })}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" />{t("workflows.graph.manualApproval")}
        </Button>
      ) : null}
      {!canary && plan.steps.length ? (
        <Button
          onClick={() => onChange({
            ...plan,
            settings: { ...plan.settings, default_strategy: "canary" },
            steps: plan.steps.map((step) => ({
              ...step,
              config: { ...step.config, strategy: "canary" },
            })),
          })}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" />{t("workflows.option.strategy.canary")}
        </Button>
      ) : null}
    </>
  );
}

export function AddApplicationControl({
  applications,
  available,
  onChange,
  plan,
}: {
  applications: ReleaseApplication[];
  available: ReleaseApplication[];
  onChange: (plan: ReleasePlan) => void;
  plan: ReleasePlan;
}) {
  const { t } = useI18n();
  const [applicationId, setApplicationId] = useState(available[0]?.id || "");
  const add = () => {
    if (!applicationId) return;
    onChange(syncSelectedApplications(
      plan,
      [...plan.steps.map((step) => step.application_id), applicationId],
      applications,
    ));
  };
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2 sm:col-span-2">
      <FormField label={t("workflows.editor.application")}>
        <NativeSelect onChange={setApplicationId} value={applicationId}>
          {available.map((application) => (
            <option key={application.id} value={application.id}>{application.name}</option>
          ))}
        </NativeSelect>
      </FormField>
      <Button onClick={add} size="sm" type="button" variant="outline">
        <Plus aria-hidden="true" />{t("workflows.editor.addTarget")}
      </Button>
    </div>
  );
}
