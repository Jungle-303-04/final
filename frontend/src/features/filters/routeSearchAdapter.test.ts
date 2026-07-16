import { describe, expect, it } from "vitest";

import { serializeRouteSearch } from "./routeSearchAdapter";

describe("route search adapter", () => {
  it("preserves caller order while omitting absent optional fields", () => {
    expect(serializeRouteSearch([
      ["cluster", "cluster-a"],
      ["apiGroup", "apps"],
      ["apiVersion", null],
      ["a", "shop/api-a"],
    ])).toBe("?cluster=cluster-a&apiGroup=apps&a=shop%2Fapi-a");
  });
});
