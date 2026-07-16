import type { ComponentType } from "react";

import type { HomePort } from "../../features/home/homeContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import type { PhysicalTopologyRealtimePort } from "../../features/resources/physicalTopologyRealtimeContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";
import { TopologyPage } from "./TopologyPage";

export function createTopologySurface(
  physicalTopologyPort: PhysicalTopologyPort,
  physicalTopologyRealtimePort: PhysicalTopologyRealtimePort,
  relationTopologyPort: RelationTopologyPort,
  nodePodsPort: Pick<HomePort, "loadNodePods">,
): ComponentType {
  function TopologySurface() {
    return (
      <TopologyPage
        nodePodsPort={nodePodsPort}
        physicalTopologyPort={physicalTopologyPort}
        physicalTopologyRealtimePort={physicalTopologyRealtimePort}
        relationTopologyPort={relationTopologyPort}
      />
    );
  }
  TopologySurface.displayName = "TopologySurface";
  return TopologySurface;
}
