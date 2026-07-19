import type { ReactNode } from "react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { HomePort } from "../../features/home/homeContract";
import type { ResourceTopologyView } from "../../features/filters/resourceTopologyView";
import type { TimelineRange } from "../../features/filters/filterContract";
import type { ResourcesFilterResourcePage } from "../../features/resources/resourcesFilterContract";
import type { ResourceSummary } from "../../features/resources/resourcesContract";
import {
  exactRelationNodeId,
  exactRelationResourceIdentity,
} from "../../features/resources/relationTopologyGraphModel";
import type { ResourceMetricsHistoryFrame } from "./useResourceMetricsHistoryDataFrame";
import { captureRouteMorph } from "../../motion/useCameraMorph";
import { useMotionAwareScrollIntoView } from "../../motion/scrollIntoView";
import { useI18n } from "../../shared/i18n";
import { humanizeFilterValue } from "../../shared/presentation/humanizeFilterValue";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Surface } from "../../shared/ui/Surface";
import { Button } from "../../shared/ui/primitives/button";
import { ResourcesGraphShell } from "./ResourcesGraphShell";
import { ResourcesCatalog } from "./ResourcesCatalog";
import { ResourcesListLoadingPreview } from "./ResourcesLoadingPreview";
import { ResourcesListScopeStatus } from "./ResourcesListScopeStatus";
import {
  ResourcesFailure,
  UnknownCompletenessEmpty,
} from "./ResourcesPageFeedback";
import type { ResourcesFilterPageState } from "./resourcesFilterPageStateModel";
import { ResourcesTable } from "./ResourcesTable";
import { usePhysicalTopologyDataFrame } from "./usePhysicalTopologyDataFrame";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";
import type { ChangeTimelineFrame } from "./useChangeTimelineDataFrame";
import { useResourcesPageState } from "./useResourcesPageState";
import type { PhysicalTopologyReplayState } from "./usePhysicalTopologyRealtime";
import type { PhysicalPodOpenTarget } from "./physicalTopologyGraphTypes";
import { ResourcesViewSwitcher } from "./ResourcesViewSwitcher";
import { ResourcesToolbar } from "./ResourcesToolbar";

