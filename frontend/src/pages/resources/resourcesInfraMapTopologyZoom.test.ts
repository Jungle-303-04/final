import { describe, expect, it } from "vitest";

import {
  nextTopologyZoomPercent,
  topologyZoomLevelFromPercent,
  topologyZoomPercent,
} from "./resourcesInfraMapTopologyZoom";

describe("resources infra map topology zoom", () => {
  it("formats zoom levels as whole percentages", () => {
    expect(topologyZoomPercent(0.51)).toBe(51);
    expect(topologyZoomPercent(1)).toBe(100);
  });

  it("falls back to the default zoom percentage for invalid zoom levels", () => {
    expect(topologyZoomPercent(Number.NaN)).toBe(100);
    expect(topologyZoomPercent(0)).toBe(100);
    expect(topologyZoomPercent(-1)).toBe(100);
  });

  it("moves by stable ten percent steps from arbitrary zoom levels", () => {
    expect(nextTopologyZoomPercent(0.51, 1)).toBe(60);
    expect(nextTopologyZoomPercent(0.51, -1)).toBe(50);
  });

  it("clamps zoom steps to the topology bounds", () => {
    expect(nextTopologyZoomPercent(1.6, 1)).toBe(160);
    expect(nextTopologyZoomPercent(0.05, -1)).toBe(5);
  });

  it("converts percentage values back to React Flow zoom levels", () => {
    expect(topologyZoomLevelFromPercent(60)).toBe(0.6);
  });

  it("falls back to the default zoom level for invalid percentages", () => {
    expect(topologyZoomLevelFromPercent(Number.NaN)).toBe(1);
  });
});
