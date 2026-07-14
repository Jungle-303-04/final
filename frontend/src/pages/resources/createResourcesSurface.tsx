import type { ComponentType } from "react";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesFilterPort } from "../../features/resources/resourcesFilterContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import type { ResourceMetricsHistoryPort } from "../../features/resources/resourceMetricsHistoryContract";
import { ResourcesPage } from "./ResourcesPage";

export function createResourcesSurface(
  port: ResourcesPort,
  filterPort: ResourcesFilterPort,
  physicalTopologyPort: PhysicalTopologyPort,
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort,
): ComponentType {
  function ResourcesSurface() {
    return (
      <ResourcesPage
        filterPort={filterPort}
        physicalTopologyPort={physicalTopologyPort}
        resourceMetricsHistoryPort={resourceMetricsHistoryPort}
        port={port}
      />
    );
  }
  ResourcesSurface.displayName = "ResourcesSurface";
  return ResourcesSurface;
}
