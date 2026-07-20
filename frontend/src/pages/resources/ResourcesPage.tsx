import { useEffect, useMemo, useState } from "react";
import {
  isProductContextShortcutId,
  PRODUCT_SHORTCUT_EVENT,
  type ProductShortcutEventDetail,
} from "../../app/shortcutRegistry";
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
import type {
  ResourceMetricsHistoryPort,
  ResourcesRefreshPolicyKey,
} from "../../features/resources/resourceMetricsHistoryContract";
import type {
  ResourceActionsPort,
  ResourceCapabilitiesPort,
} from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceManifestPort } from "../../features/resources/resourceManifestContract";
import type { ResourceIssuesPort } from "../../features/issues/resourceIssuesContract";
import type { ChecksPort } from "../../features/checks/checksContract";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
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
import { selectResourceMetricIds } from "./resourceMetricSelection";
import {
  EMPTY_POD_TERMINAL_PORT,
  type PodTerminalPort,
} from "../../features/pod-terminal/podTerminalContract";
import type { ServiceAccessPort } from "../../features/service-access/serviceAccessContract";
import type { PortForwardSessionPort } from "../../features/service-access/portForwardSessionContract";
import type { TimelinePort } from "../../features/timeline/timelineContract";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import type { ResourceFilesPort } from "../../features/resource-files/resourceFilesContract";
import type { TrafficPort } from "../../features/traffic/trafficContract";
import { ResourcesTrafficFlowSurface } from "./ResourcesTrafficFlowSurface";
import { useAiAssistantLayout } from "../../features/ai-assistant/AiAssistantLayoutContext";
import { ResourceDetailOverlay } from "./ResourceDetailOverlay";
import { ResourcesStatusHeader } from "./ResourcesStatusHeader";

const CONNECTION_PANEL_RESOURCE_TYPES = [
  "service",
  "endpoint",
  "endpoints",
  "endpointslice",
  "ingress",
  "configmap",
  "secret",
  "application",
  "applicationset",
  "appproject",
] as const;

