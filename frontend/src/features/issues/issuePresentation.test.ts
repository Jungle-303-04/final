import { describe, expect, it } from "vitest";
import type { IssueSummary } from "./issuesContract";
import {
  issueEvidenceCount,
  issueSeverityTone,
  sortIssuesForQueue,
} from "./issuePresentation";

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

describe("issue severity presentation", () => {
  it("uses only the typed server tier and keeps equal-tier server order", () => {
    const warning = { ...ISSUE, id: "warning", severity: "warning" as const };
    const criticalFirst = { ...ISSUE, id: "critical-a", severity: "critical" as const };
    const criticalSecond = { ...ISSUE, id: "critical-b", severity: "critical" as const };
    const unavailable = { ...ISSUE, id: "unavailable", severity: null };

    expect(sortIssuesForQueue([warning, criticalFirst, unavailable, criticalSecond]).map(({ id }) => id))
      .toEqual(["critical-a", "critical-b", "warning", "unavailable"]);
    expect(issueSeverityTone("critical")).toBe("critical");
    expect(issueSeverityTone("warning")).toBe("warning");
    expect(issueSeverityTone(null)).toBeNull();
  });
});
