import { Trash2 } from "lucide-react";
import type { ReleaseApplication, ReleasePlan } from "../../features/gitops/gitOpsContract";
import { syncSelectedApplications } from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { WorkflowTargetAddControl } from "./WorkflowTargetAddControl";

export function PlanWizardTargets({
  plan,
  applications,
  onChange,
  onTargetAdded,
}: {
  plan: ReleasePlan;
  applications: ReleaseApplication[];
  onChange: (plan: ReleasePlan) => void;
  onTargetAdded: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 justify-end">
        <WorkflowTargetAddControl
          applications={applications}
          onAdded={onTargetAdded}
          onChange={onChange}
          plan={plan}
        />
      </div>
      {plan.steps.length ? (
        <ol className="grid min-w-0 divide-y rounded-lg border bg-card">
          {plan.steps.map((step, index) => {
            const application = applications.find((item) => item.id === step.application_id);
            const name = step.name || application?.name || step.application_id;
            const repository = application?.repository || step.application_id;
            const branch = application?.branch || t("workflows.value.notSet");
            const removeLabel = `${t("workflows.editor.remove")}: ${name}`;
            return (
              <li className="flex min-w-0 items-center gap-3 px-3 py-2.5" key={step.step_id || step.application_id}>
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <strong className="min-w-0 text-sm [overflow-wrap:anywhere]">{name}</strong>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
                    <small className="min-w-0 text-xs [overflow-wrap:anywhere]">{repository}</small>
                    <small className="text-[0.6875rem] [overflow-wrap:anywhere]">{branch}</small>
                  </span>
                </span>
                <Button
                  aria-label={removeLabel}
                  onClick={() => onChange(syncSelectedApplications(
                    plan,
                    plan.steps.filter((_, stepIndex) => stepIndex !== index).map((item) => item.application_id),
                    applications,
                  ))}
                  size="icon-sm"
                  title={removeLabel}
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="grid min-h-32 place-items-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground">
          {t("workflows.editor.noTargets")}
        </div>
      )}
    </div>
  );
}
