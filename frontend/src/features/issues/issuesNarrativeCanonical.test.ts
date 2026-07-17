import { describe, expect, it } from "vitest";

import { IssuesCanonicalError } from "./issuesContract";
import { toIssueRcaReportPage } from "./issuesEvidenceCanonical";
import type { IssuesEndpointRcaReport } from "./issuesEndpointContract";

const REPORT: IssuesEndpointRcaReport = {
  id: 11,
  workspace_id: "workspace-1",
  correlation_id: "correlation-1",
  root_cause: "memory_limit_exceeded",
  action: "plan_recovery",
  incident_id: "incident-1",
  cluster_id: "cluster-1",
  symptom: "CrashLoopBackOff",
  severity: "warning",
  confidence: 0.86,
  reason: "OOMKilled and usage evidence agree",
  evidence_ref: "evidence-1",
  supporting_evidence: ["OOMKilled"],
  missing_evidence: [],
  evidence_summary: "확인된 근거 1개를 기준으로 판단했습니다.",
  evidence_bundle_summary: null,
  created_at: "2026-07-13T01:30:00Z",
  resource_kind: "Deployment",
  resource_name: "checkout-api",
  namespace: "payments",
  secondary_symptoms: [],
  selected_candidate_id: "candidate-memory",
  candidates: [],
  supporting_evidence_refs: [],
  missing_evidence_checks: [],
  narrative: {
    locale: "ko",
    executive_summary: "The Pod repeatedly restarted after exceeding its memory limit.",
    impact: "API processing may have been unstable during restarts.",
    reasoning: "OOMKilled and memory usage evidence support the same cause.",
    recommended_action: "Review memory usage and apply an approved limit adjustment.",
    recurrence_prevention: ["Monitor OOMKilled together with memory utilization."],
    limitations: ["Request error-rate evidence was not collected."],
  },
  narrative_status: "generated",
};

const PAGE = {
  items: [REPORT],
  limit: 50,
  offset: 0,
  has_more: false,
  next_cursor: null,
};

describe("Issues RCA narrative canonical mapping", () => {
  it("preserves deterministic fields and maps the structured narrative", () => {
    expect(toIssueRcaReportPage("correlation-1", PAGE).items[0]).toMatchObject({
      rootCause: "memory_limit_exceeded",
      action: "plan_recovery",
      narrativeStatus: "generated",
      narrative: {
        locale: "ko",
        executiveSummary: "The Pod repeatedly restarted after exceeding its memory limit.",
        recurrencePrevention: ["Monitor OOMKilled together with memory utilization."],
      },
    });
  });

  it("rejects a generated status without narrative content", () => {
    expect(() => toIssueRcaReportPage("correlation-1", {
      ...PAGE,
      items: [{ ...REPORT, narrative: null }],
    })).toThrow(IssuesCanonicalError);
  });
});
