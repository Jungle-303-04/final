import {
  IssuesRequestError,
  type IssuesEndpointTimelineResponse,
  type IssuesPort,
} from "./issuesContract";
import {
  transportStatus,
  withCanonicalFailure,
} from "./issuesAdapterFailure";
import { toIssueDetail, toIssueList } from "./issuesCanonical";
import { toIssueAuditTimelinePage } from "./issuesAuditCanonical";
import {
  toIssueEvidencePage,
  toIssueRcaReportPage,
} from "./issuesEvidenceCanonical";
import type {
  IssuesEndpointDependencies,
} from "./issuesEndpointContract";
import {
  toIssueRecoveryPlan,
  toIssueRecoveryReceipt,
} from "./issuesRecoveryCanonical";
import { toIssueRecentChanges } from "./issuesRecentChangesCanonical";
import { ISSUE_RECENT_CHANGES_LIMIT } from "./issuesRecentChangesContract";
import {
  canonicalIssueDetailRequest,
  canonicalIssueListRequest,
} from "./issuesValidation";

export type { IssuesEndpointDependencies } from "./issuesEndpointContract";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const MAX_SELECTION_REASON_LENGTH = 500;

export function createIssuesAdapter(endpoints: IssuesEndpointDependencies): IssuesPort {
  const loadIssueProjection = createIssueProjectionLoader(endpoints);
  return {
    async listIssues(clusterId, limit = 50, signal) {
      return withCanonicalFailure(async () => {
        const request = canonicalIssueListRequest(clusterId, limit);
        return toIssueList(
          request,
          await loadIssueProjection({
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

    async loadRecentChanges(incidentId, signal) {
      return withCanonicalFailure(async () => {
        const incident = identity(incidentId, "incident_id");
        return toIssueRecentChanges(
          incident,
          await endpoints.getIncidentRecentChanges(incident, {
            limit: ISSUE_RECENT_CHANGES_LIMIT,
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

    async loadAuditTimeline(correlationId, query = {}, signal) {
      return withCanonicalFailure(async () => {
        const correlation = opaqueIdentity(correlationId, "correlation_id");
        const page = auditTimelineQuery(query);
        return toIssueAuditTimelinePage(
          correlation,
          await endpoints.getAuditTimeline(correlation, {
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
            correlationId,
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

function createIssueProjectionLoader(
  endpoints: IssuesEndpointDependencies,
): (options: Parameters<IssuesEndpointDependencies["listRcaTimeline"]>[0]) => Promise<IssuesEndpointTimelineResponse> {
  let legacyFallbackAvailable = true;
  return async (options) => {
    if (endpoints.listRcaIssues === undefined) {
      return endpoints.listRcaTimeline(options);
    }
    try {
      return await endpoints.listRcaIssues(options);
    } catch (error: unknown) {
      // A new web bundle can temporarily reach a still-old backend. The one
      // read-only fallback is intentionally bounded: it keeps an in-flight
      // rollout from blanking the queue, but cannot silently conceal a missing
      // additive contract across subsequent refreshes.
      if (!legacyFallbackAvailable || !isMissingIssueProjection(error)) throw error;
      legacyFallbackAvailable = false;
      return endpoints.listRcaTimeline(options);
    }
  };
}

function isMissingIssueProjection(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "kind" in error
    && error.kind === "not-found"
    && "status" in error
    && error.status === 404
  );
}

function auditTimelineQuery(query: {
  cursor?: string;
  limit?: number;
}): { cursor?: string; limit: number } {
  const unsupportedField = Object.keys(query).find(
    (field) => field !== "cursor" && field !== "limit",
  );
  if (unsupportedField !== undefined) {
    throw new IssuesRequestError(
      `Unsupported audit timeline query field: ${unsupportedField}`,
    );
  }
  const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    throw new IssuesRequestError(
      `limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`,
    );
  }
  return {
    cursor: query.cursor === undefined
      ? undefined
      : opaqueIdentity(query.cursor, "cursor"),
    limit,
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
    cursor: optionalOpaqueIdentity(query.cursor, "cursor"),
  };
}

function identity(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new IssuesRequestError(`${field} is required`);
  return normalized;
}

function opaqueIdentity(value: string, field: string): string {
  if (value.trim() === "") {
    throw new IssuesRequestError(`${field} is required`);
  }
  return value;
}

function optionalIdentity(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  return identity(value, field);
}

function optionalOpaqueIdentity(
  value: string | undefined,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  return opaqueIdentity(value, field);
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
