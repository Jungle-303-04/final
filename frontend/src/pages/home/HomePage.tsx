import { useCallback, useMemo, useRef, useState } from "react";

import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import type {
  ClusterDisconnectPort,
  ClustersPort,
} from "../../features/clusters/clustersContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { normalizeNamespaceRefs } from "../../features/filters/filterUrlSyntax";
import type {
  HomeClusterChoice,
  HomePort,
} from "../../features/home/homeContract";
import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ClusterConnectDialog } from "../clusters/ClusterConnectDialog";
import {
  ClusterDisconnectDialog,
  type DisconnectPhase,
} from "../clusters/ClusterDisconnectDialog";
import { PollingFreshness } from "../PollingFreshness";
import type { HomeBoardPorts } from "./useHomeBoardData";
import { HomeClusterGrid } from "./HomeClusterGrid";
import { HomeFleetHeader } from "./HomeFleetHeader";
import {
  exactIncidentSum,
  HomeClusterBoundary,
  homeConnectionState,
  HomeFailureScreen,
  isResumableDisconnectPhase,
  PartialFailureBanner,
  UnknownCluster,
} from "./HomePageSupport";
import { HomeWidgetBoard } from "./HomeWidgetBoard";
import {
  projectHomeFleetClusters,
  summarizeHomeFleetUsage,
  useHomeClusterCardsData,
} from "./useHomeClusterCardsData";
import { useHomePageState } from "./useHomePageState";

