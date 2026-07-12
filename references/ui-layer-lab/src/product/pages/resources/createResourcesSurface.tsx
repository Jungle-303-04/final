import type { ComponentType } from "react";
import type { HomePort } from "../../features/home/homeContract";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import { ResourcesPage } from "./ResourcesPage";

export function createResourcesSurface(
  port: ResourcesPort,
  clusterPort: Pick<HomePort, "listClusterChoices">,
): ComponentType {
  function ResourcesSurface() {
    return <ResourcesPage clusterPort={clusterPort} port={port} />;
  }
  ResourcesSurface.displayName = "ResourcesSurface";
  return ResourcesSurface;
}
