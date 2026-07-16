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
    const port = createActivityNotificationsAdapter({ getAuditTimeline });

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
});
