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
  ReleasePlan,
  ReleaseReadiness,
  ReleaseRun,
  ReleaseRunAction,
} from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Surface } from "../../shared/ui/Surface";
import {
  RunActions,
  RunFact,
  RunStatusBadge,
  formatRunTime,
  shortRunId,
} from "./RunWorkspaceParts";

export function RunWorkspace({
  plan,
  runs,
  readiness,
  pending,
  onCheckReadiness,
  onStart,
  onAction,
}: {
  plan: ReleasePlan;
  runs: ReleaseRun[];
  readiness?: ReleaseReadiness;
  pending: boolean;
  onCheckReadiness: () => void;
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

  return (
    <div className="grid min-w-0 gap-4">
      <header className="grid min-w-0 gap-1">
        <h2 className="m-0 text-base font-semibold">{t("workflows.runs.title")}</h2>
        <p className="m-0 text-xs leading-5 text-muted-foreground">
          {t("workflows.runs.description")}
        </p>
      </header>

      <Surface aria-label={t("workflows.runs.precheckTitle")} className="grid min-w-0 gap-4 p-4">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 aria-hidden="true" className="size-4" />
            </span>
            <div className="grid min-w-0 gap-0.5">
              <strong className="text-sm">{t("workflows.runs.precheckTitle")}</strong>
              <span className="text-xs leading-5 text-muted-foreground">
                {t("workflows.runs.precheckDescription")}
              </span>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <Button disabled={pending} onClick={onCheckReadiness} variant="outline">
              <CheckCircle2 aria-hidden="true" />
              {pending ? t("workflows.runs.checking") : t("workflows.runs.check")}
            </Button>
            <Button disabled={pending || readiness?.ready !== true} onClick={onStart}>
              <CirclePlay aria-hidden="true" />
              {pending ? t("workflows.runs.starting") : t("workflows.runs.start")}
            </Button>
          </div>
        </div>

        {readiness ? (
          <div className={`grid min-w-0 gap-2 rounded-lg border px-3 py-2.5 ${readiness.ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
            <div className="flex min-w-0 items-start gap-2">
              {readiness.ready
                ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                : <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />}
              <div className="grid min-w-0 gap-0.5">
                <strong className="text-xs">
                  {readiness.ready ? t("workflows.runs.ready") : t("workflows.runs.blocked")}
                </strong>
                <span className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                  {readiness.summary}
                </span>
              </div>
            </div>
            {readiness.blockers.length ? (
              <ul className="m-0 grid gap-1 pl-6 text-xs text-muted-foreground">
                {readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Surface>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside aria-label={t("workflows.runs.title")} className="min-w-0">
          {orderedRuns.length ? (
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
          ) : (
            <div className="grid min-h-36 place-items-center rounded-xl border border-dashed px-5 text-center text-sm text-muted-foreground">
              {t("workflows.runs.empty")}
            </div>
          )}
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
            <div className="grid min-h-72 place-items-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
              {t("workflows.runs.empty")}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
