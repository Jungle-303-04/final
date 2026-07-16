import { beforeEach, describe, expect, it, vi } from "vitest";

import { listRcaIssues } from "./rca-issues";

const ISSUE_LIST = {
  items: [{
    workspace_id: "workspace-1",
    correlation_id: "corr-1",
    cluster_id: "cluster-1",
    incident_id: "incident-1",
    incident_namespace: "payments",
    incident_resource_kind: "Deployment",
    incident_resource_name: "checkout",
    incident_symptom: "Restarting",
    evidence_ref: null,
    current_subject: "incident.detected",
    status: "incident_detected",
    root_cause: null,
    confidence: null,
    supporting_evidence: [],
    missing_evidence: [],
    action_route: null,
    command_id: null,
    pr_url: null,
    error_reason: null,
    updated_at: "2026-07-16T00:00:00Z",
    issue_severity: "critical",
    severity_availability: "available",
    severity_reason_code: null,
  }],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("additive RCA Issues API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("reads the versioned additive projection without changing the legacy timeline route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(ISSUE_LIST));

    await expect(listRcaIssues({ clusterId: "cluster-1", limit: 25 })).resolves.toEqual(ISSUE_LIST);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/rca/issues?cluster_id=cluster-1&limit=25",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("rejects a contradictory severity availability contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      items: [{
        ...ISSUE_LIST.items[0],
        issue_severity: null,
        severity_availability: "available",
      }],
    }));

    await expect(listRcaIssues()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});
