import { describe, expect, it } from "vitest";

import type { HomeBoardScope } from "./homeBoardDataContract";
import { homeBoardScopeRequestKey } from "./homeBoardRequestIdentity";

describe("home board request identity", () => {
  it("does not restart every board request for presentation-only freshness changes", () => {
    const first = scope([
      cluster("cluster-b", "stale", ["shop", "platform"]),
      cluster("cluster-a", "live", ["default"]),
    ]);
    const sameRequest = scope([
      cluster("cluster-a", "partial", ["default"]),
      cluster("cluster-b", "live", ["platform", "shop"]),
    ]);

    expect(homeBoardScopeRequestKey(sameRequest)).toBe(homeBoardScopeRequestKey(first));
  });

  it("restarts requests when the actual cluster or namespace scope changes", () => {
    const first = scope([cluster("cluster-a", "live", ["default"])]);
    const changed = scope([cluster("cluster-a", "live", ["default", "shop"])]);

    expect(homeBoardScopeRequestKey(changed)).not.toBe(homeBoardScopeRequestKey(first));
  });
});

function scope(clusters: HomeBoardScope["clusters"]): HomeBoardScope {
  return { allAccessible: true, applications: [], clusters };
}

function cluster(
  clusterId: string,
  freshness: HomeBoardScope["clusters"][number]["freshness"],
  namespaces: string[],
): HomeBoardScope["clusters"][number] {
  return { clusterId, freshness, namespaces, workspaceId: "workspace" };
}