export function ResourcesListSurface({
  filterList,
  listFallback,
  metricHistory,
  nodePodsPort,
  onNodePodsUnauthorized,
  onLoadMore,
  physicalTopology,
  relationTopology,
  replay,
  selectTableRows,
  state,
  topologyPinned,
  topologyView,
  onTopologyViewChange,
  timelineFrame,
}: {
  filterList: ResourcesFilterPageState<ResourcesFilterResourcePage>;
  listFallback: ReactNode;
  metricHistory: ResourceMetricsHistoryFrame;
  nodePodsPort: Pick<HomePort, "loadNodePods">;
  onNodePodsUnauthorized: () => void;
  onLoadMore: () => void;
  physicalTopology: ReturnType<typeof usePhysicalTopologyDataFrame>;
  relationTopology: RelationTopologyFrame;
  replay: PhysicalTopologyReplayState;
  selectTableRows: (rows: readonly ResourceSummary[]) => ResourceSummary[];
  state: ReturnType<typeof useResourcesPageState>;
  topologyPinned: boolean;
  topologyView: ResourceTopologyView;
  onTopologyViewChange: (view: ResourceTopologyView) => void;
  timelineFrame: ChangeTimelineFrame;
}) {
  const { t } = useI18n();
  const filter = useUnifiedFilter();
  const scrollIntoView = useMotionAwareScrollIntoView();
  const cluster = state.choices.phase === "ready"
    ? state.choices.data.clusters.find((candidate) => candidate.id === state.selectedClusterId)
    : undefined;
  const openPod = (pod: PhysicalPodOpenTarget) => {
    state.openDetail({
      resourceType: "pod",
      kind: "Pod",
      namespace: pod.namespace,
      name: pod.name,
    });
  };
  const revealServer = (serverId: string) => {
    if (state.selectedResourceType !== "pod") state.selectResourceType("pod");
    filter.updateDetail(
      (current) => ({ ...current, node: serverId }),
      "drill-in",
    );
    requestAnimationFrame(() => {
      scrollIntoView(document.getElementById("resources-list-surface"), { block: "start" });
    });
  };
  const rewindToCluster = () => filter.updateFilters(
    (current) => ({
      ...current,
      common: {
        ...current.common,
        applications: [],
        labels: [],
        namespaces: [],
      },
      resources: {
        ...current.resources,
        health: [],
        query: "",
        types: [],
      },
    }),
    "clear-filters",
  );
  const rewindToAll = () => {
    captureRouteMorph(document);
    filter.updateFilters(
      (current) => ({
        ...current,
        common: {
          clusters: [],
          namespaces: [],
          applications: [],
          labels: [],
        },
        resources: {
          ...current.resources,
          types: [],
          health: [],
          query: "",
        },
      }),
      "clear-filters",
    );
  };
  const breadcrumbs = [
    ...(cluster
      ? [{ id: `cluster:${cluster.id}`, label: cluster.name, onSelect: rewindToCluster }]
      : []),
    ...filter.state.common.applications.map((applicationId) => ({
      id: `application:${applicationId}`,
      label: applicationId,
      onSelect: () => filter.updateFilters(
        (current) => ({
          ...current,
          common: { ...current.common, applications: [applicationId] },
        }),
        "chip-remove",
      ),
    })),
  ];
  const timelineRange = filter.detail.timeRange ?? "1h";
  const changeTimelineRange = (range: TimelineRange) => filter.updateDetail(
    (current) => ({
      ...current,
      timeRange: range === "1h" ? undefined : range,
      timeAt: undefined,
    }),
    "time-range",
  );
  const changeTimelineAt = (timeAt: number | undefined) => filter.updateDetail(
    (current) => ({ ...current, timeAt }),
    "time-at",
  );
  const changeGraphCollapsed = (collapsed: boolean) => filter.updateDetail(
    (current) => ({
      ...current,
      graphCollapsed: collapsed ? true : undefined,
    }),
    "graph-visibility",
  );
  const listedResources = filterList.phase === "ready" && filterList.data
    ? filterList.data.items.map((item) => item.resource)
    : [];
  const selectRelationResource = (resourceId: string) => {
    const identity = exactRelationResourceIdentity(resourceId, listedResources);
    if (identity === null) return false;
    state.openDetail(identity);
    return true;
  };
  const selectedRelationResourceId = exactRelationNodeId(
    state.detailIdentity,
    listedResources,
  );
  return (
    <div className="grid min-w-0 gap-4" data-slot="resources-view-surface">
      <ResourcesViewSwitcher onChange={state.setView} view={state.view} />
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <aside className="min-w-0 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1" data-slot="resources-catalog-rail">
          <ResourcesCatalog
            discovery={state.catalog.phase === "ready" ? state.catalog.data.apiDiscovery : undefined}
            items={state.catalog.phase === "ready" ? state.catalog.data.items : []}
            onSelect={state.selectResourceType}
            selectedResourceType={state.selectedResourceType}
          />
        </aside>
        <div className="grid min-w-0 gap-4 overflow-x-hidden lg:col-start-1 lg:row-start-1">
          {state.view === "map" ? (
            <Surface aria-labelledby="resources-graph-title" className="min-w-0 overflow-hidden">
              <ResourcesGraphShell
                breadcrumbs={breadcrumbs}
                clusterId={state.selectedClusterId ?? "unknown"}
                frame={physicalTopology}
                includeDeleted={state.includeDeleted}
                relationFrame={relationTopology}
                onSelectRelationResource={selectRelationResource}
                selectedRelationResourceId={selectedRelationResourceId}
                onOpenPod={openPod}
                nodePodsPort={nodePodsPort}
                onNodePodsUnauthorized={onNodePodsUnauthorized}
                onRevealServer={revealServer}
                onSelectAll={rewindToAll}
                skeletonServerCount={cluster?.serverCount ?? cluster?.nodeCount ?? null}
                topologyPinned={topologyPinned}
                topologyView={topologyView}
                onTopologyViewChange={onTopologyViewChange}
                timelineAtMs={filter.detail.timeAt}
                timelineFrame={timelineFrame}
                timelineRange={timelineRange}
                timelineReplayStatus={replay.status}
                timelineReplayWindow={{ fromMs: replay.availableFromMs, toMs: replay.availableToMs }}
                onTimelineAtChange={changeTimelineAt}
                onTimelineRangeChange={changeTimelineRange}
                collapsed={filter.detail.graphCollapsed === true}
                onCollapsedChange={changeGraphCollapsed}
                onIncludeDeletedChange={state.setIncludeDeleted}
              />
            </Surface>
          ) : listFallback ?? (
            <Surface
              aria-labelledby="resources-list-title"
              className="min-w-0 overflow-hidden"
              id="resources-list-surface"
            >
              <div className="flex min-w-0 items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="font-medium" id="resources-list-title">
                  {filter.state.resources.types.length === 0
                    ? t("resources.list.allTitle")
                    : filter.state.resources.types.map(humanizeFilterValue).join(", ")}
                </h3>
                <ResourcesToolbar
                  includeDeleted={state.includeDeleted}
                  onIncludeDeletedChange={state.setIncludeDeleted}
                />
              </div>
              <ResourcesListBody
                filterList={filterList}
                metricHistory={metricHistory}
                onLoadMore={onLoadMore}
                selectTableRows={selectTableRows}
                state={state}
              />
            </Surface>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourcesListBody({
  filterList,
  metricHistory,
  onLoadMore,
  selectTableRows,
  state,
}: {
  filterList: ResourcesFilterPageState<ResourcesFilterResourcePage>;
  metricHistory: ResourceMetricsHistoryFrame;
  onLoadMore: () => void;
  selectTableRows: (rows: readonly ResourceSummary[]) => ResourceSummary[];
  state: ReturnType<typeof useResourcesPageState>;
}) {
  const { t } = useI18n();
  if (filterList.phase === "idle" || filterList.phase === "loading") {
    return (
      <ProductStateScreen
        kind="loading"
        loadingPreview={<ResourcesListLoadingPreview />}
        placement="content"
      />
    );
  }
  if (filterList.phase === "failed" && filterList.failure) {
    return (
      <ResourcesFailure
        failure={filterList.failure}
        onRetry={state.refresh}
        retryWaitSeconds={state.retryWaitSeconds}
      />
    );
  }
  if (
    filterList.phase !== "ready" ||
    filterList.data === null ||
    filterList.data.items.length === 0
  ) {
    return <UnknownCompletenessEmpty variant="list" />;
  }
  const items = selectTableRows(filterList.data.items.map((item) => item.resource));
  return (
    <div className="min-w-0">
      <ResourcesListScopeStatus page={filterList.data} />
      <ResourcesTable
        items={items}
        metricHistory={metricHistory}
        onOpen={state.openDetail}
        onOpenManifest={(identity) => state.openDetail(identity, "manifest")}
        registerRowButton={state.registerRowButton}
      />
      {filterList.data.hasMore || filterList.appending || filterList.appendFailure ? (
        <div className="flex flex-wrap items-center justify-center gap-3 border-t px-4 py-3">
          {filterList.appendFailure ? (
            <span className="text-xs text-destructive" role="alert">
              {t("resources.list.appendFailed")}
            </span>
          ) : null}
          <Button
            disabled={filterList.appending}
            onClick={onLoadMore}
            type="button"
            variant="outline"
          >
            {filterList.appending
              ? t("resources.list.loadingMore")
              : t("resources.list.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
