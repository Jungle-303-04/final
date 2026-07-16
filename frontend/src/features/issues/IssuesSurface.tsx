import { RefreshCw } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { IssuesListPanel } from "./IssuesListPanel";
import { IssuesPanels } from "./IssuesPanels";
import {
  IssuesPortFailure,
  type IssueAuditTimelinePage,
  type IssueDetail,
  type IssueEvidencePage,
  type IssueList,
  type IssueRecentChanges,
  type IssueRcaReportPage,
  type IssueSummary,
  type IssuesPort,
  type IssueRecoveryPlan,
} from "./issuesContract";
import type {
  IssuePanelsState,
  IssuesSurfaceCopy,
  RecoverySelectionCapability,
  SectionState,
} from "./issuesSurfaceContract";
import { useIssueAuditPagination } from "./useIssueAuditPagination";
import { useIssueDetailFocus } from "./useIssueDetailFocus";
import { useOptionalActivityNotifications } from "../notifications/ActivityNotificationsProvider";

const ISSUE_REFRESH_INTERVAL_MS = 10_000;
const RECOVERY_PROGRESS_REFRESH_INTERVAL_MS = 2_000;

export function IssuesSurface({
  clusterId,
  copy,
  port,
  recoverySelection,
}: {
  clusterId: string | null;
  copy: IssuesSurfaceCopy;
  port: IssuesPort;
  recoverySelection: RecoverySelectionCapability;
}) {
  const [listRecord, setListRecord] = useState<{
    scope: string | null;
    state: SectionState<IssueList>;
  }>({ scope: clusterId, state: emptyState() });
  const [selectedRecord, setSelectedRecord] = useState<{
    scope: string | null;
    issue: IssueSummary;
  } | null>(null);
  const [panels, setPanels] = useState<IssuePanelsState>(emptyPanels());
  const [detailFull, setDetailFull] = useState(false);
  const [revision, setRevision] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const activityNotifications = useOptionalActivityNotifications();
  const mutationRef = useRef<AbortController | null>(null);
  const list = listRecord.scope === clusterId ? listRecord.state : emptyState<IssueList>();
  const selected = selectedRecord?.scope === clusterId ? selectedRecord.issue : null;
  const selectedCorrelationId = selected?.correlationId ?? null;
  const selectedId = selected?.id ?? null;
  const selectedIncidentId = selected?.incidentId ?? null;
  const selectedStatus = selected?.status ?? null;
  const auditScope = selected === null
    ? null
    : `${clusterId ?? ""}\u0000${selected.correlationId}`;
  const { detailRegionId, detailRegionRef, requestDetailFocus } =
    useIssueDetailFocus(selected?.id ?? null);

  const { abortAuditPage, loadMoreAudit } = useIssueAuditPagination({
    auditScope,
    correlationId: selected?.correlationId ?? null,
    panels,
    port,
    setPanels,
  });

  useEffect(() => {
    const controller = new AbortController();
    void port.listIssues(clusterId, 50, controller.signal).then(
      (data) => {
        setListRecord({
          scope: clusterId,
          state: { data, loading: false, failure: null },
        });
        setLastRefreshedAt(Date.now());
        setSelectedRecord((current) => {
          if (current?.scope !== clusterId) return current;
          const latest = data.items.find((issue) => issue.id === current.issue.id);
          return latest === undefined || latest === current.issue
            ? current
            : { scope: clusterId, issue: latest };
        });
      },
      (error: unknown) => {
        if (!isAbortError(error)) {
          setListRecord((current) => ({
            scope: clusterId,
            state: {
              data: current.scope === clusterId ? current.state.data : null,
              loading: false,
              failure: portFailure(error),
            },
          }));
        }
      },
    );
    return () => controller.abort();
  }, [clusterId, port, revision]);

  useEffect(() => {
    const refreshVisibleList = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setRevision((value) => value + 1);
    };
    const interval = window.setInterval(refreshVisibleList, ISSUE_REFRESH_INTERVAL_MS);
    const refreshAfterVisibility = () => {
      if (document.visibilityState === "visible") refreshVisibleList();
    };
    document.addEventListener("visibilitychange", refreshAfterVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshAfterVisibility);
    };
  }, [clusterId, port]);

  useEffect(() => {
    if (selectedCorrelationId === null) return;
    abortAuditPage();
    const controller = new AbortController();
    if (selectedIncidentId !== null) {
      const incidentId = selectedIncidentId;
      loadSection(
        () => port.loadIssue(incidentId, clusterId, controller.signal),
        controller.signal,
        (detail) => setPanels((current) => ({ ...current, detail })),
      );
      loadSection(
        () => port.loadRecentChanges(incidentId, controller.signal),
        controller.signal,
        (recentChanges) => setPanels((current) => ({ ...current, recentChanges })),
      );
    }
    loadSection(
      () => port.loadAuditTimeline(selectedCorrelationId, {}, controller.signal),
      controller.signal,
      (audit) => setPanels((current) => ({ ...current, audit })),
    );
    loadSection(
      () => port.loadEvidence(selectedCorrelationId, {}, controller.signal),
      controller.signal,
      (evidence) => setPanels((current) => ({ ...current, evidence })),
    );
    loadSection(
      () => port.loadReports(selectedCorrelationId, {}, controller.signal),
      controller.signal,
      (reports) => setPanels((current) => ({ ...current, reports })),
    );
    loadSection(
      () => port.loadRecoveryPlan(selectedCorrelationId, controller.signal),
      controller.signal,
      (recovery) => setPanels((current) => ({ ...current, recovery })),
    );
    return () => controller.abort();
  }, [abortAuditPage, clusterId, port, selectedCorrelationId, selectedIncidentId]);

  useEffect(() => () => mutationRef.current?.abort(), []);

  useEffect(() => {
    if (
      selectedCorrelationId === null || selectedId === null || selectedStatus === null ||
      panels.receipt === null
    ) return;
    if (recoveryProgressIsTerminalStatus(selectedStatus)) return;
    const controller = new AbortController();
    let refreshing = false;
    const refreshProgress = async () => {
      if (refreshing || controller.signal.aborted) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const [issuesResult, recoveryResult, auditResult] = await Promise.allSettled([
          port.listIssues(clusterId, 50, controller.signal),
          port.loadRecoveryPlan(selectedCorrelationId, controller.signal),
          port.loadAuditTimeline(selectedCorrelationId, {}, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        if (issuesResult.status === "fulfilled") {
          const latest = issuesResult.value.items.find((issue) => issue.id === selectedId);
          if (latest !== undefined) {
            setSelectedRecord({ scope: clusterId, issue: latest });
          }
        }
        setPanels((current) => ({
          ...current,
          audit: auditResult.status === "fulfilled"
            ? { data: auditResult.value, loading: false, failure: null }
            : {
                data: current.audit.data,
                loading: false,
                failure: portFailure(auditResult.reason),
              },
          recovery: recoveryResult.status === "fulfilled"
            ? { data: recoveryResult.value, loading: false, failure: null }
            : {
                data: current.recovery.data,
                loading: false,
                failure: portFailure(recoveryResult.reason),
              },
        }));
        setLastRefreshedAt(Date.now());
      } finally {
        refreshing = false;
      }
    };
    void refreshProgress();
    const interval = window.setInterval(refreshProgress, RECOVERY_PROGRESS_REFRESH_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [clusterId, panels.receipt, port, selectedCorrelationId, selectedId, selectedStatus]);

  const selectRecovery = useCallback((actionId: string) => {
    const plan = panels.recovery.data;
    if (recoverySelection.state !== "enabled" || selected === null || plan === null) return;
    mutationRef.current?.abort();
    const controller = new AbortController();
    mutationRef.current = controller;
    setPanels((current) => ({
      ...current,
      selectionFailure: null,
      selectionPendingId: actionId,
    }));
    void port.selectRecoveryAction({
      correlationId: selected.correlationId,
      planId: plan.id,
      actionId,
    }, controller.signal).then(async (result) => {
      if (result.kind === "conflict") {
        setPanels((current) => ({
          ...current,
          recovery: { data: result.plan, loading: false, failure: null },
          selectionFailure: null,
          selectionPendingId: null,
        }));
        return;
      }
      setPanels((current) => ({
        ...current,
        receipt: result.receipt,
        selectionFailure: null,
        selectionPendingId: null,
      }));
      activityNotifications?.beginIncidentRecovery({
        correlationId: result.receipt.correlationId,
        target: selected.resourceName || selected.symptom || selected.id,
        href: issueActivityHref(selected.clusterId),
      });
      try {
        const refreshed = await port.loadRecoveryPlan(selected.correlationId, controller.signal);
        setPanels((current) => ({
          ...current,
          recovery: { data: refreshed, loading: false, failure: null },
        }));
      } catch (error: unknown) {
        if (isAbortError(error)) return;
        setPanels((current) => ({
          ...current,
          recovery: {
            data: current.recovery.data,
            loading: false,
            failure: portFailure(error),
          },
        }));
      }
    }).catch((error: unknown) => {
      if (isAbortError(error)) return;
      setPanels((current) => ({
        ...current,
        recovery: {
          data: current.recovery.data,
          loading: false,
          failure: null,
        },
        selectionFailure: portFailure(error),
        selectionPendingId: null,
      }));
    }).finally(() => {
      if (mutationRef.current === controller) mutationRef.current = null;
    });
  }, [activityNotifications, panels.recovery.data, port, recoverySelection.state, selected]);

  const selectIssue = useCallback((issue: IssueSummary) => {
    abortAuditPage();
    requestDetailFocus(issue.id);
    setDetailFull(false);
    setPanels(loadingPanels(issue.incidentId !== null));
    setSelectedRecord({ scope: clusterId, issue });
  }, [abortAuditPage, clusterId, requestDetailFocus]);

  const closeIssue = useCallback(() => {
    const trigger = typeof document === "undefined"
      ? null
      : document.querySelector<HTMLButtonElement>('[aria-current="true"]');
    abortAuditPage();
    setDetailFull(false);
    setPanels(emptyPanels());
    setSelectedRecord(null);
    window.requestAnimationFrame(() => trigger?.focus());
  }, [abortAuditPage]);

  useEffect(() => {
    if (selected === null) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeIssue();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeIssue, selected]);

  const refreshList = useCallback(() => {
    setListRecord((current) => ({
      scope: clusterId,
      state: {
        data: current.scope === clusterId ? current.state.data : null,
        failure: null,
        loading: true,
      },
    }));
    setRevision((value) => value + 1);
  }, [clusterId]);

  return (
    <div
      className="flex min-h-96 min-w-0 gap-4"
      data-detail-layout={selected === null ? "closed" : detailFull ? "full" : "peek"}
    >
      <Card
        aria-label={copy.listLabel}
        className={selected === null
          ? "min-w-0 flex-1"
          : detailFull
            ? "hidden min-w-0 lg:block lg:basis-0 lg:flex-none lg:overflow-hidden lg:opacity-0 lg:pointer-events-none lg:transition-[flex-basis,opacity] lg:duration-300 lg:ease-out motion-reduce:transition-none"
            : "hidden min-w-0 flex-1 lg:block lg:opacity-100 lg:transition-[flex-basis,opacity] lg:duration-300 lg:ease-out motion-reduce:transition-none"}
        role="region"
      >
        <CardHeader className="flex flex-row items-center gap-3 border-b">
          <div className="min-w-0 flex-1">
            <CardTitle>{copy.listLabel}</CardTitle>
            {lastRefreshedAt !== null ? (
              <time
                className="mt-0.5 block truncate text-[11px] tabular-nums text-muted-foreground"
                dateTime={new Date(lastRefreshedAt).toISOString()}
              >
                {copy.updated} · {copy.auditTime(new Date(lastRefreshedAt).toISOString())}
              </time>
            ) : null}
          </div>
          <Button
            aria-label={copy.refresh}
            onClick={refreshList}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <RefreshCw aria-hidden="true" className={cn(list.loading && "motion-safe:animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent className="lg:min-h-96">
          <IssuesListPanel
            copy={copy}
            detailRegionId={detailRegionId}
            list={list}
            onSelect={selectIssue}
            selected={selected}
          />
        </CardContent>
      </Card>
      {selected === null ? null : (
        <div className={cn(
          "min-w-0 w-full basis-full shrink-0 transition-[flex-basis] duration-300 ease-out motion-reduce:transition-none",
          detailFull ? "lg:basis-full" : "lg:basis-[30rem]",
        )}
        >
          <IssuesPanels
            capability={recoverySelection}
            copy={copy}
            detailRegionId={detailRegionId}
            detailRegionRef={detailRegionRef}
            full={detailFull}
            onClose={closeIssue}
            onFullChange={setDetailFull}
            onLoadMoreAudit={loadMoreAudit}
            onSelectRecovery={selectRecovery}
            selected={selected}
            state={panels}
          />
        </div>
      )}
    </div>
  );
}

function emptyState<T>(): SectionState<T> {
  return { data: null, failure: null, loading: true };
}

function emptyPanels(): IssuePanelsState {
  return {
    detail: emptyState<IssueDetail>(),
    recentChanges: emptyState<IssueRecentChanges>(),
    audit: emptyState<IssueAuditTimelinePage>(),
    evidence: emptyState<IssueEvidencePage>(),
    reports: emptyState<IssueRcaReportPage>(),
    recovery: emptyState<IssueRecoveryPlan>(),
    receipt: null,
    selectionFailure: null,
    selectionPendingId: null,
  };
}

function recoveryProgressIsTerminalStatus(status: string): boolean {
  return ["command_rejected", "incident_resolved", "pr_failed", "resolved"].includes(
    status.trim().toLowerCase(),
  );
}

function issueActivityHref(clusterId: string | null): string {
  if (!clusterId) return "/issues";
  return `/issues?${new URLSearchParams({ clusters: clusterId }).toString()}`;
}

function loadingPanels(loadIncidentSections: boolean): IssuePanelsState {
  const panels = emptyPanels();
  return loadIncidentSections
    ? panels
    : {
        ...panels,
        detail: { data: null, failure: null, loading: false },
        recentChanges: { data: null, failure: null, loading: false },
      };
}

function loadSection<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
  update: (state: SectionState<T>) => void,
): void {
  void operation().then(
    (data) => update({ data, loading: false, failure: null }),
    (error: unknown) => {
      if (!signal.aborted && !isAbortError(error)) {
        update({ data: null, loading: false, failure: portFailure(error) });
      }
    },
  );
}

function portFailure(error: unknown): IssuesPortFailure {
  return error instanceof IssuesPortFailure ? error : new IssuesPortFailure("error");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
