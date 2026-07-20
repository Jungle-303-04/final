import { describe, expect, it } from "vitest";
import type { IssueAuditTimelinePage, IssueSummary } from "./issuesContract";
import { issueRecoveryProgress } from "./issueRecoveryProgress";

const SELECTED: IssueSummary = {
  id: "incident-1",
  incidentId: "incident-1",
  correlationId: "correlation-1",
  clusterId: "cluster-1",
  namespace: "shop",
  resourceKind: "Deployment",
  resourceName: "api",
  symptom: "CrashLoopBackOff",
  currentSubject: "recovery.planned",
  status: "selection_requested",
  rootCause: "oom_killed",
  confidence: 0.98,
  supportingEvidence: [],
  missingEvidence: [],
  evidenceRef: "evidence-1",
  actionRoute: "rollout_restart",
  commandId: null,
  pullRequestUrl: null,
  errorReason: null,
  updatedAt: "2026-07-15T05:00:00Z",
  situationSummary: null,
  recommendedActionSummary: null,
  evidenceSummary: null,
  evidenceBundleSummary: null,
};

describe("issueRecoveryProgress", () => {
  it.each([
    ["selection_requested", "recovery.planned", "approval", 20],
    ["command_requested", "command.requested", "executing", 60],
    ["command_completed", "command.completed", "completed", 100],
    ["pr_created", "safe_pr.created", "completed", 100],
    ["incident_resolved", "command.completed", "completed", 100],
    ["command_rejected", "command.rejected", "failed", 60],
    ["pr_failed", "safe_pr.failed", "failed", 80],
    ["selection_requested", "workflow.run.completed", "completed", 100],
    ["selection_requested", "workflow.run.failed", "failed", 80],
  ] as const)("maps %s to a server-backed %s phase", (status, subject, expected, progress) => {
    expect(issueRecoveryProgress({
      audit: audit(subject),
      plan: null,
      receipt: null,
      selected: { ...SELECTED, status, currentSubject: subject },
      selectionFailed: false,
      selectionPending: false,
    })).toMatchObject({ phase: expected, progress });
  });

  it("does not claim execution before the accepted selection reaches the command timeline", () => {
    expect(issueRecoveryProgress({
      audit: audit("recovery.action_selected"),
      plan: null,
      receipt: { accepted: true, eventId: "event-1", correlationId: "correlation-1" },
      selected: SELECTED,
      selectionFailed: false,
      selectionPending: false,
    })).toMatchObject({ phase: "submitting", progress: 40 });
  });

  it("uses an actual selection request failure instead of simulating a later stage", () => {
    expect(issueRecoveryProgress({
      audit: null,
      plan: null,
      receipt: null,
      selected: SELECTED,
      selectionFailed: true,
      selectionPending: false,
    })).toMatchObject({ phase: "failed", progress: 40 });
  });

  it("uses the newest audit event and does not preserve an earlier failed attempt", () => {
    expect(issueRecoveryProgress({
      audit: audits("command.rejected", "command.completed"),
      plan: null,
      receipt: null,
      selected: SELECTED,
      selectionFailed: false,
      selectionPending: false,
    })).toMatchObject({
      phase: "completed",
      progress: 100,
      latestEvent: { subject: "command.completed" },
    });
  });
});

function audit(subject: string): IssueAuditTimelinePage {
  return audits(subject);
}

function audits(...subjects: string[]): IssueAuditTimelinePage {
  return {
    correlationId: "correlation-1",
    items: subjects.map((subject, index) => ({
      eventId: `event-${index + 1}`,
      subject,
      source: "workflow-controller",
      createdAt: `2026-07-15T05:00:0${index + 1}Z`,
      causationId: null,
      journeyStage: "command",
      payloadSummary: {},
    })),
    limit: 50,
    hasMore: false,
    nextCursor: null,
  };
}
