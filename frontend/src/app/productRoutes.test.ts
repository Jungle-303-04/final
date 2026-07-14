import { describe, expect, it } from "vitest";
import {
  PRODUCT_ROUTE_CATALOG,
  PRODUCT_LANE_ROUTE_STUBS,
  productNavigationForReleasedSurfaces,
  productRouteForPath,
  resolveProductRoute,
  type ProductSurfaceId,
} from "./productRoutes";

describe("product route release registry", () => {
  it("defines the provider-neutral backend-backed primary route order", () => {
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.id)).toEqual([
      "clusters",
      "home",
      "resources",
      "issues",
      "metrics",
      "applications",
      "gitops",
      "catalog",
    ]);
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.label)).toEqual([
      "Clusters",
      "Home",
      "Resources",
      "Issues",
      "Metrics",
      "Applications",
      "GitOps",
      "Catalog",
    ]);
  });

  it("registers every sprint lane path without releasing an empty surface", () => {
    expect(PRODUCT_LANE_ROUTE_STUBS).toEqual({
      rca: ["issues"],
      metrics: ["metrics"],
      "workloads-gitops": ["applications", "gitops"],
      "ai-catalog": ["catalog"],
    });
    expect(productNavigationForReleasedSurfaces(new Set())).toEqual([]);
  });

  it("shows only surfaces released by the composition root", () => {
    const released = new Set<ProductSurfaceId>(["home", "issues", "catalog"]);

    expect(productNavigationForReleasedSurfaces(released).map((route) => route.id)).toEqual([
      "home",
      "issues",
      "catalog",
    ]);
  });

  it.each([
    ["/", "home"],
    ["/clusters", "clusters"],
    ["/resources/pods", "resources"],
    ["/metrics", "metrics"],
    ["/gitops/detail/application/default/storefront", "gitops"],
    ["/catalog/items/prometheus", "catalog"],
  ] as const)("maps %s to its owning screen", (pathname, routeId) => {
    expect(productRouteForPath(pathname)?.id).toBe(routeId);
  });

  it("falls unknown and retired demo routes back to the Clusters entry point", () => {
    expect(resolveProductRoute("/not-a-route").id).toBe("clusters");
    expect(resolveProductRoute("/topology").id).toBe("clusters");
    expect(resolveProductRoute("/timeline").id).toBe("clusters");
    expect(resolveProductRoute("/traffic").id).toBe("clusters");
    expect(resolveProductRoute("/legacy-metrics").id).toBe("clusters");
  });

  it("keeps backend-gap screens and Settings out of the primary route catalog", () => {
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.id)).not.toEqual(
      expect.arrayContaining([
        "topology",
        "timeline",
        "traffic",
        "helm",
        "checks",
        "cost",
        "settings",
      ]),
    );
  });
});
