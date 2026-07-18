import { describe, expect, it } from "vitest";
import {
  decodeResourceTarget,
  decodeResourceDetail,
  decodeResourceSelection,
  encodeResourceTarget,
  encodeResourceDetail,
  encodeResourceSelection,
  resolveResourceType,
} from "./resourcesUrlState";

describe("Resources URL identity", () => {
  it("round-trips the S6 detail path including cluster-scoped resources", () => {
    const namespaced = {
      resourceType: "pod",
      kind: "Pod",
      namespace: "shop",
      name: "checkout-api-0",
    } as const;
    const clusterScoped = { ...namespaced, kind: "Node", namespace: null, name: "worker-a" };

    expect(encodeResourceDetail(namespaced)).toBe("Pod/shop/checkout-api-0");
    expect(decodeResourceDetail("pod", "Pod/shop/checkout-api-0")).toEqual(namespaced);
    expect(encodeResourceDetail(clusterScoped)).toBe("Node/~/worker-a");
    expect(decodeResourceDetail("node", "Node/~/worker-a")).toEqual({
      ...clusterScoped,
      resourceType: "node",
    });
  });

  it("rejects ambiguous S6 detail paths", () => {
    expect(decodeResourceDetail("pod", "Pod/shop/one/more")).toBeNull();
    expect(decodeResourceDetail("pod", "Pod//api-0")).toBeNull();
    expect(decodeResourceDetail(null, "Pod/shop/api-0")).toBeNull();
  });

  it("round-trips backend-valid event names containing colons", () => {
    const identity = {
      resourceType: "event",
      kind: "Event",
      namespace: "shop",
      name: "uid-1:Pod:checkout-api-0:BackOff",
    } as const;

    const selection = encodeResourceSelection(identity);

    expect(selection).toEqual({
      kind: "Event",
      resource: "shop/uid-1:Pod:checkout-api-0:BackOff",
    });
    expect(decodeResourceSelection("event", selection.kind, selection.resource))
      .toEqual(identity);
  });

  it("accepts provider-neutral catalog types and kinds within backend length bounds", () => {
    const identity = {
      resourceType: "custom.io:widget",
      kind: "Custom-Widget",
      namespace: null,
      name: "widget:blue",
    } as const;

    const selection = encodeResourceSelection(identity);

    expect(decodeResourceSelection(identity.resourceType, selection.kind, selection.resource))
      .toEqual(identity);
  });

  it("rejects ambiguous composite identities instead of throwing during decode", () => {
    expect(decodeResourceSelection("event", "Event", "shop/one/two")).toBeNull();
    expect(() => encodeResourceSelection({
      resourceType: "event",
      kind: "Event",
      namespace: "shop",
      name: "one/two",
    })).toThrowError(TypeError);
  });

  it("round-trips a self-contained detail target independently from list filters", () => {
    const identity = {
      resourceType: "custom.io:widget",
      kind: "CustomWidget",
      namespace: "shop",
      name: "blue",
    } as const;

    const selection = encodeResourceTarget("provider/cluster-a", identity);

    expect(selection.resource).toMatch(/^v1\//u);
    expect(decodeResourceTarget("other-cluster", "pod", selection.kind, selection.resource))
      .toEqual({ clusterId: "provider/cluster-a", identity });
  });

  it("keeps reading legacy detail identity with explicit fallback context", () => {
    expect(decodeResourceTarget("cluster-a", "pod", "Pod", "shop/api-0"))
      .toEqual({
        clusterId: "cluster-a",
        identity: {
          resourceType: "pod",
          kind: "Pod",
          namespace: "shop",
          name: "api-0",
        },
      });
    expect(decodeResourceTarget(null, "pod", "Pod", "shop/api-0")).toBeNull();
  });

  it("maps kind-specific legacy paths onto canonical inventory families", () => {
    expect(resolveResourceType("daemonset")).toEqual({ kind: "valid", value: "workload" });
    expect(resolveResourceType("Deployment")).toEqual({ kind: "valid", value: "workload" });
    expect(resolveResourceType("ingress")).toEqual({ kind: "valid", value: "custom_resource" });
    expect(resolveResourceType("node")).toEqual({ kind: "valid", value: "node" });
  });

  it("keeps the legacy underscore token as cluster scope instead of a displayed namespace", () => {
    expect(decodeResourceTarget("cluster-a", "node", "Node", "_/worker-a"))
      .toEqual({
        clusterId: "cluster-a",
        identity: {
          resourceType: "node",
          kind: "Node",
          namespace: null,
          name: "worker-a",
        },
      });
  });

  it.each([
    ["cronjob", "workload", "CronJob", "ops", "nightly"],
    ["configmap", "custom_resource", "ConfigMap", "ops", "settings"],
    ["hpa", "custom_resource", "HorizontalPodAutoscaler", "ops", "api"],
    ["node", "node", "Node", null, "worker-a"],
    ["namespace", "custom_resource", "Namespace", null, "ops"],
    ["event", "event", "Event", "ops", "event-1"],
    ["serviceaccount", "custom_resource", "ServiceAccount", "ops", "api"],
    ["role", "custom_resource", "Role", "ops", "reader"],
    ["clusterrole", "custom_resource", "ClusterRole", null, "reader"],
    ["rolebinding", "custom_resource", "RoleBinding", "ops", "reader"],
    ["clusterrolebinding", "custom_resource", "ClusterRoleBinding", null, "reader"],
  ] as const)(
    "keeps the %s representative detail URL self-contained",
    (legacyPath, resourceType, kind, namespace, name) => {
      expect(resolveResourceType(legacyPath)).toEqual({ kind: "valid", value: resourceType });
      const identity = { resourceType, kind, namespace, name };
      const target = encodeResourceTarget("cluster-1", identity);
      expect(decodeResourceTarget(null, null, target.kind, target.resource)).toEqual({
        clusterId: "cluster-1",
        identity,
      });
    },
  );
});
