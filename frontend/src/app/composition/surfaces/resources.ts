import type { ComponentType } from "react";
import {
  approveResourceManifestEdit,
  cancelCommand,
  createRealtimeClient,
  executeResourceCapability,
  getChangeTimeline,
  getKubernetesApiResources,
  getInventoryResourceDetail,
  getInventorySummary,
  getPhysicalTopology,
  getRelationTopology,
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
  startServiceRequest,
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
import type {
  PhysicalTopologyRealtimePort,
  PhysicalTopologyRealtimeStreamPolicy,
} from "../../../features/resources/physicalTopologyRealtimeContract";
import { createResourcesSurface } from "../../../pages/resources/createResourcesSurface";
import { createResourceIssuesAdapter } from "../../../features/issues/createResourceIssuesAdapter";
import { createServiceAccessAdapter } from "../../../features/service-access/createServiceAccessAdapter";

export function loadResourcesSurface(homePort: HomePort): ComponentType {
  const physicalTopologyRealtimePort: PhysicalTopologyRealtimePort = {
    connect(subscription, handlers) {
      const client = createRealtimeClient({
        subscription,
        reconnect: { baseDelayMs: 3_000, maxDelayMs: 30_000 },
        onMessage: (message) => {
          if (message.type === "hello") {
            handlers.onPolicy(toPhysicalTopologyStreamPolicy(message.stream_policy));
            return;
          }
          // Keep protocol keepalives outside the topology state reducer.
          if (message.type !== "ping") handlers.onMessage(message);
        },
        onStateChange: (state) => handlers.onStatusChange(state.status),
      });
      client.connect();
      return () => client.close();
    },
  };
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
    createResourceIssuesAdapter({ getResourceIssues }),
    createServiceAccessAdapter({
      resolveServiceAccess,
      startServiceRequest,
      cancelCommand(input, signal) {
        return cancelCommand(input, { signal });
      },
    }),
  );
}

function toPhysicalTopologyStreamPolicy(policy: {
  revision: number;
  max_frames_per_second: number;
  hidden_tab: "coalesce";
  max_pending_messages: number;
}): PhysicalTopologyRealtimeStreamPolicy {
  return {
    revision: policy.revision,
    maxFramesPerSecond: policy.max_frames_per_second,
    hiddenTab: policy.hidden_tab,
    maxPendingMessages: policy.max_pending_messages,
  };
}
