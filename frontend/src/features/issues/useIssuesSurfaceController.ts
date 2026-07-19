import { useCallback, useEffect, useRef, useState } from "react";

import type {
  IssueList,
  IssueQueueFilters,
  IssueSummary,
  IssuesPort,
} from "./issuesContract";
import type {
  IssuePanelsState,
  RecoverySelectionCapability,
} from "./issuesSurfaceContract";
import { useIssueAuditPagination } from "./useIssueAuditPagination";
import { useIssueDetailFocus } from "./useIssueDetailFocus";
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";
import { EMPTY_ISSUE_QUEUE_FILTERS } from "./issuesValidation";
import {
  emptyPanels,
  emptyState,
  isAbortError,
  loadingPanels,
  portFailure,
} from "./issuesSurfaceState";
import {
  useIssuesSurfaceEffects,
  type IssueListRecord,
  type SelectedIssueRecord,
} from "./useIssuesSurfaceEffects";

export interface IssuesSurfaceControllerOptions {
  clusterId: string | null;
  initialIssueId?: string | null;
  port: IssuesPort;
  recoverySelection: RecoverySelectionCapability;
  filters?: IssueQueueFilters;
}

export function useIssuesSurfaceController({
  clusterId,
  initialIssueId = null,
  port,
  recoverySelection,
  filters = EMPTY_ISSUE_QUEUE_FILTERS,
}: IssuesSurfaceControllerOptions) {
  const [listRecord, setListRecord] = useState<IssueListRecord>({
    scope: clusterId,
    state: emptyState(),
  });
  const [selectedRecord, setSelectedRecord] = useState<SelectedIssueRecord | null>(null);
  const [panels, setPanels] = useState<IssuePanelsState>(emptyPanels());
  const [detailFull, setDetailFull] = useState(false);
  const [revision, setRevision] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
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
  const requestScheduledRefresh = useCallback(
    () => setRevision((value) => value + 1),
    [],
  );
  const refreshController = useServerRefreshScheduler(requestScheduledRefresh);

  const { abortAuditPage, loadMoreAudit } = useIssueAuditPagination({
    auditScope,
    correlationId: selected?.correlationId ?? null,
    panels,
    port,
    setPanels,
  });

  const selectIssue = useCallback((issue: IssueSummary) => {
    abortAuditPage();
    requestDetailFocus(issue.id);
    setDetailFull(false);
    setPanels(loadingPanels(issue.incidentId !== null));
    setSelectedRecord({ scope: clusterId, issue });
  }, [abortAuditPage, clusterId, requestDetailFocus]);

  useIssuesSurfaceEffects({
    abortAuditPage,
    clusterId,
    filters,
    initialIssueId,
    mutationRef,
    panels,
    port,
    refreshController,
    revision,
    selectIssue,
    selectedCorrelationId,
    selectedId,
    selectedIncidentId,
    selectedStatus,
    setLastRefreshedAt,
    setListRecord,
    setPanels,
    setSelectedRecord,
  });

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
      refreshController.requestRefresh();
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
  }, [panels.recovery.data, port, recoverySelection.state, refreshController, selected]);

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
    refreshController.requestRefresh();
  }, [clusterId, refreshController]);

  return {
    closeIssue,
    detailFull,
    detailRegionId,
    detailRegionRef,
    lastRefreshedAt,
    list,
    loadMoreAudit,
    panels,
    refreshList,
    selectIssue,
    selected,
    selectRecovery,
    setDetailFull,
  };
}

export type IssuesSurfaceController = ReturnType<typeof useIssuesSurfaceController>;
