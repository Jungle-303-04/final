import { describe, expect, it, vi } from "vitest";
import { createResourcesAdapter } from "./createResourcesAdapter";
import {
  endpoints,
  endpointResource,
  INVENTORY_SUMMARY,
  POD_LIST,
  RESOURCE_DETAIL,
} from "./createResourcesAdapter.testSupport";

describe("canonical Resources adapter validation", () => {
  it.each([
    ["catalog", { ...INVENTORY_SUMMARY, cluster_id: "other" }],
    ["list", { ...POD_LIST, cluster_id: "other" }],
    ["detail", { ...RESOURCE_DETAIL, cluster_id: "other" }],
  ] as const)("rejects a %s cluster identity mismatch", async (operation, payload) => {
    const port = createResourcesAdapter(endpoints({
      getInventorySummary: vi.fn().mockResolvedValue(payload),
      listInventoryResourcesByType: vi.fn().mockResolvedValue(payload),
      getInventoryResourceDetail: vi.fn().mockResolvedValue(payload),
    }));
    const request = operation === "catalog"
      ? port.loadCatalog("cluster-1")
      : operation === "list"
        ? port.listResources("cluster-1", { resourceType: "pod" })
        : port.loadResourceDetail("cluster-1", {
          resourceType: "service",
          kind: "Service",
          namespace: "shop",
          name: "checkout",
        });

    await expect(request).rejects.toMatchObject({ code: "invalid-response" });
  });

  it.each([
    ["response resource type", { ...POD_LIST, resource_type: "service" }],
    ["item resource type", {
      ...POD_LIST,
      resources: [endpointResource({ resource_type: "service" })],
    }],
    ["item namespace", {
      ...POD_LIST,
      resources: [endpointResource({ namespace: "other" })],
    }],
  ])("rejects a mismatched list %s", async (_name, payload) => {
    const port = createResourcesAdapter(endpoints({
      listInventoryResourcesByType: vi.fn().mockResolvedValue(payload),
    }));

    await expect(port.listResources("cluster-1", {
      resourceType: "pod",
      namespace: "shop",
    })).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("rejects a response that exceeds the requested list limit", async () => {
    const port = createResourcesAdapter(endpoints({
      listInventoryResourcesByType: vi.fn().mockResolvedValue(POD_LIST),
    }));

    await expect(port.listResources("cluster-1", {
      resourceType: "pod",
      limit: 1,
    })).rejects.toMatchObject({ code: "invalid-response" });
  });

  it.each([
    ["clusterId", " ", { resourceType: "pod" }],
    ["resourceType", "cluster-1", { resourceType: " " }],
    ["namespace", "cluster-1", { resourceType: "pod", namespace: " shop " }],
    ["limit below range", "cluster-1", { resourceType: "pod", limit: 0 }],
    ["limit above range", "cluster-1", { resourceType: "pod", limit: 1001 }],
    ["fractional limit", "cluster-1", { resourceType: "pod", limit: 2.5 }],
  ])("rejects an invalid %s before calling the list endpoint", async (
    _name,
    clusterId,
    query,
  ) => {
    const dependencies = endpoints();
    const port = createResourcesAdapter(dependencies);

    await expect(port.listResources(clusterId, query))
      .rejects.toMatchObject({ code: "invalid-request" });
    expect(dependencies.listInventoryResourcesByType).not.toHaveBeenCalled();
  });

  it.each([
    ["resource type", { resourceType: " ", kind: "Pod", namespace: "shop", name: "p1" }],
    ["kind", { resourceType: "pod", kind: " ", namespace: "shop", name: "p1" }],
    ["namespace", { resourceType: "pod", kind: "Pod", namespace: " shop ", name: "p1" }],
    ["name", { resourceType: "pod", kind: "Pod", namespace: "shop", name: " " }],
  ])("rejects an invalid detail %s before calling the endpoint", async (_name, identity) => {
    const dependencies = endpoints();

    await expect(createResourcesAdapter(dependencies).loadResourceDetail(
      "cluster-1",
      identity,
    )).rejects.toMatchObject({ code: "invalid-request" });
    expect(dependencies.getInventoryResourceDetail).not.toHaveBeenCalled();
  });

  it.each([
    ["wire identity", {
      ...RESOURCE_DETAIL,
      identity: { ...RESOURCE_DETAIL.identity, name: "other" },
    }],
    ["primary resource", {
      ...RESOURCE_DETAIL,
      resource: { ...RESOURCE_DETAIL.resource, name: "other" },
    }],
    ["primary resource kind", {
      ...RESOURCE_DETAIL,
      resource: { ...RESOURCE_DETAIL.resource, kind: "Other" },
    }],
    ["primary resource namespace", {
      ...RESOURCE_DETAIL,
      resource: { ...RESOURCE_DETAIL.resource, namespace: "other" },
    }],
    ["related cluster", {
      ...RESOURCE_DETAIL,
      related: {
        pods: [endpointResource({ cluster_id: "other" })],
      },
    }],
    ["related namespace shape", {
      ...RESOURCE_DETAIL,
      related: {
        pods: [endpointResource({ namespace: " " })],
      },
    }],
    ["event cluster", {
      ...RESOURCE_DETAIL,
      events: [endpointResource({
        cluster_id: "other",
        resource_type: "event",
        kind: "Event",
      })],
    }],
    ["non-event event collection", {
      ...RESOURCE_DETAIL,
      events: [endpointResource()],
    }],
  ])("rejects a mismatched detail %s", async (_name, payload) => {
    const port = createResourcesAdapter(endpoints({
      getInventoryResourceDetail: vi.fn().mockResolvedValue(payload),
    }));

    await expect(port.loadResourceDetail("cluster-1", {
      resourceType: "service",
      kind: "Service",
      namespace: "shop",
      name: "checkout",
    })).rejects.toMatchObject({ code: "invalid-response" });
  });

  it.each([
    ["negative catalog count", {
      ...INVENTORY_SUMMARY,
      counts: [{ resource_type: "pod", health: "healthy", count: -1 }],
    }],
    ["fractional catalog count", {
      ...INVENTORY_SUMMARY,
      counts: [{ resource_type: "pod", health: "healthy", count: 1.5 }],
    }],
    ["invalid catalog timestamp", {
      ...INVENTORY_SUMMARY,
      latest_snapshot: { collected_at: "yesterday" },
    }],
  ])("rejects %s", async (_name, payload) => {
    await expect(createResourcesAdapter(endpoints({
      getInventorySummary: vi.fn().mockResolvedValue(payload),
    })).loadCatalog("cluster-1")).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  it.each([
    ["blank identity", endpointResource({ name: " " })],
  ])("isolates %s at the resource row", async (_name, resource) => {
    await expect(createResourcesAdapter(endpoints({
      listInventoryResourcesByType: vi.fn().mockResolvedValue({
        cluster_id: "cluster-1",
        resource_type: "pod",
        resources: [resource],
      }),
    })).listResources("cluster-1", { resourceType: "pod" }))
      .resolves.toMatchObject({ items: [], excludedCount: 1 });
  });

  it("isolates duplicate canonical identities", async () => {
    const duplicate = endpointResource();

    await expect(createResourcesAdapter(endpoints({
      listInventoryResourcesByType: vi.fn().mockResolvedValue({
        cluster_id: "cluster-1",
        resource_type: "pod",
        resources: [duplicate, { ...duplicate, inventory_key: "different-key" }],
      }),
    })).listResources("cluster-1", { resourceType: "pod" }))
      .resolves.toMatchObject({
        items: [{ id: "resource:cluster-1/uid-pod-1" }],
        excludedCount: 1,
      });
  });

  it.each([
    ["cluster", endpointResource({ cluster_id: "other" })],
    ["resource type", endpointResource({ resource_type: "service" })],
    ["namespace", endpointResource({ namespace: "other" })],
  ])("keeps a list item %s boundary mismatch as a hard failure", async (_name, resource) => {
    await expect(createResourcesAdapter(endpoints({
      listInventoryResourcesByType: vi.fn().mockResolvedValue({
        cluster_id: "cluster-1",
        resource_type: "pod",
        resources: [resource],
      }),
    })).listResources("cluster-1", {
      resourceType: "pod",
      namespace: "shop",
    })).rejects.toMatchObject({ code: "invalid-response" });
  });
});
