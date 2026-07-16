import { describe, expect, it } from "vitest";

import { compareHref, parseCompareRoute, replaceCompareSide } from "./compareNavigation";

describe("compare navigation", () => {
  it("keeps the source comparison fields and accepts a descriptor-resolvable omitted version", () => {
    const identity = parseCompareRoute(new URLSearchParams(
      "cluster=cluster-a&kind=deployments&apiGroup=apps&a=shop%2Fapi-a&b=shop%2Fapi-b",
    ));

    expect(identity).toEqual({
      clusterId: "cluster-a",
      kind: "deployments",
      apiGroup: "apps",
      apiVersion: null,
      a: { namespace: "shop", name: "api-a" },
      b: { namespace: "shop", name: "api-b" },
    });
    expect(compareHref({ ...identity!, apiVersion: "v1" })).toBe(
      "/compare?cluster=cluster-a&kind=deployments&apiGroup=apps&a=shop%2Fapi-a&b=shop%2Fapi-b&apiVersion=v1",
    );
  });

  it("replaces only the chosen side and rejects invalid route identity", () => {
    const identity = parseCompareRoute(new URLSearchParams(
      "cluster=cluster-a&kind=services&apiGroup=&apiVersion=v1&a=api-a&b=api-b",
    ));
    expect(replaceCompareSide(identity!, "b", { namespace: "shop", name: "api-b" }).b).toEqual({ namespace: "shop", name: "api-b" });
    expect(parseCompareRoute(new URLSearchParams("kind=deployments&apiGroup=apps&a=shop%2Fa&b=shop%2Fb"))).toBeNull();
    expect(parseCompareRoute(new URLSearchParams("cluster=c&kind=deployments&apiGroup=apps&a=shop%2Fa&b=bad%2Fpath%2Fvalue"))).toBeNull();
  });
});
