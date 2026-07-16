// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RefreshAction, RefreshFeedback, refreshFeedbackState } from "./RefreshFeedback";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RefreshFeedback", () => {
  it("keeps the glyph decorative while its owner retains the refresh button semantics", () => {
    render(<RefreshAction iconOnly label="Refresh applications" onRefresh={vi.fn()} />);

    const action = screen.getByRole("button", { name: "Refresh applications" });
    const visual = action.querySelector<HTMLElement>('[data-slot="refresh-feedback"]');

    expect(visual?.getAttribute("aria-hidden")).toBe("true");
    expect(visual?.dataset.refreshFeedbackState).toBe("idle");

    fireEvent.click(action);

    expect(action.getAttribute("aria-busy")).toBe("true");
    expect(visual?.dataset.refreshFeedbackState).toBe("pending");
  });

  it("uses only opacity and an immediate transition when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    })));

    render(<RefreshFeedback state="succeeded" />);

    const visual = document.querySelector<HTMLElement>('[data-slot="refresh-feedback"]');
    expect(visual?.dataset.reducedMotion).toBe("true");
    expect(visual?.style.transform ?? "").toBe("");
  });

  it("maps only supplied data-frame outcomes to a visual state", () => {
    expect(refreshFeedbackState({ phase: "idle" })).toBe("idle");
    expect(refreshFeedbackState({ phase: "pending" })).toBe("pending");
    expect(refreshFeedbackState({ phase: "succeeded" })).toBe("succeeded");
    expect(refreshFeedbackState({ hasFailed: true, phase: "idle" })).toBe("failed");
    expect(refreshFeedbackState({ isReconnecting: true, phase: "idle" })).toBe("reconnecting");
  });
});
