import type { ComponentType } from "react";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesFilterPort } from "../../features/resources/resourcesFilterContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import { ResourcesPage } from "./ResourcesPage";

export function createResourcesSurface(
  port: ResourcesPort,
  filterPort: ResourcesFilterPort,
  physicalTopologyPort: PhysicalTopologyPort,
): ComponentType {
  function ResourcesSurface() {
    return (
      <ResourcesPage
        filterPort={filterPort}
        physicalTopologyPort={physicalTopologyPort}
        port={port}
      />
    );
  }
  ResourcesSurface.displayName = "ResourcesSurface";
  return ResourcesSurface;
}
