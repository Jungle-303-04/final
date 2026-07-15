import { useMemo, type ComponentType } from "react";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import type { TimelinePort } from "../../features/timeline/timelineContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ScopeFreshness } from "../../shared/parity/referenceParity";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { TimelineSurface } from "./TimelineSurface";

export function createTimelineSurface(port: TimelinePort): ComponentType {
  function TimelineSurfaceRoute() {
    const clusterScope = useClusterScope();
    const filter = useUnifiedFilter();
    const clusters = timelineClusters(clusterScope);
    const scopes = useMemo(() => clusters.map((cluster) => ({
      workspaceId: cluster.workspaceId,
      clusterId: cluster.id,
      namespaces: filter.state.common.namespaces
        .filter((namespace) => namespace.clusterId === cluster.id)
        .map((namespace) => namespace.namespace),
      freshness: timelineFreshness(cluster),
    })), [clusters, filter.state.common.namespaces]);

    if (clusterScope.selection.kind === "resolving") {
      return <ProductStateScreen kind="loading" placement="content" />;
    }
    if (clusterScope.selection.kind === "empty") {
      return <ProductStateScreen kind="empty" placement="content" />;
    }
    if (clusterScope.selection.kind === "unavailable") {
      if (clusterScope.selection.failure.code === "forbidden") {
        return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
      }
      if (clusterScope.selection.failure.code === "offline") {
        return (
          <ProductStateScreen
            issue={{ code: "network" }}
            kind="offline"
            placement="content"
            retry={{ onRetry: clusterScope.refresh, pending: false }}
          />
        );
      }
      return <ProductStateScreen issue={{ code: "server" }} kind="error" placement="content" />;
    }
    if (clusterScope.selection.kind === "unknown" || scopes.length === 0) {
      return <ProductStateScreen issue={{ code: "unknown" }} kind="error" placement="content" />;
    }
    return <TimelineSurface port={port} scopes={scopes} />;
  }

  TimelineSurfaceRoute.displayName = "TimelineSurfaceRoute";
  return TimelineSurfaceRoute;
}

function timelineClusters(
  scope: ReturnType<typeof useClusterScope>,
): readonly HomeClusterChoice[] {
  if (scope.selection.kind === "selected") return [scope.selection.cluster];
  if (scope.selection.kind === "multiple") return scope.selection.clusters;
  if (scope.selection.kind === "unfiltered" && scope.collection.phase === "ready") {
    return scope.collection.data.clusters;
  }
  return [];
}

function timelineFreshness(cluster: HomeClusterChoice): ScopeFreshness {
  if (cluster.connectionState === "online") return "live";
  if (cluster.connectionState === "stale") return "stale";
  return "disconnected";
}
