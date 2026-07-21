import type { ComponentType } from "react";
import { getTrafficOverview } from "../../../api";
import { createTrafficAdapter } from "../../../features/traffic/createTrafficAdapter";
import { createTrafficSurface } from "../../../pages/traffic/createTrafficSurface";

export function loadTrafficSurface(): ComponentType {
  return createTrafficSurface(createTrafficAdapter({ getTrafficOverview }));
}
