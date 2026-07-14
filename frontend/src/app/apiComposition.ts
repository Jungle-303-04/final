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
  getClusterConnectStatus,
  getPhysicalTopology,
  getRelationTopology,
  getResourceCapabilities,
  getResourceMetricsHistory,
  getSession,
  listEvidence,
  listInventoryResourcesByType,
  listRcaReports,
  listRcaTimeline,
  listClusters,
  listGlobalFilterFacets,
  listFilteredResources,
  listResourceFilterFacets,
  listResourceLabelFacets,
  connectCluster,
  listApplicationDeployments,
  listApplicationRuns,
  listApplications,
  login,
  logout,
  restartDeployment,
  scaleDeployment,
  selectRecoveryAction,
  createReleaseFlowClient,
  getAiSuggestions,
  postAiChat,
  openPodLogStream,
  openWorkloadLogStream,
} from "../api";
import { createAiAssistantAdapter } from "../features/ai-assistant/createAiAssistantAdapter";
import { createLogStreamAdapter } from "../features/log-stream/createLogStreamAdapter";
import { createAuthAdapter } from "../features/auth/createAuthAdapter";
import { createApplicationsGitOpsAdapter } from "../features/applications-gitops/createApplicationsGitOpsAdapter";
import { createApplicationsSurface } from "../features/applications-gitops/createApplicationsGitOpsSurfaces";
import { createHomeAdapter } from "../features/home/createHomeAdapter";
import { createClustersAdapter } from "../features/clusters/createClustersAdapter";
import { createGlobalFilterAdapter } from "../features/global-filter/createGlobalFilterAdapter";
import { createIssuesAdapter } from "../features/issues/createIssuesAdapter";
import { createGitOpsAdapter } from "../features/gitops/createGitOpsAdapter";
import { createResourcesAdapter } from "../features/resources/createResourcesAdapter";
import { createResourcesFilterAdapter } from "../features/resources/createResourcesFilterAdapter";
import { createPhysicalTopologyAdapter } from "../features/resources/createPhysicalTopologyAdapter";
import { createRelationTopologyAdapter } from "../features/resources/createRelationTopologyAdapter";
import { createResourceMetricsHistoryAdapter } from "../features/resources/createResourceMetricsHistoryAdapter";
import { createResourceCapabilitiesAdapter } from "../features/resources/createResourceCapabilitiesAdapter";
import { createResourceActionsAdapter } from "../features/resources/createResourceActionsAdapter";
import { createHomeSurface } from "../pages/home/createHomeSurface";
import { createIssuesSurface } from "../pages/issues/createIssuesSurface";
import { createResourcesSurface } from "../pages/resources/createResourcesSurface";
import { createClustersSurface } from "../pages/clusters/createClustersSurface";
import { createGitOpsSurface } from "../pages/gitops/createGitOpsSurface";
import { createProductComposition } from "./productComposition";

export function createApiComposition() {
  const homePort = createHomeAdapter({
    getClusterNodesSummary,
    getClusterSummary,
    getNodePodsSummary,
    listClusters,
  });
  const clustersPort = createClustersAdapter({ connectCluster, getClusterConnectStatus });
  const globalFilterPort = createGlobalFilterAdapter({ listGlobalFilterFacets });
  const resourcesPort = createResourcesAdapter({
    getInventoryResourceDetail,
    getInventorySummary,
    listInventoryResourcesByType,
  });
  const resourcesFilterPort = createResourcesFilterAdapter({
    listFilteredResources,
    listResourceFilterFacets,
    listResourceLabelFacets,
  });
  const physicalTopologyPort = createPhysicalTopologyAdapter({ getPhysicalTopology });
  const relationTopologyPort = createRelationTopologyAdapter({ getRelationTopology });
  const resourceMetricsHistoryPort = createResourceMetricsHistoryAdapter({
    getResourceMetricsHistory,
  });
  const resourceCapabilitiesPort = createResourceCapabilitiesAdapter({
    getResourceCapabilities,
  });
  const resourceActionsPort = createResourceActionsAdapter({
    restartDeployment,
    scaleDeployment,
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
  const aiAssistantPort = createAiAssistantAdapter({ getAiSuggestions, postAiChat });
  const logStreamPort = createLogStreamAdapter({ openPodLogStream, openWorkloadLogStream });
  return createProductComposition([
    {
      id: "clusters",
      Component: createClustersSurface(clustersPort),
    },
    {
      id: "home",
      Component: createHomeSurface(homePort),
    },
    {
      id: "resources",
      Component: createResourcesSurface(
        resourcesPort,
        resourcesFilterPort,
        physicalTopologyPort,
        relationTopologyPort,
        resourceMetricsHistoryPort,
        resourceCapabilitiesPort,
        resourceActionsPort,
      ),
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
  }), homePort, globalFilterPort, aiAssistantPort, logStreamPort);
}
