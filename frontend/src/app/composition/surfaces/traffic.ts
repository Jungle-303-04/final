import type { ComponentType } from "react";
import {
  connectTrafficSource,
  getTrafficOverview,
  getTrafficSources,
  setTrafficSource,
} from "../../../api";
import { createTrafficAdapter } from "../../../features/traffic/createTrafficAdapter";
import { createTrafficSurface } from "../../../pages/traffic/createTrafficSurface";

export function loadTrafficSurface(): ComponentType {
  return createTrafficSurface(createTrafficAdapter({
    connectTrafficSource,
    getTrafficOverview,
    getTrafficSources,
    setTrafficSource,
  }));
}
