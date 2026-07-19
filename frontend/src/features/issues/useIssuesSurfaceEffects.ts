import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

import type {
  IssueList,
  IssueQueueFilters,
  IssueSummary,
  IssuesPort,
} from "./issuesContract";
import type { IssuePanelsState, SectionState } from "./issuesSurfaceContract";
import type { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";
import {
  isAbortError,
  loadSection,
  portFailure,
  recoveryProgressIsTerminalStatus,
} from "./issuesSurfaceState";

export interface IssueListRecord {
  scope: string | null;
  state: SectionState<IssueList>;
}

export interface SelectedIssueRecord {
  scope: string | null;
  issue: IssueSummary;
}

interface IssuesSurfaceEffectsOptions {
  abortAuditPage: () => void;
  clusterId: string | null;
  filters: IssueQueueFilters;
  initialIssueId: string | null;
  mutationRef: RefObject<AbortController | null>;
  panels: IssuePanelsState;
  port: IssuesPort;
  refreshController: ReturnType<typeof useServerRefreshScheduler>;
  revision: number;
  selectIssue: (issue: IssueSummary) => void;
  selectedCorrelationId: string | null;
  selectedId: string | null;
  selectedIncidentId: string | null;
  selectedStatus: string | null;
  setLastRefreshedAt: Dispatch<SetStateAction<number | null>>;
  setListRecord: Dispatch<SetStateAction<IssueListRecord>>;
  setPanels: Dispatch<SetStateAction<IssuePanelsState>>;
  setSelectedRecord: Dispatch<SetStateAction<SelectedIssueRecord | null>>;
}

export function useIssuesSurfaceEffects({
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
}: IssuesSurfaceEffectsOptions): void {
  const hydratedInitialIssueRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      port.listIssues(clusterId, 50, controller.signal, filters),
      port.loadIssuesAuditRefreshPolicy(controller.signal),
    ]).then(
      ([data, refreshPolicy]) => {
        setListRecord({
          scope: clusterId,
          state: { data, loading: false, failure: null },
        });
        setLastRefreshedAt(Date.now());
        refreshController.acceptSuccess(refreshPolicy);
        const hydrationKey = initialIssueId === null
          ? null
          : `${clusterId ?? ""}\u0000${initialIssueId}`;
        const initialIssue = initialIssueId === null
          ? undefined
          : data.items.find((issue) => issue.id === initialIssueId);
        if (
          hydrationKey !== null
          && initialIssue !== undefined
          && hydratedInitialIssueRef.current !== hydrationKey
        ) {
          hydratedInitialIssueRef.current = hydrationKey;
          selectIssue(initialIssue);
        }
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
          refreshController.backgroundFailure();
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
  }, [
    clusterId,
    filters,
    initialIssueId,
    port,
    refreshController,
    revision,
    selectIssue,
    setLastRefreshedAt,
    setListRecord,
    setSelectedRecord,
  ]);

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
  }, [abortAuditPage, clusterId, port, selectedCorrelationId, selectedIncidentId, setPanels]);

  useEffect(() => () => mutationRef.current?.abort(), [mutationRef]);

  useEffect(() => {
    if (revision === 0 || selectedCorrelationId === null || panels.receipt !== null) return;
    const controller = new AbortController();
    void Promise.all([
      port.loadAuditTimeline(selectedCorrelationId, {}, controller.signal),
      port.loadIssuesAuditRefreshPolicy(controller.signal),
    ]).then(([audit, refreshPolicy]) => {
      if (controller.signal.aborted) return;
      setPanels((current) => ({
        ...current,
        audit: { data: audit, loading: false, failure: null },
      }));
      refreshController.acceptSuccess(refreshPolicy);
    }).catch((error: unknown) => {
      if (controller.signal.aborted || isAbortError(error)) return;
      refreshController.backgroundFailure();
      setPanels((current) => ({
        ...current,
        audit: {
          data: current.audit.data,
          loading: false,
          failure: portFailure(error),
        },
      }));
    });
    return () => controller.abort();
  }, [panels.receipt, port, refreshController, revision, selectedCorrelationId, setPanels]);

  useEffect(() => {
    if (
      selectedCorrelationId === null || selectedId === null || selectedStatus === null ||
      panels.receipt === null
    ) return;
    if (recoveryProgressIsTerminalStatus(selectedStatus)) return;
    const controller = new AbortController();
    const refreshProgress = async () => {
      try {
        const [recoveryResult, auditResult, policyResult] = await Promise.allSettled([
          port.loadRecoveryPlan(selectedCorrelationId, controller.signal),
          port.loadAuditTimeline(selectedCorrelationId, {}, controller.signal),
          port.loadIssuesAuditRefreshPolicy(controller.signal),
        ]);
        if (controller.signal.aborted) return;
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
        if (
          policyResult.status === "fulfilled" &&
          (recoveryResult.status === "fulfilled" || auditResult.status === "fulfilled")
        ) {
          refreshController.acceptSuccess(policyResult.value);
        } else {
          refreshController.backgroundFailure();
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          refreshController.backgroundFailure();
        }
      }
    };
    void refreshProgress();
    return () => controller.abort();
  }, [
    panels.receipt,
    port,
    refreshController,
    revision,
    selectedCorrelationId,
    selectedId,
    selectedStatus,
    setLastRefreshedAt,
    setPanels,
  ]);
}
