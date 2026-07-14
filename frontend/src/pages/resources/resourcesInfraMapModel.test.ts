import { describe, expect, it } from "vitest";
import type {
  ResourceDetail,
  ResourceSummary,
} from "../../features/resources/resourcesContract";
import {
  INFRA_MAP,
  POD_LIST,
} from "./ResourcesPage.testFixtures";
import { buildInfraMapModel } from "./resourcesInfraMapModel";

describe("buildInfraMapModel", () => {
  it("shows the heaviest Pods per Node and summarizes overflow without a selection", () => {
    const model = buildInfraMapModel({
      detail: null,
      maxPodsPerNode: 1,
      nodes: INFRA_MAP.nodes,
      pods: POD_LIST.items,
    });

    const workerA = model.nodes.find((node) => node.name === "worker-a");
    expect(workerA?.visiblePods.map((pod) => pod.name)).toEqual(["checkout-api-0"]);
    expect(workerA?.hiddenPodCount).toBe(1);
    expect(model.selection.active).toBe(false);
  });

  it("projects a selected Node to the Pods scheduled on that Node", () => {
    const model = buildInfraMapModel({
      detail: detailFor(INFRA_MAP.nodes[0]!),
      nodes: INFRA_MAP.nodes,
      pods: POD_LIST.items,
    });

    const workerA = model.nodes.find((node) => node.name === "worker-a");
    const workerB = model.nodes.find((node) => node.name === "worker-b");
    expect(workerA?.visiblePods.map((pod) => pod.name)).toEqual([
      "checkout-api-0",
      "orders-api-0",
    ]);
    expect(workerB?.visiblePods).toHaveLength(0);
    expect(model.selection.matchedPodCount).toBe(2);
  });

  it("uses related owner resources to find Pods behind a selected controller", () => {
    const selected = workload("checkout-root");
    const relatedOwner = workload("checkout-api");
    const model = buildInfraMapModel({
      detail: {
        ...detailFor(selected),
        related: [{ items: [relatedOwner], name: "Owned resources" }],
      },
      nodes: INFRA_MAP.nodes,
      pods: POD_LIST.items,
    });

    expect(model.selection.active).toBe(true);
    expect(model.selection.matchedPodCount).toBe(1);
    expect(model.nodes.flatMap((node) => node.visiblePods.map((pod) => pod.name)))
      .toEqual(["checkout-api-0"]);
  });
});

function detailFor(resource: ResourceSummary): ResourceDetail {
  return {
    clusterId: resource.clusterId,
    events: [],
    eventsCompleteness: "unknown",
    identity: {
      kind: resource.kind,
      name: resource.name,
      namespace: resource.namespace,
      resourceType: resource.resourceType,
    },
    related: [],
    relatedCompleteness: "unknown",
    resource,
  };
}

function workload(name: string): ResourceSummary {
  return {
    ...POD_LIST.items[0]!,
    facts: {
      availableReplicas: 1,
      desiredReplicas: 1,
      generation: 1,
      observedGeneration: 1,
      readyReplicas: 1,
      type: "workload",
      unavailableReplicas: 0,
      updatedReplicas: 1,
    },
    id: `workload:${name}`,
    kind: "Deployment",
    name,
    resourceType: "workload",
    uid: `uid-${name}`,
  };
}
