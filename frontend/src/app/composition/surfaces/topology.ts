import type { ComponentType } from "react";

import type { HomePort } from "../../../features/home/homeContract";
import { loadResourcesSurface } from "./resources";

/**
 * Topology owns a first-class route, while the physical topology projection
 * remains the one canonical surface.  Sharing the surface keeps its existing
 * scope, permission, empty-state, and realtime contracts intact instead of
 * creating a route-only read model.
 */
export function loadTopologySurface(homePort: HomePort): ComponentType {
  return loadResourcesSurface(homePort);
}
