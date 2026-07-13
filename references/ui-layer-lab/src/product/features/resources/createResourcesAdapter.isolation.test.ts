import { describe, expect, it } from "vitest";
import { createResourcesAdapter } from "./createResourcesAdapter";
import {
  endpoints,
  endpointResource,
  RESOURCE_DETAIL,
} from "./createResourcesAdapter.testSupport";

describe("canonical Resources failure isolation", () => {
  it.each([
    ["pod", { cpu_mcores: "lots" }, "cpuMillicores", null],
    ["node", { ready: "yes" }, "ready", null],
    ["workload", { ready_replicas: -1 }, "readyReplicas", null],
    ["service", { ports: "not-an-array" }, "ports", []],
    ["event", { first_timestamp: "yesterday" }, "firstSeenAt", null],
  ] as const)(
    "downgrades an invalid optional %s fact without dropping the resource",
    async (resourceType, summary, field, expectedValue) => {
      const resource = endpointResource({
        inventory_key: `inventory-${resourceType}-1`,
        resource_type: resourceType,
        kind: resourceType === "event" ? "Event" : "Example",
        name: `${resourceType}-1`,
        uid: `uid-${resourceType}-1`,
        summary,
      });
      const result = await createResourcesAdapter(endpoints({
        listInventoryResourcesByType: () => Promise.resolve({
          cluster_id: "cluster-1",
          resource_type: resourceType,
          resources: [resource],
        }),
      })).listResources("cluster-1", { resourceType });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.facts).toMatchObject({ [field]: expectedValue });
      expect(result).toMatchObject({
        excludedCount: 0,
        dataQualityWarnings: [{
          code: "optional-fact-unavailable",
          section: "list",
          field,
          rowIndex: 0,
          group: null,
        }],
      });
    },
  );

  it("excludes only malformed and duplicate list rows", async () => {
    const valid = endpointResource();
    const invalid = endpointResource({
      inventory_key: "inventory-invalid",
      name: " ",
      uid: "uid-invalid",
    });
    const duplicate = endpointResource({ inventory_key: "inventory-duplicate" });
    const result = await createResourcesAdapter(endpoints({
      listInventoryResourcesByType: () => Promise.resolve({
        cluster_id: "cluster-1",
        resource_type: "pod",
        resources: [valid, invalid, duplicate],
      }),
    })).listResources("cluster-1", { resourceType: "pod", limit: 3 });

    expect(result.items.map(({ name }) => name)).toEqual(["checkout-api-0"]);
    expect(result).toMatchObject({
      returned: 1,
      limitReached: true,
      excludedCount: 2,
      dataQualityWarnings: [
        {
          code: "invalid-resource-excluded",
          section: "list",
          field: null,
          rowIndex: 1,
          group: null,
        },
        {
          code: "duplicate-resource-excluded",
          section: "list",
          field: null,
          rowIndex: 2,
          group: null,
        },
      ],
    });
  });

  it("isolates malformed related and event rows with explicit counts", async () => {
    const relatedPod = RESOURCE_DETAIL.related.pods?.[0];
    if (!relatedPod) throw new Error("RESOURCE_DETAIL fixture must include one related pod");
    const invalidRelated = endpointResource({
      inventory_key: "inventory-related-invalid",
      name: " ",
      uid: "uid-related-invalid",
    });
    const invalidEvent = endpointResource({
      inventory_key: "inventory-event-invalid",
      resource_type: "event",
      kind: "Event",
      name: "bad-event",
      uid: "uid-event-invalid",
      observed_at: "yesterday",
    });
    const result = await createResourcesAdapter(endpoints({
      getInventoryResourceDetail: () => Promise.resolve({
        ...RESOURCE_DETAIL,
        related: {
          pods: [relatedPod, invalidRelated],
        },
        events: [...RESOURCE_DETAIL.events, invalidEvent],
      }),
    })).loadResourceDetail("cluster-1", {
      resourceType: "service",
      kind: "Service",
      namespace: "shop",
      name: "checkout",
    });

    expect(result.related[0]).toMatchObject({ excludedCount: 1 });
    expect(result.related[0]?.items).toHaveLength(1);
    expect(result.events).toHaveLength(1);
    expect(result).toMatchObject({
      relatedExcludedCount: 1,
      eventExcludedCount: 1,
      dataQualityWarnings: [
        {
          code: "invalid-resource-excluded",
          section: "related",
          field: null,
          rowIndex: 1,
          group: "pods",
        },
        {
          code: "invalid-resource-excluded",
          section: "events",
          field: null,
          rowIndex: 1,
          group: null,
        },
      ],
    });
  });

  it("downgrades an invalid primary detail fact while preserving the detail", async () => {
    const result = await createResourcesAdapter(endpoints({
      getInventoryResourceDetail: () => Promise.resolve({
        ...RESOURCE_DETAIL,
        resource: {
          ...RESOURCE_DETAIL.resource,
          summary: { type: "ClusterIP", ports: "invalid" },
        },
      }),
    })).loadResourceDetail("cluster-1", {
      resourceType: "service",
      kind: "Service",
      namespace: "shop",
      name: "checkout",
    });

    expect(result.resource.facts).toMatchObject({ type: "service", ports: [] });
    expect(result).toMatchObject({
      relatedExcludedCount: 0,
      eventExcludedCount: 0,
      dataQualityWarnings: [{
        code: "optional-fact-unavailable",
        section: "resource",
        field: "ports",
        rowIndex: null,
        group: null,
      }],
    });
  });
});
