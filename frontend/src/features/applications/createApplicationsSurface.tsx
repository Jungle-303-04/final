import type { ComponentType } from "react";
import { ApplicationsSurface } from "./ApplicationsSurface";
import type { ApplicationsPort } from "./applicationsContract";

export function createApplicationsSurface(port: ApplicationsPort): ComponentType {
  function ApplicationsSurfaceRoute() {
    return <ApplicationsSurface port={port} />;
  }
  ApplicationsSurfaceRoute.displayName = "ApplicationsSurfaceRoute";
  return ApplicationsSurfaceRoute;
}
