import { describe, expect, it } from "vitest";

import type { AuditTimelineItem } from "../api/audit-timeline-schemas";
import { recoveryOutcomeNotices } from "./recoveryOutcome";

function event(
  eventId: string,
  subject: string,
  payloadSummary: Record<string, unknown> = {},
  createdAt = "2026-07-24T01:00:01Z",
): AuditTimelineItem {
  return {
    event_id: eventId,
    subject,
    source: "test",
    created_at: createdAt,
    causation_id: null,
    journey_stage: subject.startsWith("safe_pr") ? "pr" : "command",
    payload_summary: payloadSummary,
  };
}

describe("recoveryOutcomeNotices", () => {
  it("reports a created PR without claiming the incident is resolved", () => {
    const notices = recoveryOutcomeNotices({
      actionRoute: "safe_pr",
      audit: [
        event("selected", "recovery.action_selected", {}, "2026-07-24T01:00:00Z"),
        event("pr", "safe_pr.created", { pr_url: "https://github.com/kyro/platform/pull/17" }),
      ],
      issueStatus: "recovery_selected",
      selectionEventId: "selected",
      submittedAt: "2026-07-24T01:00:00Z",
    });

    expect(notices).toEqual([
      expect.objectContaining({
        kind: "pull_request_created",
        terminal: false,
        prUrl: "https://github.com/kyro/platform/pull/17",
      }),
    ]);
  });

  it("reports execution completion separately from incident resolution", () => {
    const notices = recoveryOutcomeNotices({
      actionRoute: "auto",
      audit: [
        event("selected", "recovery.action_selected", {}, "2026-07-24T01:00:00Z"),
        event("workflow", "workflow.run.completed", { summary: "rollout health completed" }),
      ],
      issueStatus: "command_completed",
      selectionEventId: "selected",
      submittedAt: "2026-07-24T01:00:00Z",
    });

    expect(notices).toEqual([
      expect.objectContaining({
        kind: "execution_completed",
        terminal: false,
        summary: "rollout health completed",
      }),
    ]);
  });

  it("only reports final recovery completion after the issue resolves", () => {
    const notices = recoveryOutcomeNotices({
      actionRoute: "auto",
      audit: [event("selected", "recovery.action_selected", {}, "2026-07-24T01:00:00Z")],
      issueStatus: "incident_resolved",
      selectionEventId: "selected",
      submittedAt: "2026-07-24T01:00:00Z",
    });

    expect(notices).toEqual([
      expect.objectContaining({
        kind: "recovery_completed",
        terminal: true,
        title: "복구가 완료되었습니다.",
      }),
    ]);
  });

  it("reports backend failures with the recorded reason", () => {
    const notices = recoveryOutcomeNotices({
      actionRoute: "safe_pr",
      audit: [
        event("selected", "recovery.action_selected", {}, "2026-07-24T01:00:00Z"),
        event("failed", "safe_pr.failed", { reason: "GitHub 권한이 없습니다." }),
      ],
      issueStatus: "pr_failed",
      selectionEventId: "selected",
      submittedAt: "2026-07-24T01:00:00Z",
    });

    expect(notices).toEqual([
      expect.objectContaining({
        kind: "recovery_failed",
        terminal: true,
        detail: "GitHub 권한이 없습니다.",
      }),
    ]);
  });

  it("turns a control namespace rejection into an actionable operator message", () => {
    const notices = recoveryOutcomeNotices({
      actionRoute: "auto",
      audit: [
        event("selected", "recovery.action_selected", {}, "2026-07-24T01:00:00Z"),
        event("rejected", "command.rejected", {
          reason_code: "control_namespace_not_allowed",
          reason: "backend wording can change independently",
        }),
      ],
      issueStatus: "command_rejected",
      selectionEventId: "selected",
      submittedAt: "2026-07-24T01:00:00Z",
    });

    expect(notices[0]?.detail).toBe(
      "대상 네임스페이스가 클러스터 연결 시 허용한 제어 범위 밖입니다. 클러스터 설정의 제어 네임스페이스를 확인해 주세요.",
    );
  });
});
