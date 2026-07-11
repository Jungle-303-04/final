import { describe, expect, it } from "vitest";

import { treemapWithResidual } from "./layout";

describe("treemapWithResidual", () => {
  it("preserves zero and unavailable entities in a residual rail", () => {
    const result = treemapWithResidual([
      { key: "weighted", value: "weighted", weight: 3 },
      { key: "zero", value: "zero", weight: 0 },
      { key: "missing", value: "missing", weight: Number.NaN },
    ]);

    expect(result).toHaveLength(3);
    expect(result.filter((item) => item.layoutRole === "weighted")).toHaveLength(1);
    expect(result.filter((item) => item.layoutRole === "residual")).toHaveLength(2);
    expect(result.find((item) => item.key === "zero")?.rect.height).toBeGreaterThan(0);
    expect(result.find((item) => item.key === "missing")?.rect.height).toBeGreaterThan(0);
  });

  it("uses the full frame as an equal residual shelf when every value is zero", () => {
    const result = treemapWithResidual([
      { key: "b", value: "b", weight: 0 },
      { key: "a", value: "a", weight: 0 },
    ]);

    expect(result.map((item) => item.key)).toEqual(["a", "b"]);
    expect(result.every((item) => item.layoutRole === "residual")).toBe(true);
    expect(result.map((item) => item.rect)).toEqual([
      { x: 0, y: 0, width: 50, height: 100 },
      { x: 50, y: 0, width: 50, height: 100 },
    ]);
  });

  it("keeps deterministic canonical-key ordering", () => {
    const left = treemapWithResidual([
      { key: "z", value: "z", weight: 1 },
      { key: "a", value: "a", weight: 1 },
    ]);
    const right = treemapWithResidual([
      { key: "a", value: "a", weight: 1 },
      { key: "z", value: "z", weight: 1 },
    ]);

    expect(left).toEqual(right);
  });
});
