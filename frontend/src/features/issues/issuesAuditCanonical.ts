import type {
  IssueAuditEvent,
  IssueAuditTimelinePage,
} from "./issuesAuditContract";
import {
  IssuesCanonicalError,
  IssuesRequestError,
} from "./issuesContract";
import type {
  IssuesEndpointAuditTimelineItem,
  IssuesEndpointAuditTimelineResponse,
} from "./issuesEndpointContract";

const MAX_AUDIT_TIMELINE_LIMIT = 200;

export function toIssueAuditTimelinePage(
  correlationId: string,
  response: IssuesEndpointAuditTimelineResponse,
): IssueAuditTimelinePage {
  requireOpaqueRequestValue(correlationId, "correlation_id");
  validatePage(response);

  return {
    correlationId,
    items: response.items.map(toIssueAuditEvent),
    limit: response.limit,
    hasMore: response.has_more,
    nextCursor: response.next_cursor,
  };
}

function toIssueAuditEvent(item: IssuesEndpointAuditTimelineItem): IssueAuditEvent {
  requireOpaqueResponseValue(item.event_id, "audit event_id");
  requireOpaqueResponseValue(item.subject, "audit subject");
  requireOpaqueResponseValue(item.source, "audit source");
  requireOpaqueResponseValue(item.created_at, "audit created_at");
  if (item.causation_id !== null) {
    requireOpaqueResponseValue(item.causation_id, "audit causation_id");
  }

  return {
    eventId: item.event_id,
    subject: item.subject,
    source: item.source,
    createdAt: item.created_at,
    causationId: item.causation_id,
    journeyStage: item.journey_stage,
    payloadSummary: item.payload_summary,
  };
}

function validatePage(response: IssuesEndpointAuditTimelineResponse): void {
  if (
    !Number.isInteger(response.limit)
    || response.limit < 1
    || response.limit > MAX_AUDIT_TIMELINE_LIMIT
  ) {
    throw new IssuesCanonicalError("Invalid audit timeline page limit");
  }
  if (response.next_cursor !== null) {
    requireOpaqueResponseValue(response.next_cursor, "audit next_cursor");
  }
  if (response.has_more && response.next_cursor === null) {
    throw new IssuesCanonicalError(
      "Audit timeline has_more requires next_cursor",
    );
  }
}

function requireOpaqueRequestValue(value: string, field: string): void {
  if (value.trim() === "") {
    throw new IssuesRequestError(`${field} is required`);
  }
}

function requireOpaqueResponseValue(value: string, field: string): void {
  if (value.trim() === "") {
    throw new IssuesCanonicalError(`${field} is required`);
  }
}
