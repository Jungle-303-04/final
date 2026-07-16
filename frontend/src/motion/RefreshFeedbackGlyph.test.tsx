// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RefreshFeedbackGlyph } from "./RefreshFeedbackGlyph";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RefreshFeedbackGlyph", () => {
  it("uses only an immediate opacity update when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    })));

    render(<RefreshFeedbackGlyph state="succeeded" />);

    const visual = document.querySelector<HTMLElement>('[data-slot="refresh-feedback"]');
    expect(visual?.getAttribute("aria-hidden")).toBe("true");
    expect(visual?.dataset.reducedMotion).toBe("true");
    expect(visual?.style.transform ?? "").toBe("");
  });

  it("exposes a visual-only state for the semantic adapter", () => {
    render(<RefreshFeedbackGlyph state="reconnecting" />);

    const visual = document.querySelector<HTMLElement>('[data-slot="refresh-feedback"]');
    expect(visual?.dataset.refreshFeedbackState).toBe("reconnecting");
    expect(visual?.getAttribute("aria-hidden")).toBe("true");
  });
});
