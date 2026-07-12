import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { grantApproval, rejectApproval } from "./approvals";

const ACCEPTED = {
  accepted: true,
  event_id: "evt-approval-1",
  correlation_id: "corr-approval-1",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GitOps approval API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("grants an approval with a decision reason", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await expect(
      grantApproval("approval/123", { reason: "Diff reviewed by platform team" }),
    ).resolves.toEqual(ACCEPTED);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approvals/approval%2F123/grant",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ reason: "Diff reviewed by platform team" }),
      }),
    );
  });

  it("rejects an approval and allows an omitted reason", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await expect(rejectApproval("approval-123")).resolves.toEqual(ACCEPTED);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approvals/approval-123/reject",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: null }),
      }),
    );
  });

  it("forwards AbortSignal", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(
      grantApproval("approval-123", { signal: controller.signal }),
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approvals/approval-123/grant",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("preserves not-found and already-resolved conflicts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "approval already resolved" }, 409),
    );

    await expect(grantApproval("approval-123")).rejects.toMatchObject({
      kind: "http",
      status: 409,
      detail: "approval already resolved",
    } satisfies Partial<ApiError>);
  });

  it("rejects malformed decision responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ accepted: true, event_id: "evt-only" }),
    );

    await expect(rejectApproval("approval-123")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});
