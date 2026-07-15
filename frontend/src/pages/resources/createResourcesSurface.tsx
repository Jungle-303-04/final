import type { ComponentType } from "react";
import type { HomePort } from "../../features/home/homeContract";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesFilterPort } from "../../features/resources/resourcesFilterContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import type { PhysicalTopologyRealtimePort } from "../../features/resources/physicalTopologyRealtimeContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";
import type { ChangeTimelinePort } from "../../features/resources/changeTimelineContract";
import type { ResourceMetricsHistoryPort } from "../../features/resources/resourceMetricsHistoryContract";
import type {
  ResourceActionsPort,
  ResourceCapabilitiesPort,
} from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceManifestPort } from "../../features/resources/resourceManifestContract";
import { ResourcesPage } from "./ResourcesPage";
import {
  EMPTY_POD_TERMINAL_PORT,
  type PodTerminalPort,
} from "../../features/pod-terminal/podTerminalContract";

export function createResourcesSurface(
  port: ResourcesPort,
  filterPort: ResourcesFilterPort,
  physicalTopologyPort: PhysicalTopologyPort,
  physicalTopologyRealtimePort: PhysicalTopologyRealtimePort,
  nodePodsPort: Pick<HomePort, "loadNodePods">,
  relationTopologyPort: RelationTopologyPort,
  changeTimelinePort: ChangeTimelinePort,
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort,
  resourceCapabilitiesPort: ResourceCapabilitiesPort,
  resourceActionsPort: ResourceActionsPort,
  podTerminalPort: PodTerminalPort = EMPTY_POD_TERMINAL_PORT,
  resourceManifestPort?: ResourceManifestPort,
): ComponentType {
  function ResourcesSurface() {
    return (
      <ResourcesPage
        filterPort={filterPort}
        physicalTopologyPort={physicalTopologyPort}
        physicalTopologyRealtimePort={physicalTopologyRealtimePort}
        nodePodsPort={nodePodsPort}
        relationTopologyPort={relationTopologyPort}
        changeTimelinePort={changeTimelinePort}
        resourceMetricsHistoryPort={resourceMetricsHistoryPort}
        resourceCapabilitiesPort={resourceCapabilitiesPort}
        resourceActionsPort={resourceActionsPort}
        podTerminalPort={podTerminalPort}
        resourceManifestPort={resourceManifestPort}
        port={port}
      />
    );
  }
  ResourcesSurface.displayName = "ResourcesSurface";
  return ResourcesSurface;
}
