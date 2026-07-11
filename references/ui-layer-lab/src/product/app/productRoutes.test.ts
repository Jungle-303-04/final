import { describe, expect, it } from "vitest";
import {
  PRODUCT_ROUTE_CATALOG,
  productNavigationForCapabilities,
  productRouteForPath,
  resolveProductRoute,
  type ProductCapabilityId,
} from "./productRoutes";

describe("product route release registry", () => {
  it("defines the provider-neutral backend-backed primary route order", () => {
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.id)).toEqual([
      "home",
      "resources",
      "issues",
      "topology",
      "applications",
      "timeline",
      "gitops",
    ]);
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.label)).toEqual([
      "Home",
      "Resources",
      "Issues",
      "Topology",
      "Applications",
      "Timeline",
      "GitOps",
    ]);
  });

  it("shows only capabilities released by the composition root", () => {
    const available = new Set<ProductCapabilityId>(["home", "issues", "timeline"]);

    expect(productNavigationForCapabilities(available).map((route) => route.id)).toEqual([
      "home",
      "issues",
      "timeline",
    ]);
  });

  it.each([
    ["/product", "home"],
    ["/product/resources/pods", "resources"],
    ["/product/topology", "topology"],
    ["/product/gitops/detail/application/default/storefront", "gitops"],
  ] as const)("maps %s to its owning screen", (pathname, routeId) => {
    expect(productRouteForPath(pathname)?.id).toBe(routeId);
  });

  it("falls unknown and retired demo routes back to Home", () => {
    expect(resolveProductRoute("/product/not-a-route").id).toBe("home");
    expect(resolveProductRoute("/metrics").id).toBe("home");
  });

  it("keeps backend-gap screens and Settings out of the primary route catalog", () => {
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.id)).not.toEqual(
      expect.arrayContaining(["traffic", "helm", "checks", "cost", "settings"]),
    );
  });
});
