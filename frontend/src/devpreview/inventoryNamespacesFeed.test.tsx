// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useInventoryNamespaces } from "./inventoryNamespacesFeed";

describe("useInventoryNamespaces", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads pod namespace counts through one bounded global facet request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      clusters: [],
      namespaces: [
        counted("cluster-a/default", "default", 8, { cluster_id: "cluster-a" }),
        counted("cluster-b/default", "default", 5, { cluster_id: "cluster-b" }),
        counted("cluster-a/shop", "shop", 3, { cluster_id: "cluster-a" }),
      ],
      applications: [],
      resource_types: [],
      labels: [],
      resources: [],
    }));

    const rendered = renderHook(() => useInventoryNamespaces(["cluster-b", "cluster-a"]));
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/filter-facets?clusters=cluster-a%2Ccluster-b&resources.types=pod",
    );
    expect(rendered.result.current.items).toEqual([
      { namespace: "default", podCount: 13 },
      { namespace: "shop", podCount: 3 },
    ]);
  });

  it("does not query when its surface is inactive", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const rendered = renderHook(() => useInventoryNamespaces([]));
    expect(rendered.result.current).toEqual({ status: "ready", items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function counted(
  id: string,
  label: string,
  count: number,
  extra: Record<string, unknown> = {},
) {
  return { id, label, count, count_completeness: "exact", ...extra };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
