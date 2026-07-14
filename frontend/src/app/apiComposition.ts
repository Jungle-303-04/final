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
  getChangeTimeline,
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
  getApplicationDrift,
  getApplicationOverview,
  listApplicationCatalog,
  listApplicationDeploymentHistory,
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
  createRealtimeClient,
} from "../api";
import type { PhysicalTopologyRealtimePort } from "../features/resources/physicalTopologyRealtimeContract";
import { createAiAssistantAdapter } from "../features/ai-assistant/createAiAssistantAdapter";
import { createLogStreamAdapter } from "../features/log-stream/createLogStreamAdapter";
import { createAuthAdapter } from "../features/auth/createAuthAdapter";
import { createApplicationsAdapter } from "../features/applications/createApplicationsAdapter";
import { createApplicationsSurface } from "../features/applications/createApplicationsSurface";
import { createHomeAdapter } from "../features/home/createHomeAdapter";
import { createClustersAdapter } from "../features/clusters/createClustersAdapter";
import { createGlobalFilterAdapter } from "../features/global-filter/createGlobalFilterAdapter";
import { createIssuesAdapter } from "../features/issues/createIssuesAdapter";
import { createGitOpsAdapter } from "../features/gitops/createGitOpsAdapter";
import { createResourcesAdapter } from "../features/resources/createResourcesAdapter";
import { createResourcesFilterAdapter } from "../features/resources/createResourcesFilterAdapter";
import { createPhysicalTopologyAdapter } from "../features/resources/createPhysicalTopologyAdapter";
import { createRelationTopologyAdapter } from "../features/resources/createRelationTopologyAdapter";
import { createChangeTimelineAdapter } from "../features/resources/createChangeTimelineAdapter";
import { createResourceMetricsHistoryAdapter } from "../features/resources/createResourceMetricsHistoryAdapter";
import { createResourceCapabilitiesAdapter } from "../features/resources/createResourceCapabilitiesAdapter";
import { createResourceActionsAdapter } from "../features/resources/createResourceActionsAdapter";
import { createHomeSurface } from "../pages/home/createHomeSurface";
import { createIssuesSurface } from "../pages/issues/createIssuesSurface";
import { createResourcesSurface } from "../pages/resources/createResourcesSurface";
import { createClustersSurface } from "../pages/clusters/createClustersSurface";
import { createGitOpsSurface } from "../pages/gitops/createGitOpsSurface";
import { createSettingsSurface } from "../pages/settings/createSettingsSurface";
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
  const physicalTopologyRealtimePort: PhysicalTopologyRealtimePort = {
    connect(subscription, handlers) {
      const client = createRealtimeClient({
        subscription,
        reconnect: { baseDelayMs: 3_000, maxDelayMs: 30_000 },
        onMessage: handlers.onMessage,
        onStateChange: (state) => handlers.onStatusChange(state.status),
      });
      client.connect();
      return () => client.close();
    },
  };
  const relationTopologyPort = createRelationTopologyAdapter({ getRelationTopology });
  const changeTimelinePort = createChangeTimelineAdapter({ getChangeTimeline });
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
  const applicationsPort = createApplicationsAdapter({
    getApplicationDrift,
    getApplicationOverview,
    listApplicationCatalog,
    listApplicationDeploymentHistory,
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
        physicalTopologyRealtimePort,
        relationTopologyPort,
        changeTimelinePort,
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
      Component: createApplicationsSurface(applicationsPort),
    },
    {
      id: "gitops",
      Component: createGitOpsSurface(gitOpsPort),
    },
    {
      id: "settings",
      Component: createSettingsSurface(),
    },
  ], createAuthAdapter({
    getSession,
    login,
    logout,
  }), homePort, globalFilterPort, aiAssistantPort, logStreamPort);
}
