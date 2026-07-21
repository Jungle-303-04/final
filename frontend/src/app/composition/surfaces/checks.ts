import type { ComponentType } from "react";
import { getChecksDetail, getChecksOverview } from "../../../api";
import { createChecksAdapter } from "../../../features/checks/createChecksAdapter";
import { createChecksSurface } from "../../../pages/checks/createChecksSurface";

export function loadChecksSurface(): ComponentType {
  return createChecksSurface(createChecksAdapter({ getChecksDetail, getChecksOverview }));
}
