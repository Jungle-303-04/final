import { describe, expect, it, vi } from "vitest";

import type { IssueDetail, IssuesPort } from "./issuesContract";
import type { IssueRcaReport } from "./issuesEvidenceContract";
import type { ResourceIssueList, ResourceIssuesPort } from "./resourceIssuesContract";
import { createRcaContextAdapter } from "./createRcaContextAdapter";

const scope = {
  workspaceId: "workspace-a",
  clusterId: "cluster-a",
  namespaces: ["shop"],
  freshness: "live" as const,
};
const resource = {
  apiGroup: "apps",
  version: "v1",
  kind: "Deployment",
  namespace: "shop",
  name: "checkout",
  uid: "deployment-uid",
};

describe("createRcaContextAdapter", () => {
  it("joins exact resource issue and report evidence without inventing impact", async () => {
    const loadResourceIssues = vi.fn().mockResolvedValue(resourceIssues());
    const loadReports = vi.fn().mockResolvedValue(reportPage());
    const port = createPort({ loadResourceIssues, loadReports });

    await expect(port.load({ kind: "resource", scope, resource })).resolves.toMatchObject({
      state: "available",
      record: {
        rootCause: "memory limit exceeded",
        impact: "checkout requests failed",
        evidence: ["evidence://bundle", "container terminated", "metrics spike"],
      },
    });
    expect(loadResourceIssues).toHaveBeenCalledWith("cluster-a", resource, undefined);
    expect(loadReports).toHaveBeenCalledWith("correlation-a", { limit: 25 }, undefined);
  });

  it("preserves an honest empty partial result and does not request reports", async () => {
    const loadReports = vi.fn();
    const port = createPort({
      loadResourceIssues: vi.fn().mockResolvedValue({
        ...resourceIssues(),
        coverageAvailability: "partial",
        reasonCodes: ["some_agent_data_unavailable"],
        items: [],
      }),
      loadReports,
    });

    await expect(port.load({ kind: "resource", scope, resource })).resolves.toEqual({
      state: "empty",
      scope,
      coverageAvailability: "partial",
      reasonCodes: ["coverage_partial"],
      record: null,
    });
    expect(loadReports).not.toHaveBeenCalled();
  });

  it("fails closed when the resource response crosses workspace scope", async () => {
    const port = createPort({
      loadResourceIssues: vi.fn().mockResolvedValue({
        ...resourceIssues(),
        scope: { ...scope, workspaceId: "workspace-b" },
      }),
    });

    await expect(port.load({ kind: "resource", scope, resource })).rejects.toEqual(
      expect.objectContaining({ code: "invalid-response" }),
    );
  });

  it("fails closed when a timeline incident correlation does not match", async () => {
    const port = createPort({ loadIssue: vi.fn().mockResolvedValue(issue()) });

    await expect(port.load({
      kind: "incident",
      scope,
      incidentId: "incident-a",
      correlationId: "correlation-other",
    })).rejects.toEqual(expect.objectContaining({ code: "invalid-response" }));
  });

  it("keeps verified issue data partial when the report contract is unavailable", async () => {
    const port = createPort({
      loadIssue: vi.fn().mockResolvedValue(issue()),
      loadReports: vi.fn().mockRejectedValue(new Error("offline")),
    });

    await expect(port.load({
      kind: "incident",
      scope,
      incidentId: "incident-a",
      correlationId: "correlation-a",
    })).resolves.toMatchObject({
      state: "partial",
      reasonCodes: expect.arrayContaining(["report_unavailable", "impact_unavailable"]),
      record: { rootCause: "memory limit exceeded", impact: null },
    });
  });
});

function createPort(overrides: {
  loadIssue?: IssuesPort["loadIssue"];
  loadReports?: IssuesPort["loadReports"];
  loadResourceIssues?: ResourceIssuesPort["loadResourceIssues"];
}) {
  return createRcaContextAdapter({
    issues: {
      loadIssue: overrides.loadIssue ?? vi.fn().mockResolvedValue(issue()),
      loadReports: overrides.loadReports ?? vi.fn().mockResolvedValue(reportPage()),
    },
    resourceIssues: {
      loadResourceIssues: overrides.loadResourceIssues ?? vi.fn().mockResolvedValue(resourceIssues()),
    },
  });
}

function issue(): IssueDetail {
  return {
    id: "workspace-a:correlation-a",
    requestedClusterId: "cluster-a",
    requestedIncidentId: "incident-a",
    workspaceId: "workspace-a",
    incidentId: "incident-a",
    correlationId: "correlation-a",
    clusterId: "cluster-a",
    namespace: "shop",
    resourceKind: "Deployment",
    resourceName: "checkout",
    symptom: "unavailable replicas",
    currentSubject: "rca.completed",
    status: "rca_completed",
    rootCause: "memory limit exceeded",
    confidence: 0.95,
    supportingEvidence: ["container terminated"],
    missingEvidence: [],
    evidenceRef: "evidence://bundle",
    actionRoute: null,
    commandId: null,
    pullRequestUrl: null,
    errorReason: null,
    updatedAt: "2026-07-18T01:00:00Z",
    dataQualityWarnings: [],
  };
}

function resourceIssues(): ResourceIssueList {
  return {
    scope,
    coverageAvailability: "available",
    observedAt: "2026-07-18T01:00:00Z",
    reasonCodes: [],
    items: [{
      ...issue(),
      onset: {
        firstObservedAt: "2026-07-18T00:55:00Z",
        source: "timeline_created_at",
        timingKind: null,
        timingAvailability: "unavailable",
        timingReasonCode: "health_transition_evidence_unavailable",
      },
    }],
    hasMore: false,
    limit: 25,
  };
}

function reportPage() {
  return {
    correlationId: "correlation-a",
    items: [report()],
    limit: 25,
    offset: 0,
    hasMore: false,
    nextCursor: null,
  };
}

function report(): IssueRcaReport {
  return {
    id: "report-a",
    correlationId: "correlation-a",
    incidentId: "incident-a",
    clusterId: "cluster-a",
    namespace: "shop",
    resourceKind: "Deployment",
    resourceName: "checkout",
    rootCause: "memory limit exceeded",
    action: "increase limit",
    symptom: "unavailable replicas",
    severity: "critical",
    confidence: 0.95,
    reason: "verified evidence",
    evidenceRef: "evidence://bundle",
    supportingEvidence: ["metrics spike"],
    missingEvidence: [],
    secondarySymptoms: [],
    selectedCandidateId: null,
    candidates: [],
    supportingEvidenceRefs: [],
    missingEvidenceChecks: [],
    evidenceSummary: null,
    evidenceBundleSummary: null,
    narrative: {
      locale: "ko",
      executiveSummary: "summary",
      impact: "checkout requests failed",
      reasoning: "reasoning",
      recommendedAction: "increase limit",
      recurrencePrevention: [],
      limitations: [],
    },
    narrativeStatus: "generated",
    createdAt: "2026-07-18T01:01:00Z",
  };
}
