import { useCallback, useEffect, useMemo, useState } from "react";

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
  clusterId: string;
  freshness: "live" | "stale" | "partial" | "disconnected";
  namespaces: readonly string[];
  workspaceId: string;
}

export type HomeBoardResource<T> =
  | { phase: "loading" }
  | { phase: "failed"; retry: () => void }
  | { data: T; phase: "ready"; retry: () => void };

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
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((current) => current + 1), []);
  const activityQuery = useMemo(
    () => activityWindowForPeriod(period, refreshKey > 0 ? refreshKey : mountedAtMs),
    [mountedAtMs, period, refreshKey],
  );
  const incidents = useAsyncResource(
    (signal) => ports.issues.listIssues(clusterId, 3, signal),
    [clusterId, ports.issues, refreshKey, revision],
    retry,
  );
  const sync = useAsyncResource(
    async (signal) => {
      const [applications, targets] = await Promise.all([
        ports.gitops.listApplications(signal),
        ports.gitops.listSyncTargets(signal, { clusters: [clusterId] }),
      ]);
      const categories = targets.map((target) => gitOpsSyncCategory(target.syncStatus));
      const synced = categories.filter((category) => category === "synced").length;
      const outOfSync = categories.filter((category) => category === "out-of-sync").length;
      return {
        known: synced + outOfSync,
        lastObservedAt: latestObservedAt(targets),
        outOfSync,
        repositories: new Set(
          applications.map((application) => application.repository).filter(Boolean),
        ).size,
        synced,
        targets,
      };
    },
    [clusterId, ports.gitops, refreshKey, revision],
    retry,
  );
  const activity = useAsyncResource(
    (signal) => {
      if (activityQuery === null) return Promise.reject(new Error("activity window unavailable"));
      return ports.activity.loadOverview(activityQuery, signal);
    },
    [activityQuery, ports.activity, refreshKey, revision],
    retry,
  );
  const namespaces = useAsyncResource(
    async (signal) => {
      if (!wantsNamespaces) return [];
      const response = await ports.inventory(clusterId, [], signal);
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
    [clusterId, ports.inventory, refreshKey, revision, wantsNamespaces],
    retry,
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
    [clusterId, filterState, ports.resources, refreshKey, revision, wantsCriticalResources],
    retry,
  );
  const cost = useAsyncResource(
    async (signal) => {
      if (!wantsCost) return null;
      const timeRange = costRangeForPeriod(period);
      if (timeRange === null || activityQuery === null) {
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
      revision,
      scope.namespaces,
      wantsCost,
    ],
    retry,
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
      revision,
      scope,
      wantsTimeline,
    ],
    retry,
  );
  return { activity, cost, criticalResources, incidents, namespaces, sync, timeline };
}

function useAsyncResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[],
  retry: () => void,
): HomeBoardResource<T> {
  const [state, setState] = useState<HomeBoardResource<T>>({ phase: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (active) setState({ phase: "loading" });
    });
    void load(controller.signal).then(
      (data) => {
        if (active) setState({ data, phase: "ready", retry });
      },
      (error: unknown) => {
        if (active && !isAbortError(error)) setState({ phase: "failed", retry });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
    // Each caller supplies the complete request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return state;
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

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
