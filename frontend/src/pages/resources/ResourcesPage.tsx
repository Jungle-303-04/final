import { useEffect, useMemo } from "react";
import { cn } from "@/shared/lib/cn";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import type { HomePort } from "../../features/home/homeContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesFilterPort } from "../../features/resources/resourcesFilterContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import type { PhysicalTopologyRealtimePort } from "../../features/resources/physicalTopologyRealtimeContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";
import type { ChangeTimelinePort } from "../../features/resources/changeTimelineContract";
import type { ResourceMetricsHistoryPort } from "../../features/resources/resourceMetricsHistoryContract";
import type {
  ResourceActionsPort,
  ResourceCapabilitiesPort,
} from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceManifestPort } from "../../features/resources/resourceManifestContract";
import type { ResourceIssuesPort } from "../../features/issues/resourceIssuesContract";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { Badge } from "../../shared/ui/primitives/badge";
import { PollingFreshness } from "../PollingFreshness";
import { ResourceDetailWorkspace } from "./ResourceDetailWorkspace";
import { ResourcesSurfaceLoadingPreview } from "./ResourcesLoadingPreview";
import {
  CatalogFreshness,
  ResourcesDenied,
  ResourcesFailure,
  ResourcesRefreshFeedback,
  ResourcesClusterBoundary,
  UnknownCompletenessEmpty,
  UnknownSelection,
} from "./ResourcesPageFeedback";
import { useResourcesFilterDataFrame } from "./useResourcesFilterDataFrame";
import { usePhysicalTopologyDataFrame } from "./usePhysicalTopologyDataFrame";
import { useResourcesPageState } from "./useResourcesPageState";
import { ResourcesFleetZoom } from "./ResourcesFleetZoom";
import { ResourcesListSurface } from "./ResourcesListSurface";
import { useResourceMetricsHistoryDataFrame } from "./useResourceMetricsHistoryDataFrame";
import { useResourceDetailNavigation } from "./useResourceDetailNavigation";
import { useResourceCapabilitiesDataFrame } from "./useResourceCapabilitiesDataFrame";
import { useResourceIssuesDataFrame } from "./useResourceIssuesDataFrame";
import { useRelationTopologyDataFrame } from "./useRelationTopologyDataFrame";
import { useResourceTopologyViewController } from "./useResourceTopologyViewController";
import { useChangeTimelineDataFrame } from "./useChangeTimelineDataFrame";
import { usePhysicalTopologyRealtime } from "./usePhysicalTopologyRealtime";
import { ResourcesLiveStatus } from "./ResourcesLiveStatus";
import { selectResourceMetricIds } from "./resourceMetricSelection";
import {
  EMPTY_POD_TERMINAL_PORT,
  type PodTerminalPort,
} from "../../features/pod-terminal/podTerminalContract";
import type { ServiceAccessPort } from "../../features/service-access/serviceAccessContract";

