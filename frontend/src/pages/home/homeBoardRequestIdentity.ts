import type { HomeBoardScope } from "./homeBoardDataContract";

export function homeBoardScopeRequestKey(scope: HomeBoardScope): string {
  return JSON.stringify({
    allAccessible: scope.allAccessible,
    applications: [...new Set(scope.applications)].sort((left, right) => left.localeCompare(right)),
    clusters: scope.clusters
      .map((cluster) => ({
        clusterId: cluster.clusterId,
        namespaces: [...new Set(cluster.namespaces ?? [])].sort((left, right) => left.localeCompare(right)),
        workspaceId: cluster.workspaceId,
      }))
      .sort((left, right) =>
        left.clusterId.localeCompare(right.clusterId) || left.workspaceId.localeCompare(right.workspaceId)
      ),
  });
}
