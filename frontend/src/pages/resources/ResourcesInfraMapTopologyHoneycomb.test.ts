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
      columns: 3,
      rowGap: 8,
      rowOffset: 5,
    })).toEqual([
      { x: -10, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });
});
