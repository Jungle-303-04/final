import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { getRcaTimeline } from "./rca";

const RCA_TIMELINE = {
  items: [
    {
      workspace_id: "default",
      correlation_id: "corr-123",
      cluster_id: "prod-seoul-01",
      incident_id: "inc-456",
      incident_namespace: "default",
      incident_resource_kind: "Deployment",
      incident_resource_name: "api",
      incident_symptom: "API response latency increased",
      evidence_ref: "evidence-123",
      current_subject: "deployment/default/api",
      status: "investigating",
      root_cause: null,
      confidence: null,
      supporting_evidence: [],
      missing_evidence: ["pod metrics"],
      action_route: "/issues/inc-456",
      command_id: null,
      pr_url: null,
      error_reason: null,
      updated_at: "2026-07-12T10:30:00Z",
    },
  ],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Home RCA timeline API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the Home teaser with a fixed limit of six", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(RCA_TIMELINE),
    );

    await expect(getRcaTimeline()).resolves.toEqual(RCA_TIMELINE);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/rca/timeline?limit=6",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("allows an empty recent-incident list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ items: [] }),
    );

    await expect(getRcaTimeline()).resolves.toEqual({ items: [] });
  });

  it("passes an AbortSignal to the fixed-limit request", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    controller.abort();

    await expect(getRcaTimeline(controller.signal)).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/rca/timeline?limit=6",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("rejects a timeline item with an invalid confidence value", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        items: [{ ...RCA_TIMELINE.items[0], confidence: "high" }],
      }),
    );

    await expect(getRcaTimeline()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves an unauthorized response as an API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Not authenticated" }, 401),
    );

    await expect(getRcaTimeline()).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
      detail: "Not authenticated",
    } satisfies Partial<ApiError>);
  });
});
