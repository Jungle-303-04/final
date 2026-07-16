import { describe, expect, it } from "vitest";

import { createEmptyUnifiedFilterState } from "./filterContract";
import { parseProductFilterUrl, serializeProductFilterUrl } from "./filterUrl";

describe("cost URL state", () => {
  it("round-trips the cost tab and non-default server trend range", () => {
    const parsed = parseProductFilterUrl(
      "?clusters=cluster-a&namespaces=cluster-a%2Fshop&tab=trend&cost.range=7d",
    );

    expect(parsed.detail).toMatchObject({ tab: "trend", costRange: "7d" });
    expect(parsed.invalidValues.costRange).toEqual([]);
    expect(serializeProductFilterUrl(parsed.state, parsed.detail)).toBe(
      "?clusters=cluster-a&namespaces=cluster-a%2Fshop&tab=trend&cost.range=7d",
    );
  });

  it("omits the default range and isolates malformed or repeated values", () => {
    const defaultRange = parseProductFilterUrl("?cost.range=24h");
    const invalid = parseProductFilterUrl("?cost.range=30d&cost.range=7d");

    expect(serializeProductFilterUrl(createEmptyUnifiedFilterState(), defaultRange.detail)).toBe("");
    expect(invalid.detail.costRange).toBeUndefined();
    expect(invalid.invalidValues.costRange).toEqual(["7d", "30d"]);
  });
});
