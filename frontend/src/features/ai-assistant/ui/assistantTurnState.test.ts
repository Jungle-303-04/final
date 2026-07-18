import { describe, expect, it } from "vitest";

import {
  assistantRequestReducer,
  INITIAL_ASSISTANT_REQUEST_STATE,
} from "./assistantTurnState";

describe("assistantRequestReducer", () => {
  it("preserves the submitted question through a real failure state", () => {
    const pending = assistantRequestReducer(INITIAL_ASSISTANT_REQUEST_STATE, {
      contextKey: "resource:pod-a",
      question: "재시작 원인을 알려줘",
      type: "submitted",
    });
    expect(pending).toEqual({
      contextKey: "resource:pod-a",
      phase: "pending",
      question: "재시작 원인을 알려줘",
    });

    const failed = assistantRequestReducer(pending, {
      contextKey: "resource:pod-a",
      question: "재시작 원인을 알려줘",
      type: "failed",
    });
    expect(failed).toEqual({
      contextKey: "resource:pod-a",
      phase: "failed",
      question: "재시작 원인을 알려줘",
    });
  });

  it("returns to idle after settlement or cancellation", () => {
    const pending = assistantRequestReducer(INITIAL_ASSISTANT_REQUEST_STATE, {
      contextKey: "home",
      question: "현재 상태는?",
      type: "submitted",
    });

    expect(assistantRequestReducer(pending, { type: "settled" }))
      .toBe(INITIAL_ASSISTANT_REQUEST_STATE);
    expect(assistantRequestReducer(pending, { type: "cancelled" }))
      .toBe(INITIAL_ASSISTANT_REQUEST_STATE);
  });
});
