import { describe, expect, it } from "vitest";
import {
  canonicalizeProductFilterUrl,
  parseProductFilterUrl,
} from "./filterUrl";

describe("VP-010 scalar filter URL", () => {
  it("isolates invalid scalar filter and detail values instead of accepting them", () => {
    const search = "?resources.includeDeleted=sometimes&resources.view=cards" +
      "&applications.pendingPromotion=waiting&full=wide";
    const result = parseProductFilterUrl(search);

    expect(result.state.resources.includeDeleted).toBe(false);
    expect(result.state.resources.view).toBe("table");
    expect(result.state.applicationSurface.pendingPromotion).toBe(false);
    expect(result.detail.full).toBe(false);
    expect(result.invalidValues).toMatchObject({
      applicationsPendingPromotion: ["waiting"],
      detailFull: ["wide"],
      resourcesIncludeDeleted: ["sometimes"],
      resourcesView: ["cards"],
    });
    expect(canonicalizeProductFilterUrl(search)).toBe("");
  });
});
