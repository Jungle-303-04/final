import { describe, expect, it, vi } from "vitest";
import { createApiComposition } from "./apiComposition";

describe("API composition root", () => {
  it("registers approved read surfaces without making network requests before mount", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const composition = createApiComposition();

    expect(composition.surfaces.map((surface) => surface.id)).toEqual([
      "clusters",
      "home",
      "resources",
      "issues",
      "applications",
      "gitops",
    ]);
    expect([...composition.releasedSurfaceIds]).toEqual([
      "clusters",
      "home",
      "resources",
      "issues",
      "applications",
      "gitops",
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
