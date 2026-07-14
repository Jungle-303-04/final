// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REDUCED_MOTION_QUERY,
  prefersReducedMotion,
} from "../usePrefersReducedMotion";

afterEach(() => vi.unstubAllGlobals());

describe("prefers reduced motion", () => {
  it("reads the operating-system preference from the canonical query", () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: true,
      media: query,
    } as MediaQueryList));
    vi.stubGlobal("matchMedia", matchMedia);

    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
  });

  it("fails open to normal motion when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
