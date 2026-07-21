// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useResourceAccess } from "./resourceAccessFeed";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

describe("resource access feed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses exact subject access for ServiceAccount resources", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({
      type: "subject", observed_at: "2026-07-21T00:00:00Z",
      subject: { kind: "ServiceAccount", namespace: "shop", name: "checkout" },
      direct: [], inherited_from_groups: [], flat: [], truncated: false, used_by_pods: [],
    }));
    const rendered = renderHook(() => useResourceAccess("game-server", "ServiceAccount", "shop", "checkout"));
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/rbac/subject/ServiceAccount/shop/checkout");
  });

  it("uses the honest namespace summary for workload permission context", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({
      type: "namespace", observed_at: "2026-07-21T00:00:00Z", namespace: "shop",
      role_bindings: [], cluster_role_bindings_with_local_subject: [], service_account_count: 3,
    }));
    const rendered = renderHook(() => useResourceAccess("game-server", "Deployment", "shop", "checkout"));
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/rbac/namespace/shop");
  });

  it("keeps unsupported cluster-scoped resource access idle", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const rendered = renderHook(() => useResourceAccess("game-server", "Node", null, "node-a"));
    expect(rendered.result.current.status).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads a Namespace by its resource name without requiring a row namespace", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({
      type: "namespace", observed_at: "2026-07-21T00:00:00Z", namespace: "shop",
      role_bindings: [], cluster_role_bindings_with_local_subject: [], service_account_count: 3,
    }));
    const rendered = renderHook(() => useResourceAccess("game-server", "Namespace", null, "shop"));
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/rbac/namespace/shop");
  });
});
