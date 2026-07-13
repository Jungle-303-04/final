import { describe, expect, it } from "vitest";

import { createEmptyUnifiedFilterState } from "../filters/filterContract";
import {
  createFilteredResourcesRequest,
  createResourceFacetRequest,
  createResourceLabelFacetRequest,
} from "./resourcesFilterRequest";
import { populatedFilterState } from "./createResourcesFilterAdapter.testSupport";

describe("Resources filter canonical requests", () => {
  it.each([
    ["clusters", ["cluster-a", "cluster-b"]],
    ["namespaces", ["cluster-a/shop", "cluster/b/platform"]],
    ["applications", ["app-checkout", "app-platform"]],
  ] as const)("selects and canonicalizes the %s structural axis", (axis, selected) => {
    const state = populatedFilterState();

    expect(createResourceFacetRequest(state, {
      axis,
      cursor: "facet-cursor-1",
      limit: 25,
    })).toEqual({
      axis,
      selected,
      cursor: "facet-cursor-1",
      limit: 25,
    });
  });

  it("converts common and Resources state to one server query", () => {
    const state = populatedFilterState();

    expect(createFilteredResourcesRequest(state, {
      cursor: "resource-cursor-1",
      limit: 100,
    })).toEqual({
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
    });
    expect(state.common.labels).toHaveLength(3);
  });

  it("keeps every Label selector so the endpoint can apply Label AND semantics", () => {
    const request = createResourceLabelFacetRequest(populatedFilterState(), {
      facetQuery: "  team=check  ",
      cursor: "label-cursor-1",
      limit: 40,
    });

    expect(request).toEqual({
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
    });
  });

  it("does not manufacture a cluster, cursor, query, or Label for empty state", () => {
    expect(createFilteredResourcesRequest(createEmptyUnifiedFilterState(), {})).toEqual({
      clusters: [],
      namespaces: [],
      applications: [],
      resourceTypes: [],
      health: [],
      labels: [],
      includeDeleted: false,
    });
  });

  it("rejects invalid Namespace and Label values instead of repairing them", () => {
    const state = populatedFilterState();
    const badNamespace = {
      ...state,
      common: {
        ...state.common,
        namespaces: [{ clusterId: "cluster-a", namespace: "bad namespace" }],
      },
    };
    const badLabel = {
      ...state,
      common: {
        ...state.common,
        labels: [{ key: "UPPER.PREFIX/name", value: "x" }],
      },
    };

    expect(() => createFilteredResourcesRequest(badNamespace, {})).toThrow(TypeError);
    expect(() => createFilteredResourcesRequest(badLabel, {})).toThrow(TypeError);
  });
});
