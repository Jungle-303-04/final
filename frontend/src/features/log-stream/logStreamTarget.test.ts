import { describe, expect, it } from "vitest";

import type { ResourceSummary } from "../resources/resourcesContract";
import { logStreamTargetFromResource } from "./logStreamTarget";

describe("log stream resource target", () => {
  it("opens only exact namespaced pod and supported workload identities", () => {
    expect(logStreamTargetFromResource(resource())).toEqual({
      type: "pod",
      clusterId: "cluster-1",
      namespace: "shop",
      name: "checkout",
      container: null,
    });
    expect(logStreamTargetFromResource(resource({
      resourceType: "workload",
      kind: "Deployment",
      facts: {
        type: "workload",
        desiredReplicas: null,
        readyReplicas: null,
        availableReplicas: null,
        updatedReplicas: null,
        unavailableReplicas: null,
        generation: null,
        observedGeneration: null,
      },
    }))).toMatchObject({ type: "workload", kind: "deployments" });
    expect(logStreamTargetFromResource(resource({ namespace: null }))).toBeNull();
    expect(logStreamTargetFromResource(resource({
      resourceType: "service",
      kind: "Service",
      facts: { type: "generic" },
    }))).toBeNull();
  });
});

function resource(overrides: Partial<ResourceSummary> = {}): ResourceSummary {
  return {
    id: "pod-1",
    identityStability: "uid",
    inventoryKey: "inventory-1",
    uid: "uid-1",
    clusterId: "cluster-1",
    resourceType: "pod",
    apiVersion: "v1",
    kind: "Pod",
    namespace: "shop",
    name: "checkout",
    status: "Running",
    health: "healthy",
    healthStatus: "healthy",
    facts: {
      type: "pod",
      phase: "Running",
      nodeName: null,
      owner: null,
      readiness: null,
      restartCount: null,
      cpuMillicores: null,
      memoryMebibytes: null,
      podIp: null,
      hostIp: null,
      waitingReasons: [],
      terminatedReasons: [],
    },
    observedAt: null,
    firstSeenAt: null,
    lastSeenAt: null,
    deletedAt: null,
    ...overrides,
  };
}
