import {
  getAuditTimeline,
  getClusterNodesSummary,
  getClusterSummary,
  getRcaIncident,
  getRecoveryPlanByCorrelation,
  getInventoryResourceDetail,
  getIncidentRecentChanges,
  getInventorySummary,
  getNodePodsSummary,
  getSession,
  listEvidence,
  listInventoryResourcesByType,
  listRcaReports,
  listRcaTimeline,
  listClusters,
  login,
  logout,
  selectRecoveryAction,
} from "../api";
import { createAuthAdapter } from "../features/auth/createAuthAdapter";
import { createHomeAdapter } from "../features/home/createHomeAdapter";
import { createIssuesAdapter } from "../features/issues/createIssuesAdapter";
import { createResourcesAdapter } from "../features/resources/createResourcesAdapter";
import { createHomeSurface } from "../pages/home/createHomeSurface";
import { createIssuesSurface } from "../pages/issues/createIssuesSurface";
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
  const issuesPort = createIssuesAdapter({
    getAuditTimeline,
    getIncidentRecentChanges,
    getRcaIncident,
    getRecoveryPlanByCorrelation,
    listEvidence,
    listRcaReports,
    listRcaTimeline,
    selectRecoveryAction,
  });
  return createProductComposition([
    {
      id: "home",
      Component: createHomeSurface(homePort),
    },
    {
      id: "resources",
      Component: createResourcesSurface(resourcesPort),
    },
    {
      id: "issues",
      Component: createIssuesSurface(issuesPort),
    },
  ], createAuthAdapter({
    getSession,
    login,
    logout,
  }), homePort);
}
