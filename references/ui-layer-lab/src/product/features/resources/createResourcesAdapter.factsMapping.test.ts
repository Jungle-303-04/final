import { describe, expect, it } from "vitest";
import { createResourcesAdapter } from "./createResourcesAdapter";
import {
  endpoints,
  endpointResource,
} from "./createResourcesAdapter.testSupport";

describe("canonical Resources fact mapping", () => {
  it("feature-narrows Node and Workload summaries", async () => {
    const node = endpointResource({
      inventory_key: "inventory-node-1",
      resource_type: "node",
      kind: "Node",
      namespace: null,
      name: "worker-a",
      uid: "uid-node-1",
      summary: {
        ready: true,
        allocatable: { pods: "110", cpu: "4", memory: "16Gi" },
        cpu_mcores: 830,
        mem_mib: 4096,
        cpu_ratio: 0.2075,
        mem_ratio: 0.25,
      },
    });
    const workload = endpointResource({
      inventory_key: "inventory-workload-1",
      resource_type: "workload",
      kind: "Deployment",
      name: "checkout-api",
      uid: "uid-workload-1",
      summary: {
        desired_replicas: 3,
        ready_replicas: 2,
        available_replicas: 2,
        updated_replicas: 3,
        unavailable_replicas: 1,
        generation: 12,
        observed_generation: 12,
      },
    });

    const nodeResult = await createResourcesAdapter(endpoints({
      listInventoryResourcesByType: () => Promise.resolve({
        cluster_id: "cluster-1",
        resource_type: "node",
        resources: [node],
      }),
    })).listResources("cluster-1", { resourceType: "node" });
    const workloadResult = await createResourcesAdapter(endpoints({
      listInventoryResourcesByType: () => Promise.resolve({
        cluster_id: "cluster-1",
        resource_type: "workload",
        resources: [workload],
      }),
    })).listResources("cluster-1", { resourceType: "workload" });

    expect(nodeResult.items[0]?.facts).toEqual({
      type: "node",
      ready: true,
      podCapacity: 110,
      cpuMillicores: 830,
      memoryMebibytes: 4096,
      cpuRatio: 0.2075,
      memoryRatio: 0.25,
    });
    expect(workloadResult.items[0]?.facts).toEqual({
      type: "workload",
      desiredReplicas: 3,
      readyReplicas: 2,
      availableReplicas: 2,
      updatedReplicas: 3,
      unavailableReplicas: 1,
      generation: 12,
      observedGeneration: 12,
    });
  });

  it("preserves the explicit include-deleted scope without claiming full pagination", async () => {
    const dependencies = endpoints({
      listInventoryResourcesByType: () => Promise.resolve({
        cluster_id: "cluster-1",
        resource_type: "pod",
        resources: [endpointResource({ deleted_at: "2026-07-12T10:01:00Z" })],
      }),
    });

    await expect(createResourcesAdapter(dependencies).listResources("cluster-1", {
      resourceType: "pod",
      includeDeleted: true,
      limit: 200,
    })).resolves.toMatchObject({
      includeDeleted: true,
      completeness: "unknown",
      limit: 200,
      returned: 1,
      limitReached: false,
      items: [{ deletedAt: "2026-07-12T10:01:00.000Z" }],
    });
    expect(dependencies.listInventoryResourcesByType).toHaveBeenCalledWith(
      "cluster-1",
      {
        resourceType: "pod",
        namespace: null,
        includeDeleted: true,
        limit: 200,
      },
      undefined,
    );
  });

  it("maps an unrecognized resource type to generic facts without exposing open summary data", async () => {
    const custom = endpointResource({
      inventory_key: "inventory-custom-1",
      resource_type: "custom",
      api_version: "",
      kind: "FutureResource",
      name: "future-resource",
      uid: "uid-custom-1",
      summary: { secret_nested_state: { must_not_reach_product_state: true } },
    });
    const result = await createResourcesAdapter(endpoints({
      listInventoryResourcesByType: () => Promise.resolve({
        cluster_id: "cluster-1",
        resource_type: "custom",
        resources: [custom],
      }),
    })).listResources("cluster-1", { resourceType: "custom" });

    expect(result.items[0]).toMatchObject({
      resourceType: "custom",
      apiVersion: "",
      facts: { type: "generic" },
    });
    expect(JSON.stringify(result)).not.toContain("must_not_reach_product_state");
  });
});
