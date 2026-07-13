import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  IssuesPortFailure,
  type IssueAuditTimelinePage,
  type IssuesPort,
} from "./issuesContract";
import type { IssuePanelsState } from "./issuesSurfaceContract";

export function useIssueAuditPagination({
  auditScope,
  correlationId,
  panels,
  port,
  setPanels,
}: {
  auditScope: string | null;
  correlationId: string | null;
  panels: IssuePanelsState;
  port: IssuesPort;
  setPanels: Dispatch<SetStateAction<IssuePanelsState>>;
}) {
  const requestRef = useRef<AbortController | null>(null);
  const scopeRef = useRef<string | null>(null);

  useEffect(() => {
    scopeRef.current = auditScope;
  }, [auditScope]);

  const abortAuditPage = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  useEffect(() => abortAuditPage, [abortAuditPage]);

  const loadMoreAudit = useCallback(() => {
    const currentPage = panels.audit.data;
    if (
      correlationId === null ||
      currentPage === null ||
      currentPage.hasMore === false ||
      currentPage.nextCursor === null ||
      panels.audit.loading ||
      requestRef.current !== null
    ) return;

    const controller = new AbortController();
    const requestScope = auditScope;
    requestRef.current = controller;
    setPanels((current) => ({
      ...current,
      audit: { ...current.audit, failure: null, loading: true },
    }));
    void port.loadAuditTimeline(correlationId, {
      cursor: currentPage.nextCursor,
      limit: currentPage.limit,
    }, controller.signal).then(
      (nextPage) => {
        if (controller.signal.aborted || scopeRef.current !== requestScope) return;
        setPanels((current) => ({
          ...current,
          audit: {
            data: appendAuditPage(current.audit.data, nextPage),
            failure: null,
            loading: false,
          },
        }));
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error) || scopeRef.current !== requestScope) {
          return;
        }
        setPanels((current) => ({
          ...current,
          audit: {
            data: current.audit.data,
            failure: portFailure(error),
            loading: false,
          },
        }));
      },
    ).finally(() => {
      if (requestRef.current === controller) requestRef.current = null;
    });
  }, [auditScope, correlationId, panels.audit.data, panels.audit.loading, port, setPanels]);

  return { abortAuditPage, loadMoreAudit };
}

function appendAuditPage(
  current: IssueAuditTimelinePage | null,
  next: IssueAuditTimelinePage,
): IssueAuditTimelinePage {
  if (current === null || current.correlationId !== next.correlationId) return next;
  return {
    correlationId: current.correlationId,
    items: [...current.items, ...next.items],
    limit: next.limit,
    hasMore: next.hasMore,
    nextCursor: next.nextCursor,
  };
}

function portFailure(error: unknown): IssuesPortFailure {
  return error instanceof IssuesPortFailure ? error : new IssuesPortFailure("error");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
