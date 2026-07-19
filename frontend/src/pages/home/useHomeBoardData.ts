import { useMemo, useState } from "react";

import type { CostPort } from "../../features/cost/costContract";
import type { UnifiedFilterState } from "../../features/filters/filterContract";
import type {
  HomeActivityOverview,
  HomeActivityPort,
  HomeBoardPeriod,
} from "../../features/home-activity/homeActivityContract";
import { activityWindowForPeriod } from "../../features/home-activity/homeActivityWindow";
import { gitOpsSyncCategory } from "../../features/gitops/gitOpsPresentation";
import type { GitOpsPort, GitOpsSyncTarget } from "../../features/gitops/gitOpsContract";
import type { IssueList, IssuesPort } from "../../features/issues/issuesContract";
import type {
  ResourcesEndpointInventorySummary,
} from "../../features/resources/resourcesEndpointContract";
import type {
  ResourcesFilterPort,
  ResourcesFilterResourceItem,
} from "../../features/resources/resourcesFilterContract";
import {
  TimelineFailure,
  type TimelinePort,
  type TimelineSnapshot,
} from "../../features/timeline/timelineContract";
import {
  costRangeForPeriod,
  criticalResourceFilterState,
  homeTimelineQuery,
  projectHomeCost,
} from "./homeBoardDataQueries";
import {
  useHomeBoardResource as useAsyncResource,
  type HomeBoardResource,
} from "./useHomeBoardResource";
export type { HomeBoardResource } from "./useHomeBoardResource";

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
  known: number;
  lastObservedAt: string | null;
  outOfSync: number;
  repositories: number;
  synced: number;
  targets: readonly GitOpsSyncTarget[];
}

export interface HomeNamespacePods {
  namespace: string;
  pods: number;
}

export interface HomeCostProjection {
  changePercent: number | null;
  currency: string;
  periodTotalMicros: number;
  values: readonly number[];
}

export interface HomeBoardScope {
  applications: readonly string[];
  clusterId: string;
  freshness: "live" | "stale" | "partial" | "disconnected";
  namespaces: readonly string[];
  workspaceId: string;
}

export interface HomeBoardData {
  activity: HomeBoardResource<HomeActivityOverview>;
  incidents: HomeBoardResource<IssueList>;
  namespaces: HomeBoardResource<readonly HomeNamespacePods[]>;
  cost: HomeBoardResource<HomeCostProjection | null>;
  criticalResources: HomeBoardResource<readonly ResourcesFilterResourceItem[]>;
  sync: HomeBoardResource<HomeSyncSummary>;
  timeline: HomeBoardResource<TimelineSnapshot | null>;
}

