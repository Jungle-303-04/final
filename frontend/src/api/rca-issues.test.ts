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
    category: "container_restart",
    category_availability: "available",
    category_reason_code: null,
  }],
  total: 1,
  total_matched: 3,
  count_completeness: "exact",
  recent_changes: [],
  visibility: {
    state: "partial",
    completeness: "partial",
    authorized_cluster_count: 1,
    requested_namespaces: ["cluster-1/payments"],
    reason_codes: ["legacy_category_projection_incomplete"],
  },
  facets: {
    namespaces: [{ value: "cluster-1/payments", count: 3 }],
    severities: [{ value: "critical", count: 2 }],
    categories: [{ value: "container_restart", count: 2 }],
  },
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

    await expect(listRcaIssues({
      clusterId: "cluster-1",
      namespaces: ["cluster-1/payments"],
      severities: ["critical"],
      categories: ["container_restart"],
      limit: 25,
    })).resolves.toEqual(ISSUE_LIST);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/rca/issues?cluster_id=cluster-1&namespaces=cluster-1%2Fpayments&severity=critical&category=container_restart&limit=25",
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
      total: 1,
      total_matched: 1,
      count_completeness: "exact",
      recent_changes: [],
      visibility: ISSUE_LIST.visibility,
      facets: ISSUE_LIST.facets,
    }));

    await expect(listRcaIssues()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});
