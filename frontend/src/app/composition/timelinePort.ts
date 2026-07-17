import {
  getTimelineCapabilities,
  getTimelineOverview,
  getTimelinePins,
  getTimelineSnapshot,
  removeTimelinePin,
  subscribeTimelineEvents,
  upsertTimelinePin,
} from "../../api";
import { createTimelineAdapter } from "../../features/timeline/createTimelineAdapter";
import type { TimelinePort } from "../../features/timeline/timelineContract";

/** One authenticated Timeline adapter shared by every lazy product surface. */
export function createApiTimelinePort(): TimelinePort {
  return createTimelineAdapter({
    getTimelineCapabilities,
    getTimelineOverview,
    getTimelinePins,
    getTimelineSnapshot,
    removeTimelinePin,
    subscribeTimelineEvents,
    upsertTimelinePin,
  });
}
