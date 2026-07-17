import { describe, expect, it } from "vitest";

import type { ResourceSummary } from "./resourcesContract";
import {
  buildRelationTopologyGraphModel,
  exactRelationNodeId,
  exactRelationResourceIdentity,
  relationNodeHealthTone,
} from "./relationTopologyGraphModel";

describe("relation topology graph model", () => {
  it("separates truly disconnected resources and preserves typed directed edges", () => {
    const model = buildRelationTopologyGraphModel({
      nodes: [
        relationNode("workload-1", "workload", "Deployment", "api", "Ready"),
        relationNode("pod-1", "pod", "Pod", "api-abc", "CrashLoopBackOff"),
        relationNode("service-1", "service", "Service", "api", "Ready"),
        relationNode("config-1", "configmap", "ConfigMap", "api-config", "Active"),
      ],
      edges: [
        { from: "workload-1", to: "pod-1", type: "owns" },
        { from: "service-1", to: "pod-1", type: "selects" },
      ],
    }, new Set());

    expect(model.connected.map((node) => node.resource.id)).toEqual([
      "workload-1",
      "pod-1",
      "service-1",
    ]);
    expect(model.disconnected.map((node) => node.resource.id)).toEqual(["config-1"]);
    expect(model.edges.map((edge) => [edge.from, edge.type, edge.to, edge.tone])).toEqual([
      ["workload-1", "owns", "pod-1", "critical"],
      ["service-1", "selects", "pod-1", "critical"],
    ]);
    expect(model.edgeCounts).toEqual({ owns: 1, runs_on: 0, selects: 1, routes_to: 0 });
  });

  it("does not mislabel a resource as disconnected when its peer kind is hidden", () => {
    const model = buildRelationTopologyGraphModel({
      nodes: [
        relationNode("workload-1", "workload", "Deployment", "api", "Ready"),
        relationNode("pod-1", "pod", "Pod", "api-abc", "Running"),
      ],
      edges: [{ from: "workload-1", to: "pod-1", type: "owns" }],
    }, new Set(["Pod"]));

    expect(model.disconnected).toEqual([]);
    expect(model.connected[0]).toMatchObject({
      resource: { id: "workload-1" },
      degree: 1,
      visibleDegree: 0,
      hiddenRelationCount: 1,
    });
    expect(model.edges).toEqual([]);
  });

  it("classifies only observed status and keeps unrecognized values unknown", () => {
    expect(relationNodeHealthTone("Ready")).toBe("healthy");
    expect(relationNodeHealthTone("Pending")).toBe("warning");
    expect(relationNodeHealthTone("ImagePullBackOff")).toBe("critical");
    expect(relationNodeHealthTone("custom-controller-state")).toBe("unknown");
  });

  it("opens canonical identity only through an exact inventory key match", () => {
    const resources = [resource("real-inventory-key")];

    expect(exactRelationResourceIdentity("real-inventory-key", resources)).toEqual({
      resourceType: "pod",
      kind: "Pod",
      namespace: "shop",
      name: "checkout-api-0",
    });
    expect(exactRelationResourceIdentity("pod:shop/checkout-api-0", resources)).toBeNull();
    expect(exactRelationNodeId({
      resourceType: "pod",
      kind: "Pod",
      namespace: "shop",
      name: "checkout-api-0",
    }, resources)).toBe("real-inventory-key");
  });
});

function relationNode(
  id: string,
  resourceType: string,
  kind: string,
  name: string,
  status: string,
) {
  return {
    id,
    identity: {
      resourceType,
      kind,
      namespace: "shop",
      name,
    },
    kind,
    name,
    status,
  };
}

function resource(inventoryKey: string): ResourceSummary {
  return {
    id: inventoryKey,
    inventoryKey,
    identityStability: "uid",
    uid: "pod-uid",
    clusterId: "cluster-1",
    resourceType: "pod",
    apiVersion: "v1",
    kind: "Pod",
    namespace: "shop",
    name: "checkout-api-0",
    status: "Running",
    health: "healthy",
    healthStatus: "Ready",
    facts: { type: "generic" },
    observedAt: "2026-07-15T01:00:00Z",
    firstSeenAt: null,
    lastSeenAt: null,
    deletedAt: null,
  };
}