export function useHomeBoardData({
  clusterId,
  filterState,
  period,
  ports,
  refreshKey,
  scope,
  wantsCost,
  wantsCriticalResources,
  wantsNamespaces,
  wantsTimeline,
}: {
  clusterId: string;
  filterState: UnifiedFilterState;
  period: HomeBoardPeriod;
  ports: HomeBoardPorts;
  refreshKey: number;
  scope: HomeBoardScope;
  wantsCost: boolean;
  wantsCriticalResources: boolean;
  wantsNamespaces: boolean;
  wantsTimeline: boolean;
}): HomeBoardData {
  const [mountedAtMs] = useState(() => Date.now());
  const activityQuery = useMemo(
    () => {
      const window = activityWindowForPeriod(
        period,
        refreshKey > 0 ? refreshKey : mountedAtMs,
      );
      return window === null ? null : {
        ...window,
        applications: scope.applications,
        clusterIds: [clusterId],
        namespaces: scope.namespaces,
      };
    },
    [
      clusterId,
      mountedAtMs,
      period,
      refreshKey,
      scope.applications,
      scope.namespaces,
    ],
  );
  const incidents = useAsyncResource(
    (signal) => {
      if (scope.applications.length > 0) {
        return Promise.reject(new Error("issue application scope unavailable"));
      }
      return ports.issues.listIssues(clusterId, 3, signal, {
        namespaces: scope.namespaces,
        severities: [],
        categories: [],
      });
    },
    [clusterId, ports.issues, refreshKey, scope.applications, scope.namespaces],
  );
  const sync = useAsyncResource(
    async (signal) => {
      const [applications, targets] = await Promise.all([
        ports.gitops.listApplications(signal),
        ports.gitops.listSyncTargets(signal, {
          applications: scope.applications,
          clusters: [clusterId],
          namespaces: scope.namespaces,
        }),
      ]);
      const categories = targets.map((target) => gitOpsSyncCategory(target.syncStatus));
      const synced = categories.filter((category) => category === "synced").length;
      const outOfSync = categories.filter((category) => category === "out-of-sync").length;
      const scopedApplicationIds = new Set(targets.map((target) => target.applicationId));
      return {
        known: synced + outOfSync,
        lastObservedAt: latestObservedAt(targets),
        outOfSync,
        repositories: new Set(
          applications
            .filter((application) => scopedApplicationIds.has(application.id))
            .map((application) => application.repository)
            .filter(Boolean),
        ).size,
        synced,
        targets,
      };
    },
    [clusterId, ports.gitops, refreshKey, scope.applications, scope.namespaces],
  );
  const activity = useAsyncResource(
    (signal) => {
      if (scope.applications.length > 0) {
        return Promise.reject(new Error("activity application scope unavailable"));
      }
      if (activityQuery === null) return Promise.reject(new Error("activity window unavailable"));
      return ports.activity.loadOverview(activityQuery, signal);
    },
    [activityQuery, ports.activity, refreshKey, scope.applications],
  );
  const namespaces = useAsyncResource(
    async (signal) => {
      if (!wantsNamespaces) return [];
      const response = await ports.inventory(clusterId, scope.namespaces, signal);
      return response.namespaces
        .map((namespace) => ({
          namespace: namespace.namespace,
          pods: namespace.counts
            .filter((count) => count.resource_type === "pod")
            .reduce((sum, count) => sum + count.count, 0),
        }))
        .filter((namespace) => namespace.pods > 0)
        .sort((left, right) => right.pods - left.pods || left.namespace.localeCompare(right.namespace));
    },
    [clusterId, ports.inventory, refreshKey, scope.namespaces, wantsNamespaces],
  );
  const criticalResources = useAsyncResource(
    async (signal) => {
      if (!wantsCriticalResources) return [];
      const response = await ports.resources.listResourcePage(
        criticalResourceFilterState(filterState, clusterId),
        { limit: 5 },
        signal,
      );
      return response.items.slice(0, 5);
    },
    [clusterId, filterState, ports.resources, refreshKey, wantsCriticalResources],
  );
  const cost = useAsyncResource(
    async (signal) => {
      if (!wantsCost) return null;
      const timeRange = costRangeForPeriod(period);
      if (activityQuery === null) {
        throw new Error("cost period unavailable");
      }
      const overview = await ports.cost.getOverview({
        clusterIds: [clusterId],
        namespaces: scope.namespaces,
        timeRange,
      }, signal);
      return projectHomeCost(overview, activityQuery.fromMs, activityQuery.toMs);
    },
    [
      activityQuery,
      clusterId,
      period,
      ports.cost,
      refreshKey,
      scope.namespaces,
      wantsCost,
    ],
  );
  const timeline = useAsyncResource(
    async (signal) => {
      if (!wantsTimeline) return null;
      if (activityQuery === null) throw new TimelineFailure("invalid-request");
      const capabilities = ports.timeline.readCapabilities
        ? await ports.timeline.readCapabilities(signal, scope.workspaceId)
        : ports.timeline.capabilities;
      return ports.timeline.readTimeline(
        homeTimelineQuery(
          capabilities,
          scope,
          activityQuery.toMs - activityQuery.fromMs,
        ),
        signal,
      );
    },
    [
      activityQuery,
      ports.timeline,
      refreshKey,
      scope,
      wantsTimeline,
    ],
  );
  return { activity, cost, criticalResources, incidents, namespaces, sync, timeline };
}

function latestObservedAt(targets: readonly GitOpsSyncTarget[]): string | null {
  let latest: string | null = null;
  let latestMs = -1;
  for (const target of targets) {
    if (!target.observedAt) continue;
    const value = Date.parse(target.observedAt);
    if (Number.isFinite(value) && value > latestMs) {
      latestMs = value;
      latest = target.observedAt;
    }
  }
  return latest;
}
