import type {
  ReleaseApplication,
  ReleaseCluster,
  ReleasePlan,
  ReleaseTargetInput,
} from "../../features/gitops/gitOpsContract";
import { syncSelectedApplications } from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { DeploymentTargetDialog } from "./DeploymentTargetDialog";

export function PlanWizardTargets({
  plan,
  applications,
  clusters,
  pending,
  onChange,
  onCreateTarget,
  onTargetChanged,
}: {
  plan: ReleasePlan;
  applications: ReleaseApplication[];
  clusters: ReleaseCluster[];
  pending: boolean;
  onChange: (plan: ReleasePlan) => void;
  onCreateTarget: (input: ReleaseTargetInput) => Promise<ReleaseApplication | null>;
  onTargetChanged: () => void;
}) {
  const { t } = useI18n();
  const createAndSelect = async (input: ReleaseTargetInput) => {
    const application = await onCreateTarget(input);
    if (!application) return null;
    const selectedIds = plan.steps.map((step) => step.application_id);
    onChange(syncSelectedApplications(
      plan,
      selectedIds.includes(application.id) ? selectedIds : [...selectedIds, application.id],
      [...applications, application],
    ));
    onTargetChanged();
    return application;
  };

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 justify-end">
        <DeploymentTargetDialog clusters={clusters} onCreate={createAndSelect} pending={pending} />
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {applications.map((application) => {
          const checked = plan.steps.some((step) => step.application_id === application.id);
          const repository = application.repository || application.id;
          const branch = application.branch || t("workflows.value.notSet");
          return (
            <label
              className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 has-checked:border-primary has-checked:bg-primary/5"
              key={application.id}
            >
              <input
                checked={checked}
                className="size-4 shrink-0 accent-primary"
                onChange={(event) => {
                  const ids = plan.steps.map((step) => step.application_id);
                  onChange(syncSelectedApplications(
                    plan,
                    event.target.checked
                      ? [...ids, application.id]
                      : ids.filter((id) => id !== application.id),
                    applications,
                  ));
                  onTargetChanged();
                }}
                type="checkbox"
              />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <strong className="min-w-0 text-sm [overflow-wrap:anywhere]">{application.name}</strong>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
                  <small className="min-w-0 text-xs [overflow-wrap:anywhere]">{repository}</small>
                  <small className="text-[0.6875rem] [overflow-wrap:anywhere]">{branch}</small>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
