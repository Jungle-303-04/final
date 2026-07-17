import { describe, expect, it } from "vitest";
import { routeDefinitionForSurface } from "../../app/productRoutes";
import { createEmptyUnifiedFilterState } from "../../features/filters/filterContract";
import { parseProductFilterUrl } from "../../features/filters/filterUrl";
import { clusterResourcesHref } from "./clusterNavigation";

describe("cluster resource navigation", () => {
  it("replaces the cluster scope and preserves every other filter", () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-old"];
    state.common.applications = ["checkout"];
    state.resources.health = ["warning"];

    const href = clusterResourcesHref(state, "cluster-2");
    const parsed = parseProductFilterUrl(href.slice(href.indexOf("?")));

    expect(href.startsWith(`${routeDefinitionForSurface("resources").path}?`)).toBe(true);
    expect(parsed.state.common.clusters).toEqual(["cluster-2"]);
    expect(parsed.state.common.applications).toEqual(["checkout"]);
    expect(parsed.state.resources.health).toEqual(["warning"]);
  });

  it("opens an exact resource kind without discarding the shared scope", () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-old"];
    state.common.namespaces = [{ clusterId: "cluster-2", namespace: "shop" }];
    state.resources.types = ["service"];

    const href = clusterResourcesHref(state, "cluster-2", "pod");
    const parsed = parseProductFilterUrl(href.slice(href.indexOf("?")));

    expect(parsed.state.common.clusters).toEqual(["cluster-2"]);
    expect(parsed.state.common.namespaces).toEqual([
      { clusterId: "cluster-2", namespace: "shop" },
    ]);
    expect(parsed.state.resources.types).toEqual(["pod"]);
  });
});
