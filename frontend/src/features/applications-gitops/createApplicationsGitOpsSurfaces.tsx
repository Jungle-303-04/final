import type { ComponentType } from "react";
import { ApplicationsSurface } from "./ApplicationsSurface";
import type { ApplicationsGitOpsPort } from "./applicationsGitOpsContract";
import { GitOpsSurface } from "./GitOpsSurface";

export function createApplicationsSurface(port: ApplicationsGitOpsPort): ComponentType {
  function ApplicationsSurfaceRoute() {
    return <ApplicationsSurface port={port} />;
  }
  ApplicationsSurfaceRoute.displayName = "ApplicationsSurfaceRoute";
  return ApplicationsSurfaceRoute;
}

export function createGitOpsSurface(port: ApplicationsGitOpsPort): ComponentType {
  function GitOpsSurfaceRoute() {
    return <GitOpsSurface port={port} />;
  }
  GitOpsSurfaceRoute.displayName = "GitOpsSurfaceRoute";
  return GitOpsSurfaceRoute;
}
