import { describe, expect, it } from "vitest";
import { parseProductFilterUrl, serializeProductFilterUrl } from "./filterUrl";

describe("Resources timeline URL", () => {
  it("round-trips a bounded timeline without leaking the live default", () => {
    const historical = parseProductFilterUrl("?clusters=cluster-a&t.range=15m&t.at=1720000000000");

    expect(historical.detail.timeRange).toBe("15m");
    expect(historical.detail.timeAt).toBe(1_720_000_000_000);
    expect(serializeProductFilterUrl(historical.state, historical.detail)).toBe(
      "?clusters=cluster-a&t.range=15m&t.at=1720000000000",
    );
    const live = parseProductFilterUrl("?t.range=1h");
    expect(live.detail.timeRange).toBe("1h");
    expect(serializeProductFilterUrl(live.state, live.detail)).toBe("");
  });

  it("fails closed and canonicalizes malformed timeline coordinates", () => {
    const result = parseProductFilterUrl("?t.range=forever&t.at=-1&t.at=200");

    expect(result.detail.timeRange).toBeUndefined();
    expect(result.detail.timeAt).toBeUndefined();
    expect(result.invalidValues.timeRange).toEqual(["forever"]);
    expect(result.invalidValues.timeAt).toEqual(["200", "-1"]);
    expect(serializeProductFilterUrl(result.state, result.detail)).toBe("");
  });
});
