import { Activity, ExternalLink, RefreshCw, Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBottomDock } from "../../features/bottom-dock/BottomDockProvider";
import {
  WorkloadDetailPortFailure,
  type ScheduledRunCatalog,
  type ScheduledWorkloadRun,
  type WorkloadDetailPort,
  type WorkloadDetailRequest,
} from "../../features/workload-detail/workloadDetailContract";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { cn } from "../../shared/lib/cn";
import { useI18n } from "../../shared/i18n/I18nProvider";

const ACTIVE_REFRESH_MILLISECONDS = 5_000;

type RunFrame =
  | { phase: "loading"; catalog: null; failure: null }
  | { phase: "ready"; catalog: ScheduledRunCatalog; failure: null; refreshing: boolean }
  | { phase: "failed"; catalog: null; failure: WorkloadDetailPortFailure };

export function WorkloadExecution({ port, request }: { port: WorkloadDetailPort; request: WorkloadDetailRequest }) {
  const { t } = useI18n();
  const [revision, setRevision] = useState(0);
  const [frame, setFrame] = useState<RunFrame>({ phase: "loading", catalog: null, failure: null });
  const refresh = useCallback(() => {
    setFrame((current) => current.phase === "ready" ? { ...current, refreshing: true } : current);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void port.getScheduledRuns(request, controller.signal).then(
      (catalog) => setFrame({ phase: "ready", catalog, failure: null, refreshing: false }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setFrame({
          phase: "failed",
          catalog: null,
          failure: error instanceof WorkloadDetailPortFailure ? error : new WorkloadDetailPortFailure("error"),
        });
      },
    );
    return () => controller.abort();
  }, [port, request, revision]);

  useEffect(() => {
    if (frame.phase !== "ready" || frame.refreshing || !frame.catalog.runs.some((run) => run.active)) return;
    const timer = window.setTimeout(refresh, ACTIVE_REFRESH_MILLISECONDS);
    return () => window.clearTimeout(timer);
  }, [frame, refresh]);

  if (frame.phase === "loading") return <p className="py-8 text-sm text-muted-foreground" role="status">{t("workloadDetail.execution.loading")}</p>;
  if (frame.phase === "failed") {
    return <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{t("workloadDetail.execution.unavailable")}</p>;
  }
  return <ExecutionCatalog catalog={frame.catalog} onRefresh={refresh} refreshing={frame.refreshing} />;
}

function ExecutionCatalog({ catalog, onRefresh, refreshing }: { catalog: ScheduledRunCatalog; onRefresh: () => void; refreshing: boolean }) {
  const { formatDate, t } = useI18n();
  const dock = useBottomDock();
  const [selectedKey, setSelectedKey] = useState<string | null>(catalog.defaultRunKey);
  const selected = useMemo(
    () => catalog.runs.find((run) => run.runKey === selectedKey)
      ?? catalog.runs.find((run) => run.runKey === catalog.defaultRunKey)
      ?? catalog.runs[0]
      ?? null,
    [catalog.defaultRunKey, catalog.runs, selectedKey],
  );
  const events = selected === null ? [] : catalog.lifecycle.filter((event) => event.runKey === selected.runKey);
  const openLogs = (run: ScheduledWorkloadRun) => {
    const namespace = catalog.owner.namespace;
    if (run.nextStep !== "logs" || namespace === null) return;
    dock.openLogs({
      type: "scheduled-run",
      clusterId: catalog.scope.clusterId,
      kind: catalog.owner.kind,
      namespace,
      name: catalog.owner.name,
      runKey: run.runKey,
    });
  };
  const formatTime = (value: string | null): string => {
    if (value === null) return t("workloadDetail.execution.notObserved");
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
      ? t("workloadDetail.execution.invalidTimestamp")
      : formatDate(date);
  };

  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="execution-history-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="text-base font-semibold" id="execution-history-title">{t("workloadDetail.execution.title")}</h2><p className="text-sm text-muted-foreground">{t("workloadDetail.execution.description")}</p></div>
        <Button disabled={refreshing} onClick={onRefresh} size="sm" type="button" variant="outline"><RefreshCw aria-hidden="true" className={cn(refreshing && "motion-safe:animate-spin motion-reduce:animate-none")} />{t("common.action.refresh")}</Button>
      </header>
      {!catalog.complete ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm" role="status">{t("workloadDetail.execution.partial")}</p> : null}
      {catalog.runs.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{t("workloadDetail.execution.empty")}</p> : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-2" role="listbox" aria-label={t("workloadDetail.execution.list")}>
            {catalog.runs.map((run) => <button aria-selected={run.runKey === selected?.runKey} className={cn("grid min-w-0 gap-1 rounded-lg border px-3 py-2 text-left", run.runKey === selected?.runKey && "border-primary bg-muted/40")} key={run.runKey} onClick={() => setSelectedKey(run.runKey)} role="option" type="button"><span className="truncate text-sm font-medium">{run.resource.name}</span><span className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{formatTime(run.startedAt ?? run.scheduledAt)}</span><Badge variant="outline">{run.phase}</Badge></span></button>)}
          </div>
          {selected ? <div className="grid min-w-0 gap-4 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-medium">{selected.resource.name}</h3><p className="text-sm text-muted-foreground">{t("workloadDetail.execution.podsSummary", { total: selected.podTotal, succeeded: selected.podSucceeded, failed: selected.podFailed, running: selected.podRunning })}</p></div>{selected.nextStep === "logs" ? <Button onClick={() => openLogs(selected)} size="sm" type="button"><Terminal aria-hidden="true" />{t("workloadDetail.execution.viewLogs")}</Button> : selected.nextStep === "timeline" ? <Badge variant="outline"><Activity aria-hidden="true" className="mr-1 h-3 w-3" />{t("workloadDetail.execution.timelineEvidence")}</Badge> : null}</div>
            <ol className="grid gap-2" aria-label={t("workloadDetail.execution.lifecycle")}>{events.map((event) => <li className="flex min-w-0 items-start justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2" key={event.eventId}><span className="min-w-0 truncate text-sm">{event.reason}</span><time className="shrink-0 text-xs text-muted-foreground" dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time></li>)}</ol>
            {selected.nextStep === "logs" ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><ExternalLink aria-hidden="true" className="h-3 w-3" />{t("workloadDetail.execution.logsDock")}</p> : null}
          </div> : null}
        </div>
      )}
    </section>
  );
}
