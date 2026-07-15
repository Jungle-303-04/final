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
  getClusterConnectionStatus,
  getCommandStatus,
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
  unregisterCluster,
  listGlobalFilterFacets,
  listFilteredResources,
  listResourceFilterFacets,
  listResourceLabelFacets,
  connectCluster,
  reissueClusterConnectCommand,
  getApplicationDrift,
  getGitOpsApplicationDetail,
  getApplicationOverview,
  listApplicationCatalog,
  listApplicationDeploymentHistory,
  login,
  logout,
  executeResourceCapability,
  subscribeCommandOperationEvents,
  selectRecoveryAction,
  createReleaseFlowClient,
  getAiSuggestions,
  postAiChat,
  openPodLogStream,
  openWorkloadLogStream,
  openPodTerminal,
  createRealtimeClient,
  acknowledgeAlertEvent,
  listAlertEvents,
  listApplicationDeployments,
  promoteAlertEvent,
  createAlertRule,
  deleteAlertRule,
  listAlertRules,
  updateAlertRule,
  approveResourceManifestEdit,
  getResourceManifestSource,
  previewResourceManifestEdit,
  getTimelineCapabilities,
  getTimelineOverview,
  getTimelinePins,
  getTimelineSnapshot,
  removeTimelinePin,
  subscribeTimelineEvents,
  upsertTimelinePin,
  getHelmRelease,
  listHelmReleases,
  getTrafficOverview,
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
import { createResourceManifestAdapter } from "../features/resources/createResourceManifestAdapter";
import { createOperationEventsAdapter } from "../features/operations/createOperationEventsAdapter";
import { createOperationStatusStore } from "../features/operations/OperationStatusStore";
import { createHomeSurface } from "../pages/home/createHomeSurface";
import { createIssuesSurface } from "../pages/issues/createIssuesSurface";
import { createResourcesSurface } from "../pages/resources/createResourcesSurface";
import { createClustersSurface } from "../pages/clusters/createClustersSurface";
import { createGitOpsSurface } from "../pages/gitops/createGitOpsSurface";
import { createSettingsSurface } from "../pages/settings/createSettingsSurface";
import { createProductComposition } from "./productComposition";
import { createAlertEventsAdapter } from "../features/alerts/createAlertEventsAdapter";
import { createPodTerminalAdapter } from "../features/pod-terminal/createPodTerminalAdapter";
import { createAlertsSurface } from "../pages/alerts/createAlertsSurface";
import { createAlertRulesAdapter } from "../features/alerts/createAlertRulesAdapter";
import { createTimelineAdapter } from "../features/timeline/createTimelineAdapter";
import { createTimelineSurface } from "../pages/timeline/createTimelineSurface";
import { createHelmAdapter } from "../features/helm/createHelmAdapter";
import { createHelmSurface } from "../pages/helm/createHelmSurface";
import { createTrafficAdapter } from "../features/traffic/createTrafficAdapter";
import { createTrafficSurface } from "../pages/traffic/createTrafficSurface";

export function createApiComposition() {
  const homePort = createHomeAdapter({
    getClusterNodesSummary,
    getClusterSummary,
    getNodePodsSummary,
    listClusters,
  });
  const clustersPort = createClustersAdapter({
    connectCluster,
    getClusterConnectionStatus,
    getCommandStatus,
    reissueClusterConnectCommand,
    unregisterCluster,
  });
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
  const timelinePort = createTimelineAdapter({
    getTimelineCapabilities,
    getTimelineOverview,
    getTimelinePins,
    getTimelineSnapshot,
    removeTimelinePin,
    subscribeTimelineEvents,
    upsertTimelinePin,
  });
  const resourceMetricsHistoryPort = createResourceMetricsHistoryAdapter({
    getResourceMetricsHistory,
  });
  const resourceCapabilitiesPort = createResourceCapabilitiesAdapter({
    getResourceCapabilities,
  });
  const resourceActionsPort = createResourceActionsAdapter({
    executeResourceCapability(capability, values, signal) {
      return executeResourceCapability(capability.path, values, signal);
    },
  });
  const operationEventsPort = createOperationEventsAdapter({ subscribeCommandOperationEvents });
  const operationStatusStore = createOperationStatusStore(operationEventsPort);
  const podTerminalPort = createPodTerminalAdapter({ openPodTerminal });
  const resourceManifestPort = createResourceManifestAdapter({
    approveResourceManifestEdit,
    getResourceManifestSource,
    previewResourceManifestEdit,
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
  const gitOpsPort = createGitOpsAdapter({
    ...createReleaseFlowClient(),
    getApplicationDetail: getGitOpsApplicationDetail,
    listApplicationDeployments,
  });
  const helmPort = createHelmAdapter({
    getHelmRelease,
    listHelmReleases,
  });
  const trafficPort = createTrafficAdapter({ getTrafficOverview });
  const aiAssistantPort = createAiAssistantAdapter({
    createAlertRule,
    getAiSuggestions,
    postAiChat,
  });
  const logStreamPort = createLogStreamAdapter({ openPodLogStream, openWorkloadLogStream });
  const alertEventsPort = createAlertEventsAdapter({
    acknowledgeAlertEvent,
    listAlertEvents,
    promoteAlertEvent,
  });
  const alertRulesPort = createAlertRulesAdapter({
    createAlertRule,
    deleteAlertRule,
    listAlertRules,
    updateAlertRule,
  });
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
        homePort,
        relationTopologyPort,
        changeTimelinePort,
        resourceMetricsHistoryPort,
        resourceCapabilitiesPort,
        resourceActionsPort,
        podTerminalPort,
        resourceManifestPort,
      ),
    },
    {
      id: "issues",
      Component: createIssuesSurface(issuesPort),
    },
    {
      id: "timeline",
      Component: createTimelineSurface(timelinePort),
    },
    {
      id: "alerts",
      Component: createAlertsSurface(alertRulesPort),
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
      id: "helm",
      Component: createHelmSurface(helmPort),
    },
    {
      id: "traffic",
      Component: createTrafficSurface(trafficPort),
    },
    {
      id: "settings",
      Component: createSettingsSurface(),
    },
  ], createAuthAdapter({
    getSession,
    login,
    logout,
  }), homePort, globalFilterPort, aiAssistantPort, logStreamPort, alertEventsPort, operationStatusStore);
}
