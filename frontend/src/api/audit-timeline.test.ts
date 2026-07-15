import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  AUDIT_TIMELINE_DEFAULT_LIMIT,
  AUDIT_TIMELINE_MAX_LIMIT,
  AUDIT_TIMELINE_PATH,
  auditTimelineResponseSchema as publicAuditTimelineResponseSchema,
  getAuditTimeline as publicGetAuditTimeline,
} from "./index";
import {
  getAuditTimeline,
} from "./audit-timeline";
import { auditTimelineResponseSchema } from "./audit-timeline-schemas";

const AUDIT_TIMELINE = {
  items: [
    {
      event_id: "event-incident-1",
      subject: "incident.detected",
      source: "dashboard-projection",
      created_at: "2026-07-13T04:00:00+00:00",
      causation_id: null,
      journey_stage: "alert" as const,
      payload_summary: {
        incident_id: "incident-1",
        severity: "critical",
      },
    },
    {
      event_id: "event-rca-1",
      subject: "rca.completed",
      source: "rca-worker",
      created_at: "2026-07-13T04:00:01+00:00",
      causation_id: "event-parent-1",
      journey_stage: "rca" as const,
      payload_summary: {
        root_cause: "ImagePullBackOff",
        evidence: ["event://cluster-1/default/pod-1"],
      },
    },
  ],
  limit: 2,
  has_more: true,
  next_cursor: "eyJ2IjoxLCJpZCI6Mn0",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("audit timeline API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports the verified endpoint and strict response schema", () => {
    expect(publicGetAuditTimeline).toBe(getAuditTimeline);
    expect(publicAuditTimelineResponseSchema).toBe(auditTimelineResponseSchema);
    expect(AUDIT_TIMELINE_DEFAULT_LIMIT).toBe(50);
    expect(AUDIT_TIMELINE_MAX_LIMIT).toBe(200);
    expect(AUDIT_TIMELINE_PATH).toBe("/api/audit/timeline");
  });

  it("preserves server order, nullable causation, and allowlisted summary values", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(AUDIT_TIMELINE),
    );

    const result = await getAuditTimeline("correlation-1", { limit: 2 });

    expect(result).toEqual(AUDIT_TIMELINE);
    expect(result.items.map(({ subject }) => subject)).toEqual([
      "incident.detected",
      "rca.completed",
    ]);
    expect(result.items[0]?.causation_id).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/audit/timeline?correlation_id=correlation-1&limit=2",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("forwards an opaque cursor without interpreting it and preserves AbortSignal", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(getAuditTimeline("correlation/1", {
      cursor: "opaque+/cursor==",
      signal: controller.signal,
    })).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/audit/timeline?correlation_id=correlation%2F1&cursor=opaque%2B%2Fcursor%3D%3D&limit=50",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it.each([
    ["response", { ...AUDIT_TIMELINE, total: 2 }],
    ["item", {
      ...AUDIT_TIMELINE,
      items: [{ ...AUDIT_TIMELINE.items[0], workspace_id: "must-not-leak" }],
    }],
  ])("rejects unknown %s fields as contract drift", async (_layer, payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getAuditTimeline("correlation-1", { limit: 2 })).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it.each([
    ["blank correlation", "", {}],
    ["blank cursor", "correlation-1", { cursor: " " }],
    ["zero limit", "correlation-1", { limit: 0 }],
    ["fractional limit", "correlation-1", { limit: 1.5 }],
    ["oversized limit", "correlation-1", { limit: 201 }],
  ])("rejects %s before making a request", async (_case, correlationId, options) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(getAuditTimeline(correlationId, options)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps an invalid cursor response through the shared API error path", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "cursor is invalid" }, 422),
    );

    await expect(getAuditTimeline("correlation-1", { cursor: "expired" }))
      .rejects.toMatchObject({
        kind: "invalid-request",
        status: 422,
        detail: "cursor is invalid",
      } satisfies Partial<ApiError>);
  });
});
