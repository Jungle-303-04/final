import { describe, expect, it, vi } from "vitest";
import { createApiComposition } from "./apiComposition";
import { PRODUCT_ROUTE_CATALOG, type ProductSurfaceId } from "./productRoutes";

const APPROVED_SURFACE_IDS = new Set<ProductSurfaceId>([
  "alerts",
  "applications",
  "clusters",
  "gitops",
  "helm",
  "home",
  "issues",
  "resources",
  "settings",
  "timeline",
]);

describe("API composition root", () => {
  it("registers released read surfaces without making network requests before mount", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const composition = createApiComposition();
    const expectedSurfaceIds = PRODUCT_ROUTE_CATALOG
      .filter((routeDefinition) => APPROVED_SURFACE_IDS.has(routeDefinition.id))
      .map((routeDefinition) => routeDefinition.id);

    expect(composition.surfaces.map((surface) => surface.id)).toEqual(expectedSurfaceIds);
    expect([...composition.releasedSurfaceIds]).toEqual(expectedSurfaceIds);
    expect(composition.releasedSurfaceIds.has("timeline")).toBe(true);
    expect(composition.releasedSurfaceIds.has("helm")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
