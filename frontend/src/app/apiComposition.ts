import {
  acknowledgeAlertEvent, addDiagnoseTurn, clearDiagnoseHistory,
  createAlertRule, createDiagnoseRun, createReleaseFlowClient,
  deleteAlertRule, executeGitOpsResourceAction, getActivityOverview,
  getAiSuggestions, getAuditTimeline, getClusterNodesSummary,
  getClusterSummary, getCompareCandidates, getCompareResourcePair,
  getCostNodes, getCostOverview, getDiagnoseCapabilities,
  getGitOpsApplicationDetail, getGitOpsResourceInsights, getGitOpsResourceTree,
  getHomeInsights, getIncidentRecentChanges, getInventorySummary,
  getNamespaceScope, getNodePodsSummary, getPrometheusIntegration,
  getRcaIncident, getRecoveryPlanByCorrelation, getResourceIssues,
  getRuntimeDiagnostics, getScheduledWorkloadRuns, getSettingsAccessProfile,
  getUiPreferences, getVersionCheck, getWorkloadDetail,
  grantDiagnoseConsent, listAlertEvents, listAlertRules,
  listClusters, listDiagnoseRuns, listEvidence,
  listFilteredResources, listGitOpsOverview, listGlobalFilterFacets,
  listRcaIssues, listRcaReports, listRcaTimeline,
  listResourceFilterFacets, listResourceLabelFacets, openPodLogStream,
  openScheduledWorkloadRunLogStream, openWorkloadLogStream, parseResourceFileResult,
  postAiChat, promoteAlertEvent, searchResourceIdentities,
  selectRecoveryAction, startResourceFileCommand, stopDiagnoseRun,
  subscribeCommandOperationEvents, subscribeDiagnoseEvents, subscribeHomeDashboardEvents,
  updateAlertRule, updateNamespaceScope, updatePrometheusIntegration,
  updateUiPreferences,
} from "../api";
import { createAiAssistantAdapter } from "../features/ai-assistant/createAiAssistantAdapter";
import { createAlertEventsAdapter } from "../features/alerts/createAlertEventsAdapter";
import { createAlertRulesAdapter } from "../features/alerts/createAlertRulesAdapter";
import type { AuthPort } from "../features/auth/authContract";
import { createGlobalFilterAdapter } from "../features/global-filter/createGlobalFilterAdapter";
import { createDiagnoseAdapter } from "../features/diagnose/createDiagnoseAdapter";
import { createHomeAdapter } from "../features/home/createHomeAdapter";
import { createLogStreamAdapter } from "../features/log-stream/createLogStreamAdapter";
import { createWorkloadDetailAdapter } from "../features/workload-detail/createWorkloadDetailAdapter";
import { createCompareAdapter } from "../features/compare/createCompareAdapter";
import { createOperationEventsAdapter } from "../features/operations/createOperationEventsAdapter";
import { createOperationStatusStore } from "../features/operations/OperationStatusStore";
import { createResourceFilesAdapter } from "../features/resource-files/createResourceFilesAdapter";
import { createShellStateAdapter } from "../features/shell-state/createShellStateAdapter";
import { createSettingsAdapter } from "../features/settings/createSettingsAdapter";
import { createRuntimeStatusAdapter } from "../features/runtime-status/createRuntimeStatusAdapter";
import { createPortRegistry } from "./composition/PortRegistry";
import { createProductComposition, type ProductComposition } from "./productComposition";
import { createApiBrowserRefreshPolicyRegistry } from "./composition/browserRefreshPolicyRegistry";
import { createApiTimelinePort } from "./composition/timelinePort";
import { createPortForwardSessionAdapter } from "../features/service-access/createPortForwardSessionAdapter";
import { desktopBridge } from "../desktop/desktopBridge";
import { createIssuesAdapter } from "../features/issues/createIssuesAdapter";
import { createResourceIssuesAdapter } from "../features/issues/createResourceIssuesAdapter";
import { createRcaContextAdapter } from "../features/issues/createRcaContextAdapter";
import { createGitOpsAdapter } from "../features/gitops/createGitOpsAdapter";
import { createHomeActivityAdapter } from "../features/home-activity/createHomeActivityAdapter";
import { createCostAdapter } from "../features/cost/createCostAdapter";
import { createResourcesFilterAdapter } from "../features/resources/createResourcesFilterAdapter";

/**
 * The authenticated composition is intentionally small: global providers and
 * their one-owner ports are created here, while every page factory is loaded
 * only through its registered route module.
 */
