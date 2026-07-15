import { describe, expect, it, vi } from "vitest";
import {
  createIssuesAdapter,
  type IssuesEndpointDependencies,
} from "./createIssuesAdapter";

const auditTimelinePage = {
  items: [{
    event_id: "event-incident-1",
    subject: "incident.detected",
    source: "dashboard-projection",
    created_at: "2026-07-13T01:10:00Z",
    causation_id: null,
    journey_stage: "alert" as const,
    payload_summary: { incident_id: "incident-1" },
  }, {
    event_id: "event-rca-1",
    subject: "rca.completed",
    source: "rca-worker",
    created_at: "2026-07-13T01:30:00Z",
    causation_id: "event-parent-1",
    journey_stage: "rca" as const,
    payload_summary: { root_cause: "Memory limit exceeded" },
  }],
  limit: 2,
  has_more: true,
  next_cursor: "audit-cursor-2",
};

describe("createIssuesAdapter audit timeline", () => {
  it("loads the audit page without client sorting or workspace filtering", async () => {
    const dependencies = endpoints();
    const port = createIssuesAdapter(dependencies);

    await expect(port.loadAuditTimeline("correlation-1", {
      cursor: "audit-cursor-1",
      limit: 2,
    })).resolves.toMatchObject({
      correlationId: "correlation-1",
      hasMore: true,
      nextCursor: "audit-cursor-2",
      items: [
        { subject: "incident.detected", causationId: null },
        { subject: "rca.completed", causationId: "event-parent-1" },
      ],
    });
    expect(dependencies.getAuditTimeline).toHaveBeenCalledWith("correlation-1", {
      cursor: "audit-cursor-1",
      limit: 2,
      signal: undefined,
    });
  });
});

function endpoints(): IssuesEndpointDependencies {
  return {
    listRcaTimeline: vi.fn(),
    getRcaIncident: vi.fn(),
    listEvidence: vi.fn(),
    listRcaReports: vi.fn(),
    getAuditTimeline: vi.fn().mockResolvedValue(auditTimelinePage),
    getIncidentRecentChanges: vi.fn(),
    getRecoveryPlanByCorrelation: vi.fn(),
    selectRecoveryAction: vi.fn(),
  };
}
