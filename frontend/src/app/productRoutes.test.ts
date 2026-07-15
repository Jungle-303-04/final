import { describe, expect, it } from "vitest";
import {
  PRODUCT_ROUTE_CATALOG,
  landingProductRouteForReleasedSurfaces,
  productNavigationForReleasedSurfaces,
  productRouteForPath,
  resolveProductRoute,
  type ProductSurfaceId,
} from "./productRoutes";

describe("product route release registry", () => {
  it("defines the provider-neutral backend-backed primary route order", () => {
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.id)).toEqual([
      "home",
      "clusters",
      "resources",
      "issues",
      "alerts",
      "applications",
      "gitops",
      "settings",
    ]);
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.label)).toEqual([
      "Home",
      "Clusters",
      "Resources",
      "Incidents",
      "Alerts",
      "Applications",
      "GitOps",
      "Settings",
    ]);
  });

  it("does not release a navigation entry without a registered surface", () => {
    expect(productNavigationForReleasedSurfaces(new Set())).toEqual([]);
  });

  it("shows only surfaces released by the composition root", () => {
    const released = new Set<ProductSurfaceId>(["home", "issues", "settings"]);

    expect(productNavigationForReleasedSurfaces(released).map((route) => route.id)).toEqual([
      "home",
      "issues",
      "settings",
    ]);
  });

  it("resolves the landing route from declarative route metadata", () => {
    expect(PRODUCT_ROUTE_CATALOG.find((route) => route.landing)?.id).toBe("home");
    expect(landingProductRouteForReleasedSurfaces(new Set<ProductSurfaceId>([
      "home",
      "clusters",
    ])).id).toBe("home");
    expect(landingProductRouteForReleasedSurfaces(new Set<ProductSurfaceId>([
      "clusters",
      "resources",
    ])).id).toBe("clusters");
  });

  it.each([
    ["/home", "home"],
    ["/clusters", "clusters"],
    ["/resources/pods", "resources"],
    ["/alerts", "alerts"],
    ["/gitops/detail/application/default/storefront", "gitops"],
    ["/settings", "settings"],
  ] as const)("maps %s to its owning screen", (pathname, routeId) => {
    expect(productRouteForPath(pathname)?.id).toBe(routeId);
  });

  it("keeps the bare root available for the landing redirect", () => {
    expect(productRouteForPath("/")).toBeNull();
  });

  it("falls unknown and retired demo routes back to Home", () => {
    expect(resolveProductRoute("/not-a-route").id).toBe("home");
    expect(resolveProductRoute("/topology").id).toBe("home");
    expect(resolveProductRoute("/timeline").id).toBe("home");
    expect(resolveProductRoute("/traffic").id).toBe("home");
    expect(resolveProductRoute("/legacy-metrics").id).toBe("home");
  });

  it("keeps retired and backend-gap screens out of the route catalog", () => {
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.id)).not.toEqual(
      expect.arrayContaining([
        "topology",
        "timeline",
        "traffic",
        "helm",
        "checks",
        "cost",
        "metrics",
        "catalog",
      ]),
    );
  });
});
