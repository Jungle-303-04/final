import { describe, expect, it } from "vitest";

import {
  formatRightsizingQuantity,
  rightsizingActionPresentation,
  rightsizingFitKey,
  rightsizingSignalKey,
} from "./rightsizingPresentation";

describe("rightsizing presentation", () => {
  it("maps only server-owned enums to semantic presentation", () => {
    expect(rightsizingActionPresentation("increase")).toEqual({
      key: "rightsizing.action.increase",
      tone: "warning",
    });
    expect(rightsizingActionPresentation("need_data").tone).toBe("unknown");
    expect(rightsizingFitKey("insufficient_history")).toBe(
      "rightsizing.fit.insufficient_history",
    );
    expect(rightsizingSignalKey("oom")).toBe("rightsizing.signal.oom");
  });

  it("formats safe integer transport units without deriving recommendations", () => {
    const formatNumber = (value: number | bigint) => String(value);
    expect(formatRightsizingQuantity(
      { unit: "millicores", value: 500 },
      formatNumber,
      "Unset",
    )).toBe("500 mCPU");
    expect(formatRightsizingQuantity(
      { unit: "bytes", value: 134_217_728 },
      formatNumber,
      "Unset",
    )).toBe("134217728 bytes");
    expect(formatRightsizingQuantity(null, formatNumber, "Unset")).toBe("Unset");
  });
});
