import { useMemo } from "react";

import type { UnifiedFilterState } from "../../features/filters/filterContract";
import { namespaceSelector } from "../../features/filters/filterUrlSyntax";
import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import { activityWindowForPeriod } from "../../features/home-activity/homeActivityWindow";
import { TimelineFailure } from "../../features/timeline/timelineContract";
import {
  costRangeForPeriod,
  criticalResourceFilterState,
  homeTimelineQuery,
  projectHomeCost,
} from "./homeBoardDataQueries";
import type {
  HomeBoardData,
  HomeBoardPorts,
  HomeBoardScope,
} from "./homeBoardDataContract";
import {
  fanOutClusters,
  loadScopedIssues,
  requireClusterScope,
  requireSupportedApplicationScope,
  timelineWorkspaceCacheKey,
} from "./homeBoardDataLoaders";
import {
  compareAttentionResourceHealth,
  latestObservedAt,
  summarizeRepositorySync,
} from "./homeBoardDataProjection";
import { homeBoardScopeRequestKey } from "./homeBoardRequestIdentity";
import { useHomeBoardResource as useAsyncResource } from "./useHomeBoardResource";
export type {
  HomeBoardData,
  HomeBoardPorts,
  HomeBoardScope,
  HomeCostProjection,
  HomeCriticalResourcesProjection,
  HomeNamespacePodProjection,
  HomeNamespacePods,
  HomeSyncSummary,
} from "./homeBoardDataContract";
export type { HomeBoardResource } from "./useHomeBoardResource";
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
  const scopeRequestKey = homeBoardScopeRequestKey(scope);
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
  const namespaceReferencesKey = JSON.stringify(namespaceReferences);
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
  const activityQueryKey = JSON.stringify(activityQuery);
  const criticalFilterRequestKey = JSON.stringify(
    criticalResourceFilterState(filterState, clusterIds),
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
    {
      key: `incidents:${scopeRequestKey}:${namespaceReferencesKey}:r${refreshKey}`,
      owner: ports.issues,
    },
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
    {
      key: `sync:${scopeRequestKey}:r${refreshKey}`,
      owner: ports.gitops,
    },
  );
  const activity = useAsyncResource(
    async (signal) => {
      requireSupportedApplicationScope(scope);
      if (activityQuery === null) throw new Error("activity window unavailable");
      return ports.activity.loadOverview(activityQuery, signal);
    },
    {
      key: `activity:${scopeRequestKey}:${activityQueryKey}:r${refreshKey}`,
      owner: ports.activity,
    },
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
    {
      key: `namespaces:${scopeRequestKey}:enabled:${wantsNamespaces}:r${refreshKey}`,
      owner: ports.inventory,
    },
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
    {
      key: `critical:${scopeRequestKey}:${criticalFilterRequestKey}:r${refreshKey}`,
      owner: ports.resources,
    },
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
    {
      key: `cost:${scopeRequestKey}:${activityQueryKey}:${period}:enabled:${wantsCost}:r${refreshKey}`,
      owner: ports.cost,
    },
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
    {
      key: `timeline:${scopeRequestKey}:${activityQueryKey}:enabled:${wantsTimeline}:r${refreshKey}`,
      owner: ports.timeline,
    },
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
