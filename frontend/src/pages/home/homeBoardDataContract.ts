import type { CostPort } from "../../features/cost/costContract";
import type {
  HomeActivityOverview,
  HomeActivityPort,
} from "../../features/home-activity/homeActivityContract";
import type { GitOpsPort, GitOpsSyncTarget } from "../../features/gitops/gitOpsContract";
import type { IssueList, IssuesPort } from "../../features/issues/issuesContract";
import type { ResourcesEndpointInventorySummary } from "../../features/resources/resourcesEndpointContract";
import type {
  ResourcesFilterCompleteness,
  ResourcesFilterPort,
  ResourcesFilterResourceItem,
} from "../../features/resources/resourcesFilterContract";
import type { TimelinePort, TimelineSnapshot } from "../../features/timeline/timelineContract";
import type { ClusterScope } from "../../shared/parity/referenceParity";
import type { HomeBoardResource } from "./useHomeBoardResource";

export interface HomeBoardPorts {
  activity: HomeActivityPort;
  cost: Pick<CostPort, "getOverview">;
  gitops: Pick<GitOpsPort, "listApplications" | "listSyncTargets">;
  inventory: (
    clusterId: string,
    namespaces?: readonly string[],
    signal?: AbortSignal,
  ) => Promise<ResourcesEndpointInventorySummary>;
  issues: Pick<IssuesPort, "listIssues">;
  resources: Pick<ResourcesFilterPort, "listResourcePage">;
  timeline: Pick<TimelinePort, "capabilities" | "readCapabilities" | "readTimeline">;
}

export interface HomeSyncSummary {
  completeness: "exact" | "partial";
  known: number;
  lastObservedAt: string | null;
  outOfSync: number;
  repositories: number;
  synced: number;
  targets: readonly GitOpsSyncTarget[];
  unknown: number;
}

export interface HomeNamespacePods {
  clusterIds: readonly string[];
  namespace: string;
  pods: number;
}

export interface HomeNamespacePodProjection {
  incompleteClusterIds: readonly string[];
  items: readonly HomeNamespacePods[];
}

export interface HomeCostProjection {
  changePercent: number | null;
  currency: string;
  periodTotalMicros: number;
  values: readonly number[];
}

export interface HomeCriticalResourcesProjection {
  filteredCount: number | null;
  filteredCountCompleteness: ResourcesFilterCompleteness;
  items: readonly ResourcesFilterResourceItem[];
}

export interface HomeBoardScope {
  applications: readonly string[];
  allAccessible: boolean;
  clusters: readonly ClusterScope[];
}

export interface HomeBoardData {
  activity: HomeBoardResource<HomeActivityOverview>;
  incidents: HomeBoardResource<IssueList>;
  namespaces: HomeBoardResource<HomeNamespacePodProjection>;
  cost: HomeBoardResource<HomeCostProjection | null>;
  criticalResources: HomeBoardResource<HomeCriticalResourcesProjection>;
  sync: HomeBoardResource<HomeSyncSummary>;
  timeline: HomeBoardResource<TimelineSnapshot | null>;
}
