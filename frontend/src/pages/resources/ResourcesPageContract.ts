import type { ChecksPort } from "../../features/checks/checksContract";
import type { GitOpsPort } from "../../features/gitops/gitOpsContract";
import type { HomePort } from "../../features/home/homeContract";
import type { ResourceIssuesPort } from "../../features/issues/resourceIssuesContract";
import type { PodTerminalPort } from "../../features/pod-terminal/podTerminalContract";
import type { ResourceFilesPort } from "../../features/resource-files/resourceFilesContract";
import type {
  ResourceActionsPort,
  ResourceCapabilitiesPort,
} from "../../features/resources/resourceCapabilitiesContract";
import type { ChangeTimelinePort } from "../../features/resources/changeTimelineContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import type { PhysicalTopologyRealtimePort } from "../../features/resources/physicalTopologyRealtimeContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";
import type { ResourceManifestPort } from "../../features/resources/resourceManifestContract";
import type {
  ResourceMetricsHistoryPort,
  ResourcesRefreshPolicyKey,
} from "../../features/resources/resourceMetricsHistoryContract";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesFilterPort } from "../../features/resources/resourcesFilterContract";
import type { PortForwardSessionPort } from "../../features/service-access/portForwardSessionContract";
import type { ServiceAccessPort } from "../../features/service-access/serviceAccessContract";
import type { TimelinePort } from "../../features/timeline/timelineContract";
import type { TrafficPort } from "../../features/traffic/trafficContract";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";

export interface ResourcesPageProps {
  filterPort: ResourcesFilterPort;
  physicalTopologyPort: PhysicalTopologyPort;
  physicalTopologyRealtimePort: PhysicalTopologyRealtimePort;
  nodePodsPort: Pick<HomePort, "loadNodePods">;
  relationTopologyPort: RelationTopologyPort;
  changeTimelinePort: ChangeTimelinePort;
  timelinePort?: TimelinePort;
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort;
  refreshPolicies: BrowserRefreshPolicyRegistry<ResourcesRefreshPolicyKey>;
  resourceCapabilitiesPort: ResourceCapabilitiesPort;
  resourceActionsPort: ResourceActionsPort;
  podTerminalPort?: PodTerminalPort;
  serviceAccessPort?: ServiceAccessPort;
  portForwardSessions?: PortForwardSessionPort;
  resourceManifestPort?: ResourceManifestPort;
  resourceIssuesPort?: ResourceIssuesPort;
  checksPort?: ChecksPort;
  resourceFilesPort?: ResourceFilesPort;
  trafficPort?: TrafficPort;
  repositoryLineagePort?: Pick<GitOpsPort, "listApplications" | "listSyncTargets">;
  port: ResourcesPort;
}
