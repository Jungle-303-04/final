import { describe, expect, it, vi } from "vitest";
import { createApiComposition } from "./apiComposition";

describe("API composition root", () => {
  it("registers Home without making network requests before mount", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const composition = createApiComposition();

    expect(composition.surfaces.map((surface) => surface.id)).toEqual(["home"]);
    expect([...composition.releasedSurfaceIds]).toEqual(["home"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
