import type { ComponentType } from "react";
import { createTrafficSurface } from "../../../pages/traffic/createTrafficSurface";
import { createTrafficProductPort } from "../trafficPort";

export function loadTrafficSurface(): ComponentType {
  return createTrafficSurface(createTrafficProductPort());
}
