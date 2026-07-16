import type { ComponentType } from "react";
import {
  getApplicationDrift,
  getApplicationOverview,
  listApplicationCatalog,
  listApplicationDeploymentHistory,
} from "../../../api";
import { createApplicationsAdapter } from "../../../features/applications/createApplicationsAdapter";
import { createApplicationsSurface } from "../../../features/applications/createApplicationsSurface";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";

export function loadApplicationsSurface(
  refreshPolicies: BrowserRefreshPolicyRegistry<"applications">,
): ComponentType {
  return createApplicationsSurface(createApplicationsAdapter({
    getApplicationDrift,
    getApplicationOverview,
    listApplicationCatalog,
    listApplicationDeploymentHistory,
  }, refreshPolicies));
}
