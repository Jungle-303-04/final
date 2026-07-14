import {
  AlertTriangle,
  CheckCircle2,
  CirclePlay,
  Clock3,
  FastForward,
  History,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  ReleaseApplication,
  ReleasePlan,
  ReleaseReadiness,
  ReleaseRun,
  ReleaseRunAction,
} from "../../features/gitops/gitOpsContract";
import {
  releaseStepSetupIssues,
  type StepSetupField,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Surface } from "../../shared/ui/Surface";
import {
  checkCoveredBySetupIssues,
  groupSetupIssues,
  ReadinessCheckRow,
  SetupIssueRow,
} from "./RunReadinessDetails";
import {
  RunActions,
  RunFact,
  RunStatusBadge,
  formatRunTime,
  shortRunId,
} from "./RunWorkspaceParts";
import { WorkflowInlineHeading } from "./WorkflowInlineHeading";
import { WorkflowWorkspaceHeader } from "./WorkflowWorkspaceHeader";

export function RunWorkspace({
  plan,
  applications,
  runs,
  readiness,
  pending,
  onCheckReadiness,
  onEdit,
  onStart,
  onAction,
}: {
  plan: ReleasePlan;
  applications: ReleaseApplication[];
  runs: ReleaseRun[];
  readiness?: ReleaseReadiness;
  pending: boolean;
  onCheckReadiness: () => void;
  onEdit: (stepIndex?: number, field?: StepSetupField) => void;
  onStart: () => void;
  onAction: (run: ReleaseRun, action: ReleaseRunAction) => void;
}) {
  const { formatDate, t } = useI18n();
  const orderedRuns = useMemo(
    () => [...runs].sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || ""))),
    [runs],
  );
  const [selectedRunId, setSelectedRunId] = useState(orderedRuns[0]?.run_id || "");

  const effectiveSelectedRunId = orderedRuns.some((run) => run.run_id === selectedRunId)
    ? selectedRunId
    : orderedRuns[0]?.run_id || "";
  const selectedRun = orderedRuns.find((run) => run.run_id === effectiveSelectedRunId);
  const setupIssues = releaseStepSetupIssues(plan, applications);
  const setupIssueGroups = groupSetupIssues(setupIssues);
  const attentionChecks = readiness?.checks.filter((check) => check.status === "blocked" || check.status === "warning") || [];
  const remainingChecks = attentionChecks.filter((check) => !checkCoveredBySetupIssues(check, setupIssues));

  return (
    <div className="grid min-w-0 gap-4">
      <WorkflowWorkspaceHeader
        actions={<>
          <Button disabled={pending} onClick={onCheckReadiness} variant="outline">
            <CheckCircle2 aria-hidden="true" />
            {pending
              ? t("workflows.runs.checking")
              : readiness
                ? t("workflows.runs.recheck")
                : t("workflows.runs.check")}
          </Button>
          {readiness?.ready ? (
            <Button disabled={pending} onClick={onStart}>
              <CirclePlay aria-hidden="true" />
              {pending ? t("workflows.runs.starting") : t("workflows.runs.start")}
            </Button>
          ) : null}
        </>}
        title={t("workflows.runs.title")}
      />

      {readiness ? (
        <Surface aria-label={t("workflows.runs.precheckTitle")} className="grid min-w-0 gap-4 p-4">
          <WorkflowInlineHeading
            as="h3"
            icon={<CheckCircle2 aria-hidden="true" />}
            title={t("workflows.runs.precheckTitle")}
            variant="compact"
          />
          <div className="grid min-w-0 gap-3 border-t pt-3" role="status">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {readiness.ready
                ? <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
                : <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-amber-600" />}
              <strong className="text-xs">
                {readiness.ready
                  ? t("workflows.runs.ready")
                  : t("workflows.runs.blockerCount", { count: readiness.blockers.length })}
              </strong>
              {readiness.impact ? (
                <span className="text-xs text-muted-foreground">
                  {t("workflows.runs.impact", {
                    steps: readiness.impact.total_steps,
                    waves: readiness.impact.total_waves,
                    production: readiness.impact.production_target_count,
                  })}
                </span>
              ) : null}
            </div>
            {setupIssueGroups.length ? (
              <div className="grid min-w-0 divide-y">
                {setupIssueGroups.map((group) => (
                  <SetupIssueRow group={group} key={group.stepId} onEdit={onEdit} />
                ))}
              </div>
            ) : null}
            {remainingChecks.length ? (
              <div className="grid min-w-0 divide-y">
                {remainingChecks.map((check) => (
                  <ReadinessCheckRow check={check} key={check.check_id} onEdit={onEdit} />
                ))}
              </div>
            ) : null}
          </div>
        </Surface>
      ) : null}

      {orderedRuns.length ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside aria-label={t("workflows.runs.title")} className="min-w-0">
            <div className="grid min-w-0 gap-1 rounded-xl border bg-card p-2 shadow-sm">
              {orderedRuns.map((run) => (
                <button
                  aria-pressed={run.run_id === effectiveSelectedRunId}
                  className="grid min-w-0 gap-1 rounded-lg px-3 py-2 text-left hover:bg-muted/60 aria-pressed:bg-muted"
                  key={run.run_id}
                  onClick={() => setSelectedRunId(run.run_id)}
                  type="button"
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <strong className="min-w-0 truncate text-xs">{shortRunId(run.run_id)}</strong>
                    <RunStatusBadge status={run.status} />
                  </span>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {t("workflows.runs.currentWave", { current: run.current_wave, total: run.total_waves })}
                  </span>
                  <span className="truncate text-[0.6875rem] text-muted-foreground">
                    {formatRunTime(run.created_at, formatDate, t("workflows.value.notSet"))}
                  </span>
                </button>
              ))}
            </div>
          </aside>

        <section className="min-w-0">
          {selectedRun ? (
            <Surface aria-label={selectedRun.run_id} className="grid min-w-0 overflow-hidden">
              <div className="flex min-w-0 flex-col gap-3 border-b p-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="grid min-w-0 gap-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="m-0 min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
                      {selectedRun.plan_name || plan.name}
                    </h3>
                    <RunStatusBadge status={selectedRun.status} />
                  </div>
                  <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {selectedRun.run_id}
                  </span>
                </div>
                <RunActions pending={pending} run={selectedRun} onAction={onAction} />
              </div>

              <dl className="grid min-w-0 gap-px border-b bg-border sm:grid-cols-3">
                <RunFact
                  icon={<FastForward aria-hidden="true" />}
                  label={t("workflows.context.status")}
                  value={t("workflows.runs.currentWave", { current: selectedRun.current_wave, total: selectedRun.total_waves })}
                />
                <RunFact
                  icon={<Clock3 aria-hidden="true" />}
                  label={t("workflows.runs.created")}
                  value={formatRunTime(selectedRun.created_at, formatDate, t("workflows.value.notSet"))}
                />
                <RunFact
                  icon={<History aria-hidden="true" />}
                  label={t("workflows.runs.startedBy")}
                  value={selectedRun.started_by || t("workflows.value.notSet")}
                />
              </dl>

              <div className="grid min-w-0 lg:grid-cols-2">
                <section aria-labelledby="workflow-run-steps" className="grid min-w-0 content-start gap-3 border-b p-4 lg:border-r lg:border-b-0">
                  <h4 className="m-0 text-xs font-semibold" id="workflow-run-steps">
                    {t("workflows.runs.steps")}
                  </h4>
                  <div className="grid min-w-0 gap-1">
                    {selectedRun.steps.map((step) => (
                      <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border px-2.5 py-2" key={step.run_step_id}>
                        <span className="grid size-6 place-items-center rounded-md bg-muted text-[0.6875rem] font-semibold">
                          {step.wave}
                        </span>
                        <span className="min-w-0 text-xs font-medium [overflow-wrap:anywhere]">{step.name}</span>
                        <RunStatusBadge status={step.status} />
                      </div>
                    ))}
                  </div>
                </section>
                <section aria-labelledby="workflow-run-events" className="grid min-w-0 content-start gap-3 p-4">
                  <h4 className="m-0 text-xs font-semibold" id="workflow-run-events">
                    {t("workflows.runs.events")}
                  </h4>
                  {selectedRun.events.length ? (
                    <div className="grid min-w-0 gap-3 border-l pl-3">
                      {selectedRun.events.slice(-8).reverse().map((event) => (
                        <div className="grid min-w-0 gap-0.5" key={event.audit_id}>
                          <strong className="text-xs [overflow-wrap:anywhere]">{event.event_type}</strong>
                          <span className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{event.message}</span>
                          <small className="text-[0.6875rem] text-muted-foreground">
                            {formatRunTime(event.created_at, formatDate, t("workflows.value.notSet"))}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("workflows.runs.noEvents")}</span>
                  )}
                </section>
              </div>
            </Surface>
          ) : (
            <RunEmptyState label={t("workflows.runs.empty")} />
          )}
        </section>
        </div>
      ) : <RunEmptyState label={t("workflows.runs.empty")} />}
    </div>
  );
}

function RunEmptyState({ label }: { label: string }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-xl border border-dashed bg-muted/15 px-6 text-center">
      <div className="grid justify-items-center gap-3">
        <span className="grid size-12 place-items-center rounded-lg border bg-card text-primary shadow-sm">
          <History aria-hidden="true" className="size-5" />
        </span>
        <strong className="text-sm">{label}</strong>
      </div>
    </div>
  );
}
