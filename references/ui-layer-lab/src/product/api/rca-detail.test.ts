import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { getRcaIncident } from "./rca-detail";

const RCA_INCIDENT = {
  item: {
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
    root_cause: "Memory pressure caused repeated Pod restarts",
    confidence: 0.86,
    supporting_evidence: ["Pod restart count increased"],
    missing_evidence: ["recent deployment change"],
    action_route: "/issues/inc-456",
    command_id: null,
    pr_url: null,
    error_reason: null,
    updated_at: "2026-07-13T10:30:00Z",
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("RCA Incident detail API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads one Incident detail by id", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(RCA_INCIDENT));

    await expect(getRcaIncident("inc-456")).resolves.toEqual(RCA_INCIDENT);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/rca/incidents/inc-456",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("encodes the incident id and scopes the request to a cluster", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(RCA_INCIDENT));

    await getRcaIncident("inc/456", { clusterId: "prod/seoul 01" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/rca/incidents/inc%2F456?cluster_id=prod%2Fseoul+01",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("forwards AbortSignal", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(
      getRcaIncident("inc-456", { signal: controller.signal }),
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/rca/incidents/inc-456",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("preserves a not-found response as an API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "RCA incident not found" }, 404),
    );

    await expect(getRcaIncident("missing-incident")).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "RCA incident not found",
    } satisfies Partial<ApiError>);
  });

  it("rejects a malformed Incident detail response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ item: { ...RCA_INCIDENT.item, confidence: "high" } }),
    );

    await expect(getRcaIncident("inc-456")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects unknown Incident response fields as contract drift", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...RCA_INCIDENT, provider: "unknown" }),
    );

    await expect(getRcaIncident("inc-456")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});
