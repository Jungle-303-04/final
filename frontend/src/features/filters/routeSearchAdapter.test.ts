import { describe, expect, it } from "vitest";

import { mergeRouteSearch, serializeRouteSearch } from "./routeSearchAdapter";

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

describe("mergeRouteSearch", () => {
  it("adds route-local state without dropping shared filters or hashes", () => {
    expect(mergeRouteSearch(
      "/issues?clusters=cluster-a&namespaces=cluster-a%2Fgame#evidence",
      [["view", "checks"]],
    )).toBe(
      "/issues?clusters=cluster-a&namespaces=cluster-a%2Fgame&view=checks#evidence",
    );
  });
});
