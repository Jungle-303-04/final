import type { ComponentType } from "react";

import type { HomePort } from "../../../features/home/homeContract";
import { createTopologySurface } from "../../../pages/topology/createTopologySurface";
import { createTopologyPorts } from "../topologyPorts";

/**
 * Topology has a separate page and lazy route boundary. Only the typed graph
 * ports and graph primitives are shared with Resources, so either page can be
 * rolled back without replacing the other page's controller.
 */
export function loadTopologySurface(homePort: HomePort): ComponentType {
  const topologyPorts = createTopologyPorts();
  return createTopologySurface(
    topologyPorts.physical,
    topologyPorts.realtime,
    topologyPorts.relation,
    homePort,
  );
}
