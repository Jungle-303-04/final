import type { ComponentType } from "react";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import { ResourcesPage } from "./ResourcesPage";

export function createResourcesSurface(
  port: ResourcesPort,
): ComponentType {
  function ResourcesSurface() {
    return <ResourcesPage port={port} />;
  }
  ResourcesSurface.displayName = "ResourcesSurface";
  return ResourcesSurface;
}
