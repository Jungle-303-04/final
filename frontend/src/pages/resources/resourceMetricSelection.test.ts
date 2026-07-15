import { describe, expect, it } from "vitest";

import type { ResourceSummary } from "../../features/resources/resourcesContract";
import { selectResourceMetricIds } from "./resourceMetricSelection";

function resource(
  inventoryKey: string,
  resourceType: string,
): ResourceSummary {
  return {
    id: inventoryKey,
    inventoryKey,
    identityStability: "uid",
    uid: `${inventoryKey}-uid`,
    clusterId: "cluster-1",
    resourceType,
    apiVersion: "v1",
    kind: resourceType === "node" ? "Node" : resourceType === "pod" ? "Pod" : "Event",
    namespace: resourceType === "node" ? null : "shop",
    name: inventoryKey,
    status: "Running",
    health: "healthy",
    healthStatus: "healthy",
    facts: { type: "generic" },
    observedAt: "2026-07-15T05:00:00Z",
    firstSeenAt: "2026-07-15T05:00:00Z",
    lastSeenAt: "2026-07-15T05:00:00Z",
    deletedAt: null,
  };
}

describe("resource metric selection", () => {
  it("keeps Event details out of a measured Pod/Node batch", () => {
    expect(selectResourceMetricIds(
      resource("event-a", "event"),
      [resource("pod-a", "pod"), resource("node-a", "node")],
    )).toEqual(["pod-a", "node-a"]);
  });

  it("puts the selected measured resource first and de-duplicates it", () => {
    expect(selectResourceMetricIds(
      resource("node-a", "node"),
      [resource("pod-a", "pod"), resource("node-a", "node")],
    )).toEqual(["node-a", "pod-a"]);
  });
});
