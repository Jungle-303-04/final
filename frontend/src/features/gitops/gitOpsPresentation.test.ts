import { describe, expect, it } from "vitest";

import type { GitOpsSyncTarget } from "./gitOpsContract";
import { filterGitOpsSyncTargets, gitOpsSyncCategory } from "./gitOpsPresentation";

describe("gitOpsPresentation", () => {
  it.each([
    ["Synced", "synced"],
    ["succeeded", "synced"],
    ["OutOfSync", "out-of-sync"],
    ["out-of-sync", "out-of-sync"],
    ["Running", "checking"],
    ["degraded", "failed"],
    [null, "unknown"],
    ["provider-specific-state", "unknown"],
  ] as const)("normalizes the observed status %s without inventing controller state", (value, expected) => {
    expect(gitOpsSyncCategory(value)).toBe(expected);
  });

  it("searches only the authorized target projection across stable visible fields", () => {
    const rows = [
      target({
        id: "checkout:prod",
        applicationId: "checkout",
        applicationName: "Checkout API",
        clusterId: "production-east",
        namespace: "checkout",
        environment: "production",
        syncStatus: "out_of_sync",
        revision: "abc123",
      }),
      target({
        id: "inventory:stage",
        applicationId: "inventory",
        applicationName: "Inventory API",
        clusterId: "staging-east",
        namespace: "inventory",
        environment: "staging",
        syncStatus: "synced",
        revision: "def456",
      }),
    ];

    expect(filterGitOpsSyncTargets(rows, " PRODUCTION   east ")).toEqual([rows[0]]);
    expect(filterGitOpsSyncTargets(rows, "DEF456")).toEqual([rows[1]]);
    expect(filterGitOpsSyncTargets(rows, "missing")).toEqual([]);
    expect(filterGitOpsSyncTargets(rows, " ")).toEqual(rows);
  });
});

function target(overrides: Partial<GitOpsSyncTarget>): GitOpsSyncTarget {
  return {
    id: "target",
    applicationId: "application",
    applicationName: "Application",
    clusterId: null,
    namespace: null,
    environment: null,
    syncStatus: null,
    revision: null,
    observedAt: null,
    ...overrides,
  };
}
