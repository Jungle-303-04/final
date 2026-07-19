import { describe, expect, it } from "vitest";

import { parseProductFilterUrl, serializeProductFilterUrl } from "./filterUrl";

describe("home board URL period", () => {
  it("round-trips non-default shared periods", () => {
    const parsed = parseProductFilterUrl("?clusters=cluster-a&home.period=30d");
    expect(parsed.detail.homePeriod).toBe("30d");
    expect(serializeProductFilterUrl(parsed.state, parsed.detail))
      .toBe("?clusters=cluster-a&home.period=30d");
  });

  it("omits today and canonicalizes unsupported values", () => {
    const today = parseProductFilterUrl("?home.period=today");
    expect(today.detail.homePeriod).toBe("today");
    expect(serializeProductFilterUrl(today.state, today.detail)).toBe("");

    const unsupported = parseProductFilterUrl("?home.period=90d");
    expect(unsupported.detail.homePeriod).toBeUndefined();
    expect(unsupported.invalidValues.homePeriod).toEqual(["90d"]);
    expect(unsupported.needsCanonicalWrite).toBe(true);
  });
});
