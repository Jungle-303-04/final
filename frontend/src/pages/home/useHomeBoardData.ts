import { useMemo, useState } from "react";

import type { CostPort } from "../../features/cost/costContract";
import type { UnifiedFilterState } from "../../features/filters/filterContract";
import { namespaceSelector } from "../../features/filters/filterUrlSyntax";
import type {
  HomeActivityOverview,
  HomeActivityPort,
  HomeBoardPeriod,
} from "../../features/home-activity/homeActivityContract";
import { activityWindowForPeriod } from "../../features/home-activity/homeActivityWindow";
import { gitOpsSyncCategory } from "../../features/gitops/gitOpsPresentation";
import type { GitOpsPort, GitOpsSyncTarget } from "../../features/gitops/gitOpsContract";
import type {
  IssueList,
  IssueQueueFacet,
  IssueQueueFilters,
  IssuesPort,
} from "../../features/issues/issuesContract";
import { sortIssuesForQueue } from "../../features/issues/issuePresentation";
import type {
  ResourcesEndpointInventorySummary,
} from "../../features/resources/resourcesEndpointContract";
import type {
  ResourcesFilterCompleteness,
  ResourcesFilterPort,
  ResourcesFilterResourceItem,
} from "../../features/resources/resourcesFilterContract";
import {
  TimelineFailure,
  type TimelinePort,
  type TimelineSnapshot,
} from "../../features/timeline/timelineContract";
import type { ClusterScope } from "../../shared/parity/referenceParity";
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

