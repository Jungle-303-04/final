import type { TimelineEvent, TimelineWindow } from "../../features/timeline/timelineContract";

export function timelineLensWindow(window: TimelineWindow, requestedWidthMs: number): TimelineWindow {
  const width = boundedLensWidth(window, requestedWidthMs);
  return { fromMs: window.toMs - width, toMs: window.toMs };
}

export function moveTimelineLens(
  window: TimelineWindow,
  lens: TimelineWindow,
  deltaMs: number,
): TimelineWindow {
  const width = lens.toMs - lens.fromMs;
  const lastStart = window.toMs - width;
  const fromMs = Math.min(Math.max(lens.fromMs + deltaMs, window.fromMs), lastStart);
  return { fromMs, toMs: fromMs + width };
}

export function timelineLensAtPosition(
  window: TimelineWindow,
  requestedWidthMs: number,
  position: number,
): TimelineWindow {
  const width = boundedLensWidth(window, requestedWidthMs);
  const fullWidth = window.toMs - window.fromMs;
  const center = window.fromMs + Math.min(Math.max(position, 0), 1) * fullWidth;
  const fromMs = Math.min(
    Math.max(Math.round(center - width / 2), window.fromMs),
    window.toMs - width,
  );
  return { fromMs, toMs: fromMs + width };
}

export function filterTimelineEventsForLens(
  events: readonly TimelineEvent[],
  lens: TimelineWindow,
): readonly TimelineEvent[] {
  return events.filter((event) => {
    const occurredAtMs = Date.parse(event.occurredAt);
    return Number.isFinite(occurredAtMs) && occurredAtMs >= lens.fromMs && occurredAtMs < lens.toMs;
  });
}

function boundedLensWidth(window: TimelineWindow, requestedWidthMs: number): number {
  const fullWidth = window.toMs - window.fromMs;
  if (fullWidth < 1 || !Number.isFinite(requestedWidthMs) || requestedWidthMs < 1) {
    throw new Error("Timeline lens requires a positive server window and duration.");
  }
  return Math.min(Math.round(requestedWidthMs), fullWidth);
}
