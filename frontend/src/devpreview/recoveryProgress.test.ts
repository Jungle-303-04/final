import { describe, expect, it } from "vitest";

import { recoveryProgressState } from "./recoveryProgress";

describe("recoveryProgressState", () => {
  it("keeps recovery at zero while RCA is still running", () => {
    expect(recoveryProgressState({ status: "rca_in_progress" })).toMatchObject({
      phase: "waiting",
      label: "복구 대기",
      step: 0,
    });
  });

  it("shows approval after RCA completes", () => {
    expect(recoveryProgressState({ status: "rca_completed" })).toMatchObject({
      phase: "approval",
      label: "승인 대기",
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
    expect(recoveryProgressState({ status: "incident_resolved" })).toMatchObject({
      phase: "completed",
      label: "복구 완료",
      step: 5,
    });
  });

  it("keeps the failed stage visible", () => {
    expect(recoveryProgressState({ status: "command_rejected" })).toMatchObject({
      phase: "failed",
      label: "복구 실패",
      step: 2,
    });
  });
});
