import {
  getClusterNodesSummary,
  getClusterSummary,
  getNodePodsSummary,
  getSession,
  listClusters,
  login,
  logout,
} from "../api";
import { createAuthAdapter } from "../features/auth/createAuthAdapter";
import { createHomeAdapter } from "../features/home/createHomeAdapter";
import { createHomeSurface } from "../pages/home/createHomeSurface";
import { createProductComposition } from "./productComposition";

export function createApiComposition() {
  const homePort = createHomeAdapter({
    getClusterNodesSummary,
    getClusterSummary,
    getNodePodsSummary,
    listClusters,
  });
  return createProductComposition([{
    id: "home",
    Component: createHomeSurface(homePort),
  }], createAuthAdapter({
    getSession,
    login,
    logout,
  }));
}
