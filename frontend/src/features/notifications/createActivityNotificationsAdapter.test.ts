import { describe, expect, it, vi } from "vitest";

import { createActivityNotificationsAdapter } from "./createActivityNotificationsAdapter";

describe("createActivityNotificationsAdapter", () => {
  it("loads Safe PR progress from the correlation audit timeline", async () => {
    const getAuditTimeline = vi.fn().mockResolvedValue({
      items: [{
        event_id: "evt-safe-pr-created",
        subject: "safe_pr.created",
        created_at: "2026-07-16T05:01:00Z",
        payload_summary: { message: "PR #128 created", pr_number: 128 },
      }],
    });
    const port = createActivityNotificationsAdapter({
      getAuditTimeline,
      listReleaseAuditEvents: vi.fn().mockResolvedValue({ events: [] }),
    });

    await expect(port.loadSafePrEvents("correlation-safe-pr")).resolves.toEqual([{
      eventId: "evt-safe-pr-created",
      eventType: "safe_pr.created",
      message: "PR #128 created",
      createdAt: "2026-07-16T05:01:00Z",
      details: { message: "PR #128 created", pr_number: 128 },
    }]);
    expect(getAuditTimeline).toHaveBeenCalledWith(
      "correlation-safe-pr",
      { limit: 200, signal: undefined },
    );
  });

  it("loads completed and failed workflow runs from the real release audit projection", async () => {
    const listReleaseAuditEvents = vi.fn().mockResolvedValue({
      events: [{
        audit_id: "audit-workflow-failed",
        run_id: "run-1",
        event_type: "workflow.run.failed",
        message: "Deployment verification failed.",
        created_at: "2026-07-17T05:01:00Z",
        plan_id: "plan-1",
        plan_name: "payment-api",
        application_ids: ["app-payment"],
        details: { reason: "readiness timeout" },
      }, {
        audit_id: "audit-step",
        run_id: "run-1",
        event_type: "workflow.step.recorded",
        message: "step",
        created_at: "2026-07-17T05:00:00Z",
        plan_id: "plan-1",
        plan_name: "payment-api",
        application_ids: ["app-payment"],
        details: {},
      }],
    });
    const port = createActivityNotificationsAdapter({
      getAuditTimeline: vi.fn(),
      listReleaseAuditEvents,
    });

    await expect(port.loadWorkflowEvents?.()).resolves.toEqual([{
      eventId: "audit-workflow-failed",
      eventType: "workflow.run.failed",
      message: "Deployment verification failed.",
      createdAt: "2026-07-17T05:01:00Z",
      runId: "run-1",
      planId: "plan-1",
      planName: "payment-api",
      applicationIds: ["app-payment"],
      details: { reason: "readiness timeout" },
    }]);
    expect(listReleaseAuditEvents).toHaveBeenCalledWith({ limit: 200, signal: undefined });
  });
});
