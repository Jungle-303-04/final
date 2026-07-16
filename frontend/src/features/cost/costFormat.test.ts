import { describe, expect, it } from "vitest";

import { allocationUsePercent, formatCostMicros } from "./costFormat";

const formatNumber = (value: number | bigint, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat("en-US", options).format(value);

describe("cost formatters", () => {
  it("formats server-provided integer micro-units without projecting another period", () => {
    expect(formatCostMicros(100_000, "USD", formatNumber)).toBe("$0.10");
    expect(formatCostMicros(219_000_000, "KRW", formatNumber)).toContain("219");
  });

  it("rejects invalid transport units and currency", () => {
    expect(() => formatCostMicros(-1, "USD", formatNumber)).toThrow(RangeError);
    expect(() => formatCostMicros(1, "usd", formatNumber)).toThrow(TypeError);
  });

  it("preserves unavailable allocation use separately from observed zero", () => {
    expect(allocationUsePercent(null)).toBeNull();
    expect(allocationUsePercent(0)).toBe(0);
    expect(allocationUsePercent(10_000)).toBe(100);
  });
});
