import { describe, expect, it } from "vitest";
import {
  timelinePinTargetForEvent,
  timelinePinTargetKey,
} from "./timelinePinTargets";
import type { TimelineEvent } from "./timelineContract";

describe("Timeline persistent pin targets", () => {
  it("uses only exact server resource and application-workflow subjects", () => {
    const resource = event({
      subject: { kind: "resource", resource: resourceRef() },
      resource: resourceRef(),
    });
    const application = event({
      subject: { kind: "application_workflow", applicationId: "app-checkout", bindingId: "binding-a", workflowRunId: "run-a" },
      resource: null,
      source: "application_workflow",
    });
    const locator = event({
      subject: {
        kind: "inventory_locator",
        inventoryKey: "inventory-a",
        apiGroup: "apps",
        version: "v1",
        resourceKind: "Deployment",
        namespace: "payments",
        name: "checkout",
      },
      resource: null,
    });

    expect(timelinePinTargetForEvent(resource)).toEqual({
      kind: "resource",
      scope: resource.scope,
      resource: resourceRef(),
    });
    expect(timelinePinTargetForEvent(application)).toEqual({ kind: "application", applicationId: "app-checkout" });
    expect(timelinePinTargetForEvent(locator)).toBeNull();
  });

  it("matches resource membership without depending on namespace ordering", () => {
    const target = {
      kind: "resource" as const,
      scope: { workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: ["shop", "payments"], freshness: "live" as const },
      resource: resourceRef(),
    };
    const reordered = { ...target, scope: { ...target.scope, namespaces: ["payments", "shop"] } };

    expect(timelinePinTargetKey(target)).toBe(timelinePinTargetKey(reordered));
  });
});

function event(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: "event-a",
    source: "inventory",
    sourceKey: "inventory:event-a",
    nativeId: "event-a",
    activity: "change",
    occurredAt: "2026-07-15T00:00:00.000Z",
    scope: { workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: ["payments"], freshness: "live" },
    subject: { kind: "resource", resource: resourceRef() },
    resource: resourceRef(),
    type: "update",
    severity: "info",
    title: "Checkout changed",
    owner: null,
    metadata: {},
    ...overrides,
  };
}

function resourceRef() {
  return {
    apiGroup: "apps",
    version: "v1",
    kind: "Deployment",
    namespace: "payments",
    name: "checkout",
    uid: "deployment-checkout",
  };
}