export function ResourcesPage({
  filterPort,
  physicalTopologyPort,
  physicalTopologyRealtimePort,
  nodePodsPort,
  relationTopologyPort,
  changeTimelinePort,
  resourceMetricsHistoryPort,
  resourceCapabilitiesPort,
  resourceActionsPort,
  podTerminalPort = EMPTY_POD_TERMINAL_PORT,
  serviceAccessPort,
  resourceManifestPort,
  resourceIssuesPort,
  port,
}: {
  filterPort: ResourcesFilterPort;
  physicalTopologyPort: PhysicalTopologyPort;
  physicalTopologyRealtimePort: PhysicalTopologyRealtimePort;
  nodePodsPort: Pick<HomePort, "loadNodePods">;
  relationTopologyPort: RelationTopologyPort;
  changeTimelinePort: ChangeTimelinePort;
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort;
  resourceCapabilitiesPort: ResourceCapabilitiesPort;
  resourceActionsPort: ResourceActionsPort;
  podTerminalPort?: PodTerminalPort;
  serviceAccessPort?: ServiceAccessPort;
  resourceManifestPort?: ResourceManifestPort;
  resourceIssuesPort?: ResourceIssuesPort;
  port: ResourcesPort;
}) {
  const { t } = useI18n();
  const { reportUnauthorized } = useAuthSessionGate();
  const session = useOptionalProductSession();
  const filter = useUnifiedFilter();
  const state = useResourcesPageState(port);
  const topology = useResourceTopologyViewController();
  const authorityKey = session
    ? `${session.workspaceId}:${session.userId}`
    : "anonymous";
  const physicalTopologyFrame = usePhysicalTopologyDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1,
    filterState: filter.state,
    port: physicalTopologyPort,
    reportUnauthorized,
    revision: state.podRevision,
  });
  const relationTopology = useRelationTopologyDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1 &&
      topology.view === "relations",
    filterState: filter.state,
    port: relationTopologyPort,
    reportUnauthorized,
    revision: state.revision,
  });
  const timelineReadBounded = filter.state.resources.types.length > 0 ||
    filter.state.common.namespaces.length > 0 ||
    filter.state.common.applications.length > 0 ||
    filter.state.common.labels.length > 0 ||
    filter.state.resources.health.length > 0 ||
    filter.state.resources.query.trim().length > 0;
  const changeTimeline = useChangeTimelineDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1 &&
      timelineReadBounded,
    authorityKey,
    filterState: filter.state,
    port: changeTimelinePort,
    range: filter.detail.timeRange ?? "1h",
    reportUnauthorized,
    revision: state.revision,
  });
  const filtered = useResourcesFilterDataFrame({
    active:
      state.selectedClusterExists &&
      !state.resourceTypeInvalid,
    authorityKey,
    facetAxis: null,
    facetQuery: "",
    filterState: filter.state,
    onListFailure: state.recordListFailure,
    onListSuccess: state.recordListSuccess,
    port: filterPort,
    reportUnauthorized,
    revision: state.revision,
  });
  const filteredPage = filtered.list.phase === "ready"
    ? filtered.list.data
    : null;
  const currentResourceRows = useMemo(
    () => (filteredPage?.items ?? []).map((item) => item.resource),
    [filteredPage],
  );
  const physicalRealtime = usePhysicalTopologyRealtime({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1,
    clusterId: state.selectedClusterId,
    frame: physicalTopologyFrame,
    port: physicalTopologyRealtimePort,
    replayAtMs: filter.detail.timeAt,
    rows: currentResourceRows,
    workspaceId: session?.workspaceId ?? null,
  });
  const physicalTopology = physicalRealtime.frame;
  const detailResource = state.detail.phase === "ready"
    ? state.detail.data.resource
    : null;
  const detailResourceId = detailResource?.inventoryKey ?? null;
  const metricResourceIds = useMemo(
    () => selectResourceMetricIds(detailResource, currentResourceRows),
    [currentResourceRows, detailResource],
  );
  const metricHistory = useResourceMetricsHistoryDataFrame({
    active: metricResourceIds.length > 0,
    authorityKey,
    filterState: filter.state,
    port: resourceMetricsHistoryPort,
    range: filter.detail.timeRange ?? "1h",
    reportUnauthorized,
    resourceIds: metricResourceIds,
    snapshotRevision: filteredPage?.snapshot.snapshotRevision ?? null,
    liveSeries: physicalRealtime.metricSeries,
  });
  const resourceCapabilities = useResourceCapabilitiesDataFrame({
    active: state.detailRequested && detailResourceId !== null,
    authorityKey,
    port: resourceCapabilitiesPort,
    reportUnauthorized,
    resourceId: detailResourceId,
  });
  const resourceIssues = useResourceIssuesDataFrame({
    active: resourceIssuesPort !== undefined && state.detailRequested && state.detailIdentity !== null,
    authorityKey,
    clusterId: state.detail.phase === "ready"
      ? state.detail.data.clusterId
      : state.selectedClusterId,
    identity: state.detailIdentity,
    port: resourceIssuesPort ?? INACTIVE_RESOURCE_ISSUES_PORT,
    reportUnauthorized,
    revision: state.revision,
  });
  const detailNavigationItems = useMemo(
    () => (filteredPage?.items ?? []).map((item) => item.resource),
    [filteredPage],
  );
  useResourceDetailNavigation({
    active: state.detailRequested,
    current: state.detailIdentity,
    items: detailNavigationItems,
    onNavigate: state.navigateDetail,
  });
  const resourcesView = state.view;
  const setResourcesView = state.setView;
  useEffect(() => {
    if (resourcesView === "graph") setResourcesView("table");
  }, [resourcesView, setResourcesView]);
  if (state.choices.phase === "idle" || state.choices.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (state.choices.phase === "failed") {
    return (
      <ResourcesFailure
        failure={state.choices.failure}
        onRetry={state.refresh}
        retryWaitSeconds={state.retryWaitSeconds}
      />
    );
  }
  if (state.choices.data.clusters.length === 0) {
    return <ResourcesClusterBoundary variant="catalog-unconfirmed" />;
  }
  const refreshing =
    [state.choices, state.catalog, state.list, state.detail].some(
      (resource) => resource.phase === "ready" && resource.refreshing,
    ) || filtered.list.refreshing;
  return (
    <div
      className="flex h-[calc(100svh-3.5rem)] min-w-0 overflow-hidden"
      data-detail-layout={state.detailRequested ? (state.detailFull ? "full" : "peek") : "closed"}
    >
      <div
        className={state.detailRequested
          ? state.detailFull
            ? "hidden min-w-0 overflow-y-auto lg:block lg:basis-0 lg:flex-none lg:overflow-hidden lg:opacity-0 lg:pointer-events-none lg:transition-[flex-basis,opacity] lg:duration-300 lg:ease-out motion-reduce:transition-none"
            : "hidden min-w-0 flex-1 overflow-y-auto lg:block lg:opacity-100 lg:transition-[flex-basis,opacity] lg:duration-300 lg:ease-out motion-reduce:transition-none"
          : "min-w-0 flex-1 overflow-y-auto"}
        data-slot="resources-list-column"
      >
        <ProductPageFrame>
          <header className="flex min-w-0 justify-end">
            <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 xl:w-auto">
              {state.automaticRefreshPaused ? (
                <Badge variant="outline">{t("resources.refresh.paused")}</Badge>
              ) : null}
              <ResourcesLiveStatus state={physicalRealtime.live} />
              {physicalRealtime.live.status === "connected" ? null : (
                <PollingFreshness
                  connectionState={
                    physicalTopology.phase === "ready" && physicalTopology.refreshFailure
                      ? "disconnected"
                      : "connected"
                  }
                  dataUpdatedAt={Math.max(state.updatedAt, physicalTopology.updatedAt)}
                  intervalSeconds={5}
                  isFetching={refreshing || physicalTopology.refreshing}
                  onRefresh={state.refresh}
                />
              )}
            </div>
          </header>

          {!state.selectedClusterExists ? (
            state.clusterSelection.kind === "unknown" ? (
              <UnknownSelection value={state.selectedClusterId} variant="cluster" />
            ) : state.clusterSelection.kind === "unfiltered" ? (
              <ResourcesFleetZoom clusters={state.choices.data.clusters} />
            ) : state.clusterSelection.kind === "multiple" ? (
              <ResourcesClusterBoundary variant="multiple" />
            ) : (
              <UnknownSelection value={state.selectedClusterId} variant="cluster" />
            )
          ) : state.denied ? (
            <ResourcesDenied onRetry={state.refresh} />
          ) : state.catalog.phase === "loading" || state.catalog.phase === "idle" ? (
            <ProductStateScreen
              kind="loading"
              loadingPreview={<ResourcesSurfaceLoadingPreview />}
              placement="content"
            />
          ) : state.catalog.phase === "failed" ? (
            <ResourcesFailure
              failure={state.catalog.failure}
              onRetry={state.refresh}
              retryWaitSeconds={state.retryWaitSeconds}
            />
          ) : state.catalog.data.items.length === 0 ? (
            <UnknownCompletenessEmpty variant="catalog" />
          ) : (
            <>
              <ResourcesRefreshFeedback
                catalog={state.catalog}
                choices={state.choices}
                filterList={filtered.list}
                list={state.list}
              />
              <CatalogFreshness observedAt={state.catalog.data.observedAt} />
              <ResourcesListSurface
                filterList={filtered.list}
                listFallback={state.resourceTypeInvalid ? (
                  <UnknownSelection
                    value={state.selectedResourceType}
                    variant="resource"
                  />
                ) : null}
                metricHistory={metricHistory}
                nodePodsPort={nodePodsPort}
                onNodePodsUnauthorized={reportUnauthorized}
                onLoadMore={filtered.loadMoreList}
                onTopologyViewChange={topology.pin}
                physicalTopology={physicalTopology}
                relationTopology={relationTopology}
                replay={physicalRealtime.replay}
                selectTableRows={physicalRealtime.selectTableRows}
                state={state}
                timelineFrame={changeTimeline}
                topologyPinned={topology.pinned}
                topologyView={topology.view}
              />
            </>
          )}
        </ProductPageFrame>
      </div>
      {state.detailRequested ? (
        <div
          className={cn(
            "min-w-0 w-full basis-full shrink-0 bg-background transition-[flex-basis,border-color] duration-300 ease-out motion-reduce:transition-none",
            state.detailFull ? "border-l-0 lg:basis-full" : "border-l lg:basis-[42rem]",
          )}
          data-detail-size={state.detailFull ? "full" : "peek"}
          data-slot="resources-detail-column"
        >
          <ResourceDetailWorkspace
            actionsPort={resourceActionsPort}
            capabilities={resourceCapabilities}
            detail={state.detail}
            full={state.detailFull}
            identity={state.detailIdentity}
            metricHistory={metricHistory}
            resourceIssues={resourceIssues}
            manifestPort={resourceManifestPort}
            onUnauthorized={reportUnauthorized}
            onClose={state.closeDetail}
            onFullChange={state.setDetailFull}
            onNavigateResource={state.navigateDetail}
            onTabChange={state.setDetailTab}
            tab={state.detailTab}
            terminalPort={podTerminalPort}
            serviceAccessPort={serviceAccessPort}
          />
        </div>
      ) : null}
    </div>
  );
}

const INACTIVE_RESOURCE_ISSUES_PORT: ResourceIssuesPort = {
  loadResourceIssues: () => Promise.reject(new Error("resource issue port is inactive")),
};