export function useHomeBoardData({
  filterState,
  period,
  ports,
  refreshKey,
  scope,
  wantsCost,
  wantsNamespaces,
  wantsTimeline,
}: {
  filterState: UnifiedFilterState;
  period: HomeBoardPeriod;
  ports: HomeBoardPorts;
  refreshKey: number;
  scope: HomeBoardScope;
  wantsCost: boolean;
  wantsNamespaces: boolean;
  wantsTimeline: boolean;
}): HomeBoardData {
  const [mountedAtMs] = useState(() => Date.now());
  const clusterIds = useMemo(
    () => scope.clusters.map((cluster) => cluster.clusterId),
    [scope.clusters],
  );
  const activityNamespaceNames = useMemo(
    () => [...new Set(scope.clusters.flatMap((cluster) => cluster.namespaces ?? []))]
      .sort((left, right) => left.localeCompare(right)),
    [scope.clusters],
  );
  const namespaceReferences = useMemo(
    () => [...new Set(scope.clusters.flatMap((cluster) =>
      (cluster.namespaces ?? []).map((namespace) => namespaceSelector({
        clusterId: cluster.clusterId,
        namespace,
      }))
    ))].sort((left, right) => left.localeCompare(right)),
    [scope.clusters],
  );
  const activityQuery = useMemo(
    () => {
      const window = activityWindowForPeriod(
        period,
        refreshKey > 0 ? refreshKey : mountedAtMs,
      );
      return window === null || clusterIds.length === 0 ? null : {
        ...window,
        applications: scope.applications,
        clusterIds,
        namespaces: activityNamespaceNames,
      };
    },
    [
      clusterIds,
      mountedAtMs,
      activityNamespaceNames,
      period,
      refreshKey,
      scope.applications,
    ],
  );
  const incidents = useAsyncResource(
    (signal) => {
      if (scope.applications.length > 0) {
        return Promise.reject(new Error("issue application scope unavailable"));
      }
      return loadScopedIssues(ports.issues, scope, signal, {
        namespaces: namespaceReferences,
        severities: [],
        categories: [],
      });
    },
    [namespaceReferences, ports.issues, refreshKey, scope],
  );
  const sync = useAsyncResource(
    async (signal) => {
      requireClusterScope(clusterIds);
      const [applications, targets] = await Promise.all([
        ports.gitops.listApplications(signal),
        ports.gitops.listSyncTargets(signal, {
          applications: scope.applications,
          clusters: clusterIds,
          namespaces: namespaceReferences,
        }),
      ]);
      const categories = targets.map((target) => gitOpsSyncCategory(target.syncStatus));
      const synced = categories.filter((category) => category === "synced").length;
      const outOfSync = categories.filter((category) => category === "out-of-sync").length;
      const scopedApplicationIds = new Set(targets.flatMap((target) =>
        target.applicationIds && target.applicationIds.length > 0
          ? target.applicationIds
          : [target.applicationId]
      ));
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
    [clusterIds, namespaceReferences, ports.gitops, refreshKey, scope.applications],
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
  const namespacePods = useAsyncResource(
    async (signal) => {
      if (!wantsNamespaces) return { incompleteClusterIds: [], items: [] };
      requireClusterScope(clusterIds);
      const result = await fanOutClusters(scope.clusters, signal, (cluster, clusterSignal) =>
        ports.inventory(cluster.clusterId, cluster.namespaces, clusterSignal)
      );
      if (result.successes.length === 0 && result.failures.length > 0) {
        throw result.failures[0]!.error;
      }
      const podsByNamespace = new Map<string, number>();
      for (const { value } of result.successes) {
        for (const namespace of value.namespaces) {
          const pods = namespace.counts
            .filter((count) => count.resource_type === "pod")
            .reduce((sum, count) => sum + count.count, 0);
          if (pods <= 0) continue;
          podsByNamespace.set(
            namespace.namespace,
            (podsByNamespace.get(namespace.namespace) ?? 0) + pods,
          );
        }
      }
      return {
        incompleteClusterIds: result.failures.map((failure) => failure.clusterId),
        items: [...podsByNamespace]
          .map(([namespace, pods]) => ({ namespace, pods }))
          .sort((left, right) =>
            right.pods - left.pods || left.namespace.localeCompare(right.namespace)
          ),
      };
    },
    [clusterIds, ports.inventory, refreshKey, scope.clusters, wantsNamespaces],
  );
  const criticalResources = useAsyncResource(
    async (signal) => {
      requireClusterScope(clusterIds);
      const response = await ports.resources.listResourcePage(
        criticalResourceFilterState(filterState, clusterIds),
        { limit: 5 },
        signal,
      );
      return {
        filteredCount: response.counts.filteredCount,
        filteredCountCompleteness: response.counts.filteredCountCompleteness,
        items: response.items.slice(0, 5),
      };
    },
    [clusterIds, filterState, ports.resources, refreshKey],
  );
  const cost = useAsyncResource(
    async (signal) => {
      if (!wantsCost) return null;
      const timeRange = costRangeForPeriod(period);
      if (activityQuery === null) {
        throw new Error("cost period unavailable");
      }
      const overview = await ports.cost.getOverview({
        clusterIds,
        namespaces: namespaceReferences,
        timeRange,
      }, signal);
      return projectHomeCost(overview, activityQuery.fromMs, activityQuery.toMs);
    },
    [
      activityQuery,
      clusterIds,
      namespaceReferences,
      period,
      ports.cost,
      refreshKey,
      wantsCost,
    ],
  );
  const timeline = useAsyncResource(
    async (signal) => {
      if (!wantsTimeline) return null;
      if (activityQuery === null) throw new TimelineFailure("invalid-request");
      const capabilities = ports.timeline.readCapabilities
        ? await ports.timeline.readCapabilities(signal, timelineWorkspaceCacheKey(scope))
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
  return {
    activity,
    cost,
    criticalResources,
    incidents,
    namespaces: namespacePods,
    sync,
    timeline,
  };
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

async function loadScopedIssues(
  port: Pick<IssuesPort, "listIssues">,
  scope: HomeBoardScope,
  signal: AbortSignal,
  filters: IssueQueueFilters,
): Promise<IssueList> {
  requireClusterScope(scope.clusters.map((cluster) => cluster.clusterId));
  if (scope.allAccessible) {
    return port.listIssues(null, 3, signal, filters);
  }
  if (scope.clusters.length === 1) {
    const cluster = scope.clusters[0]!;
    return port.listIssues(cluster.clusterId, 3, signal, {
      ...filters,
      namespaces: namespaceReferencesForCluster(cluster),
    });
  }
  const result = await fanOutClusters(scope.clusters, signal, (cluster, clusterSignal) =>
    port.listIssues(cluster.clusterId, 3, clusterSignal, {
      ...filters,
      namespaces: namespaceReferencesForCluster(cluster),
    })
  );
  if (result.successes.length === 0 && result.failures.length > 0) {
    throw result.failures[0]!.error;
  }
  return mergeIssueLists(
    result.successes.map((success) => success.value),
    result.failures.map((failure) => failure.clusterId),
    filters,
  );
}

function namespaceReferencesForCluster(cluster: ClusterScope): string[] {
  return [...new Set((cluster.namespaces ?? []).map((namespace) => namespaceSelector({
    clusterId: cluster.clusterId,
    namespace,
  })))].sort((left, right) => left.localeCompare(right));
}

function mergeIssueLists(
  lists: readonly IssueList[],
  incompleteClusterIds: readonly string[],
  filters: IssueQueueFilters,
): IssueList {
  const uniqueItems = new Map<string, IssueList["items"][number]>();
  for (const list of lists) {
    for (const item of list.items) {
      if (!uniqueItems.has(item.id)) uniqueItems.set(item.id, item);
    }
  }
  const candidates = sortIssuesForQueue([...uniqueItems.values()]);
  const items = candidates.slice(0, 3);
  const partial = incompleteClusterIds.length > 0 || lists.some(
    (list) => list.completeness !== "exact" || list.visibility.completeness !== "exact",
  );
  const visibilityState = incompleteClusterIds.length > 0 || lists.some(
    (list) => list.visibility.state === "partial",
  )
    ? "partial" as const
    : lists.some((list) => list.visibility.state === "restricted")
    ? "restricted" as const
    : "complete" as const;
  return {
    clusterId: null,
    completeness: partial ? "partial" : "exact",
    dataQualityWarnings: lists.flatMap((list) => list.dataQualityWarnings),
    excludedCount: sumNumbers(lists.map((list) => list.excludedCount)),
    items,
    limit: 3,
    limitReached: candidates.length > items.length || lists.some((list) => list.limitReached),
    returned: items.length,
    total: sumNumbers(lists.map((list) => list.total)),
    totalMatched: sumNumbers(lists.map((list) => list.totalMatched)),
    filters,
    visibility: {
      state: visibilityState,
      completeness: partial ? "partial" : "exact",
      authorizedClusterCount: exactNullableSum(
        lists.map((list) => list.visibility.authorizedClusterCount),
      ),
      requestedNamespaces: filters.namespaces,
      reasonCodes: [
        ...new Set([
          ...lists.flatMap((list) => list.visibility.reasonCodes),
          ...(incompleteClusterIds.length > 0 ? ["client-cluster-request-failed"] : []),
        ]),
      ],
    },
    facets: {
      categories: mergeIssueFacets(lists.flatMap((list) => list.facets.categories)),
      namespaces: mergeIssueFacets(lists.flatMap((list) => list.facets.namespaces)),
      severities: mergeIssueFacets(lists.flatMap((list) => list.facets.severities)),
    },
    recentChanges: lists
      .flatMap((list) => list.recentChanges)
      .sort((left, right) => Date.parse(right.changed_at) - Date.parse(left.changed_at)),
  };
}

function mergeIssueFacets(facets: readonly IssueQueueFacet[]): IssueQueueFacet[] {
  const counts = new Map<string, number>();
  for (const facet of facets) {
    counts.set(facet.value, (counts.get(facet.value) ?? 0) + facet.count);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function exactNullableSum(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

const HOME_FLEET_FAN_OUT_CONCURRENCY = 3;

interface FleetFanOutResult<T> {
  failures: Array<{ clusterId: string; error: unknown }>;
  successes: Array<{ clusterId: string; value: T }>;
}

async function fanOutClusters<T>(
  clusters: readonly ClusterScope[],
  signal: AbortSignal,
  load: (cluster: ClusterScope, signal: AbortSignal) => Promise<T>,
): Promise<FleetFanOutResult<T>> {
  const ordered = [...clusters].sort((left, right) =>
    left.clusterId.localeCompare(right.clusterId)
  );
  const records: Array<
    | { kind: "success"; clusterId: string; value: T }
    | { kind: "failure"; clusterId: string; error: unknown }
    | undefined
  > = new Array(ordered.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < ordered.length) {
      throwIfAborted(signal);
      const index = nextIndex;
      nextIndex += 1;
      const cluster = ordered[index]!;
      try {
        records[index] = {
          clusterId: cluster.clusterId,
          kind: "success",
          value: await load(cluster, signal),
        };
      } catch (error) {
        if (isAbortError(error) || signal.aborted) throw error;
        records[index] = { clusterId: cluster.clusterId, error, kind: "failure" };
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(HOME_FLEET_FAN_OUT_CONCURRENCY, ordered.length) },
      () => worker(),
    ),
  );
  const result: FleetFanOutResult<T> = { failures: [], successes: [] };
  for (const record of records) {
    if (!record) continue;
    if (record.kind === "success") result.successes.push(record);
    else result.failures.push(record);
  }
  return result;
}

function timelineWorkspaceCacheKey(scope: HomeBoardScope): string {
  return [...new Set(scope.clusters.map((cluster) => cluster.workspaceId))]
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function requireClusterScope(clusterIds: readonly string[]): void {
  if (clusterIds.length === 0) throw new Error("home fleet scope unavailable");
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Aborted", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
