import type { ComponentType } from "react";
import {
  approveResourceManifestEdit,
  applyResourceManifestNow,
  createResourceManifest,
  dryRunResourceManifestCreate,
  getResourceManifestCreateCapability,
  cancelCommand,
  executeResourceCapability,
  getChangeTimeline,
  getKubernetesApiResources,
  getInventoryResourceDetail,
  getResourceCapabilities,
  getResourceDeletionPreview,
  getWorkloadRollbackPreview,
  getResourceManifestSource,
  getResourceMetricsHistory,
  listInventoryResourcesByType,
  openPodTerminal,
  previewResourceManifestEdit,
  resolveServiceAccess,
  runScopedMetricQuery,
  startServiceRequest,
} from "../../../api";
import type { HomePort } from "../../../features/home/homeContract";
import { createPodTerminalAdapter } from "../../../features/pod-terminal/createPodTerminalAdapter";
import { createChangeTimelineAdapter } from "../../../features/resources/createChangeTimelineAdapter";
import { createResourceActionsAdapter } from "../../../features/resources/createResourceActionsAdapter";
import { createResourceCapabilitiesAdapter } from "../../../features/resources/createResourceCapabilitiesAdapter";
import { createResourceManifestAdapter } from "../../../features/resources/createResourceManifestAdapter";
import { createResourceMetricsHistoryAdapter } from "../../../features/resources/createResourceMetricsHistoryAdapter";
import { createResourcesAdapter } from "../../../features/resources/createResourcesAdapter";
import type { ResourcesEndpointDependencies } from "../../../features/resources/resourcesEndpointContract";
import type { ResourcesFilterPort } from "../../../features/resources/resourcesFilterContract";
import { createResourcesSurface } from "../../../pages/resources/createResourcesSurface";
import { createServiceAccessAdapter } from "../../../features/service-access/createServiceAccessAdapter";
import { createTopologyPorts } from "../topologyPorts";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";
import type { ResourcesRefreshPolicyKey } from "../../../features/resources/resourceMetricsHistoryContract";
import type { TimelinePort } from "../../../features/timeline/timelineContract";
import type { PortForwardSessionPort } from "../../../features/service-access/portForwardSessionContract";
import type { ResourceFilesPort } from "../../../features/resource-files/resourceFilesContract";
import { createChecksProductPort } from "./checks";
import type { ResourceIssuesPort } from "../../../features/issues/resourceIssuesContract";
import { createTrafficProductPort } from "../trafficPort";

export function loadResourcesSurface(
  homePort: HomePort,
  refreshPolicies: BrowserRefreshPolicyRegistry<
    ResourcesRefreshPolicyKey | "port_sessions" | "issues_audit"
  >,
  timelinePort: TimelinePort,
  portForwardSessions: PortForwardSessionPort,
  resourceFilesPort: ResourceFilesPort,
  resourceIssuesPort: ResourceIssuesPort,
  resourcesFilterPort: ResourcesFilterPort,
  getInventorySummary: ResourcesEndpointDependencies["getInventorySummary"],
): ComponentType {
  const topologyPorts = createTopologyPorts();
  return createResourcesSurface(
    createResourcesAdapter({
      getKubernetesApiResources,
      getInventoryResourceDetail,
      getInventorySummary,
      listInventoryResourcesByType,
    }),
    resourcesFilterPort,
    topologyPorts.physical,
    topologyPorts.realtime,
    homePort,
    topologyPorts.relation,
    createChangeTimelineAdapter({ getChangeTimeline, refreshPolicies }),
    timelinePort,
    createResourceMetricsHistoryAdapter({
      getResourceMetricsHistory,
      runScopedMetricQuery,
    }),
    refreshPolicies,
    createResourceCapabilitiesAdapter({ getResourceCapabilities }),
    createResourceActionsAdapter({
      getResourceDeletionPreview,
      getWorkloadRollbackPreview,
      executeResourceCapability(capability, values, context, signal) {
        return executeResourceCapability(capability.path, values, context, signal);
      },
    }),
    createPodTerminalAdapter({ openPodTerminal }),
    createResourceManifestAdapter({
      approveResourceManifestEdit,
      applyResourceManifestNow,
      createResourceManifest,
      dryRunResourceManifestCreate,
      getResourceManifestSource,
      getResourceManifestCreateCapability,
      previewResourceManifestEdit,
    }),
    resourceIssuesPort,
    createChecksProductPort(refreshPolicies),
    createServiceAccessAdapter({
      resolveServiceAccess,
      startServiceRequest,
      cancelCommand(input, signal) {
        return cancelCommand(input, { signal });
      },
    }),
    portForwardSessions,
    resourceFilesPort,
    createTrafficProductPort(),
  );
}
