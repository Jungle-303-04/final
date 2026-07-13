import { RefreshCw } from "lucide-react";
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
  const [revision, setRevision] = useState(0);
  const mutationRef = useRef<AbortController | null>(null);
  const list = listRecord.scope === clusterId ? listRecord.state : emptyState<IssueList>();
  const selected = selectedRecord?.scope === clusterId ? selectedRecord.issue : null;
  const auditScope = selected === null
    ? null
    : `${clusterId ?? ""}\u0000${selected.correlationId}`;

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
      (data) => setListRecord({
        scope: clusterId,
        state: { data, loading: false, failure: null },
      }),
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
    if (selected === null) return;
    abortAuditPage();
    const controller = new AbortController();
    if (selected.incidentId !== null) {
      const incidentId = selected.incidentId;
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
      () => port.loadAuditTimeline(selected.correlationId, {}, controller.signal),
      controller.signal,
      (audit) => setPanels((current) => ({ ...current, audit })),
    );
    loadSection(
      () => port.loadEvidence(selected.correlationId, {}, controller.signal),
      controller.signal,
      (evidence) => setPanels((current) => ({ ...current, evidence })),
    );
    loadSection(
      () => port.loadReports(selected.correlationId, {}, controller.signal),
      controller.signal,
      (reports) => setPanels((current) => ({ ...current, reports })),
    );
    loadSection(
      () => port.loadRecoveryPlan(selected.correlationId, controller.signal),
      controller.signal,
      (recovery) => setPanels((current) => ({ ...current, recovery })),
    );
    return () => controller.abort();
  }, [abortAuditPage, clusterId, port, selected]);

  useEffect(() => () => mutationRef.current?.abort(), []);

  const selectRecovery = useCallback((actionId: string) => {
    const plan = panels.recovery.data;
    if (recoverySelection.state !== "enabled" || selected === null || plan === null) return;
    mutationRef.current?.abort();
    const controller = new AbortController();
    mutationRef.current = controller;
    setPanels((current) => ({ ...current, selectionPendingId: actionId }));
    void port.selectRecoveryAction({
      correlationId: selected.correlationId,
      planId: plan.id,
      actionId,
    }, controller.signal).then(async (result) => {
      if (result.kind === "conflict") {
        setPanels((current) => ({
          ...current,
          recovery: { data: result.plan, loading: false, failure: null },
          selectionPendingId: null,
        }));
        return;
      }
      setPanels((current) => ({
        ...current,
        receipt: result.receipt,
        selectionPendingId: null,
      }));
      const refreshed = await port.loadRecoveryPlan(selected.correlationId, controller.signal);
      setPanels((current) => ({
        ...current,
        recovery: { data: refreshed, loading: false, failure: null },
      }));
    }).catch((error: unknown) => {
      if (isAbortError(error)) return;
      setPanels((current) => ({
        ...current,
        recovery: {
          data: current.recovery.data,
          loading: false,
          failure: portFailure(error),
        },
        selectionPendingId: null,
      }));
    }).finally(() => {
      if (mutationRef.current === controller) mutationRef.current = null;
    });
  }, [panels.recovery.data, port, recoverySelection.state, selected]);

  const selectIssue = useCallback((issue: IssueSummary) => {
    abortAuditPage();
    setPanels(loadingPanels(issue.incidentId !== null));
    setSelectedRecord({ scope: clusterId, issue });
  }, [abortAuditPage, clusterId]);

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
    <div className="grid gap-4 lg:min-h-96 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.6fr)]">
      <Card aria-label={copy.listLabel} role="region">
        <CardHeader className="border-b">
          <CardTitle>{copy.listLabel}</CardTitle>
          <Button
            aria-label={copy.refresh}
            className="justify-self-end"
            onClick={refreshList}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent className="lg:min-h-96">
          <IssuesListPanel copy={copy} list={list} onSelect={selectIssue} selected={selected} />
        </CardContent>
      </Card>
      {selected === null ? (
        <Card className="min-h-48 lg:min-h-96" role="status">
          <CardContent className="grid min-h-48 place-items-center text-muted-foreground lg:min-h-96">
            {copy.detailEmpty}
          </CardContent>
        </Card>
      ) : (
        <IssuesPanels
          capability={recoverySelection}
          copy={copy}
          onLoadMoreAudit={loadMoreAudit}
          onSelectRecovery={selectRecovery}
          selected={selected}
          state={panels}
        />
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
    selectionPendingId: null,
  };
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
