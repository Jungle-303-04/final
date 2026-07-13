import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { listEvidence, listRcaReports } from "./evidence";

const EVIDENCE = {
  items: [
    {
      id: 7,
      workspace_id: "default",
      correlation_id: "corr-123",
      kind: "incident.evidence",
      cluster_id: "prod-seoul-01",
      evidence_ref: "evidence-123",
      summary: "Kubernetes, metric, and log evidence collected",
      sources: [
        {
          source: "kubernetes",
          summary: "Pod restart and OOMKilled event",
          schema_version: 1,
          collector: "cluster-agent",
          collector_version: "1.0.0",
          source_version: null,
          query_version: null,
          collected_at: "2026-07-13T10:20:00Z",
          evidence_key: "kubernetes",
          source_id: null,
          agent_id: "agent-1",
          window_start: null,
        },
      ],
      created_at: "2026-07-13T10:20:00Z",
    },
  ],
  limit: 50,
  offset: 0,
  has_more: false,
  next_cursor: null,
};

const RCA_REPORTS = {
  items: [
    {
      id: 11,
      workspace_id: "default",
      correlation_id: "corr-123",
      root_cause: "Memory limit exceeded",
      action: "Increase memory limit after approval",
      incident_id: "inc-456",
      cluster_id: "prod-seoul-01",
      symptom: "API Pod repeatedly restarted",
      severity: "warning",
      confidence: 0.86,
      reason: "OOMKilled and memory usage evidence agree",
      evidence_ref: "evidence-123",
      supporting_evidence: ["OOMKilled"],
      missing_evidence: [],
      created_at: "2026-07-13T10:30:00Z",
      resource_kind: "Deployment",
      resource_name: "api",
      namespace: "default",
      secondary_symptoms: [],
      selected_candidate_id: "candidate-memory",
      candidates: [],
      supporting_evidence_refs: [],
      missing_evidence_checks: [],
    },
  ],
  limit: 50,
  offset: 0,
  has_more: false,
  next_cursor: null,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Evidence and RCA report API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists Evidence for an Incident with filters and pagination", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(EVIDENCE));

    await expect(
      listEvidence({
        correlationId: "corr-123",
        kind: "incident.evidence",
        limit: 100,
        offset: 20,
      }),
    ).resolves.toEqual(EVIDENCE);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/evidence?correlation_id=corr-123&kind=incident.evidence&limit=100&offset=20",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("lists RCA reports by correlation id", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(RCA_REPORTS));

    await expect(
      listRcaReports({ correlationId: "corr-123" }),
    ).resolves.toEqual(RCA_REPORTS);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca-reports?correlation_id=corr-123&limit=50",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("preserves ISO range filters and the opaque server cursor", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({
        ...EVIDENCE,
        has_more: true,
        next_cursor: "eyJ2IjoxLCJpZCI6N30",
      }));

    const result = await listEvidence({
      correlationId: "corr/123",
      since: "2026-07-13T00:00:00+09:00",
      until: "2026-07-14T00:00:00Z",
      cursor: "cursor/+==",
    });

    expect(result.next_cursor).toBe("eyJ2IjoxLCJpZCI6N30");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/evidence?correlation_id=corr%2F123&since=2026-07-13T00%3A00%3A00%2B09%3A00&until=2026-07-14T00%3A00%3A00Z&limit=50&cursor=cursor%2F%2B%3D%3D",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("forwards AbortSignal to Evidence requests", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(listEvidence({ signal: controller.signal })).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/evidence?limit=50",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("rejects invalid pagination before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(listEvidence({ limit: 201 })).rejects.toThrow(
      "Evidence list limit must be an integer from 1 to 200",
    );
    await expect(listRcaReports({ offset: -1 })).rejects.toThrow(
      "Evidence/RCA report offset must be a non-negative integer",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed RCA report payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        ...RCA_REPORTS,
        items: [{ ...RCA_REPORTS.items[0], confidence: "high" }],
      }),
    );

    await expect(listRcaReports()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects unknown evidence page fields as contract drift", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...EVIDENCE, total: 1 }),
    );

    await expect(listEvidence()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});
