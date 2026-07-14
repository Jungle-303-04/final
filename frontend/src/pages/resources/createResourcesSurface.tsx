import type { ComponentType } from "react";
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
import { ResourcesPage } from "./ResourcesPage";

export function createResourcesSurface(
  port: ResourcesPort,
  filterPort: ResourcesFilterPort,
  physicalTopologyPort: PhysicalTopologyPort,
  physicalTopologyRealtimePort: PhysicalTopologyRealtimePort,
  relationTopologyPort: RelationTopologyPort,
  changeTimelinePort: ChangeTimelinePort,
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort,
  resourceCapabilitiesPort: ResourceCapabilitiesPort,
  resourceActionsPort: ResourceActionsPort,
): ComponentType {
  function ResourcesSurface() {
    return (
      <ResourcesPage
        filterPort={filterPort}
        physicalTopologyPort={physicalTopologyPort}
        physicalTopologyRealtimePort={physicalTopologyRealtimePort}
        relationTopologyPort={relationTopologyPort}
        changeTimelinePort={changeTimelinePort}
        resourceMetricsHistoryPort={resourceMetricsHistoryPort}
        resourceCapabilitiesPort={resourceCapabilitiesPort}
        resourceActionsPort={resourceActionsPort}
        port={port}
      />
    );
  }
  ResourcesSurface.displayName = "ResourcesSurface";
  return ResourcesSurface;
}
