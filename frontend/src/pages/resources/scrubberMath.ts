import type { TimelineRange } from "../../features/filters/filterContract";
import type { ChangeTimelineSnapshot } from "../../features/resources/changeTimelineContract";

const RANGE_DURATION_MS: Record<TimelineRange, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};

const RANGE_BUCKET_MS: Record<TimelineRange, number> = {
  "15m": 30_000,
  "1h": 2 * 60_000,
  "6h": 10 * 60_000,
  "24h": 30 * 60_000,
};

export function timelineWindow(range: TimelineRange, toMs: number) {
  return {
    fromMs: toMs - RANGE_DURATION_MS[range],
    toMs,
    bucketMs: RANGE_BUCKET_MS[range],
  };
}

export function clampTimelineMs(value: number, fromMs: number, toMs: number): number {
  return Math.min(toMs, Math.max(fromMs, value));
}

export function timelinePercent(value: number, fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  return ((clampTimelineMs(value, fromMs, toMs) - fromMs) / (toMs - fromMs)) * 100;
}

export function isTimelineGap(
  value: number,
  gaps: ChangeTimelineSnapshot["gaps"],
): boolean {
  return gaps.some((gap) => value >= gap.from && value < gap.to);
}

export function timelinePlaybackStart(timeline: ChangeTimelineSnapshot): number {
  const incident = timeline.events.find((event) => event.kind === "incident");
  return clampTimelineMs(
    incident ? incident.occurredMs - timeline.bucketMs : timeline.fromMs,
    timeline.fromMs,
    timeline.toMs,
  );
}

export function timelinePlaybackStep(timeline: ChangeTimelineSnapshot): number {
  return Math.max(timeline.bucketMs, Math.ceil((timeline.toMs - timeline.fromMs) / 48));
}
