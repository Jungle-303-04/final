import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { listRcaTimeline } from "./rca-list";

const RCA_LIST = {
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
      updated_at: "2026-07-13T10:30:00Z",
    },
  ],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Issues RCA list API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the full list with the default limit", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(RCA_LIST));

    await expect(listRcaTimeline()).resolves.toEqual(RCA_LIST);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/rca/timeline?limit=50",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("passes a cluster filter and custom limit", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ items: [] }));

    await expect(
      listRcaTimeline({ clusterId: "prod/seoul 01", limit: 25 }),
    ).resolves.toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/rca/timeline?cluster_id=prod%2Fseoul+01&limit=25",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("forwards AbortSignal", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(listRcaTimeline({ signal: controller.signal })).rejects.toBe(
      abortError,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/rca/timeline?limit=50",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("rejects an invalid limit before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(listRcaTimeline({ limit: 101 })).rejects.toThrow(
      "RCA list limit must be an integer from 1 to 100",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed RCA items", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ items: [{ ...RCA_LIST.items[0], confidence: "high" }] }),
    );

    await expect(listRcaTimeline()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects unknown timeline response fields as contract drift", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ items: [], total: 0 }),
    );

    await expect(listRcaTimeline()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});
