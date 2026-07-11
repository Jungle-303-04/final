import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { createProductComposition } from "./productComposition";

const EmptySurface: ComponentType = () => null;

describe("product composition", () => {
  it("keeps the production release closed when no approved surface is registered", () => {
    const composition = createProductComposition([]);

    expect(composition.surfaces).toEqual([]);
    expect([...composition.releasedSurfaceIds]).toEqual([]);
  });

  it("sorts registered surfaces by the canonical navigation order", () => {
    const composition = createProductComposition([
      { id: "timeline", Component: EmptySurface },
      { id: "home", Component: EmptySurface },
      { id: "issues", Component: EmptySurface },
    ]);

    expect(composition.surfaces.map((surface) => surface.id)).toEqual([
      "home",
      "issues",
      "timeline",
    ]);
  });

  it("rejects duplicate registrations instead of choosing one implicitly", () => {
    expect(() => createProductComposition([
      { id: "home", Component: EmptySurface },
      { id: "home", Component: EmptySurface },
    ])).toThrow(/duplicate product surface: home/u);
  });
});
