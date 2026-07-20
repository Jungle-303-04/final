import { useState } from "react";

import { EMPTY_POD_TERMINAL_PORT } from "../../features/pod-terminal/podTerminalContract";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ResourceDetailOverlay } from "./ResourceDetailOverlay";
import { ResourceDetailWorkspace } from "./ResourceDetailWorkspace";
import { ResourcesFleetZoom } from "./ResourcesFleetZoom";
import { ResourcesListSurface } from "./ResourcesListSurface";
import { ResourcesSurfaceLoadingPreview } from "./ResourcesLoadingPreview";
import type { ResourcesPageProps } from "./ResourcesPageContract";
import {
  CatalogFreshness,
  ResourcesClusterBoundary,
  ResourcesDenied,
  ResourcesFailure,
  ResourcesRefreshFeedback,
  UnknownCompletenessEmpty,
  UnknownSelection,
} from "./ResourcesPageFeedback";
import { ResourcesStatusHeader } from "./ResourcesStatusHeader";
import { ResourcesTrafficFlowSurface } from "./ResourcesTrafficFlowSurface";
import { ResourcesViewSwitcher } from "./ResourcesViewSwitcher";
import { useResourcesPageModel } from "./useResourcesPageModel";

export function ResourcesPage(props: ResourcesPageProps) {
  const {
    checksPort,
    nodePodsPort,
    podTerminalPort = EMPTY_POD_TERMINAL_PORT,
    portForwardSessions,
    repositoryLineagePort,
    resourceActionsPort,
    resourceFilesPort,
    resourceManifestPort,
    serviceAccessPort,
    trafficPort,
  } = props;
  const [manifestEditing, setManifestEditing] = useState(false);
  const {
    aiLayout,
    changeTimeline,
    connectionTopology,
    filter,
    filtered,
    metricHistory,
    physicalRealtime,
    physicalTopology,
    relationTopology,
    reportUnauthorized,
    resourceCapabilities,
    resourceIssues,
    state,
    topology,
  } = useResourcesPageModel(props, manifestEditing);

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

  const refreshing = [state.choices, state.catalog, state.list, state.detail].some(
    (resource) => resource.phase === "ready" && resource.refreshing,
  ) || filtered.list.refreshing;
  const createNamespace = filter.state.common.namespaces.length === 1
    && filter.state.common.namespaces[0].clusterId === state.selectedClusterId
    ? filter.state.common.namespaces[0].namespace
    : null;
  const detailFull = state.detailFull || aiLayout.open;
  const detailInset = aiLayout.open ? aiLayout.width : 0;
  const fleetView = filter.detail.resourceSurfaceView ?? "map";

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 overflow-hidden"
      data-detail-layout={state.detailRequested ? (detailFull ? "full" : "peek") : "closed"}
      data-slot="resources-scroll-boundary"
    >
      <div
        aria-hidden={detailFull}
        className={state.detailRequested
          ? detailFull
            ? "hidden min-w-0 overflow-y-auto lg:block lg:basis-0 lg:flex-none lg:overflow-hidden lg:opacity-0 lg:pointer-events-none lg:transition-[flex-basis,opacity] lg:duration-(--motion-page) lg:ease-(--ease-page) motion-reduce:transition-none"
            : "hidden min-w-0 flex-1 overflow-y-auto lg:block lg:opacity-100 lg:transition-[flex-basis,opacity] lg:duration-(--motion-page) lg:ease-(--ease-page) motion-reduce:transition-none"
          : "min-w-0 flex-1 overflow-y-auto"}
        data-slot="resources-list-column"
        inert={detailFull}
      >
        <ProductPageFrame>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2" data-slot="resources-surface-toolbar">
            <ResourcesViewSwitcher onChange={state.setView} view={state.view} />
            {state.selectedClusterExists ? (
              <ResourcesStatusHeader
                automaticRefreshPaused={state.automaticRefreshPaused}
                clusterId={state.selectedClusterId}
                createNamespace={createNamespace}
                live={physicalRealtime.live}
                manifestPort={resourceManifestPort}
                onInvalidate={state.refresh}
                onRefresh={state.refresh}
                onUnauthorized={reportUnauthorized}
                pollingDisconnected={physicalTopology.phase === "ready" && Boolean(physicalTopology.refreshFailure)}
                pollingUpdatedAt={Math.max(state.updatedAt, physicalTopology.updatedAt)}
                refreshAfterSeconds={state.refreshAfterSeconds}
                refreshing={refreshing || physicalTopology.refreshing}
              />
            ) : null}
          </div>
          <ResourcesPageContent
            changeTimeline={changeTimeline}
            choices={state.choices.data}
            connectionTopology={connectionTopology}
            filterList={filtered.list}
            fleetView={fleetView}
            metricHistory={metricHistory}
            nodePodsPort={nodePodsPort}
            onLoadMore={filtered.loadMoreList}
            onUnauthorized={reportUnauthorized}
            physicalRealtime={physicalRealtime}
            physicalTopology={physicalTopology}
            relationTopology={relationTopology}
            repositoryLineagePort={repositoryLineagePort}
            state={state}
            topology={topology}
            trafficPort={trafficPort}
          />
        </ProductPageFrame>
      </div>
      {state.detailRequested ? (
        <ResourceDetailOverlay forceFull={detailFull} rightInset={detailInset}>
          <ResourceDetailWorkspace
            actionsPort={resourceActionsPort}
            capabilities={resourceCapabilities}
            checksPort={checksPort}
            detail={state.detail}
            forceFull={aiLayout.open}
            full={state.detailFull}
            identity={state.detailIdentity}
            manifestPort={resourceManifestPort}
            metricHistory={metricHistory}
            onClose={state.closeDetail}
            onFullChange={state.setDetailFull}
            onManifestEditingChange={setManifestEditing}
            onNavigateResource={state.navigateDetail}
            onResourceActionInvalidation={state.requestResourceEventInvalidation}
            onTabChange={state.setDetailTab}
            onUnauthorized={reportUnauthorized}
            portForwardSessions={portForwardSessions}
            resourceFilesPort={resourceFilesPort}
            resourceIssues={resourceIssues}
            serviceAccessPort={serviceAccessPort}
            tab={state.detailTab}
            terminalPort={podTerminalPort}
          />
        </ResourceDetailOverlay>
      ) : null}
    </div>
  );
}

