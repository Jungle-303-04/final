import { describe, expect, it, vi } from "vitest";

import { createResourcesFilterAdapter } from "./createResourcesFilterAdapter";
import {
  filterEndpoints,
  populatedFilterState,
} from "./createResourcesFilterAdapter.testSupport";

describe("Resources filter adapter", () => {
  it("loads exactly one structural facet page and forwards its signal", async () => {
    const dependencies = filterEndpoints();
    const controller = new AbortController();
    const port = createResourcesFilterAdapter(dependencies);

    const page = await port.listFacetPage(populatedFilterState(), {
      axis: "clusters",
      cursor: "facet-cursor-1",
      limit: 25,
    }, controller.signal);

    expect(page.selectedResolutions.map(
      (resolution: { status: string }) => resolution.status,
    )).toEqual([
      "restricted",
      "unresolved",
    ]);
    expect(dependencies.listResourceFilterFacets).toHaveBeenCalledTimes(1);
    expect(dependencies.listResourceFilterFacets).toHaveBeenCalledWith({
      axis: "clusters",
      selected: ["cluster-a", "cluster-b"],
      cursor: "facet-cursor-1",
      limit: 25,
    }, controller.signal);
    expect(dependencies.listFilteredResources).not.toHaveBeenCalled();
    expect(dependencies.listResourceLabelFacets).not.toHaveBeenCalled();
  });

  it("loads one server-filtered resource page without per-cluster fan-out", async () => {
    const canonical = filterEndpoints();
    const legacyInventory = vi.fn();
    const syntheticFallback = vi.fn();
    const dependencies = {
      ...canonical,
      listInventoryResourcesByType: legacyInventory,
      listSyntheticResources: syntheticFallback,
    };
    const controller = new AbortController();
    const result = await createResourcesFilterAdapter(dependencies).listResourcePage(
      populatedFilterState(),
      { cursor: "resource-cursor-1", limit: 100 },
      controller.signal,
    );

    expect(canonical.listFilteredResources).toHaveBeenCalledTimes(1);
    expect(canonical.listFilteredResources).toHaveBeenCalledWith({
      clusters: ["cluster-a", "cluster-b"],
      namespaces: ["cluster-a/shop", "cluster/b/platform"],
      applications: ["app-checkout", "app-platform"],
      resourceTypes: ["pod", "workload"],
      health: ["degraded", "healthy"],
      labels: ["team=checkout", "tier=canary", "tier=critical"],
      query: "checkout api",
      includeDeleted: true,
      cursor: "resource-cursor-1",
      limit: 100,
    }, controller.signal);
    expect(legacyInventory).not.toHaveBeenCalled();
    expect(syntheticFallback).not.toHaveBeenCalled();
    expect(canonical.listResourceFilterFacets).not.toHaveBeenCalled();
    expect(canonical.listResourceLabelFacets).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({
      cluster: { provider: "private-cloud/future" },
      applicationIds: ["app-checkout", "app-platform"],
      applicationBindingCompleteness: "partial",
    });
  });

  it("loads one server-counted Label page with the full Label AND selection", async () => {
    const dependencies = filterEndpoints();
    const controller = new AbortController();
    const page = await createResourcesFilterAdapter(dependencies).listLabelFacetPage(
      populatedFilterState(),
      { facetQuery: "team=check", cursor: "label-cursor-1", limit: 40 },
      controller.signal,
    );

    expect(dependencies.listResourceLabelFacets).toHaveBeenCalledTimes(1);
    expect(dependencies.listResourceLabelFacets).toHaveBeenCalledWith({
      clusters: ["cluster-a", "cluster-b"],
      namespaces: ["cluster-a/shop", "cluster/b/platform"],
      applications: ["app-checkout", "app-platform"],
      resourceTypes: ["pod", "workload"],
      health: ["degraded", "healthy"],
      labels: ["team=checkout", "tier=canary", "tier=critical"],
      query: "checkout api",
      includeDeleted: true,
      facetQuery: "team=check",
      cursor: "label-cursor-1",
      limit: 40,
    }, controller.signal);
    expect(page.items).toEqual([{
      key: "team",
      value: "checkout",
      selector: "team=checkout",
      matchCount: 18,
      countCompleteness: "partial",
    }]);
    expect(page.counts.filteredCount).toBeNull();
    expect(dependencies.listFilteredResources).not.toHaveBeenCalled();
    expect(dependencies.listResourceFilterFacets).not.toHaveBeenCalled();
  });
});
