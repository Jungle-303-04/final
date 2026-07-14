import { describe, expect, it, vi } from "vitest";
import { createGlobalFilterAdapter } from "./createGlobalFilterAdapter";

describe("createGlobalFilterAdapter", () => {
  it("flattens server-defined groups without inventing axes or counts", async () => {
    const listGlobalFilterFacets = vi.fn(async () => ({
      clusters: [{ id: "cluster-a", label: "Production", count: 8, count_completeness: "exact" as const }],
      namespaces: [{ id: "cluster-a/shop", label: "shop", cluster_id: "cluster-a", count: 4, count_completeness: "exact" as const }],
      applications: [{ id: "checkout", label: "Checkout", count: 3, count_completeness: "partial" as const }],
      labels: [{ key: "team", value: "checkout", count: 2, count_completeness: "exact" as const }],
      resources: [{ id: "resource-a", label: "checkout-api", kind: "Deployment", count: 1, count_completeness: "exact" as const }],
    }));
    const adapter = createGlobalFilterAdapter({ listGlobalFilterFacets });
    const selection = {
      clusters: ["cluster-a"],
      namespaces: [],
      applications: [],
      labels: ["team=platform"],
    };

    await expect(adapter.search(" check ", selection)).resolves.toEqual([
      { type: "cluster", id: "cluster-a", label: "Production", count: 8, count_completeness: "exact" },
      { type: "namespace", id: "cluster-a/shop", label: "shop", clusterId: "cluster-a", count: 4, count_completeness: "exact" },
      { type: "application", id: "checkout", label: "Checkout", count: 3, count_completeness: "partial" },
      { type: "label", id: "team=checkout", label: "team=checkout", key: "team", value: "checkout", count: 2, count_completeness: "exact" },
      { type: "resource", id: "resource-a", label: "checkout-api", kind: "Deployment", count: 1, count_completeness: "exact" },
    ]);
    expect(listGlobalFilterFacets).toHaveBeenCalledWith({ ...selection, q: "check" }, undefined);
  });
});
