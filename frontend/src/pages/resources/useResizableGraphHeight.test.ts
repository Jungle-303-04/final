import { describe, expect, it } from "vitest";

import {
  DEFAULT_GRAPH_HEIGHT,
  MAX_GRAPH_HEIGHT,
  MIN_GRAPH_HEIGHT,
  clampGraphHeight,
} from "./useResizableGraphHeight";

describe("resizable graph height", () => {
  it("uses the approved 720px default and 480px to 1040px bounds", () => {
    expect(DEFAULT_GRAPH_HEIGHT).toBe(720);
    expect(MIN_GRAPH_HEIGHT).toBe(480);
    expect(MAX_GRAPH_HEIGHT).toBe(1_040);
  });

  it("clamps persisted and dragged values without accepting invalid numbers", () => {
    expect(clampGraphHeight(200)).toBe(MIN_GRAPH_HEIGHT);
    expect(clampGraphHeight(800.6)).toBe(801);
    expect(clampGraphHeight(1_400)).toBe(MAX_GRAPH_HEIGHT);
    expect(clampGraphHeight(Number.NaN)).toBe(DEFAULT_GRAPH_HEIGHT);
  });
});
