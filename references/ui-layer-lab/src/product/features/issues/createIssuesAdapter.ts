import {
  IssuesCanonicalError,
  IssuesPortFailure,
  IssuesRequestError,
  type IssuesFailureCode,
  type IssuesPort,
} from "./issuesContract";
import { toIssueDetail, toIssueList } from "./issuesCanonical";
import {
  toIssueEvidencePage,
  toIssueRcaReportPage,
} from "./issuesEvidenceCanonical";
import type { IssuesEndpointDependencies } from "./issuesEndpointContract";
import {
  toIssueRecoveryPlan,
  toIssueRecoveryReceipt,
} from "./issuesRecoveryCanonical";
import {
  canonicalIssueDetailRequest,
  canonicalIssueListRequest,
} from "./issuesValidation";

export type { IssuesEndpointDependencies } from "./issuesEndpointContract";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const MAX_SELECTION_REASON_LENGTH = 500;

export function createIssuesAdapter(endpoints: IssuesEndpointDependencies): IssuesPort {
  return {
    async listIssues(clusterId, limit = 50, signal) {
      return withCanonicalFailure(async () => {
        const request = canonicalIssueListRequest(clusterId, limit);
        return toIssueList(
          request,
          await endpoints.listRcaTimeline({
            clusterId: request.clusterId ?? undefined,
            limit: request.limit,
            signal,
          }),
        );
      });
    },

    async loadIssue(incidentId, clusterId, signal) {
      return withCanonicalFailure(async () => {
        const request = canonicalIssueDetailRequest(incidentId, clusterId);
        return toIssueDetail(
          request,
          await endpoints.getRcaIncident(request.incidentId, {
            clusterId: request.clusterId ?? undefined,
            signal,
          }),
        );
      });
    },

    async loadEvidence(correlationId, query = {}, signal) {
      return withCanonicalFailure(async () => {
        const correlation = identity(correlationId, "correlation_id");
        const page = pageQuery(query);
        return toIssueEvidencePage(
          correlation,
          await endpoints.listEvidence({
            correlationId: correlation,
            kind: optionalIdentity(query.kind, "kind"),
            ...page,
            signal,
          }),
        );
      });
    },

    async loadReports(correlationId, query = {}, signal) {
      return withCanonicalFailure(async () => {
        const correlation = identity(correlationId, "correlation_id");
        const page = pageQuery(query);
        return toIssueRcaReportPage(
          correlation,
          await endpoints.listRcaReports({
            correlationId: correlation,
            ...page,
            signal,
          }),
        );
      });
    },

    async loadRecoveryPlan(correlationId, signal) {
      return withCanonicalFailure(async () => {
        const correlation = identity(correlationId, "correlation_id");
        return toIssueRecoveryPlan(
          correlation,
          await endpoints.getRecoveryPlanByCorrelation(correlation, { signal }),
        );
      });
    },

    async selectRecoveryAction(selection, signal) {
      return withCanonicalFailure(async () => {
        const correlationId = identity(selection.correlationId, "correlation_id");
        const planId = identity(selection.planId, "plan_id");
        const actionId = identity(selection.actionId, "action_id");
        const reason = selectionReason(selection.reason);
        try {
          const receipt = await endpoints.selectRecoveryAction(
            planId,
            actionId,
            reason === undefined ? {} : { reason },
            { signal },
          );
          return {
            kind: "accepted" as const,
            receipt: toIssueRecoveryReceipt(correlationId, receipt),
          };
        } catch (error) {
          if (transportStatus(error) !== 409) throw error;
          const latest = await endpoints.getRecoveryPlanByCorrelation(
            correlationId,
            { signal },
          );
          return {
            kind: "conflict" as const,
            plan: toIssueRecoveryPlan(correlationId, latest),
          };
        }
      });
    },
  };
}

function pageQuery(query: {
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}) {
  const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
  const offset = query.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    throw new IssuesRequestError(`limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new IssuesRequestError("offset must be a non-negative integer");
  }
  return {
    since: optionalIdentity(query.since, "since"),
    until: optionalIdentity(query.until, "until"),
    limit,
    offset,
    cursor: optionalIdentity(query.cursor, "cursor"),
  };
}

function identity(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new IssuesRequestError(`${field} is required`);
  return normalized;
}

function optionalIdentity(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  return identity(value, field);
}

function selectionReason(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (value.length > MAX_SELECTION_REASON_LENGTH) {
    throw new IssuesRequestError(
      `reason must be at most ${MAX_SELECTION_REASON_LENGTH} characters`,
    );
  }
  return value;
}

async function withCanonicalFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof IssuesPortFailure) throw error;
    if (error instanceof IssuesRequestError) {
      throw new IssuesPortFailure("invalid-request");
    }
    if (error instanceof IssuesCanonicalError) {
      throw new IssuesPortFailure("invalid-response");
    }
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): IssuesPortFailure {
  const status = transportStatus(error);
  const kind = transportString(error, "kind");
  const codeByKind: Record<string, IssuesFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "not-found": "not-found",
    "invalid-request": "invalid-request",
    "rate-limited": "rate-limited",
    network: "offline",
    "invalid-payload": "invalid-response",
  };
  const codeByStatus: Record<number, IssuesFailureCode> = {
    401: "unauthorized",
    403: "forbidden",
    404: "not-found",
    422: "invalid-request",
    429: "rate-limited",
    503: "unavailable",
  };
  return new IssuesPortFailure(
    codeByKind[kind ?? ""] ?? codeByStatus[status ?? -1] ?? "error",
    retryAfter(error),
  );
}

function transportStatus(error: unknown): number | null {
  return transportNumber(error, "status");
}

function transportString(error: unknown, key: string): string | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function transportNumber(error: unknown, key: string): number | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function retryAfter(error: unknown): number | null {
  const value = transportNumber(error, "retryAfter");
  return value !== null && value >= 0 ? value : null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
