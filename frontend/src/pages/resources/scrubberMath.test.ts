import { describe, expect, it } from "vitest";
import type { ChangeTimelineSnapshot } from "../../features/resources/changeTimelineContract";
import {
  browserReplayWindow,
  clampTimelineMs,
  isTimelineGap,
  timelinePercent,
  timelinePlaybackEnd,
  timelinePlaybackStart,
  timelinePlaybackStep,
  timelineWindow,
} from "./scrubberMath";

const timeline: ChangeTimelineSnapshot = {
  fromMs: 1_000,
  toMs: 13_000,
  bucketMs: 1_000,
  buckets: [],
  gaps: [{ from: 3_000, to: 5_000 }],
  events: [{
    id: "incident-1",
    kind: "incident",
    occurredMs: 8_000,
    title: "Readiness failed",
    severity: "critical",
  }],
};

describe("timeline scrubber math", () => {
  it("keeps query ranges and bucket sizes deterministic", () => {
    expect(timelineWindow("15m", 1_000_000)).toEqual({
      fromMs: 100_000,
      toMs: 1_000_000,
      bucketMs: 30_000,
    });
    expect(timelineWindow("24h", 86_500_000).fromMs).toBe(100_000);
  });

  it("clamps percentages without inventing data", () => {
    expect(clampTimelineMs(0, 1_000, 13_000)).toBe(1_000);
    expect(timelinePercent(7_000, 1_000, 13_000)).toBe(50);
    expect(isTimelineGap(4_000, timeline.gaps)).toBe(true);
    expect(isTimelineGap(5_000, timeline.gaps)).toBe(false);
  });

  it("starts immediately before the first incident and advances in bounded steps", () => {
    expect(timelinePlaybackStart(timeline)).toBe(7_000);
    expect(timelinePlaybackStep(timeline)).toBe(1_000);
    expect(timelinePlaybackStep({ ...timeline, bucketMs: 120_000 })).toBe(1_000);
    expect(timelinePlaybackStart({ ...timeline, events: [] })).toBe(1_000);
  });

  it("limits replay to the intersection with the actual browser buffer", () => {
    expect(browserReplayWindow(timeline, { fromMs: 2_000, toMs: 4_000 }))
      .toEqual({ fromMs: 2_000, toMs: 4_000 });
    expect(browserReplayWindow(timeline, { fromMs: 20_000, toMs: 30_000 })).toBeNull();
    expect(browserReplayWindow(timeline, { fromMs: null, toMs: null })).toBeNull();
    expect(timelinePlaybackEnd(timeline, { fromMs: 2_000, toMs: 4_000 })).toBe(4_000);
  });
});