export function ResourcesPage({
  filterPort,
  physicalTopologyPort,
  physicalTopologyRealtimePort,
  nodePodsPort,
  relationTopologyPort,
  changeTimelinePort,
  timelinePort,
  resourceMetricsHistoryPort,
  refreshPolicies,
  resourceCapabilitiesPort,
  resourceActionsPort,
  podTerminalPort = EMPTY_POD_TERMINAL_PORT,
  serviceAccessPort,
  portForwardSessions,
  resourceManifestPort,
  resourceIssuesPort,
  checksPort,
  resourceFilesPort,
  trafficPort,
  port,
}: {
  filterPort: ResourcesFilterPort;
  physicalTopologyPort: PhysicalTopologyPort;
  physicalTopologyRealtimePort: PhysicalTopologyRealtimePort;
  nodePodsPort: Pick<HomePort, "loadNodePods">;
  relationTopologyPort: RelationTopologyPort;
  changeTimelinePort: ChangeTimelinePort;
  timelinePort?: TimelinePort;
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort;
  refreshPolicies: BrowserRefreshPolicyRegistry<ResourcesRefreshPolicyKey>;
  resourceCapabilitiesPort: ResourceCapabilitiesPort;
  resourceActionsPort: ResourceActionsPort;
  podTerminalPort?: PodTerminalPort;
  serviceAccessPort?: ServiceAccessPort;
  portForwardSessions?: PortForwardSessionPort;
  resourceManifestPort?: ResourceManifestPort;
  resourceIssuesPort?: ResourceIssuesPort;
  checksPort?: ChecksPort;
  resourceFilesPort?: ResourceFilesPort;
  trafficPort?: TrafficPort;
  port: ResourcesPort;
}) {
  const { reportUnauthorized } = useAuthSessionGate();
  const session = useOptionalProductSession();
  const filter = useUnifiedFilter();
  const aiLayout = useAiAssistantLayout();
  const [manifestEditing, setManifestEditing] = useState(false);
  const state = useResourcesPageState(port, refreshPolicies, manifestEditing);
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
    refreshPolicies,
    reportUnauthorized,
    revision: state.podRevision,
  });
  const relationTopology = useRelationTopologyDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1 &&
      topology.view === "relations" &&
      (filter.state.resources.types.length > 0 ||
        filter.state.resources.health.length > 0 ||
        filter.state.resources.query.trim().length > 0),
    filterState: filter.state,
    port: relationTopologyPort,
    reportUnauthorized,
    revision: state.revision,
  });
  const connectionTopologyFilterState = useMemo(() => ({
    ...filter.state,
    resources: {
      ...filter.state.resources,
      health: [],
      query: "",
      types: filter.state.common.applications.length > 0
        ? []
        : [...CONNECTION_PANEL_RESOURCE_TYPES],
    },
  }), [filter.state]);
  const connectionTopology = useRelationTopologyDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1 &&
      state.view === "map",
    filterState: connectionTopologyFilterState,
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
    onResourceDelta: state.requestResourceEventInvalidation,
  });
  const changeTimeline = useChangeTimelineDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1 &&
      timelineReadBounded,
    authorityKey,
    filterState: filter.state,
    onResourceInvalidation: state.requestResourceEventInvalidation,
    port: changeTimelinePort,
    range: filter.detail.timeRange ?? "1h",
    reportUnauthorized,
    revision: state.revision,
    timelinePort,
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
    active: metricResourceIds.length > 0 || detailResource !== null,
    authorityKey,
    filterState: filter.state,
    port: resourceMetricsHistoryPort,
    range: filter.detail.timeRange ?? "1h",
    refreshPolicies,
    reportUnauthorized,
    resourceIds: metricResourceIds,
    snapshotRevision: filteredPage?.snapshot.snapshotRevision ?? null,
    liveSeries: physicalRealtime.metricSeries,
    observedResource: detailResource,
    scopeSnapshot: filteredPage?.snapshot ?? null,
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
  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const detail = (event as CustomEvent<ProductShortcutEventDetail>).detail;
      if (!detail || !isProductContextShortcutId(detail.id)) return;
      if (detail.id === "resources:previous-kind") state.cycleResourceType(-1);
      if (detail.id === "resources:next-kind") state.cycleResourceType(1);
    };
    window.addEventListener(PRODUCT_SHORTCUT_EVENT, handleShortcut);
    return () => window.removeEventListener(PRODUCT_SHORTCUT_EVENT, handleShortcut);
  }, [state]);
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
  const createNamespace = filter.state.common.namespaces.length === 1
    && filter.state.common.namespaces[0].clusterId === state.selectedClusterId
    ? filter.state.common.namespaces[0].namespace
    : null;
  const detailFull = state.detailFull || aiLayout.open;
  const detailInset = aiLayout.open ? aiLayout.width : 0;
  const fleetView = filter.detail.resourceSurfaceView ?? "map";
  return (
    <div
      className="relative flex h-[calc(100svh-3.5rem)] min-w-0 overflow-hidden"
      data-detail-layout={state.detailRequested ? (detailFull ? "full" : "peek") : "closed"}
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

          {state.view === "flow" && trafficPort ? (
            <ResourcesTrafficFlowSurface onOpenService={state.openDetailTarget} port={trafficPort} setView={state.setView} />
          ) : !state.selectedClusterExists ? (
            state.clusterSelection.kind === "unknown" ? (
              <UnknownSelection value={state.selectedClusterId} variant="cluster" />
            ) : state.clusterSelection.kind === "unfiltered" ? (
              <ResourcesFleetZoom
                clusters={state.choices.data.clusters}
                completeness={state.choices.data.completeness}
                onViewChange={state.setView}
                view={fleetView}
              />
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
            state.catalog.data.completeness === "observed" ? (
              <ProductStateScreen kind="empty" placement="content" />
            ) : (
              <UnknownCompletenessEmpty variant="catalog" />
            )
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
                connectionTopology={connectionTopology}
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
        <ResourceDetailOverlay forceFull={detailFull} rightInset={detailInset}>
          <ResourceDetailWorkspace
            actionsPort={resourceActionsPort}
            capabilities={resourceCapabilities}
            detail={state.detail}
            full={state.detailFull}
            forceFull={aiLayout.open}
            identity={state.detailIdentity}
            metricHistory={metricHistory}
            resourceIssues={resourceIssues}
            checksPort={checksPort}
            manifestPort={resourceManifestPort}
            onUnauthorized={reportUnauthorized}
            onManifestEditingChange={setManifestEditing}
            onClose={state.closeDetail}
            onFullChange={state.setDetailFull}
            onNavigateResource={state.navigateDetail}
            onResourceActionInvalidation={state.requestResourceEventInvalidation}
            onTabChange={state.setDetailTab}
            tab={state.detailTab}
            terminalPort={podTerminalPort}
            serviceAccessPort={serviceAccessPort}
            portForwardSessions={portForwardSessions}
            resourceFilesPort={resourceFilesPort}
          />
        </ResourceDetailOverlay>
      ) : null}
    </div>
  );
}

const INACTIVE_RESOURCE_ISSUES_PORT: ResourceIssuesPort = {
  loadResourceIssues: () => Promise.reject(new Error("resource issue port is inactive")),
};
