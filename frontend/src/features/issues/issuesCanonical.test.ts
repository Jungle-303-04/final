import { describe, expect, it } from "vitest";
import {
  IssuesPortFailure,
  type IssuesEndpointTimelineItem,
} from "./issuesContract";
import {
  toIssueDetail,
  toIssueList,
} from "./issuesCanonical";
import {
  IssuesCanonicalError,
  IssuesRequestError,
  canonicalIssueDetailRequest,
  canonicalIssueListRequest,
  issueStableId,
} from "./issuesValidation";

const firstItem = endpointItem({
  workspace_id: "workspace-a",
  correlation_id: "correlation-a",
  cluster_id: "cluster-a",
  incident_id: "incident-a",
  incident_namespace: "payments",
  incident_resource_kind: "Deployment",
  incident_resource_name: "checkout",
  incident_symptom: "Pods are restarting",
  current_subject: "checkout rollout",
  status: "waiting_for_evidence",
  root_cause: "Memory pressure",
  confidence: 0.75,
  supporting_evidence: ["oom-kill", "restart-spike"],
  missing_evidence: ["heap-profile"],
  evidence_ref: "evidence-a",
  action_route: "/recoveries/action-a",
  command_id: "command-a",
  pr_url: "https://example.invalid/pull/1",
  error_reason: null,
  updated_at: "2026-07-13T00:00:00+09:00",
});

describe("Issues canonical list", () => {
  it("maps actual RCA timeline fields without changing status or server order", () => {
    const secondItem = endpointItem({
      workspace_id: "workspace-a",
      correlation_id: "correlation-b",
      cluster_id: null,
      incident_id: null,
      incident_symptom: "Second incident",
      current_subject: "second subject",
      status: "vendor_future_literal",
    });

    const result = toIssueList(
      canonicalIssueListRequest("cluster-a", 2),
      { items: [firstItem, secondItem] },
    );

    expect(result).toMatchObject({
      clusterId: "cluster-a",
      completeness: "unknown",
      limit: 2,
      returned: 2,
      limitReached: true,
      excludedCount: 0,
      dataQualityWarnings: [],
    });
    expect(result.items.map(({ correlationId }) => correlationId)).toEqual([
      "correlation-a",
      "correlation-b",
    ]);
    expect(result.items[0]).toEqual({
      id: issueStableId("workspace-a", "correlation-a"),
      incidentId: "incident-a",
      correlationId: "correlation-a",
      workspaceId: "workspace-a",
      clusterId: "cluster-a",
      namespace: "payments",
      resourceKind: "Deployment",
      resourceName: "checkout",
      symptom: "Pods are restarting",
      currentSubject: "checkout rollout",
      status: "waiting_for_evidence",
      rootCause: "Memory pressure",
      confidence: 0.75,
      supportingEvidence: ["oom-kill", "restart-spike"],
      missingEvidence: ["heap-profile"],
      evidenceRef: "evidence-a",
      actionRoute: "/recoveries/action-a",
      commandId: "command-a",
      pullRequestUrl: "https://example.invalid/pull/1",
      errorReason: null,
      updatedAt: "2026-07-12T15:00:00.000Z",
      situationSummary: null,
      recommendedActionSummary: null,
      evidenceSummary: null,
      evidenceBundleSummary: null,
    });
    expect(result.items[1]?.status).toBe("vendor_future_literal");
    expect(result).not.toHaveProperty("total");
    expect(result).not.toHaveProperty("hasMore");
    expect(result).not.toHaveProperty("severityFacets");
    expect(result).not.toHaveProperty("categoryFacets");
  });

  it("accepts only the server-owned two-tier severity projection", () => {
    const result = toIssueList(
      canonicalIssueListRequest("cluster-a", 2),
      { items: [
        endpointItem({
          issue_severity: "critical",
          severity_availability: "available",
          severity_reason_code: null,
        }),
        endpointItem({
          correlation_id: "correlation-b",
          issue_severity: null,
          severity_availability: "unavailable",
          severity_reason_code: "outside_two_tier_scale",
        }),
      ] },
    );

    expect(result.items.map((item) => ({
      severity: item.severity,
      availability: item.severityAvailability,
    }))).toEqual([
      { severity: "critical", availability: "available" },
      { severity: null, availability: "unavailable" },
    ]);
  });

  it("isolates invalid identities, duplicates, and mismatched non-null clusters", () => {
    const invalidWorkspace = endpointItem({ workspace_id: " ", correlation_id: "bad-a" });
    const invalidCorrelation = endpointItem({ workspace_id: "workspace-a", correlation_id: 9 });
    const duplicate = endpointItem({ ...firstItem, incident_symptom: "duplicate" });
    const wrongCluster = endpointItem({
      workspace_id: "workspace-a",
      correlation_id: "wrong-cluster",
      cluster_id: "cluster-b",
    });
    const clusterUnknown = endpointItem({
      workspace_id: "workspace-a",
      correlation_id: "cluster-unknown",
      cluster_id: null,
    });

    const result = toIssueList(
      canonicalIssueListRequest("cluster-a", 10),
      {
        items: [
          firstItem,
          invalidWorkspace,
          invalidCorrelation,
          duplicate,
          wrongCluster,
          clusterUnknown,
        ],
      },
    );

    expect(result.items.map(({ correlationId }) => correlationId)).toEqual([
      "correlation-a",
      "cluster-unknown",
    ]);
    expect(result.returned).toBe(2);
    expect(result.excludedCount).toBe(4);
    expect(result.limitReached).toBe(false);
    expect(result.dataQualityWarnings.map(({ code, rowIndex }) => ({ code, rowIndex }))).toEqual([
      { code: "invalid-issue-excluded", rowIndex: 1 },
      { code: "invalid-issue-excluded", rowIndex: 2 },
      { code: "duplicate-issue-excluded", rowIndex: 3 },
      { code: "invalid-issue-excluded", rowIndex: 4 },
    ]);
  });

  it("degrades blank incident links and invalid optional fields without dropping the row", () => {
    const result = toIssueList(
      canonicalIssueListRequest(null, 50),
      {
        items: [endpointItem({
          incident_id: " ",
          incident_namespace: 42,
          incident_symptom: false,
          confidence: 4,
          supporting_evidence: ["valid", 2],
          pr_url: "javascript:alert(1)",
          updated_at: "yesterday",
        })],
      },
    );

    expect(result.returned).toBe(1);
    expect(result.items[0]).toMatchObject({
      incidentId: null,
      namespace: null,
      symptom: null,
      confidence: null,
      supportingEvidence: null,
      pullRequestUrl: null,
      updatedAt: null,
    });
    expect(result.dataQualityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "incident-link-unavailable", field: "incident_id" }),
      expect.objectContaining({ code: "optional-field-unavailable", field: "incident_namespace" }),
      expect.objectContaining({ code: "optional-field-unavailable", field: "incident_symptom" }),
      expect.objectContaining({ code: "optional-field-unavailable", field: "confidence" }),
      expect.objectContaining({ code: "optional-field-unavailable", field: "supporting_evidence" }),
      expect.objectContaining({ code: "optional-field-unavailable", field: "pr_url" }),
      expect.objectContaining({ code: "optional-field-unavailable", field: "updated_at" }),
    ]));
  });

  it("rejects a response that exceeds the requested limit", () => {
    const request = canonicalIssueListRequest(null, 1);
    expect(() => toIssueList(request, { items: [firstItem, firstItem] }))
      .toThrow(IssuesCanonicalError);
  });
});

