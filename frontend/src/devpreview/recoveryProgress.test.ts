import { describe, expect, it } from "vitest";

import {
  recoveryDisplayedStep,
  recoveryProgressState,
  withCreatedPullRequest,
} from "./recoveryProgress";

describe("recoveryProgressState", () => {
  it("keeps recovery at zero while RCA is still running", () => {
    expect(recoveryProgressState({ status: "rca_in_progress" })).toMatchObject({
      phase: "waiting",
      label: "복구 대기",
      step: 0,
    });
  });

  it("keeps recovery waiting until an action is selected", () => {
    expect(recoveryProgressState({ status: "rca_completed" })).toMatchObject({
      phase: "waiting",
      label: "복구 대기",
      step: 0,
    });
  });

  it("moves to submission when a candidate is selected", () => {
    expect(recoveryProgressState({ status: "rca_completed", selectionAccepted: true })).toMatchObject({
      phase: "submitting",
      label: "복구 요청됨",
      step: 1,
    });
  });

  it("does not expose an internal approval state after selection", () => {
    const progress = recoveryProgressState({
      status: "rca_completed",
      actionRoute: "approval_required",
      selectionAccepted: true,
    });
    expect(progress).toMatchObject({
      phase: "submitting",
      label: "복구 요청됨",
      step: 1,
    });
    expect(recoveryDisplayedStep(progress)).toBe(2);
  });

  it("names the submitted route instead of using one generic request label", () => {
    expect(recoveryProgressState({
      actionRoute: "auto",
      selectionAccepted: true,
    })).toMatchObject({ label: "자동 복구 요청됨", step: 1 });
    expect(recoveryProgressState({
      actionRoute: "draft_pr",
      selectionAccepted: true,
    })).toMatchObject({ label: "PR 생성 요청됨", step: 1 });
  });

  it("derives execution and verification from issue status", () => {
    expect(recoveryProgressState({ status: "command_dispatched" })).toMatchObject({
      phase: "executing",
      step: 2,
    });
    expect(recoveryProgressState({ status: "command_completed" })).toMatchObject({
      phase: "verifying",
      step: 3,
    });
  });

  it("marks resolved incidents complete", () => {
    const progress = recoveryProgressState({ status: "incident_resolved" });
    expect(progress).toMatchObject({
      phase: "completed",
      label: "복구 완료",
      step: 5,
    });
    expect(recoveryDisplayedStep(progress)).toBe(5);
  });

  it("keeps the failed stage visible", () => {
    expect(recoveryProgressState({ status: "command_rejected" })).toMatchObject({
      phase: "failed",
      label: "복구 실패",
      step: 2,
    });
  });

  it("uses workflow terminal events without claiming the incident is resolved", () => {
    expect(recoveryProgressState({
      audit: [{
        event_id: "workflow-completed",
        subject: "workflow.run.completed",
        source: "workflow-controller",
        created_at: "2026-07-24T01:00:00Z",
        causation_id: null,
        journey_stage: "workflow",
        payload_summary: { summary: "rollout health completed" },
      }],
    })).toMatchObject({
      phase: "verifying",
      label: "검증 중",
      step: 3,
    });

    expect(recoveryProgressState({
      audit: [{
        event_id: "workflow-failed",
        subject: "workflow.run.failed",
        source: "workflow-controller",
        created_at: "2026-07-24T01:00:00Z",
        causation_id: null,
        journey_stage: "workflow",
        payload_summary: { reason: "health check failed" },
      }],
    })).toMatchObject({
      phase: "failed",
      label: "복구 실패",
      step: 3,
    });
  });

  it("keeps the PR reference without overwriting a completed recovery", () => {
    const completed = recoveryProgressState({ status: "incident_resolved" });

    expect(withCreatedPullRequest(
      completed,
      "https://github.com/kyro/platform/pull/17",
      "PR 검토 필요",
    )).toBe(completed);
  });

  it("marks a created PR as ready for review before recovery completes", () => {
    const requested = recoveryProgressState({
      status: "recovery_selected",
      actionRoute: "safe_pr",
      selectionAccepted: true,
    });

    expect(withCreatedPullRequest(
      requested,
      "https://github.com/kyro/platform/pull/17",
      "PR 생성됨",
    )).toMatchObject({
      phase: "verifying",
      label: "PR 생성됨",
      step: 3,
      tone: "approval",
    });
  });
});
