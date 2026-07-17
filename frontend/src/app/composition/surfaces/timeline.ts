import type { ComponentType } from "react";
import type { TimelinePort } from "../../../features/timeline/timelineContract";
import { createTimelineSurface } from "../../../pages/timeline/createTimelineSurface";
import type { RcaContextPort } from "../../../features/issues/rcaContextContract";

export function loadTimelineSurface(port: TimelinePort, rcaContextPort: RcaContextPort): ComponentType {
  return createTimelineSurface(port, rcaContextPort);
}
