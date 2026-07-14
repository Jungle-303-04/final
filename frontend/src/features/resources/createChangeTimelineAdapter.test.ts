import { describe, expect, it, vi } from "vitest";
import { createEmptyUnifiedFilterState } from "../filters/filterContract";
import { createChangeTimelineAdapter } from "./createChangeTimelineAdapter";

describe("change timeline adapter", () => {
  it("forwards unified filters while excluding the current-only deleted toggle", async () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-1"];
    state.resources.includeDeleted = true;
    const getChangeTimeline = vi.fn().mockResolvedValue({ buckets: [], events: [], gaps: [] });
    const options = { fromMs: 1_000, toMs: 3_000, bucketMs: 1_000 };

    const result = await createChangeTimelineAdapter({ getChangeTimeline })
      .loadChangeTimeline(state, options);

    expect(result).toEqual({ ...options, buckets: [], events: [], gaps: [] });
    expect(getChangeTimeline).toHaveBeenCalledWith(expect.objectContaining({
      clusters: ["cluster-1"],
      fromMs: 1_000,
      toMs: 3_000,
      bucketMs: 1_000,
    }), undefined);
    expect(getChangeTimeline.mock.calls[0]?.[0]).not.toHaveProperty("includeDeleted");
  });
});