describe("Issues canonical detail", () => {
  it("projects the requested incident and preserves endpoint identity", () => {
    const result = toIssueDetail(
      canonicalIssueDetailRequest("incident-a", "cluster-a"),
      { item: firstItem },
    );

    expect(result).toMatchObject({
      requestedIncidentId: "incident-a",
      requestedClusterId: "cluster-a",
      id: issueStableId("workspace-a", "correlation-a"),
      incidentId: "incident-a",
      correlationId: "correlation-a",
      clusterId: "cluster-a",
      status: "waiting_for_evidence",
      dataQualityWarnings: [],
    });
  });

  it("rejects an incident or non-null cluster outside the requested boundary", () => {
    expect(() => toIssueDetail(
      canonicalIssueDetailRequest("incident-other", "cluster-a"),
      { item: firstItem },
    )).toThrow(IssuesCanonicalError);
    expect(() => toIssueDetail(
      canonicalIssueDetailRequest("incident-a", "cluster-b"),
      { item: firstItem },
    )).toThrow(IssuesCanonicalError);
  });

  it("allows an unknown response cluster but never a blank incident link", () => {
    const clusterUnknown = endpointItem({ ...firstItem, cluster_id: null });
    expect(() => toIssueDetail(
      canonicalIssueDetailRequest("incident-a", "cluster-a"),
      { item: clusterUnknown },
    )).not.toThrow();

    const blankIncident = endpointItem({ ...firstItem, incident_id: "" });
    expect(() => toIssueDetail(
      canonicalIssueDetailRequest("incident-a", "cluster-a"),
      { item: blankIncident },
    )).toThrow(IssuesCanonicalError);
  });
});

describe("Issues request and failure contracts", () => {
  it("rejects blank request identities and out-of-range limits", () => {
    expect(() => canonicalIssueListRequest(" ", 50)).toThrow(IssuesRequestError);
    expect(() => canonicalIssueListRequest(null, 0)).toThrow(IssuesRequestError);
    expect(() => canonicalIssueListRequest(null, 101)).toThrow(IssuesRequestError);
    expect(() => canonicalIssueDetailRequest("", null)).toThrow(IssuesRequestError);
  });

  it("provides stable collision-safe issue IDs", () => {
    expect(issueStableId("workspace/a", "correlation/a"))
      .toBe("issue:workspace%2Fa/correlation%2Fa");
  });

  it("exposes typed port failures without leaking transport details", () => {
    const failure = new IssuesPortFailure("rate-limited", 12);
    expect(failure).toMatchObject({
      name: "IssuesPortFailure",
      code: "rate-limited",
      retryAfterSeconds: 12,
    });
  });
});

function endpointItem(
  overrides: Partial<Record<keyof IssuesEndpointTimelineItem, unknown>> = {},
): IssuesEndpointTimelineItem {
  return {
    workspace_id: "workspace-default",
    correlation_id: "correlation-default",
    cluster_id: "cluster-a",
    incident_id: "incident-default",
    incident_namespace: null,
    incident_resource_kind: null,
    incident_resource_name: null,
    incident_symptom: null,
    evidence_ref: null,
    current_subject: "subject",
    status: "active",
    root_cause: null,
    confidence: null,
    supporting_evidence: [],
    missing_evidence: [],
    action_route: null,
    command_id: null,
    pr_url: null,
    error_reason: null,
    updated_at: null,
    ...overrides,
  };
}
