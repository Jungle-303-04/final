import { beforeEach, describe, expect, it, vi } from "vitest";

import { getResourceIssues, RESOURCE_ISSUES_PATH } from "./resource-issues";

const RESPONSE = {
  scope: {
    workspace_id: "workspace-1",
    cluster_id: "cluster-1",
    namespaces: ["target"],
    freshness: "live",
  },
  coverage_availability: "available",
  observed_at: "2026-07-16T05:00:00Z",
  reason_codes: [],
  items: [{
    workspace_id: "workspace-1",
    correlation_id: "corr-1",
    cluster_id: "cluster-1",
    incident_id: "incident-1",
    incident_namespace: "target",
    incident_resource_kind: "Deployment",
    incident_resource_name: "checkout-api",
    incident_symptom: "Unavailable replicas",
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
    updated_at: "2026-07-16T05:01:00Z",
    issue_severity: "warning",
    severity_availability: "available",
    severity_reason_code: null,
    onset: {
      first_observed_at: "2026-07-16T05:00:00Z",
      source: "timeline_created_at",
      timing_kind: null,
      timing_availability: "unavailable",
      timing_reason_code: "health_transition_evidence_unavailable",
    },
  }],
  limit: 25,
  has_more: false,
};

describe("getResourceIssues", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requests one exact bounded resource identity through the public path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(RESPONSE));

    await expect(getResourceIssues({
      clusterId: "cluster-1",
      kind: "Deployment",
      namespace: "target",
      name: "checkout-api",
      limit: 25,
    })).resolves.toEqual(RESPONSE);
    expect(RESOURCE_ISSUES_PATH).toBe("/api/dashboard/resources/issues");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/resources/issues?cluster_id=cluster-1&kind=Deployment&namespace=target&name=checkout-api&limit=25",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("rejects a non-offset onset timestamp before it reaches the feature adapter", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...RESPONSE,
      items: [{
        ...RESPONSE.items[0],
        onset: { ...RESPONSE.items[0].onset, first_observed_at: "yesterday" },
      }],
    }));

    await expect(getResourceIssues({
      clusterId: "cluster-1",
      kind: "Deployment",
      namespace: "target",
      name: "checkout-api",
    })).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
