import { describe, expect, it, vi } from "vitest";
import { createEmptyUnifiedFilterState } from "../filters/filterContract";
import { createChangeTimelineAdapter } from "./createChangeTimelineAdapter";

describe("change timeline adapter", () => {
  it("forwards unified filters and the server-owned Changes freshness policy", async () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-1"];
    state.resources.includeDeleted = true;
    const getChangeTimeline = vi.fn().mockResolvedValue({ buckets: [], events: [], gaps: [] });
    const getPolicy = vi.fn().mockResolvedValue({
      staleAfterSeconds: 5,
      refreshAfterSeconds: 15,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      eventInvalidation: true,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    });
    const options = { fromMs: 1_000, toMs: 3_000, bucketMs: 1_000 };

    const result = await createChangeTimelineAdapter({
      getChangeTimeline,
      refreshPolicies: { getPolicy },
    })
      .loadChangeTimeline(state, options);

    expect(result).toEqual({
      ...options,
      buckets: [],
      events: [],
      gaps: [],
      freshnessPolicy: {
        staleAfterSeconds: 5,
        refreshAfterSeconds: 15,
        keepLastSuccess: true,
        pauseWhenHidden: true,
        eventInvalidation: true,
        retryAfterSeconds: null,
        retryLimit: null,
        postMutationRefreshAfterSeconds: null,
      },
    });
    expect(getChangeTimeline).toHaveBeenCalledWith(expect.objectContaining({
      clusters: ["cluster-1"],
      fromMs: 1_000,
      toMs: 3_000,
      bucketMs: 1_000,
    }), undefined);
    expect(getChangeTimeline.mock.calls[0]?.[0]).not.toHaveProperty("includeDeleted");
    expect(getPolicy).toHaveBeenCalledWith("changes", undefined);
  });
});
