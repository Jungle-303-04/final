import type { ComponentType } from "react";
import {
  getTimelineCapabilities,
  getTimelineOverview,
  getTimelinePins,
  getTimelineSnapshot,
  removeTimelinePin,
  subscribeTimelineEvents,
  upsertTimelinePin,
} from "../../../api";
import { createTimelineAdapter } from "../../../features/timeline/createTimelineAdapter";
import { createTimelineSurface } from "../../../pages/timeline/createTimelineSurface";

export function loadTimelineSurface(): ComponentType {
  return createTimelineSurface(createTimelineAdapter({
    getTimelineCapabilities,
    getTimelineOverview,
    getTimelinePins,
    getTimelineSnapshot,
    removeTimelinePin,
    subscribeTimelineEvents,
    upsertTimelinePin,
  }));
}
