import {
  IssuesPortFailure,
  type IssueAuditTimelinePage,
  type IssueDetail,
  type IssueEvidencePage,
  type IssueRecentChanges,
  type IssueRcaReportPage,
  type IssueRecoveryPlan,
} from "./issuesContract";
import type { IssuePanelsState, SectionState } from "./issuesSurfaceContract";

export function emptyState<T>(): SectionState<T> {
  return { data: null, failure: null, loading: true };
}

export function emptyPanels(): IssuePanelsState {
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

export function recoveryProgressIsTerminalStatus(status: string): boolean {
  return ["command_rejected", "incident_resolved", "pr_failed", "resolved"].includes(
    status.trim().toLowerCase(),
  );
}

export function loadingPanels(loadIncidentSections: boolean): IssuePanelsState {
  const panels = emptyPanels();
  return loadIncidentSections
    ? panels
    : {
        ...panels,
        detail: { data: null, failure: null, loading: false },
        recentChanges: { data: null, failure: null, loading: false },
      };
}

export function loadSection<T>(
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

export function portFailure(error: unknown): IssuesPortFailure {
  return error instanceof IssuesPortFailure ? error : new IssuesPortFailure("error");
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
