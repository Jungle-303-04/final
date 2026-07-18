import { describe, expect, it, vi } from "vitest";
import { createApiComposition } from "./apiComposition";
import { PRODUCT_ROUTE_CATALOG, type ProductSurfaceId } from "./productRoutes";
import type { AuthPort } from "../features/auth/authContract";

const testAuthPort: AuthPort = {
  listWorkspaces: async () => ({ currentWorkspaceId: "test", items: [] }),
  loadSession: async () => ({ status: "unauthenticated" }),
  signIn: async () => { throw new Error("not used"); },
  signOut: async () => undefined,
  switchWorkspace: async () => { throw new Error("not used"); },
};

const APPROVED_SURFACE_IDS = new Set<ProductSurfaceId>([
  "alerts",
  "applications",
  "clusters",
  "cost",
  "checks",
  "deploy",
  "gitops",
  "helm",
  "home",
  "issues",
  "resources",
  "settings",
  "traffic",
  "timeline",
]);

describe("API composition root", () => {
  it("registers released read surfaces without making network requests before mount", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const composition = createApiComposition(testAuthPort);
    const expectedSurfaceIds = PRODUCT_ROUTE_CATALOG
      .filter((routeDefinition) => APPROVED_SURFACE_IDS.has(routeDefinition.id))
      .map((routeDefinition) => routeDefinition.id);

    expect(composition.surfaces.map((surface) => surface.id)).toEqual(expectedSurfaceIds);
    expect([...composition.releasedSurfaceIds]).toEqual(expectedSurfaceIds);
    expect(composition.releasedSurfaceIds.has("timeline")).toBe(true);
    expect(composition.releasedSurfaceIds.has("helm")).toBe(true);
    expect(composition.releasedSurfaceIds.has("traffic")).toBe(true);
    expect(composition.releasedSurfaceIds.has("cost")).toBe(true);
    expect(composition.releasedSurfaceIds.has("checks")).toBe(true);
    expect(composition.surfaces.map((surface) => surface.id)).not.toContain("topology");
    expect(composition.runtimeStatus.loadDiagnostics).toEqual(expect.any(Function));
    expect(composition.runtimeStatus.checkVersion).toEqual(expect.any(Function));
    expect(fetchSpy).not.toHaveBeenCalled();
    composition.dispose();
    fetchSpy.mockRestore();
  });
});
