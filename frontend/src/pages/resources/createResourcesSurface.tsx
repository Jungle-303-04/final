import type { ComponentType } from "react";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesFilterPort } from "../../features/resources/resourcesFilterContract";
import { ResourcesPage } from "./ResourcesPage";

export function createResourcesSurface(
  port: ResourcesPort,
  filterPort: ResourcesFilterPort,
): ComponentType {
  function ResourcesSurface() {
    return <ResourcesPage filterPort={filterPort} port={port} />;
  }
  ResourcesSurface.displayName = "ResourcesSurface";
  return ResourcesSurface;
}
