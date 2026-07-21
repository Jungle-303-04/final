import type { ComponentType } from "react";
import {
  getApplicationDrift,
  getApplicationOverview,
  listApplicationCatalog,
  listApplicationDeploymentHistory,
} from "../../../api";
import { createApplicationsAdapter } from "../../../features/applications/createApplicationsAdapter";
import { createApplicationsSurface } from "../../../features/applications/createApplicationsSurface";

export function loadApplicationsSurface(): ComponentType {
  return createApplicationsSurface(createApplicationsAdapter({
    getApplicationDrift,
    getApplicationOverview,
    listApplicationCatalog,
    listApplicationDeploymentHistory,
  }));
}
