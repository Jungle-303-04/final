import type { ComponentType } from "react";
import {
  approveResourceManifestEdit,
  cancelCommand,
  executeResourceCapability,
  getChangeTimeline,
  getKubernetesApiResources,
  getInventoryResourceDetail,
  getInventorySummary,
  getResourceIssues,
  getResourceCapabilities,
  getResourceManifestSource,
  getResourceMetricsHistory,
  listFilteredResources,
  listInventoryResourcesByType,
  listResourceFilterFacets,
  listResourceLabelFacets,
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
import { createResourcesFilterAdapter } from "../../../features/resources/createResourcesFilterAdapter";
import { createResourcesSurface } from "../../../pages/resources/createResourcesSurface";
import { createResourceIssuesAdapter } from "../../../features/issues/createResourceIssuesAdapter";
import { createServiceAccessAdapter } from "../../../features/service-access/createServiceAccessAdapter";
import { createTopologyPorts } from "../topologyPorts";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";
import type { ResourcesRefreshPolicyKey } from "../../../features/resources/resourceMetricsHistoryContract";
import type { TimelinePort } from "../../../features/timeline/timelineContract";
import type { PortForwardSessionPort } from "../../../features/service-access/portForwardSessionContract";

export function loadResourcesSurface(
  homePort: HomePort,
  refreshPolicies: BrowserRefreshPolicyRegistry<ResourcesRefreshPolicyKey | "port_sessions">,
  timelinePort: TimelinePort,
  portForwardSessions: PortForwardSessionPort,
): ComponentType {
  const topologyPorts = createTopologyPorts();
  return createResourcesSurface(
    createResourcesAdapter({
      getKubernetesApiResources,
      getInventoryResourceDetail,
      getInventorySummary,
      listInventoryResourcesByType,
    }),
    createResourcesFilterAdapter({
      listFilteredResources,
      listResourceFilterFacets,
      listResourceLabelFacets,
    }),
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
      executeResourceCapability(capability, values, signal) {
        return executeResourceCapability(capability.path, values, signal);
      },
    }),
    createPodTerminalAdapter({ openPodTerminal }),
    createResourceManifestAdapter({
      approveResourceManifestEdit,
      getResourceManifestSource,
      previewResourceManifestEdit,
    }),
    createResourceIssuesAdapter({ getResourceIssues }),
    createServiceAccessAdapter({
      resolveServiceAccess,
      startServiceRequest,
      cancelCommand(input, signal) {
        return cancelCommand(input, { signal });
      },
    }),
    portForwardSessions,
  );
}
