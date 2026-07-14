import { describe, expect, it } from "vitest";

import { createEmptyUnifiedFilterState } from "../features/filters/filterContract";
import { createAiAssistantContext } from "./aiAssistantContext";

describe("AI assistant shell context", () => {
  it("projects only visible filters and the canonical resource selection", () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-1"];
    state.common.namespaces = [{ clusterId: "cluster-1", namespace: "shop" }];
    state.common.labels = [{ key: "team", value: "checkout" }];
    state.resources.types = ["pod"];

    expect(createAiAssistantContext("resources", state, {
      detail: "Pod/shop/checkout-api-0",
      resource: null,
      resourceKind: null,
      tab: null,
      full: false,
      node: null,
    })).toEqual({
      screen: "resources",
      filters: {
        clusters: ["cluster-1"],
        namespaces: ["cluster-1/shop"],
        applications: [],
        labels: ["team=checkout"],
        resourceTypes: ["pod"],
        health: [],
        query: "",
      },
      selection: { type: "resource", identity: "Pod/shop/checkout-api-0" },
      time: null,
    });
  });
});
