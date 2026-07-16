import { describe, expect, it } from "vitest";

import { honeycombRows } from "./ResourcesInfraMapTopologyHoneycomb";

describe("ResourcesInfraMapTopologyHoneycomb", () => {
  it("packs pod replicas into stable honeycomb rows", () => {
    expect(honeycombRows(["a", "b", "c", "d", "e"], 3)).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ]);
  });
});
