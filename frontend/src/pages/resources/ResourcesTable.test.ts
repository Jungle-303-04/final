import { describe, expect, it } from "vitest";
import type { ResourceSummary } from "../../features/resources/resourcesContract";
import { resourceNameButtonClassName } from "./ResourcesTable";

describe("resourceNameButtonClassName", () => {
  it("uses the shared blue interaction treatment for event names", () => {
    const classes = resourceNameButtonClassName(resourceSummary("event"));

    expect(classes).toContain("text-resource-event-name");
    expect(classes).toContain("hover:text-resource-event-name-hover");
    expect(classes).toContain("focus-visible:ring-resource-event-name/40");
  });

  it("keeps non-event resource names on the default link treatment", () => {
    const classes = resourceNameButtonClassName(resourceSummary("pod"));

    expect(classes).not.toContain("text-resource-event-name");
  });
});

function resourceSummary(type: "event" | "pod"): ResourceSummary {
  return {
    id: `${type}:test`,
    inventoryKey: `${type}:test`,
    uid: null,
    identityStability: "fallback",
    clusterId: "cluster-1",
    resourceType: type,
    apiVersion: "v1",
    kind: type === "event" ? "Event" : "Pod",
    namespace: "default",
    name: "example",
    status: "healthy",
    health: "healthy",
    healthStatus: "healthy",
    observedAt: null,
    firstSeenAt: null,
    lastSeenAt: null,
    deletedAt: null,
    facts: type === "event"
      ? {
          type: "event",
          eventType: "Normal",
          reason: "Scheduled",
          message: "Scheduled successfully",
          occurrenceCount: 1,
          firstSeenAt: null,
          lastSeenAt: null,
          reportingComponent: null,
          involvedResource: null,
        }
      : { type: "generic" },
  };
}
