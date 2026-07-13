import { describe, expect, it } from "vitest";
import type { HomeClusterChoice } from "./homeContract";
import { selectInitialClusterChoice } from "./homeSelection";

describe("selectInitialClusterChoice", () => {
  it("prefers an observed active cluster over an empty verification target", () => {
    const verification = cluster({
      id: "api-verification-target",
      name: "API Verification Target",
    });
    const observed = cluster({
      id: "cluster-1",
      name: "cluster-1",
      nodeCount: 2,
      podCount: 18,
      lastObservedAt: "2026-07-13T01:00:00.000Z",
    });

    expect(selectInitialClusterChoice([verification, observed])).toBe(observed);
  });

  it("keeps server order when candidates have the same operational evidence", () => {
    const first = cluster({ id: "cluster-a", name: "cluster-a" });
    const second = cluster({ id: "cluster-b", name: "cluster-b" });

    expect(selectInitialClusterChoice([first, second])).toBe(first);
  });

  it("does not hide a verification target when it is the only authorized cluster", () => {
    const only = cluster({
      id: "api-verification-target",
      name: "API Verification Target",
    });

    expect(selectInitialClusterChoice([only])).toBe(only);
    expect(selectInitialClusterChoice([])).toBeUndefined();
  });
});

function cluster(overrides: Partial<HomeClusterChoice>): HomeClusterChoice {
  return {
    id: "cluster",
    workspaceId: "workspace-main",
    name: "cluster",
    environment: "unknown",
    provider: "unknown",
    registrationState: "active",
    connectionState: "online",
    lastObservedAt: null,
    nodeCount: 0,
    podCount: 0,
    incidentCount: 0,
    ...overrides,
  };
}
