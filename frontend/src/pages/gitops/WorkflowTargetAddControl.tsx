import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReleaseApplication, ReleasePlan } from "../../features/gitops/gitOpsContract";
import { syncSelectedApplications } from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { NativeSelect } from "./WorkflowFormControls";

export function WorkflowTargetAddControl({
  plan,
  applications,
  onChange,
  onAdded,
  className,
}: {
  plan: ReleasePlan;
  applications: ReleaseApplication[];
  onChange: (plan: ReleasePlan) => void;
  onAdded?: (applicationId: string) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [targetToAdd, setTargetToAdd] = useState("");
  const availableTargets = useMemo(() => {
    const selected = new Set(plan.steps.map((step) => step.application_id));
    return applications.filter((application) => !selected.has(application.id));
  }, [applications, plan.steps]);
  const selectedTarget = availableTargets.some((application) => application.id === targetToAdd)
    ? targetToAdd
    : availableTargets[0]?.id || "";

  const addTarget = () => {
    if (!selectedTarget) return;
    onChange(syncSelectedApplications(
      plan,
      [...plan.steps.map((step) => step.application_id), selectedTarget],
      applications,
    ));
    onAdded?.(selectedTarget);
    setTargetToAdd("");
  };

  return (
    <div className={`flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row ${className || ""}`}>
      <NativeSelect
        ariaLabel={t("workflows.editor.application")}
        className="w-full min-w-0 sm:w-64"
        disabled={!selectedTarget}
        onChange={setTargetToAdd}
        value={selectedTarget}
      >
        {availableTargets.length ? (
          availableTargets.map((application) => (
            <option key={application.id} value={application.id}>{application.name}</option>
          ))
        ) : (
          <option value="">{t("workflows.editor.noAvailableTargets")}</option>
        )}
      </NativeSelect>
      <Button disabled={!selectedTarget} onClick={addTarget} variant="outline">
        <Plus aria-hidden="true" />
        {t("workflows.editor.addTarget")}
      </Button>
    </div>
  );
}
