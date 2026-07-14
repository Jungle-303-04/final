import { describe, expect, it } from "vitest";

import { createEmptyUnifiedFilterState } from "./filterContract";
import {
  deriveResourceTopologyView,
  hasResourceTopologyFilters,
  resolveResourceTopologyView,
} from "./resourceTopologyView";

describe("resource topology view", () => {
  it("derives the view from filters without creating a pin", () => {
    const clusterOnly = createEmptyUnifiedFilterState();
    clusterOnly.common.clusters = ["cluster-1"];
    expect(deriveResourceTopologyView(clusterOnly)).toBe("physical");

    const application = createEmptyUnifiedFilterState();
    application.common.applications = ["checkout"];
    expect(deriveResourceTopologyView(application)).toBe("relations");

    const applicationPods = createEmptyUnifiedFilterState();
    applicationPods.common.applications = ["checkout"];
    applicationPods.resources.types = ["pod"];
    expect(deriveResourceTopologyView(applicationPods)).toBe("physical");

    const mixedObjects = createEmptyUnifiedFilterState();
    mixedObjects.resources.types = ["pod", "service", "workload"];
    expect(deriveResourceTopologyView(mixedObjects)).toBe("relations");
    expect(deriveResourceTopologyView(clusterOnly, { incidentSelected: true }))
      .toBe("relations");
  });

  it("gives an explicit pin priority and detects the all-filter reset boundary", () => {
    const state = createEmptyUnifiedFilterState();
    state.common.applications = ["checkout"];
    expect(resolveResourceTopologyView(state, "physical")).toBe("physical");
    expect(hasResourceTopologyFilters(state)).toBe(true);
    expect(hasResourceTopologyFilters(createEmptyUnifiedFilterState())).toBe(false);
  });
});
