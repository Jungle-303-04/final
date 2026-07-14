import type { ComponentType } from "react";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesFilterPort } from "../../features/resources/resourcesFilterContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";
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
  relationTopologyPort: RelationTopologyPort,
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort,
  resourceCapabilitiesPort: ResourceCapabilitiesPort,
  resourceActionsPort: ResourceActionsPort,
): ComponentType {
  function ResourcesSurface() {
    return (
      <ResourcesPage
        filterPort={filterPort}
        physicalTopologyPort={physicalTopologyPort}
        relationTopologyPort={relationTopologyPort}
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
