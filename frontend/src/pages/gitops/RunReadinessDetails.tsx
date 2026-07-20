import { AlertTriangle, CheckCircle2, PencilLine } from "lucide-react";
import type { ReleaseReadiness } from "../../features/gitops/gitOpsContract";
import type { StepSetupField, StepSetupIssue } from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";

export interface SetupIssueGroup {
  issues: StepSetupIssue[];
  stepId: string;
  stepIndex: number;
  stepName: string;
}

export function groupSetupIssues(issues: StepSetupIssue[]): SetupIssueGroup[] {
  const groups = new Map<string, SetupIssueGroup>();
  issues.forEach((issue) => {
    const group = groups.get(issue.stepId) || {
      issues: [],
      stepId: issue.stepId,
      stepIndex: issue.stepIndex,
      stepName: issue.stepName,
    };
    group.issues.push(issue);
    groups.set(issue.stepId, group);
  });
  return [...groups.values()];
}

export function checkCoveredBySetupIssues(
  check: ReleaseReadiness["checks"][number],
  issues: StepSetupIssue[],
): boolean {
  if (!check.blockers.length) return false;
  if (check.check_id === "plan.required_inputs") {
    return issues.filter((issue) => issue.field === "commit_sha" || issue.field === "image").length >= check.blockers.length;
  }
  if (check.check_id === "plan.application_context") {
    return issues.filter((issue) => (
      issue.field === "application_id"
      || issue.field === "repo_ref"
      || issue.field === "branch"
      || issue.field === "manifest_path"
      || issue.field === "cluster_id"
    )).length >= check.blockers.length;
  }
  return false;
}

export function SetupIssueRow({
  group,
  onEdit,
}: {
  group: SetupIssueGroup;
  onEdit: (stepIndex?: number, field?: StepSetupField) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid min-w-0 gap-2 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1.5">
        <strong className="min-w-0 text-xs [overflow-wrap:anywhere]">{group.stepName}</strong>
        <div className="flex min-w-0 flex-wrap gap-1">
          {group.issues.map((issue) => (
            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-amber-700 dark:text-amber-400" key={issue.field}>
              {setupFieldLabel(issue.field, t)}
            </span>
          ))}
        </div>
      </div>
      <Button className="justify-self-start sm:justify-self-end" onClick={() => onEdit(group.stepIndex, group.issues[0]?.field)} size="sm" variant="outline">
        <PencilLine aria-hidden="true" />
        {t("workflows.runs.editIssues")}
      </Button>
    </div>
  );
}

export function ReadinessCheckRow({
  check,
  onEdit,
}: {
  check: ReleaseReadiness["checks"][number];
  onEdit: (stepIndex?: number, field?: StepSetupField) => void;
}) {
  const { t } = useI18n();
  const editable = check.check_id === "plan.preview" || check.check_id === "plan.diagnostics";
  return (
    <div className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 items-center gap-2">
        {check.status === "blocked"
          ? <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0 text-amber-600" />
          : <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
        <strong className="min-w-0 text-xs [overflow-wrap:anywhere]">{readinessCheckLabel(check.check_id, t)}</strong>
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
          {check.status === "blocked" ? t("workflows.runs.statusBlocked") : t("workflows.runs.statusWarning")}
        </span>
      </span>
      {editable ? (
        <Button onClick={() => onEdit()} size="sm" variant="outline">
          <PencilLine aria-hidden="true" />
          {t("workflows.overview.edit")}
        </Button>
      ) : null}
    </div>
  );
}

type T = ReturnType<typeof useI18n>["t"];

function setupFieldLabel(field: StepSetupField, t: T): string {
  if (field === "application_id") return t("workflows.editor.application");
  if (field === "repo_ref") return t("workflows.detail.repository");
  if (field === "branch") return t("workflows.detail.branch");
  if (field === "manifest_path") return t("workflows.detail.manifest");
  if (field === "cluster_id") return t("workflows.editor.cluster");
  if (field === "commit_sha") return t("workflows.editor.commitSha");
  return t("workflows.editor.image");
}

function readinessCheckLabel(checkId: string, t: T): string {
  const labels: Record<string, string> = {
    "plan.preview": t("workflows.runs.check.planPreview"),
    "plan.required_inputs": t("workflows.runs.check.requiredInputs"),
    "plan.application_context": t("workflows.runs.check.applicationContext"),
    "plan.active_run_lock": t("workflows.runs.check.activeRun"),
    "live.dispatch_gate": t("workflows.runs.check.liveGate"),
    "approval.evidence": t("workflows.runs.check.approval"),
    "change.ticket": t("workflows.runs.check.changeTicket"),
    "release.window": t("workflows.runs.check.releaseWindow"),
    "change.freeze": t("workflows.runs.check.changeFreeze"),
    "runbook.sop": t("workflows.runs.check.runbook"),
    "owner.contact": t("workflows.runs.check.owner"),
    "verification.plan": t("workflows.runs.check.verification"),
    "rollback.abort_criteria": t("workflows.runs.check.abortCriteria"),
    "plan.diagnostics": t("workflows.runs.check.diagnostics"),
    "rollback.policy": t("workflows.runs.check.rollback"),
    "alerts.enabled_channels": t("workflows.runs.check.alerts"),
    "retry.policy": t("workflows.runs.check.retry"),
    "audit.redaction": t("workflows.runs.check.audit"),
  };
  return labels[checkId] || t("workflows.runs.check.other");
}
