import { namespaceSelector } from "../../features/filters/filterUrlSyntax";
import type {
  IssueList,
  IssueQueueFacet,
  IssueQueueFilters,
  IssuesPort,
} from "../../features/issues/issuesContract";
import { sortIssuesForQueue } from "../../features/issues/issuePresentation";
import type { ClusterScope } from "../../shared/parity/referenceParity";
import type { HomeBoardScope } from "./homeBoardDataContract";

export async function loadScopedIssues(
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

export interface FleetFanOutResult<T> {
  failures: Array<{ clusterId: string; error: unknown }>;
  successes: Array<{ clusterId: string; value: T }>;
}

export async function fanOutClusters<T>(
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

export function timelineWorkspaceCacheKey(scope: HomeBoardScope): string {
  return [...new Set(scope.clusters.map((cluster) => cluster.workspaceId))]
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

export function requireClusterScope(clusterIds: readonly string[]): void {
  if (clusterIds.length === 0) throw new Error("home fleet scope unavailable");
}

export function requireSupportedApplicationScope(scope: HomeBoardScope): void {
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