export function createApiComposition(auth: AuthPort): ProductComposition {
  const refreshPolicies = createApiBrowserRefreshPolicyRegistry();
  const timelinePort = createApiTimelinePort();
  const portForwardSessions = createPortForwardSessionAdapter(desktopBridge, refreshPolicies);
  const homePort = createHomeAdapter({
    getClusterNodesSummary,
    getClusterSummary,
    getHomeInsights,
    getNodePodsSummary,
    listClusters,
    subscribeHomeDashboardEvents,
  }, refreshPolicies);
  const operationStatusStore = createOperationStatusStore(
    createOperationEventsAdapter({ subscribeCommandOperationEvents }),
  );
  const resourceFilesPort = createResourceFilesAdapter({
    parseResourceFileResult,
    startResourceFileCommand,
    subscribeCommandOperationEvents,
  });
  const registry = createPortRegistry({ homePort, operationStatusStore });
  const globalFilterPort = createGlobalFilterAdapter({
    listGlobalFilterFacets,
    searchResourceIdentities,
  });
  const aiAssistantPort = createAiAssistantAdapter({
    createAlertRule,
    getAiSuggestions,
    postAiChat,
  });
  const logStreamPort = createLogStreamAdapter({
    openPodLogStream,
    openScheduledWorkloadRunLogStream,
    openWorkloadLogStream,
  });
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
  const workloadDetailPort = createWorkloadDetailAdapter({
    getScheduledWorkloadRuns,
    getWorkloadDetail,
  });
  const comparePort = createCompareAdapter({ getCompareCandidates, getCompareResourcePair });
  const shellStatePort = createShellStateAdapter({
    getNamespaceScope,
    getUiPreferences,
    updateNamespaceScope,
    updateUiPreferences,
  });
  const settingsPort = createSettingsAdapter({
    getPrometheusIntegration,
    getSettingsAccessProfile,
    updatePrometheusIntegration,
  });
  const diagnosePort = createDiagnoseAdapter({
    addDiagnoseTurn,
    clearDiagnoseHistory,
    createDiagnoseRun,
    getDiagnoseCapabilities,
    grantDiagnoseConsent,
    listDiagnoseRuns,
    stopDiagnoseRun,
    subscribeDiagnoseEvents,
  });
  const runtimeStatusPort = createRuntimeStatusAdapter({
    getRuntimeDiagnostics,
    getVersionCheck,
  });
  const issuesPort = createIssuesAdapter({
    getAuditTimeline,
    getIncidentRecentChanges,
    getRcaIncident,
    getRecoveryPlanByCorrelation,
    listRcaIssues,
    listEvidence,
    listRcaReports,
    listRcaTimeline,
    selectRecoveryAction,
  }, refreshPolicies);
  const gitOpsPort = createGitOpsAdapter({
    ...createReleaseFlowClient(),
    executeResourceAction: executeGitOpsResourceAction,
    getApplicationDetail: getGitOpsApplicationDetail,
    getResourceInsights: getGitOpsResourceInsights,
    getResourceTree: getGitOpsResourceTree,
    listOverview: listGitOpsOverview,
  });
  const homeActivityPort = createHomeActivityAdapter({ getActivityOverview });
  const costPort = createCostAdapter({ getCostOverview, getCostNodes }, refreshPolicies);
  const resourcesFilterPort = createResourcesFilterAdapter({
    listFilteredResources,
    listResourceFilterFacets,
    listResourceLabelFacets,
  });
  const resourceIssuesPort = createResourceIssuesAdapter({ getResourceIssues });
  const rcaContextPort = createRcaContextAdapter({
    issues: issuesPort,
    resourceIssues: resourceIssuesPort,
  });

  return createProductComposition([
    {
      id: "home",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/home")).loadHomeSurface(
          registry.homePort,
          {
            activity: homeActivityPort,
            cost: costPort,
            gitops: gitOpsPort,
            inventory: getInventorySummary,
            issues: issuesPort,
            resources: resourcesFilterPort,
            timeline: timelinePort,
          },
        ),
      })),
    },
    {
      id: "resources",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/resources")).loadResourcesSurface(
          registry.homePort,
          refreshPolicies,
          timelinePort,
          portForwardSessions,
          resourceFilesPort,
          resourceIssuesPort,
          resourcesFilterPort,
          getInventorySummary,
        ),
      })),
    },
    {
      id: "deploy",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/deploy")).loadDeploySurface(
          refreshPolicies,
          rcaContextPort,
          gitOpsPort,
        ),
      })),
    },
    {
      id: "issues",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/issues")).loadIssuesSurface(
          issuesPort,
          alertRulesPort,
        ),
      })),
    },
    {
      id: "timeline",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/timeline")).loadTimelineSurface(
          timelinePort,
          rcaContextPort,
        ),
      })),
    },
    {
      id: "cost",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/cost")).loadCostSurface(costPort),
      })),
    },
    {
      id: "checks",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/checks")).loadChecksSurface(refreshPolicies),
      })),
    },
    {
      id: "settings",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/settings")).loadSettingsSurface(
          settingsPort,
          shellStatePort,
        ),
      })),
    },
  ], auth, homePort, globalFilterPort, aiAssistantPort, logStreamPort, alertEventsPort, operationStatusStore, () => {
    registry.dispose();
  }, workloadDetailPort, comparePort, diagnosePort, shellStatePort, runtimeStatusPort, portForwardSessions, rcaContextPort);
}
