import { describe, expect, it } from "vitest";

import {
  DEFAULT_GRAPH_HEIGHT,
  MAX_GRAPH_HEIGHT,
  MIN_GRAPH_HEIGHT,
  clampGraphHeight,
} from "./useResizableGraphHeight";

describe("resizable graph height", () => {
  it("uses the v3 dense 560px default and 420px to 880px bounds", () => {
    expect(DEFAULT_GRAPH_HEIGHT).toBe(560);
    expect(MIN_GRAPH_HEIGHT).toBe(420);
    expect(MAX_GRAPH_HEIGHT).toBe(880);
  });

  it("clamps persisted and dragged values without accepting invalid numbers", () => {
    expect(clampGraphHeight(200)).toBe(MIN_GRAPH_HEIGHT);
    expect(clampGraphHeight(800.6)).toBe(801);
    expect(clampGraphHeight(1_400)).toBe(MAX_GRAPH_HEIGHT);
    expect(clampGraphHeight(Number.NaN)).toBe(DEFAULT_GRAPH_HEIGHT);
  });
});
