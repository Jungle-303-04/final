import { describe, expect, it } from "vitest";

import { honeycombOffsets, honeycombRows } from "./resourcesInfraMapTopologyLayout";

describe("ResourcesInfraMapTopologyHoneycomb", () => {
  it("packs pod replicas into stable honeycomb rows", () => {
    expect(honeycombRows(["a", "b", "c", "d", "e"], 3)).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ]);
  });

  it("centers computed honeycomb offsets around the group origin", () => {
    expect(honeycombOffsets(3, {
      columnGap: 10,
      rowGap: 8,
      rowOffset: 5,
    })).toEqual([
      { x: -7.5, y: -4 },
      { x: 2.5, y: -4 },
      { x: 7.5, y: 4 },
    ]);
  });

  it("packs small replica groups as a compact honeycomb instead of a single row", () => {
    const offsets = honeycombOffsets(5, {
      columnGap: 10,
      rowGap: 8,
      rowOffset: 5,
    });

    expect(new Set(offsets.map((offset) => offset.y)).size).toBeGreaterThan(1);
    expect(Math.max(...offsets.map((offset) => Math.abs(offset.x)))).toBeLessThan(16);
    expect(Math.max(...offsets.map((offset) => Math.abs(offset.y)))).toBeLessThan(13);
  });
});
