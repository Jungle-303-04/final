import { describe, expect, it } from "vitest";

import { resolveTrafficResourceKindId, TABS_FOR } from "./devpreview-unified";

describe("traffic relation resource kind", () => {
  it("preserves workload and service kinds when opening detail", () => {
    expect(resolveTrafficResourceKindId("Deployment")).toBe("Deployment");
    expect(resolveTrafficResourceKindId("ReplicaSet")).toBe("ReplicaSet");
    expect(resolveTrafficResourceKindId("Service")).toBe("Service");
  });

  it("matches backend kind casing without inventing unsupported resources", () => {
    expect(resolveTrafficResourceKindId("statefulset")).toBe("StatefulSet");
    expect(resolveTrafficResourceKindId("UnknownKind")).toBeNull();
  });
});

describe("resource detail coverage", () => {
  it.each(["ServiceAccount", "Role", "ClusterRole", "RoleBinding", "ClusterRoleBinding", "Namespace"])(
    "exposes events and access for %s",
    (kind) => {
      expect(TABS_FOR(kind)).toContain("events");
      expect(TABS_FOR(kind)).toContain("rbac");
    },
  );
});
