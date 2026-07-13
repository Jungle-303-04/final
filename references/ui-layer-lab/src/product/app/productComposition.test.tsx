import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { createProductComposition } from "./productComposition";
import type { AuthPort } from "../features/auth/authContract";
import type { ClusterScopePort } from "../features/cluster-scope/clusterScopeContract";

const EmptySurface: ComponentType = () => null;
const testAuthPort: AuthPort = {
  loadSession: async () => ({ status: "unauthenticated" }),
  signIn: async () => { throw new Error("not used"); },
  signOut: async () => undefined,
};
const testClusterScopePort: ClusterScopePort = {
  listClusterChoices: async () => ({ completeness: "unknown", clusters: [] }),
};

describe("product composition", () => {
  it("keeps the production release closed when no approved surface is registered", () => {
    const composition = createProductComposition([], testAuthPort, testClusterScopePort);

    expect(composition.auth).toBe(testAuthPort);
    expect(composition.clusterScope).toBe(testClusterScopePort);
    expect(composition.surfaces).toEqual([]);
    expect([...composition.releasedSurfaceIds]).toEqual([]);
  });

  it("sorts registered surfaces by the canonical navigation order", () => {
    const composition = createProductComposition([
      { id: "timeline", Component: EmptySurface },
      { id: "home", Component: EmptySurface },
      { id: "issues", Component: EmptySurface },
    ], testAuthPort, testClusterScopePort);

    expect(composition.surfaces.map((surface) => surface.id)).toEqual([
      "home",
      "issues",
      "timeline",
    ]);
  });

  it("rejects duplicate registrations instead of choosing one implicitly", () => {
    expect(() => createProductComposition([
      { id: "home", Component: EmptySurface },
      { id: "home", Component: EmptySurface },
    ], testAuthPort, testClusterScopePort)).toThrow(/duplicate product surface: home/u);
  });
});
