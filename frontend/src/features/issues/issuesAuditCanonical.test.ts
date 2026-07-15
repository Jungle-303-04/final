import { describe, expect, it } from "vitest";

import { IssuesCanonicalError, IssuesRequestError } from "./issuesContract";
import { toIssueAuditTimelinePage } from "./issuesAuditCanonical";

const RESPONSE = {
  items: [
    {
      event_id: "event-incident-1",
      subject: "incident.detected",
      source: "dashboard-projection",
      created_at: "2026-07-13T04:00:00+00:00",
      causation_id: null,
      journey_stage: "alert" as const,
      payload_summary: { incident_id: "incident-1" },
    },
    {
      event_id: "event-rca-1",
      subject: "rca.completed",
      source: "rca-worker",
      created_at: "not-a-client-filter",
      causation_id: "event-parent-1",
      journey_stage: "rca" as const,
      payload_summary: { confidence: 0.91 },
    },
  ],
  limit: 2,
  has_more: true,
  next_cursor: "  opaque-cursor/+==  ",
};

describe("Issues audit timeline canonical mapping", () => {
  it("preserves server order, raw domain values, nullable cause, and cursor", () => {
    const page = toIssueAuditTimelinePage("correlation-1", RESPONSE);

    expect(page).toEqual({
      correlationId: "correlation-1",
      items: [
        {
          eventId: "event-incident-1",
          subject: "incident.detected",
          source: "dashboard-projection",
          createdAt: "2026-07-13T04:00:00+00:00",
          causationId: null,
          journeyStage: "alert",
          payloadSummary: { incident_id: "incident-1" },
        },
        {
          eventId: "event-rca-1",
          subject: "rca.completed",
          source: "rca-worker",
          createdAt: "not-a-client-filter",
          causationId: "event-parent-1",
          journeyStage: "rca",
          payloadSummary: { confidence: 0.91 },
        },
      ],
      limit: 2,
      hasMore: true,
      nextCursor: "  opaque-cursor/+==  ",
    });
  });

  it("rejects blank correlation without normalizing a valid opaque identity", () => {
    expect(() => toIssueAuditTimelinePage(" ", RESPONSE)).toThrow(IssuesRequestError);
    expect(toIssueAuditTimelinePage(" correlation-1 ", {
      ...RESPONSE,
      has_more: false,
      next_cursor: null,
    }).correlationId).toBe(" correlation-1 ");
  });

  it("rejects inconsistent pagination metadata", () => {
    expect(() => toIssueAuditTimelinePage("correlation-1", {
      ...RESPONSE,
      next_cursor: null,
    })).toThrow(IssuesCanonicalError);
  });

  it.each([true, false])(
    "rejects a blank next cursor when has_more is %s",
    (hasMore) => {
      expect(() => toIssueAuditTimelinePage("correlation-1", {
        ...RESPONSE,
        has_more: hasMore,
        next_cursor: "  ",
      })).toThrow(IssuesCanonicalError);
    },
  );

  it("uses null as the only absent cursor representation", () => {
    expect(toIssueAuditTimelinePage("correlation-1", {
      ...RESPONSE,
      has_more: false,
      next_cursor: null,
    }).nextCursor).toBeNull();
  });
});
