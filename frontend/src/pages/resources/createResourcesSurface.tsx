import type { ComponentType } from "react";
import type { HomePort } from "../../features/home/homeContract";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesFilterPort } from "../../features/resources/resourcesFilterContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import type { PhysicalTopologyRealtimePort } from "../../features/resources/physicalTopologyRealtimeContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";
import type { ChangeTimelinePort } from "../../features/resources/changeTimelineContract";
import type {
  ResourceMetricsHistoryPort,
  ResourcesRefreshPolicyKey,
} from "../../features/resources/resourceMetricsHistoryContract";
import type {
  ResourceActionsPort,
  ResourceCapabilitiesPort,
} from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceManifestPort } from "../../features/resources/resourceManifestContract";
import type { ResourceIssuesPort } from "../../features/issues/resourceIssuesContract";
import type { ChecksPort } from "../../features/checks/checksContract";
import { ResourcesPage } from "./ResourcesPage";
import {
  EMPTY_POD_TERMINAL_PORT,
  type PodTerminalPort,
} from "../../features/pod-terminal/podTerminalContract";
import type { ServiceAccessPort } from "../../features/service-access/serviceAccessContract";
import type { PortForwardSessionPort } from "../../features/service-access/portForwardSessionContract";
import type { TimelinePort } from "../../features/timeline/timelineContract";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import type { TrafficPort } from "../../features/traffic/trafficContract";

export function createResourcesSurface(
  port: ResourcesPort,
  filterPort: ResourcesFilterPort,
  physicalTopologyPort: PhysicalTopologyPort,
  physicalTopologyRealtimePort: PhysicalTopologyRealtimePort,
  nodePodsPort: Pick<HomePort, "loadNodePods">,
  relationTopologyPort: RelationTopologyPort,
  changeTimelinePort: ChangeTimelinePort,
  timelinePort: TimelinePort,
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort,
  refreshPolicies: BrowserRefreshPolicyRegistry<ResourcesRefreshPolicyKey>,
  resourceCapabilitiesPort: ResourceCapabilitiesPort,
  resourceActionsPort: ResourceActionsPort,
  podTerminalPort: PodTerminalPort = EMPTY_POD_TERMINAL_PORT,
  resourceManifestPort?: ResourceManifestPort,
  resourceIssuesPort?: ResourceIssuesPort,
  checksPort?: ChecksPort,
  serviceAccessPort?: ServiceAccessPort,
  portForwardSessions?: PortForwardSessionPort,
  trafficPort?: TrafficPort,
): ComponentType {
  function ResourcesSurface() {
    return (
      <ResourcesPage
        filterPort={filterPort}
        physicalTopologyPort={physicalTopologyPort}
        physicalTopologyRealtimePort={physicalTopologyRealtimePort}
        nodePodsPort={nodePodsPort}
        relationTopologyPort={relationTopologyPort}
        changeTimelinePort={changeTimelinePort}
        timelinePort={timelinePort}
        resourceMetricsHistoryPort={resourceMetricsHistoryPort}
        refreshPolicies={refreshPolicies}
        resourceCapabilitiesPort={resourceCapabilitiesPort}
        resourceActionsPort={resourceActionsPort}
        podTerminalPort={podTerminalPort}
        resourceManifestPort={resourceManifestPort}
        resourceIssuesPort={resourceIssuesPort}
        checksPort={checksPort}
        serviceAccessPort={serviceAccessPort}
        portForwardSessions={portForwardSessions}
        port={port}
        trafficPort={trafficPort}
      />
    );
  }
  ResourcesSurface.displayName = "ResourcesSurface";
  return ResourcesSurface;
}
