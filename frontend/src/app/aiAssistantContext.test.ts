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
      logStreamId: null,
    });
  });

  it("binds only the opaque server stream handle to log-aware AI context", () => {
    const context = createAiAssistantContext(
      "resources",
      createEmptyUnifiedFilterState(),
      {
        detail: null,
        resource: null,
        resourceKind: null,
        tab: null,
        full: false,
        node: null,
      },
      "stream-command-1",
    );

    expect(context.logStreamId).toBe("stream-command-1");
    expect(JSON.stringify(context)).not.toContain("log line");
  });

  it("uses the pods already visible on a single-cluster Home as evidence context", () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-2"];

    const context = createAiAssistantContext("home", state, {
      detail: null,
      resource: null,
      resourceKind: null,
      tab: null,
      full: false,
      node: null,
    });

    expect(context.filters.resourceTypes).toEqual(["pod"]);
    expect(context.filters.clusters).toEqual(["cluster-2"]);
  });
});
