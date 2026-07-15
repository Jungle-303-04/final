import type { ComponentType } from "react";

import type { TrafficPort } from "../../features/traffic/trafficContract";
import { TrafficPage } from "./TrafficPage";

export function createTrafficSurface(port: TrafficPort): ComponentType {
  function TrafficSurface() {
    return <TrafficPage port={port} />;
  }

  TrafficSurface.displayName = "TrafficSurface";
  return TrafficSurface;
}