function ResourcesPageContent({
  changeTimeline,
  choices,
  connectionTopology,
  filterList,
  fleetView,
  metricHistory,
  nodePodsPort,
  onLoadMore,
  onUnauthorized,
  physicalRealtime,
  physicalTopology,
  relationTopology,
  repositoryLineagePort,
  state,
  topology,
  trafficPort,
}: Pick<ReturnType<typeof useResourcesPageModel>,
  | "changeTimeline"
  | "connectionTopology"
  | "metricHistory"
  | "physicalRealtime"
  | "physicalTopology"
  | "relationTopology"
  | "state"
  | "topology"
> & {
  choices: NonNullable<ReturnType<typeof useResourcesPageModel>["state"]["choices"]["data"]>;
  filterList: ReturnType<typeof useResourcesPageModel>["filtered"]["list"];
  fleetView: "map" | "list" | "flow";
  nodePodsPort: ResourcesPageProps["nodePodsPort"];
  onLoadMore: ReturnType<typeof useResourcesPageModel>["filtered"]["loadMoreList"];
  onUnauthorized: ReturnType<typeof useResourcesPageModel>["reportUnauthorized"];
  repositoryLineagePort: ResourcesPageProps["repositoryLineagePort"];
  trafficPort: ResourcesPageProps["trafficPort"];
}) {
  if (state.view === "flow" && trafficPort) {
    return <ResourcesTrafficFlowSurface onOpenService={state.openDetailTarget} port={trafficPort} />;
  }
  if (!state.selectedClusterExists) {
    if (state.clusterSelection.kind === "unknown") {
      return <UnknownSelection value={state.selectedClusterId} variant="cluster" />;
    }
    if (state.clusterSelection.kind === "unfiltered") {
      return (
        <ResourcesFleetZoom
          clusters={choices.clusters}
          completeness={choices.completeness}
          onViewChange={state.setView}
          view={fleetView}
        />
      );
    }
    if (state.clusterSelection.kind === "multiple") {
      return <ResourcesClusterBoundary variant="multiple" />;
    }
    return <UnknownSelection value={state.selectedClusterId} variant="cluster" />;
  }
  if (state.denied) return <ResourcesDenied onRetry={state.refresh} />;
  if (state.catalog.phase === "loading" || state.catalog.phase === "idle") {
    return (
      <ProductStateScreen
        kind="loading"
        loadingPreview={<ResourcesSurfaceLoadingPreview />}
        placement="content"
      />
    );
  }
  if (state.catalog.phase === "failed") {
    return (
      <ResourcesFailure
        failure={state.catalog.failure}
        onRetry={state.refresh}
        retryWaitSeconds={state.retryWaitSeconds}
      />
    );
  }
  if (state.catalog.data.items.length === 0) {
    return state.catalog.data.completeness === "observed"
      ? <ProductStateScreen kind="empty" placement="content" />
      : <UnknownCompletenessEmpty variant="catalog" />;
  }
  return (
    <>
      <ResourcesRefreshFeedback
        catalog={state.catalog}
        choices={state.choices}
        filterList={filterList}
        list={state.list}
      />
      <CatalogFreshness observedAt={state.catalog.data.observedAt} />
      <ResourcesListSurface
        connectionTopology={connectionTopology}
        filterList={filterList}
        listFallback={state.resourceTypeInvalid ? (
          <UnknownSelection value={state.selectedResourceType} variant="resource" />
        ) : null}
        metricHistory={metricHistory}
        nodePodsPort={nodePodsPort}
        onLoadMore={onLoadMore}
        onNodePodsUnauthorized={onUnauthorized}
        onTopologyViewChange={topology.pin}
        physicalTopology={physicalTopology}
        relationTopology={relationTopology}
        repositoryLineagePort={repositoryLineagePort}
        replay={physicalRealtime.replay}
        selectTableRows={physicalRealtime.selectTableRows}
        state={state}
        timelineFrame={changeTimeline}
        topologyPinned={topology.pinned}
        topologyView={topology.view}
      />
    </>
  );
}
