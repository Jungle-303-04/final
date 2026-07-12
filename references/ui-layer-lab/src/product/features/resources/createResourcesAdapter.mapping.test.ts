import { describe, expect, it } from "vitest";
import type {
  ResourceCatalog,
  ResourceList,
} from "./resourcesContract";
import { createResourcesAdapter } from "./createResourcesAdapter";
import { endpoints } from "./createResourcesAdapter.testSupport";

describe("canonical Resources catalog and list mapping", () => {
  it("maps and aggregates the server inventory catalog without claiming completeness", async () => {
    await expect(createResourcesAdapter(endpoints()).loadCatalog("cluster-1"))
      .resolves.toEqual({
        clusterId: "cluster-1",
        completeness: "unknown",
        observedAt: "2026-07-12T10:00:00.000Z",
        items: [
          {
            resourceType: "pod",
            count: 3,
            healthCounts: {
              healthy: 2,
              warning: 1,
              critical: 0,
              stale: 0,
              unknown: 0,
            },
          },
          {
            resourceType: "service",
            count: 3,
            healthCounts: {
              healthy: 1,
              warning: 0,
              critical: 0,
              stale: 0,
              unknown: 2,
            },
          },
        ],
      } satisfies ResourceCatalog);
  });

  it("maps UID and fallback identities, safe metadata, Pod facts, and limit state", async () => {
    const dependencies = endpoints();
    const controller = new AbortController();

    await expect(createResourcesAdapter(dependencies).listResources(
      "cluster-1",
      { resourceType: "pod", namespace: "shop", limit: 2 },
      controller.signal,
    )).resolves.toEqual({
      clusterId: "cluster-1",
      resourceType: "pod",
      namespace: "shop",
      includeDeleted: false,
      completeness: "unknown",
      limit: 2,
      returned: 2,
      limitReached: true,
      excludedCount: 0,
      dataQualityWarnings: [],
      items: [
        {
          id: "resource:cluster-1/uid-pod-1",
          identityStability: "uid",
          inventoryKey: "inventory-pod-1",
          uid: "uid-pod-1",
          clusterId: "cluster-1",
          resourceType: "pod",
          apiVersion: "v1",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-0",
          status: "Running",
          health: "healthy",
          healthStatus: "healthy",
          facts: {
            type: "pod",
            phase: "Running",
            nodeName: "worker-a",
            owner: { kind: "StatefulSet", name: "checkout-api" },
            readiness: { ready: 1, total: 2 },
            restartCount: 3,
            cpuMillicores: 245.5,
            memoryMebibytes: 382,
            podIp: "10.0.0.10",
            hostIp: "10.0.0.2",
            waitingReasons: ["CrashLoopBackOff"],
            terminatedReasons: ["OOMKilled"],
          },
          observedAt: "2026-07-12T10:00:00.000Z",
          firstSeenAt: "2026-07-12T09:00:00.000Z",
          lastSeenAt: "2026-07-12T10:00:00.000Z",
          deletedAt: null,
        },
        {
          id: "resource:cluster-1/pod/shop/Pod/checkout-api-1",
          identityStability: "fallback",
          inventoryKey: "inventory-pod-2",
          uid: null,
          clusterId: "cluster-1",
          resourceType: "pod",
          apiVersion: "v1",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-1",
          status: "Running",
          health: "unknown",
          healthStatus: "future-state",
          facts: {
            type: "pod",
            phase: null,
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
          observedAt: "2026-07-12T10:00:00.000Z",
          firstSeenAt: "2026-07-12T09:00:00.000Z",
          lastSeenAt: "2026-07-12T10:00:00.000Z",
          deletedAt: null,
        },
      ],
    } satisfies ResourceList);
    expect(dependencies.listInventoryResourcesByType).toHaveBeenCalledWith(
      "cluster-1",
      {
        resourceType: "pod",
        namespace: "shop",
        includeDeleted: false,
        limit: 2,
      },
      controller.signal,
    );
  });
});
