import { useMemo } from "react";

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
import type {
  GitOpsPort,
  GitOpsSyncTarget,
  ReleaseApplication,
} from "../../features/gitops/gitOpsContract";
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

export function useHomeBoardData({
  filterState,
  period,
  ports,
  refreshKey,
  scope,
  windowAnchorMs,
  wantsCost,
  wantsNamespaces,
  wantsTimeline,
}: {
  filterState: UnifiedFilterState;
  period: HomeBoardPeriod;
  ports: HomeBoardPorts;
  refreshKey: number;
  scope: HomeBoardScope;
  windowAnchorMs: number;
  wantsCost: boolean;
  wantsNamespaces: boolean;
  wantsTimeline: boolean;
}): HomeBoardData {
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
      const window = activityWindowForPeriod(period, windowAnchorMs);
      return window === null || clusterIds.length === 0 ? null : {
        ...window,
        applications: scope.applications,
        clusterIds,
        namespaces: activityNamespaceNames,
      };
    },
    [
      activityNamespaceNames,
      clusterIds,
      period,
      scope.applications,
      windowAnchorMs,
    ],
  );
  const incidents = useAsyncResource(
    async (signal) => {
      requireSupportedApplicationScope(scope);
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
      requireSupportedApplicationScope(scope);
      requireClusterScope(clusterIds);
      const [applications, targets] = await Promise.all([
        ports.gitops.listApplications(signal),
        ports.gitops.listSyncTargets(signal, {
          applications: scope.applications,
          clusters: clusterIds,
          namespaces: namespaceReferences,
        }),
      ]);
      const repositorySummary = summarizeRepositorySync(
        applications.filter((application) => clusterIds.includes(application.clusterId)),
        targets,
      );
      return {
        completeness: repositorySummary.unknown > 0 ? "partial" as const : "exact" as const,
        known: repositorySummary.synced + repositorySummary.outOfSync,
        lastObservedAt: latestObservedAt(targets),
        outOfSync: repositorySummary.outOfSync,
        repositories: repositorySummary.repositories,
        synced: repositorySummary.synced,
        targets,
        unknown: repositorySummary.unknown,
      };
    },
    [clusterIds, namespaceReferences, ports.gitops, refreshKey, scope.applications],
  );
  const activity = useAsyncResource(
    async (signal) => {
      requireSupportedApplicationScope(scope);
      if (activityQuery === null) throw new Error("activity window unavailable");
      return ports.activity.loadOverview(activityQuery, signal);
    },
    [activityQuery, ports.activity, refreshKey, scope.applications],
  );
  const namespacePods = useAsyncResource(
    async (signal) => {
      if (!wantsNamespaces) return { incompleteClusterIds: [], items: [] };
      requireSupportedApplicationScope(scope);
      requireClusterScope(clusterIds);
      const result = await fanOutClusters(scope.clusters, signal, (cluster, clusterSignal) =>
        ports.inventory(cluster.clusterId, cluster.namespaces, clusterSignal)
      );
      if (result.successes.length === 0 && result.failures.length > 0) {
        throw result.failures[0]!.error;
      }
      const podsByNamespace = new Map<string, { clusterIds: Set<string>; pods: number }>();
      for (const { clusterId, value } of result.successes) {
        for (const namespace of value.namespaces) {
          const pods = namespace.counts
            .filter((count) => count.resource_type === "pod")
            .reduce((sum, count) => sum + count.count, 0);
          if (pods <= 0) continue;
          const aggregate = podsByNamespace.get(namespace.namespace) ?? {
            clusterIds: new Set<string>(),
            pods: 0,
          };
          aggregate.clusterIds.add(clusterId);
          aggregate.pods += pods;
          podsByNamespace.set(namespace.namespace, aggregate);
        }
      }
      return {
        incompleteClusterIds: result.failures.map((failure) => failure.clusterId),
        items: [...podsByNamespace]
          .map(([namespace, aggregate]) => ({
            clusterIds: [...aggregate.clusterIds].sort((left, right) => left.localeCompare(right)),
            namespace,
            pods: aggregate.pods,
          }))
          .sort((left, right) =>
            right.pods - left.pods || left.namespace.localeCompare(right.namespace)
          ),
      };
    },
    [clusterIds, ports.inventory, refreshKey, scope.applications, scope.clusters, wantsNamespaces],
  );
  const criticalResources = useAsyncResource(
    async (signal) => {
      requireSupportedApplicationScope(scope);
      requireClusterScope(clusterIds);
      const response = await ports.resources.listResourcePage(
        criticalResourceFilterState(filterState, clusterIds),
        { limit: 5 },
        signal,
      );
      return {
        filteredCount: response.counts.filteredCount,
        filteredCountCompleteness: response.counts.filteredCountCompleteness,
        items: [...response.items].sort(compareAttentionResourceHealth).slice(0, 5),
      };
    },
    [clusterIds, filterState, ports.resources, refreshKey, scope.applications],
  );
  const cost = useAsyncResource(
    async (signal) => {
      if (!wantsCost) return null;
      requireSupportedApplicationScope(scope);
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
      scope.applications,
      wantsCost,
    ],
  );
  const timeline = useAsyncResource(
    async (signal) => {
      if (!wantsTimeline) return null;
      requireSupportedApplicationScope(scope);
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

function compareAttentionResourceHealth(
  left: ResourcesFilterResourceItem,
  right: ResourcesFilterResourceItem,
): number {
  const rank = (item: ResourcesFilterResourceItem) =>
    item.resource.health === "critical" ? 0 : item.resource.health === "warning" ? 1 : 2;
  return rank(left) - rank(right)
    || left.resource.inventoryKey.localeCompare(right.resource.inventoryKey);
}

function summarizeRepositorySync(
  applications: readonly ReleaseApplication[],
  targets: readonly GitOpsSyncTarget[],
): { outOfSync: number; repositories: number; synced: number; unknown: number } {
  const repositoryByApplicationId = new Map(
    applications
      .map((application) => [application.id, application.repository.trim()] as const)
      .filter(([, repository]) => repository.length > 0),
  );
  const states = new Map<string, "out-of-sync" | "synced" | "unknown" | "unobserved">(
    [...new Set(repositoryByApplicationId.values())].map((repository) => [
      repository,
      "unobserved",
    ]),
  );
  for (const target of targets) {
    const category = gitOpsSyncCategory(target.syncStatus);
    const applicationIds = new Set(
      target.applicationIds && target.applicationIds.length > 0
        ? target.applicationIds
        : [target.applicationId],
    );
    for (const applicationId of applicationIds) {
      const repository = repositoryByApplicationId.get(applicationId);
      if (!repository) continue;
      const current = states.get(repository);
      if (category === "out-of-sync") {
        states.set(repository, "out-of-sync");
      } else if (category === "synced") {
        if (current === "unobserved") states.set(repository, "synced");
      } else if (current !== "out-of-sync") {
        states.set(repository, "unknown");
      }
    }
  }
  const values = [...states.values()];
  return {
    outOfSync: values.filter((state) => state === "out-of-sync").length,
    repositories: states.size,
    synced: values.filter((state) => state === "synced").length,
    unknown: values.filter((state) => state === "unknown" || state === "unobserved").length,
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

function requireSupportedApplicationScope(scope: HomeBoardScope): void {
  if (scope.applications.length > 0) {
    throw new Error("home application scope unavailable");
  }
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
