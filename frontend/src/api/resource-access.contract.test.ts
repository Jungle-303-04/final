import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getKubernetesNamespaceAccess,
  getKubernetesRoleAccess,
  getKubernetesSubjectAccess,
} from "./resource-access";

const json = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "content-type": "application/json" },
});

const role = { kind: "Role" as const, namespace: "shop", name: "reader" };
const binding = { kind: "RoleBinding" as const, namespace: "shop", name: "readers", role };

describe("Kubernetes resource access API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads a namespaced ServiceAccount subject", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      type: "subject", observed_at: "2026-07-21T00:00:00Z",
      subject: { kind: "ServiceAccount", namespace: "shop", name: "checkout" },
      direct: [{ binding, role, rules: [], scope_namespace: "shop" }],
      inherited_from_groups: [], flat: [], truncated: false, used_by_pods: [],
    }));
    await expect(getKubernetesSubjectAccess({ clusterId: "game-server", kind: "ServiceAccount", namespace: "shop", name: "checkout" })).resolves.toMatchObject({ type: "subject" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rbac/subject/ServiceAccount/shop/checkout?cluster_id=game-server");
  });

  it("loads a ClusterRole through the global namespace marker", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      type: "role", observed_at: "2026-07-21T00:00:00Z",
      role: { kind: "ClusterRole", namespace: "", name: "view" }, bindings: [],
    }));
    await expect(getKubernetesRoleAccess({ clusterId: "game-server", kind: "ClusterRole", name: "view" })).resolves.toMatchObject({ type: "role" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rbac/role/ClusterRole/_/view?cluster_id=game-server");
  });

  it("loads namespace access without fabricating resource-level permission", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      type: "namespace", observed_at: "2026-07-21T00:00:00Z", namespace: "shop",
      role_bindings: [], cluster_role_bindings_with_local_subject: [], service_account_count: 4,
    }));
    await expect(getKubernetesNamespaceAccess({ clusterId: "game-server", namespace: "shop" })).resolves.toMatchObject({ type: "namespace", service_account_count: 4 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rbac/namespace/shop?cluster_id=game-server");
  });

  it("fails closed on an unexpected payload field", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      type: "namespace", observed_at: "2026-07-21T00:00:00Z", namespace: "shop",
      role_bindings: [], cluster_role_bindings_with_local_subject: [], service_account_count: 4,
      fabricated: true,
    }));
    await expect(getKubernetesNamespaceAccess({ clusterId: "game-server", namespace: "shop" })).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});
