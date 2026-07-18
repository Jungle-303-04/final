import { describe, expect, it } from "vitest";
import {
  PRODUCT_ROUTE_CATALOG,
  landingProductRouteForReleasedSurfaces,
  productNavigationForReleasedSurfaces,
  productRouteForPath,
  productRoutePaths,
  referenceNavigationRoutes,
  resolveProductRoute,
  type ProductSurfaceId,
} from "./productRoutes";

describe("product route release registry", () => {
  it("keeps every supported primary navigation surface in the product descriptor", () => {
    expect(referenceNavigationRoutes().map((route) => [route.id, route.path, route.shortcut]))
      .toEqual([
        ["home", "/home", "g h"],
        ["resources", "/resources", "g r"],
        ["deploy", "/deploy", "g d"],
        ["issues", "/issues", "g i"],
        ["timeline", "/timeline", "g l"],
        ["checks", "/checks", "g u"],
        ["cost", "/cost", "g c"],
        ["settings", "/settings", "g s"],
      ]);
  });

  it("keeps legacy URLs in the catalog but outside the eight-item navigation", () => {
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.id)).toEqual([
      "home",
      "resources",
      "deploy",
      "issues",
      "timeline",
      "checks",
      "cost",
      "settings",
      "clusters",
      "traffic",
      "applications",
      "gitops",
      "helm",
      "alerts",
    ]);
    expect(PRODUCT_ROUTE_CATALOG.filter((route) => route.navigation)).toHaveLength(8);
    expect(PRODUCT_ROUTE_CATALOG.filter((route) => route.redirectTo !== null)
      .map(({ id, redirectTo, redirectSection }) => [id, redirectTo, redirectSection]))
      .toEqual([
        ["clusters", "home", null],
        ["traffic", "resources", null],
        ["applications", "deploy", "applications"],
        ["gitops", "deploy", "repositories"],
        ["helm", "deploy", "helm"],
        ["alerts", "issues", "rules"],
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
    ])).id).toBe("resources");
  });

  it.each([
    ["/home", "home"],
    ["/clusters", "clusters"],
    ["/resources/pods", "resources"],
    ["/deploy", "deploy"],
    ["/applications", "applications"],
    ["/alerts", "alerts"],
    ["/timeline", "timeline"],
    ["/traffic", "traffic"],
    ["/helm", "helm"],
    ["/audit", "checks"],
    ["/cost", "cost"],
    ["/gitops/detail/application/default/storefront", "gitops"],
    ["/settings", "settings"],
  ] as const)("maps %s to its owning screen", (pathname, routeId) => {
    expect(productRouteForPath(pathname)?.id).toBe(routeId);
  });

  it("keeps the bare root available for the landing redirect", () => {
    expect(productRouteForPath("/")).toBeNull();
  });

  it("maps every descriptor URL and alias to the surface that owns its deferred loader", () => {
    for (const routeDefinition of PRODUCT_ROUTE_CATALOG) {
      for (const path of productRoutePaths(routeDefinition)) {
        expect(productRouteForPath(path)?.id).toBe(routeDefinition.id);
      }
    }
  });

  it("falls unknown and removed routes back to Home", () => {
    expect(resolveProductRoute("/not-a-route").id).toBe("home");
    expect(resolveProductRoute("/legacy-metrics").id).toBe("home");
    expect(productRouteForPath("/topology")).toBeNull();
    expect(resolveProductRoute("/topology").id).toBe("home");
  });
});
