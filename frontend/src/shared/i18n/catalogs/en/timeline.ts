import type { TimelineMessageKey } from "../../keys/timeline";

export const timelineEn = {
  "timeline.title": "Timeline",
  "timeline.description": "Timeline filters are shareable through the URL. Visualization and event-detail interactions are being mapped in later slices.",
  "timeline.search": "Timeline search",
  "timeline.view": "Timeline view",
  "timeline.view.list": "List",
  "timeline.view.swimlane": "Swimlane",
  "timeline.loading": "Loading timeline data…",
  "timeline.error.title": "Timeline data is unavailable.",
  "timeline.error.description": "The timeline service did not return a usable response.",
  "timeline.action.retry": "Retry timeline",
  "timeline.empty": "No timeline events match this scope.",
  "timeline.count.one": "{count} event is available for the selected scope.",
  "timeline.count.other": "{count} events are available for the selected scope.",
} satisfies Record<TimelineMessageKey, string>;
