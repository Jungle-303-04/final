import { describe, expect, it } from "vitest";
import { PRODUCT_ROUTES, productRouteForPath } from "./productRoutes";

describe("product route release registry", () => {
  it("publishes only released navigation capabilities", () => {
    expect(PRODUCT_ROUTES.filter((route) => route.showInNavigation).map((route) => route.id))
      .toEqual(["home"]);
  });

  it("keeps the metrics connection route addressable without adding a sidebar item", () => {
    expect(productRouteForPath("/metrics")).toMatchObject({
      id: "metrics",
      showInNavigation: false,
    });
  });
});
