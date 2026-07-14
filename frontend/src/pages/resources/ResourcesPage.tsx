import { useEffect, useMemo } from "react";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
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
import { useRelationTopologyDataFrame } from "./useRelationTopologyDataFrame";
import { useResourceTopologyViewController } from "./useResourceTopologyViewController";
import { useChangeTimelineDataFrame } from "./useChangeTimelineDataFrame";
import { usePhysicalTopologyRealtime } from "./usePhysicalTopologyRealtime";
import { ResourcesLiveStatus } from "./ResourcesLiveStatus";

export function ResourcesPage({
  filterPort,
  physicalTopologyPort,
  physicalTopologyRealtimePort,
  relationTopologyPort,
  changeTimelinePort,
  resourceMetricsHistoryPort,
  resourceCapabilitiesPort,
  resourceActionsPort,
  port,
}: {
  filterPort: ResourcesFilterPort;
  physicalTopologyPort: PhysicalTopologyPort;
  physicalTopologyRealtimePort: PhysicalTopologyRealtimePort;
  relationTopologyPort: RelationTopologyPort;
  changeTimelinePort: ChangeTimelinePort;
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort;
  resourceCapabilitiesPort: ResourceCapabilitiesPort;
  resourceActionsPort: ResourceActionsPort;
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
  const physicalRealtime = usePhysicalTopologyRealtime({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1 &&
      filter.detail.timeAt === undefined,
    clusterId: state.selectedClusterId,
    frame: physicalTopologyFrame,
    port: physicalTopologyRealtimePort,
    workspaceId: session?.workspaceId ?? null,
  });
  const physicalTopology = physicalRealtime.frame;
  const relationTopology = useRelationTopologyDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1,
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
  const metricResourceIds = useMemo(
    () => (filteredPage?.items ?? [])
      .map((item) => item.resource)
      .filter((resource) => resource.resourceType === "pod")
      .slice(0, 100)
      .map((resource) => resource.inventoryKey),
    [filteredPage],
  );
  const metricHistory = useResourceMetricsHistoryDataFrame({
    active: metricResourceIds.length > 0,
    authorityKey,
    filterState: filter.state,
    port: resourceMetricsHistoryPort,
    reportUnauthorized,
    resourceIds: metricResourceIds,
    snapshotRevision: filteredPage?.snapshot.snapshotRevision ?? null,
  });
  const detailResourceId = state.detail.phase === "ready"
    ? state.detail.data.resource.inventoryKey
    : null;
  const resourceCapabilities = useResourceCapabilitiesDataFrame({
    active: state.detailRequested && detailResourceId !== null,
    authorityKey,
    port: resourceCapabilitiesPort,
    reportUnauthorized,
    resourceId: detailResourceId,
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
            ? "hidden"
            : "hidden min-w-0 flex-1 overflow-y-auto lg:block"
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
                onLoadMore={filtered.loadMoreList}
                onTopologyViewChange={topology.pin}
                physicalTopology={physicalTopology}
                relationTopology={relationTopology}
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
          className={state.detailFull
            ? "min-w-0 flex-1"
            : "min-w-0 w-full shrink-0 border-l bg-background lg:w-[30rem]"}
          data-slot="resources-detail-column"
        >
          <ResourceDetailWorkspace
            actionsPort={resourceActionsPort}
            capabilities={resourceCapabilities}
            detail={state.detail}
            full={state.detailFull}
            identity={state.detailIdentity}
            onClose={state.closeDetail}
            onFullChange={state.setDetailFull}
            onTabChange={state.setDetailTab}
            tab={state.detailTab}
          />
        </div>
      ) : null}
    </div>
  );
}
