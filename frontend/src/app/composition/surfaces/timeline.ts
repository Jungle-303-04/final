import type { ComponentType } from "react";
import type { TimelinePort } from "../../../features/timeline/timelineContract";
import { createTimelineSurface } from "../../../pages/timeline/createTimelineSurface";

export function loadTimelineSurface(port: TimelinePort): ComponentType {
  return createTimelineSurface(port);
}
