import type { TimelineEvent, TimelineWindow } from "../../features/timeline/timelineContract";
import {
  isTimelineLensWithinWindow,
  type TimelineLens,
} from "../../features/filters/timelineUrlState";

/** Resolves a local lens against the server-provided snapshot bounds only. */
export function resolveTimelineLens(selection: TimelineWindow, lens: TimelineLens): TimelineWindow {
  if (lens.kind === "selection") return selection;
  if (lens.kind === "trailing") return timelineLensWindow(selection, lens.widthMs);
  return isTimelineLensWithinWindow(lens, selection)
    ? { fromMs: lens.fromMs, toMs: lens.toMs }
    : selection;
}

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

/** Keeps the same visual center where possible when a server zoom rung changes. */
export function resizeTimelineLens(
  selection: TimelineWindow,
  lens: TimelineWindow,
  requestedWidthMs: number,
): TimelineWindow {
  const width = boundedLensWidth(selection, requestedWidthMs);
  const center = lens.fromMs + (lens.toMs - lens.fromMs) / 2;
  const fromMs = Math.min(
    Math.max(Math.round(center - width / 2), selection.fromMs),
    selection.toMs - width,
  );
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
