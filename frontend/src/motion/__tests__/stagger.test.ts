import { describe, expect, it } from "vitest";
import {
  STAGGER_MS,
  podWaveDelay,
  staggerDelay,
} from "../useStagger";

describe("motion stagger", () => {
  it("uses the exact node, pod, and row steps", () => {
    expect(staggerDelay(3, STAGGER_MS.node)).toBe(210);
    expect(staggerDelay(3, STAGGER_MS.pod)).toBe(96);
    expect(staggerDelay(3, STAGGER_MS.row)).toBe(54);
  });

  it("clamps every accumulated delay at 520ms", () => {
    expect(staggerDelay(100, STAGGER_MS.node)).toBe(STAGGER_MS.max);
    expect(staggerDelay(100, STAGGER_MS.pod)).toBe(STAGGER_MS.max);
  });

  it("makes pod waves move by node and then by pod without exceeding the cap", () => {
    expect(podWaveDelay(1, 2)).toBe(134);
    expect(podWaveDelay(20, 20)).toBe(STAGGER_MS.max);
  });

  it("rejects invalid indices and durations instead of inventing a delay", () => {
    expect(() => staggerDelay(-1, STAGGER_MS.node)).toThrow(TypeError);
    expect(() => staggerDelay(1, Number.NaN)).toThrow(TypeError);
  });
});
