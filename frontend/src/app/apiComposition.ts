import {
  acknowledgeAlertEvent,
  createAlertRule,
  deleteAlertRule,
  addDiagnoseTurn,
  clearDiagnoseHistory,
  createDiagnoseRun,
  getAiSuggestions,
  getClusterNodesSummary,
  getClusterSummary,
  getHomeInsights,
  getCompareCandidates,
  getCompareResourcePair,
  getWorkloadDetail,
  getDiagnoseCapabilities,
  grantDiagnoseConsent,
  getScheduledWorkloadRuns,
  getSettingsAccessProfile,
  getRuntimeDiagnostics,
  getVersionCheck,
  getNodePodsSummary,
  getNamespaceScope,
  getUiPreferences,
  listAlertEvents,
  listAlertRules,
  listClusters,
  listGlobalFilterFacets,
  searchResourceIdentities,
  listDiagnoseRuns,
  openPodLogStream,
  openScheduledWorkloadRunLogStream,
  openWorkloadLogStream,
  postAiChat,
  promoteAlertEvent,
  subscribeCommandOperationEvents,
  stopDiagnoseRun,
  subscribeDiagnoseEvents,
  updateAlertRule,
  updateNamespaceScope,
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
import { createShellStateAdapter } from "../features/shell-state/createShellStateAdapter";
import { createSettingsAdapter } from "../features/settings/createSettingsAdapter";
import { createRuntimeStatusAdapter } from "../features/runtime-status/createRuntimeStatusAdapter";
import { createPortRegistry } from "./composition/PortRegistry";
import { createProductComposition, type ProductComposition } from "./productComposition";
import { createApiBrowserRefreshPolicyRegistry } from "./composition/browserRefreshPolicyRegistry";
import { createApiTimelinePort } from "./composition/timelinePort";

/**
 * The authenticated composition is intentionally small: global providers and
 * their one-owner ports are created here, while every page factory is loaded
 * only through its registered route module.
 */
export function createApiComposition(auth: AuthPort): ProductComposition {
  const refreshPolicies = createApiBrowserRefreshPolicyRegistry();
  const timelinePort = createApiTimelinePort();
  const homePort = createHomeAdapter({
    getClusterNodesSummary,
    getClusterSummary,
    getHomeInsights,
    getNodePodsSummary,
    listClusters,
  });
  const operationStatusStore = createOperationStatusStore(
    createOperationEventsAdapter({ subscribeCommandOperationEvents }),
  );
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
  const settingsPort = createSettingsAdapter({ getSettingsAccessProfile });
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

  return createProductComposition([
    {
      id: "clusters",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/clusters")).loadClustersSurface(),
      })),
    },
    {
      id: "home",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/home")).loadHomeSurface(registry.homePort),
      })),
    },
    {
      id: "resources",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/resources")).loadResourcesSurface(
          registry.homePort,
          refreshPolicies,
          timelinePort,
        ),
      })),
    },
    {
      id: "issues",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/issues")).loadIssuesSurface(),
      })),
    },
    {
      id: "timeline",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/timeline")).loadTimelineSurface(timelinePort),
      })),
    },
    {
      id: "alerts",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/alerts")).loadAlertsSurface(alertRulesPort),
      })),
    },
    {
      id: "applications",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/applications")).loadApplicationsSurface(),
      })),
    },
    {
      id: "gitops",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/gitops")).loadGitOpsSurface(),
      })),
    },
    {
      id: "helm",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/helm")).loadHelmSurface(),
      })),
    },
    {
      id: "traffic",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/traffic")).loadTrafficSurface(),
      })),
    },
    {
      id: "cost",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/cost")).loadCostSurface(),
      })),
    },
    {
      id: "checks",
      loader: registry.createSurfaceLoader(async () => ({
        default: (await import("./composition/surfaces/checks")).loadChecksSurface(),
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
  }, workloadDetailPort, comparePort, diagnosePort, shellStatePort, runtimeStatusPort);
}