export function HomePage({
  boardPorts,
  clusterPort,
  port,
}: {
  boardPorts?: HomeBoardPorts;
  clusterPort?: ClustersPort & ClusterDisconnectPort;
  port: HomePort;
}) {
  const state = useHomePageState(port);
  const filter = useUnifiedFilter();
  const session = useOptionalProductSession();
  const [connectOpen, setConnectOpen] = useState(false);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const [disconnectCluster, setDisconnectCluster] = useState<HomeClusterChoice | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnectPhase, setDisconnectPhase] = useState<DisconnectPhase>("confirm");
  const [editingBoard, setEditingBoard] = useState(false);
  const [outOfSync, setOutOfSync] = useState<number | null>(null);
  const updateOutOfSync = useCallback((count: number | null) => {
    setOutOfSync((current) => current === count ? current : count);
  }, []);
  const boardPeriod: HomeBoardPeriod = filter.detail.homePeriod ?? "today";
  const canManageClusters = clusterPort !== undefined &&
    (session?.roles.includes("service_admin") ?? false);
  const allClusters = useMemo(
    () => state.choices.phase === "ready" ? state.choices.data.clusters : [],
    [state.choices],
  );
  const clusterCards = useHomeClusterCardsData({
    clusters: allClusters,
    port,
    refreshRevision: state.boardRefreshRevision,
  });
  const fleetClusters = useMemo(
    () => projectHomeFleetClusters(allClusters, clusterCards.summaries),
    [allClusters, clusterCards.summaries],
  );
  const boardClusters = useMemo(() => {
    const namespaceRefs = normalizeNamespaceRefs(filter.state.common.namespaces);
    const requestedClusterIds = new Set(
      namespaceRefs.length > 0
        ? namespaceRefs.map((namespace) => namespace.clusterId)
        : filter.state.common.clusters,
    );
    return requestedClusterIds.size === 0
      ? fleetClusters
      : fleetClusters.filter((cluster) => requestedClusterIds.has(cluster.id));
  }, [filter.state.common.clusters, filter.state.common.namespaces, fleetClusters]);
  const fleetUsage = useMemo(
    () => summarizeHomeFleetUsage(boardClusters, clusterCards.overviews),
    [boardClusters, clusterCards.overviews],
  );
  const fleetCriticalCount = useMemo(
    () => exactIncidentSum(boardClusters),
    [boardClusters],
  );

  if (state.choices.phase === "loading" || state.choices.phase === "idle") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (state.choices.phase === "failed") {
    return <HomeFailureScreen failure={state.choices.failure} onRetry={state.refresh} />;
  }
  if (state.clusterAccess.kind === "forbidden") {
    return <HomeFailureScreen failure={state.clusterAccess.failure} onRetry={state.refresh} />;
  }
  const refreshing = [state.choices, state.overview, state.insights, state.nodes, state.pods].some(
    (resource) => resource.phase === "ready" && resource.refreshing,
  );
  return (
    <ProductPageFrame>
      <HomeFleetHeader
        clusters={boardClusters}
        connectButtonRef={connectButtonRef}
        criticalCount={fleetCriticalCount}
        criticalHref={filter.navigationHref("/issues")}
        editing={editingBoard}
        fleetUsage={fleetUsage}
        freshness={state.refreshIntervalSeconds === null ? null : (
          <PollingFreshness
            connectionState={homeConnectionState(state)}
            dataUpdatedAt={state.dataUpdatedAt}
            intervalSeconds={state.refreshIntervalSeconds}
            isFetching={refreshing}
            onRefresh={state.refresh}
          />
        )}
        onEdit={boardPorts ? () => setEditingBoard((current) => !current) : undefined}
        onConnect={canManageClusters ? () => setConnectOpen(true) : undefined}
        onPeriodChange={boardPorts ? (period) => {
          filter.updateDetail(
            (current) => ({ ...current, homePeriod: period }),
            "home-period",
          );
        } : undefined}
        outOfSync={outOfSync}
        period={boardPorts ? boardPeriod : undefined}
      />
      <HomeClusterGrid
        clusters={boardClusters}
        disconnectClusterId={disconnectCluster?.id}
        disconnectPhase={disconnectPhase}
        onDisconnect={canManageClusters ? (cluster) => {
          setDisconnectCluster(cluster);
          setDisconnectOpen(true);
        } : undefined}
        onRefresh={state.refresh}
        overviews={clusterCards.overviews}
      />
      {state.choices.data.clusters.length === 0 ? (
        canManageClusters ? null : <HomeClusterBoundary variant="catalog-unconfirmed" />
      ) : boardClusters.length === 0 ? (
        state.clusterSelection.kind === "multiple" ? (
          <HomeClusterBoundary variant="multiple" />
        ) : (
          <UnknownCluster clusterId={state.selectedClusterId} />
        )
      ) : (
        <>
          <PartialFailureBanner clusterCardsPartial={clusterCards.hasPartialData} state={state} />
          {boardPorts ? (
            <HomeWidgetBoard
              clusters={boardClusters}
              editing={editingBoard}
              onOutOfSyncChange={updateOutOfSync}
              period={boardPeriod}
              ports={boardPorts}
              refreshKey={state.boardRefreshRevision}
              windowAnchorMs={state.boardWindowAnchorMs}
            />
          ) : null}
        </>
      )}
      {canManageClusters && clusterPort ? (
        <>
          <ClusterConnectDialog
            existingNames={state.choices.data.clusters.map((cluster) => cluster.name)}
            onConnected={state.refresh}
            onRegistered={state.refresh}
            onOpenChange={(open) => {
              setConnectOpen(open);
              if (!open) queueMicrotask(() => connectButtonRef.current?.focus());
            }}
            open={connectOpen}
            port={clusterPort}
          />
          <ClusterDisconnectDialog
            cluster={disconnectCluster}
            key={disconnectCluster?.id ?? "closed"}
            onDisconnected={() => state.refresh()}
            onOpenChange={(open) => {
              setDisconnectOpen(open);
              if (!open && !isResumableDisconnectPhase(disconnectPhase)) {
                setDisconnectCluster(null);
              }
            }}
            onPhaseChange={(clusterId, phase) => {
              if (disconnectCluster?.id === clusterId) setDisconnectPhase(phase);
            }}
            open={disconnectOpen && disconnectCluster !== null}
            port={clusterPort}
          />
        </>
      ) : null}
    </ProductPageFrame>
  );
}
