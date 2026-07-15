import { describe, expect, it } from "vitest";
import {
  PRODUCT_ROUTE_CATALOG,
  landingProductRouteForReleasedSurfaces,
  productNavigationForReleasedSurfaces,
  productRouteForPath,
  referenceNavigationRoutes,
  resolveProductRoute,
  type ProductSurfaceId,
} from "./productRoutes";

describe("product route release registry", () => {
  it("keeps every upstream primary navigation surface in the product descriptor", () => {
    expect(referenceNavigationRoutes().map((route) => [route.id, route.path, route.shortcut]))
      .toEqual([
        ["home", "/home", "g h"],
        ["resources", "/resources", "g r"],
        ["issues", "/issues", "g i"],
        ["topology", "/topology", "g t"],
        ["applications", "/applications", "g a"],
        ["timeline", "/timeline", "g l"],
        ["traffic", "/traffic", "g f"],
        ["helm", "/helm", "g m"],
        ["gitops", "/gitops", "g o"],
        ["checks", "/checks", "g u"],
        ["cost", "/cost", "g c"],
      ]);
  });

  it("keeps product-only surfaces separate from the upstream primary route order", () => {
    expect(PRODUCT_ROUTE_CATALOG.map((route) => route.id)).toEqual([
      "home",
      "resources",
      "issues",
      "topology",
      "applications",
      "timeline",
      "traffic",
      "helm",
      "gitops",
      "checks",
      "cost",
      "clusters",
      "alerts",
      "settings",
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
    ["/topology", "topology"],
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

  it("falls unknown routes back to Home without treating known upstream screens as retired", () => {
    expect(resolveProductRoute("/not-a-route").id).toBe("home");
    expect(resolveProductRoute("/legacy-metrics").id).toBe("home");
  });
});
