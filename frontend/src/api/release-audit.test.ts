import { afterEach, describe, expect, it, vi } from "vitest";

import { listReleaseAuditEvents, RELEASE_AUDIT_PATH } from "./release-audit";

afterEach(() => vi.restoreAllMocks());

describe("release audit API", () => {
  it("loads the authorized release projection used by workflow notifications", async () => {
    const response = {
      events: [{
        audit_id: "audit-1",
        workspace_id: "default",
        run_id: "run-1",
        event_type: "workflow.run.failed",
        message: "Readiness verification timed out.",
        actor: null,
        details: { reason: "timeout" },
        created_at: "2026-07-17T05:00:00Z",
        plan_id: "plan-1",
        plan_name: "payment-api",
        run_status: "failed",
        application_ids: ["payment-api"],
      }],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(response),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    await expect(listReleaseAuditEvents()).resolves.toEqual(response);
    expect(RELEASE_AUDIT_PATH).toBe("/api/release-audit");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/release-audit?limit=200",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });
});
