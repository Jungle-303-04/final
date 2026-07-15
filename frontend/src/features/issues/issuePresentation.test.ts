import { describe, expect, it } from "vitest";
import type { IssueSummary } from "./issuesContract";
import { issueEvidenceCount } from "./issuePresentation";

const ISSUE = {
  id: "issue:workspace-1/correlation-1",
  workspaceId: "workspace-1",
  incidentId: "incident-1",
  correlationId: "correlation-1",
  clusterId: "cluster-1",
  namespace: "payments",
  resourceKind: "Pod",
  resourceName: "checkout-api-7c9d",
  symptom: "Memory pressure",
  currentSubject: "pod/payments/checkout-api-7c9d",
  status: "investigating",
  rootCause: "oom_killed",
  confidence: 0.96,
  supportingEvidence: [],
  missingEvidence: [],
  evidenceRef: "object://evidence/workspace-1/correlation-1",
  actionRoute: null,
  commandId: null,
  pullRequestUrl: null,
  errorReason: null,
  updatedAt: "2026-07-15T02:30:00Z",
} satisfies IssueSummary;

describe("issueEvidenceCount", () => {
  it("counts the linked evidence object when the projection array is empty", () => {
    expect(issueEvidenceCount(ISSUE)).toBe(1);
  });

  it("prefers the materialized evidence array count", () => {
    expect(issueEvidenceCount({
      ...ISSUE,
      supportingEvidence: ["kubernetes", "metrics", "logs"],
    })).toBe(3);
  });

  it("stays unknown when neither representation is available", () => {
    expect(issueEvidenceCount({
      ...ISSUE,
      supportingEvidence: [],
      evidenceRef: null,
    })).toBeNull();
  });
});
