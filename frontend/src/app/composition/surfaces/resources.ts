import type { ComponentType } from "react";
import {
  approveResourceManifestEdit,
  createRealtimeClient,
  executeResourceCapability,
  getChangeTimeline,
  getInventoryResourceDetail,
  getInventorySummary,
  getPhysicalTopology,
  getRelationTopology,
  getResourceCapabilities,
  getResourceManifestSource,
  getResourceMetricsHistory,
  listFilteredResources,
  listInventoryResourcesByType,
  listResourceFilterFacets,
  listResourceLabelFacets,
  openPodTerminal,
  previewResourceManifestEdit,
} from "../../../api";
import type { HomePort } from "../../../features/home/homeContract";
import { createPodTerminalAdapter } from "../../../features/pod-terminal/createPodTerminalAdapter";
import { createChangeTimelineAdapter } from "../../../features/resources/createChangeTimelineAdapter";
import { createPhysicalTopologyAdapter } from "../../../features/resources/createPhysicalTopologyAdapter";
import { createRelationTopologyAdapter } from "../../../features/resources/createRelationTopologyAdapter";
import { createResourceActionsAdapter } from "../../../features/resources/createResourceActionsAdapter";
import { createResourceCapabilitiesAdapter } from "../../../features/resources/createResourceCapabilitiesAdapter";
import { createResourceManifestAdapter } from "../../../features/resources/createResourceManifestAdapter";
import { createResourceMetricsHistoryAdapter } from "../../../features/resources/createResourceMetricsHistoryAdapter";
import { createResourcesAdapter } from "../../../features/resources/createResourcesAdapter";
import { createResourcesFilterAdapter } from "../../../features/resources/createResourcesFilterAdapter";
import type { PhysicalTopologyRealtimePort } from "../../../features/resources/physicalTopologyRealtimeContract";
import { createResourcesSurface } from "../../../pages/resources/createResourcesSurface";

export function loadResourcesSurface(homePort: HomePort): ComponentType {
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
  return createResourcesSurface(
    createResourcesAdapter({
      getInventoryResourceDetail,
      getInventorySummary,
      listInventoryResourcesByType,
    }),
    createResourcesFilterAdapter({
      listFilteredResources,
      listResourceFilterFacets,
      listResourceLabelFacets,
    }),
    createPhysicalTopologyAdapter({ getPhysicalTopology }),
    physicalTopologyRealtimePort,
    homePort,
    createRelationTopologyAdapter({ getRelationTopology }),
    createChangeTimelineAdapter({ getChangeTimeline }),
    createResourceMetricsHistoryAdapter({ getResourceMetricsHistory }),
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
  );
}
