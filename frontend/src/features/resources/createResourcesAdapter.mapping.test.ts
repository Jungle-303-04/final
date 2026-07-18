import { describe, expect, it } from "vitest";
import type {
  ResourceCatalog,
  ResourceList,
} from "./resourcesContract";
import { createResourcesAdapter } from "./createResourcesAdapter";
import {
  API_RESOURCES,
  endpoints,
  INVENTORY_SUMMARY,
} from "./createResourcesAdapter.testSupport";

describe("canonical Resources catalog and list mapping", () => {
  it("maps namespace-scoped observed counts and agent visibility evidence", async () => {
    const dependencies = endpoints();
    await expect(createResourcesAdapter(dependencies).loadCatalog("cluster-1", ["shop"]))
      .resolves.toEqual({
        clusterId: "cluster-1",
        completeness: "observed",
        observedAt: "2026-07-12T10:00:00.000Z",
        namespaceScope: ["shop"],
        reasonCodes: [],
        forbidden: [{
          namespace: "shop",
          apiGroup: "apps",
          version: "v1",
          resource: "deployments",
          kind: "Deployment",
          namespaced: true,
          reasonCode: "list_permission_not_observed",
        }],
        apiDiscovery: {
          completeness: "exact",
          observedAt: "2026-07-12T10:00:00.000Z",
          reasonCodes: [],
          resources: [{
            apiVersion: "v1",
            group: "",
            version: "v1",
            pluralName: "pods",
            singularName: "pod",
            kind: "Pod",
            namespaced: true,
            isCrd: false,
            verbs: ["get", "list", "watch"],
          }],
        },
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
    expect(dependencies.getInventorySummary).toHaveBeenCalledWith(
      "cluster-1",
      ["shop"],
      undefined,
    );
  });

  it("keeps server-projected zero-count resource types selectable", async () => {
    const dependencies = endpoints({
      getInventorySummary: async () => ({
        ...INVENTORY_SUMMARY,
        counts: [
          { resource_type: "deployment", health: "healthy", count: 2 },
          { resource_type: "ingress", health: "unknown", count: 0 },
          { resource_type: "job", health: "unknown", count: 0 },
        ],
      }),
      getKubernetesApiResources: async () => API_RESOURCES,
    });

    const catalog = await createResourcesAdapter(dependencies).loadCatalog("cluster-1");

    expect(catalog.items).toEqual([
      expect.objectContaining({ resourceType: "deployment", count: 2 }),
      expect.objectContaining({ resourceType: "ingress", count: 0 }),
      expect.objectContaining({ resourceType: "job", count: 0 }),
    ]);
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
            containerNames: ["app", "sidecar"],
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
            containerNames: [],
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
