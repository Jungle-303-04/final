// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { scrollIntoViewWithMotionPreference } from "../scrollIntoView";

afterEach(() => {
  document.body.replaceChildren();
});

describe("scrollIntoViewWithMotionPreference", () => {
  it("uses smooth scrolling for normal-motion users without moving keyboard focus", () => {
    const scrollIntoView = vi.fn();
    const focusedControl = document.createElement("button");
    document.body.append(focusedControl);
    focusedControl.focus();

    scrollIntoViewWithMotionPreference({ scrollIntoView }, { block: "center" }, false);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(document.activeElement).toBe(focusedControl);
  });

  it("uses immediate scrolling for reduced-motion users", () => {
    const scrollIntoView = vi.fn();

    scrollIntoViewWithMotionPreference({ scrollIntoView }, { block: "nearest" }, true);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "nearest" });
  });

  it("does not require scroll support from a target", () => {
    expect(() => scrollIntoViewWithMotionPreference({})).not.toThrow();
  });
});
