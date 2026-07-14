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
  listApplicationDeployments,
  listApplicationRuns,
  listApplications,
  login,
  logout,
  selectRecoveryAction,
  createReleaseFlowClient,
} from "../api";
import { createAuthAdapter } from "../features/auth/createAuthAdapter";
import { createApplicationsGitOpsAdapter } from "../features/applications-gitops/createApplicationsGitOpsAdapter";
import { createApplicationsSurface } from "../features/applications-gitops/createApplicationsGitOpsSurfaces";
import { createHomeAdapter } from "../features/home/createHomeAdapter";
import { createIssuesAdapter } from "../features/issues/createIssuesAdapter";
import { createGitOpsAdapter } from "../features/gitops/createGitOpsAdapter";
import { createResourcesAdapter } from "../features/resources/createResourcesAdapter";
import { createHomeSurface } from "../pages/home/createHomeSurface";
import { createIssuesSurface } from "../pages/issues/createIssuesSurface";
import { createResourcesSurface } from "../pages/resources/createResourcesSurface";
import { createGitOpsSurface } from "../pages/gitops/createGitOpsSurface";
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
  const applicationsGitOpsPort = createApplicationsGitOpsAdapter({
    listApplicationDeployments,
    listApplicationRuns,
    listApplications,
  });
  const gitOpsPort = createGitOpsAdapter(createReleaseFlowClient());
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
    {
      id: "applications",
      Component: createApplicationsSurface(applicationsGitOpsPort),
    },
    {
      id: "gitops",
      Component: createGitOpsSurface(gitOpsPort),
    },
  ], createAuthAdapter({
    getSession,
    login,
    logout,
  }), homePort);
}
