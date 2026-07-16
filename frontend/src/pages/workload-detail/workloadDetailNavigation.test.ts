import { describe, expect, it } from "vitest";

import { parseWorkloadDetailRoute, workloadDetailHref } from "./workloadDetailNavigation";

describe("Workload Detail URL state", () => {
  it("preserves the source apiGroup and tab names while requiring product apiVersion identity", () => {
    const route = parseWorkloadDetailRoute(
      { kind: "Deployment", namespace: "shop", name: "checkout" },
      new URLSearchParams("cluster=cluster-a&apiGroup=apps&apiVersion=v1&tab=logs"),
    );

    expect(route).toEqual({
      clusterId: "cluster-a",
      apiGroup: "apps",
      apiVersion: "v1",
      kind: "Deployment",
      namespace: "shop",
      name: "checkout",
      tab: "logs",
    });
    expect(workloadDetailHref(route!, "events")).toBe(
      "/workload/Deployment/shop/checkout?cluster=cluster-a&apiGroup=apps&apiVersion=v1&tab=events",
    );
  });

  it("uses underscore for cluster scope and rejects incomplete exact identity", () => {
    expect(workloadDetailHref({
      clusterId: "cluster-a",
      apiGroup: "",
      apiVersion: "v1",
      kind: "Node",
      namespace: null,
      name: "worker-a",
    })).toBe("/workload/Node/_/worker-a?cluster=cluster-a&apiGroup=&apiVersion=v1");
    expect(parseWorkloadDetailRoute(
      { kind: "Deployment", namespace: "shop", name: "checkout" },
      new URLSearchParams("cluster=cluster-a&apiGroup=apps"),
    )).toBeNull();
  });
});
