import { describe, expect, it, vi } from "vitest";
import { createApiComposition } from "./apiComposition";
import { PRODUCT_ROUTE_CATALOG } from "./productRoutes";
import type { AuthPort } from "../features/auth/authContract";

const testAuthPort: AuthPort = {
  listWorkspaces: async () => ({ currentWorkspaceId: "test", items: [] }),
  loadSession: async () => ({ status: "unauthenticated" }),
  signIn: async () => { throw new Error("not used"); },
  signOut: async () => undefined,
  switchWorkspace: async () => { throw new Error("not used"); },
};

describe("API composition root", () => {
  it("registers canonical read surfaces without making network requests before mount", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const composition = createApiComposition(testAuthPort);
    const expectedSurfaceIds = PRODUCT_ROUTE_CATALOG
      .filter((routeDefinition) => routeDefinition.redirectTo === null)
      .map((routeDefinition) => routeDefinition.id);

    expect(composition.surfaces.map((surface) => surface.id)).toEqual(expectedSurfaceIds);
    expect([...composition.releasedSurfaceIds]).toEqual(expectedSurfaceIds);
    expect(composition.releasedSurfaceIds.has("timeline")).toBe(true);
    expect(composition.releasedSurfaceIds.has("helm")).toBe(false);
    expect(composition.releasedSurfaceIds.has("traffic")).toBe(false);
    expect(composition.releasedSurfaceIds.has("gitops")).toBe(false);
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
