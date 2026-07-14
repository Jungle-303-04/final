import { describe, expect, it } from "vitest";
import { freshnessBucket, msToNextFreshnessBucket } from "./freshnessTime";

describe("freshnessBucket", () => {
  it("keeps the first minute precise for polling feedback", () => {
    expect(freshnessBucket(0)).toEqual({ unit: "seconds", value: 0 });
    expect(freshnessBucket(59_000)).toEqual({ unit: "seconds", value: 59 });
  });

  it("uses coarse units after the first minute", () => {
    expect(freshnessBucket(60_000)).toEqual({ unit: "minutes", value: 1 });
    expect(freshnessBucket(3_600_000)).toEqual({ unit: "hours", value: 1 });
    expect(freshnessBucket(86_400_000)).toEqual({ unit: "days", value: 1 });
  });
});

describe("msToNextFreshnessBucket", () => {
  it("schedules the next visible age boundary", () => {
    expect(msToNextFreshnessBucket(0)).toBe(1_000);
    expect(msToNextFreshnessBucket(500)).toBe(500);
    expect(msToNextFreshnessBucket(90_000)).toBe(30_000);
  });
});
