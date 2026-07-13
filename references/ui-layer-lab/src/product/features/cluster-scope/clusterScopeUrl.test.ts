import { describe, expect, it } from "vitest";
import {
  productClusterChangeHref,
  productNavigationHref,
  readProductClusterQuery,
} from "./clusterScopeUrl";

describe("product cluster scope URL", () => {
  it("distinguishes an absent cluster from an explicit empty or unknown scope", () => {
    expect(readProductClusterQuery("?node=worker-a")).toEqual({ present: false, value: null });
    expect(readProductClusterQuery("?cluster=")).toEqual({ present: true, value: "" });
    expect(readProductClusterQuery("?cluster=unknown%2Fcluster")).toEqual({
      present: true,
      value: "unknown/cluster",
    });
  });

  it("carries only the cluster into another product surface", () => {
    expect(productNavigationHref(
      "/product/resources",
      "?cluster=cluster-1&node=worker-a&namespace=default",
    )).toBe("/product/resources?cluster=cluster-1");
    expect(productNavigationHref(
      "/product",
      "?cluster=unknown%2Fcluster&resource=Pod%3Adefault%3Aapi",
    )).toBe("/product?cluster=unknown%2Fcluster");
    expect(productNavigationHref("/product", "?cluster=&node=worker-a"))
      .toBe("/product?cluster=");
    expect(productNavigationHref("/product", "?node=worker-a")).toBe("/product");
  });

  it("keeps the current pathname and clears every route-local query on selection", () => {
    expect(productClusterChangeHref("/product/resources/pod", "cluster-b"))
      .toBe("/product/resources/pod?cluster=cluster-b");
    expect(() => productClusterChangeHref("/product", "  ")).toThrow(TypeError);
  });
});
