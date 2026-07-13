import {
  getClusterNodesSummary,
  getClusterSummary,
  getInventoryResourceDetail,
  getInventorySummary,
  getNodePodsSummary,
  getSession,
  listInventoryResourcesByType,
  listClusters,
  login,
  logout,
} from "../api";
import { createAuthAdapter } from "../features/auth/createAuthAdapter";
import { createHomeAdapter } from "../features/home/createHomeAdapter";
import { createResourcesAdapter } from "../features/resources/createResourcesAdapter";
import { createHomeSurface } from "../pages/home/createHomeSurface";
import { createResourcesSurface } from "../pages/resources/createResourcesSurface";
import { createProductComposition } from "./productComposition";

export function createApiComposition() {
  const homePort = createHomeAdapter({
    getClusterNodesSummary,
    getClusterSummary,
    getNodePodsSummary,
    listClusters,
  });
  const resourcesPort = createResourcesAdapter({
    getInventoryResourceDetail,
    getInventorySummary,
    listInventoryResourcesByType,
  });
  return createProductComposition([
    {
      id: "home",
      Component: createHomeSurface(homePort),
    },
    {
      id: "resources",
      Component: createResourcesSurface(resourcesPort, homePort),
    },
  ], createAuthAdapter({
    getSession,
    login,
    logout,
  }));
}
