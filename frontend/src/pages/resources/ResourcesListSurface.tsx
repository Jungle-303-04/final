import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
import { ResourcesCatalog, ResourcesCatalogMobile } from "./ResourcesCatalog";
import { ResourcesListLoadingPreview } from "./ResourcesLoadingPreview";
import { ResourcesListScopeStatus } from "./ResourcesListScopeStatus";
import {
  ResourcesFailure,
  UnknownCompletenessEmpty,
} from "./ResourcesPageFeedback";
import type { ResourcesFilterPageState } from "./resourcesFilterPageStateModel";
import { ResourcesInfraMapView } from "./ResourcesInfraMapView";
import { buildInfraMapModel, type InfraMapNode } from "./resourcesInfraMapModel";
import { ResourcesTable } from "./ResourcesTable";
import { usePhysicalTopologyDataFrame } from "./usePhysicalTopologyDataFrame";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";
import type { ChangeTimelineFrame } from "./useChangeTimelineDataFrame";
import { useResourcesPageState } from "./useResourcesPageState";
import type { PhysicalTopologyReplayState } from "./usePhysicalTopologyRealtime";
import type { PhysicalPodOpenTarget } from "./physicalTopologyGraphTypes";
import {
  infraMapFocusItemFromResource,
  selectedPodIdsFromFocusDetails,
  useInfraMapFocusDetails,
  type InfraMapFocusItem,
} from "./useInfraMapFocusDetails";
import type { ResourcesPort } from "../../features/resources/resourcesContract";

type ReadyPhysicalTopologyFrame = Extract<
  ReturnType<typeof usePhysicalTopologyDataFrame>,
  { phase: "ready" }
>;

const RESOURCES_LIST_SURFACE_ID = "resources-list-surface";
const PRODUCT_MAIN_ID = "product-main";
const RESOURCES_LIST_REVEAL_RETRY_DELAY_MS = 120;

type MotionAwareScrollIntoView = ReturnType<typeof useMotionAwareScrollIntoView>;

function revealResourcesListSurface(scrollIntoView: MotionAwareScrollIntoView) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollResourcesListSurfaceIntoView(scrollIntoView);
      window.setTimeout(
        () => scrollResourcesListSurfaceIntoView(scrollIntoView),
        RESOURCES_LIST_REVEAL_RETRY_DELAY_MS,
      );
    });
  });
}

function scrollResourcesListSurfaceIntoView(scrollIntoView: MotionAwareScrollIntoView) {
  const target = document.getElementById(RESOURCES_LIST_SURFACE_ID);
  if (!(target instanceof HTMLElement)) return;
  scrollIntoView(target, { block: "start" });
  scrollNearestContainerToTarget(target);
}

function scrollNearestContainerToTarget(target: HTMLElement) {
  const scrollContainer = findScrollContainer(target);
  const behavior = prefersReducedMotion() ? "auto" : "smooth";
  if (scrollContainer) {
    const targetRect = target.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    scrollContainer.scrollTo({
      behavior,
      top: Math.max(0, targetRect.top - containerRect.top + scrollContainer.scrollTop),
    });
    return;
  }
  window.scrollTo({
    behavior,
    top: Math.max(0, target.getBoundingClientRect().top + window.scrollY),
  });
}

function findScrollContainer(target: HTMLElement): HTMLElement | null {
  let current = target.parentElement;
  while (current && current !== document.body) {
    if (isScrollable(current)) return current;
    current = current.parentElement;
  }
  const productMain = document.getElementById(PRODUCT_MAIN_ID);
  if (productMain instanceof HTMLElement && productMain.scrollHeight > productMain.clientHeight) {
    return productMain;
  }
  const scrollingElement = document.scrollingElement;
  return scrollingElement instanceof HTMLElement ? scrollingElement : null;
}

function isScrollable(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return element.scrollHeight > element.clientHeight &&
    ["auto", "scroll", "overlay"].some((value) =>
      style.overflowY === value || style.overflow === value);
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ResourcesListSurface({
  filterList,
  listFallback,
  metricHistory,
  nodePodsPort,
  onInfraMapUnauthorized,
  onNodePodsUnauthorized,
  onLoadMore,
  port,
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
  onInfraMapUnauthorized: () => void;
  onNodePodsUnauthorized: () => void;
  onLoadMore: () => void;
  port: ResourcesPort;
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
  const [infraMapFocusItems, setInfraMapFocusItems] = useState<InfraMapFocusItem[]>([]);
  const [infraMapListDrilldown, setInfraMapListDrilldown] =
    useState<InfraMapListDrilldown | null>(null);
  const [retainedInfraMapTopology, setRetainedInfraMapTopology] =
    useState<ReadyPhysicalTopologyFrame | null>(
      physicalTopology.phase === "ready" ? physicalTopology : null,
    );
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
    revealResourcesListSurface(scrollIntoView);
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
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setInfraMapFocusItems([]);
    });
    return () => {
      active = false;
    };
  }, [state.selectedClusterId, state.selectedResourceType]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setInfraMapListDrilldown(null);
    });
    return () => {
      active = false;
    };
  }, [state.selectedClusterId]);
  useEffect(() => {
    if (state.selectedResourceType === "pod") return undefined;
    let active = true;
    queueMicrotask(() => {
      if (active) setInfraMapListDrilldown(null);
    });
    return () => {
      active = false;
    };
  }, [state.selectedResourceType]);
  useEffect(() => {
    if (physicalTopology.phase !== "ready") return undefined;
    const animationFrame = requestAnimationFrame(() => {
      setRetainedInfraMapTopology(physicalTopology);
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [physicalTopology]);
  const infraMapTopology = physicalTopology.phase === "loading" &&
      retainedInfraMapTopology?.data.clusterId === state.selectedClusterId
    ? retainedInfraMapTopology
    : physicalTopology;
  const infraMapFocusOptions = useMemo(
    () => filterList.phase === "ready" && filterList.data !== null
      ? filterList.data.items.map((item) => infraMapFocusItemFromResource(item.resource))
      : [],
    [filterList],
  );
  const selectInfraMapFocusItem = useCallback((item: InfraMapFocusItem) => {
    setInfraMapFocusItems((current) => current.some((candidate) => candidate.key === item.key)
      ? current
      : [...current, item]);
  }, []);
  const removeInfraMapFocusItem = useCallback((key: string) => {
    setInfraMapFocusItems((current) => current.filter((item) => item.key !== key));
  }, []);
  const focusDetails = useInfraMapFocusDetails({
    clusterId: state.selectedClusterId,
    items: infraMapFocusItems,
    port,
    reportUnauthorized: onInfraMapUnauthorized,
    revision: state.revision,
  });
  const infraMapSelectedPodIds = useMemo(() => {
    if (infraMapFocusItems.length === 0) return undefined;
    if (focusDetails.phase !== "ready") {
      return new Set(infraMapFocusItems
        .filter((item) => item.identity.resourceType === "pod")
        .map((item) => item.resourceId));
    }
    return selectedPodIdsFromFocusDetails(focusDetails.data, infraMapFocusItems);
  }, [focusDetails, infraMapFocusItems]);
  const infraMapModel = useMemo(
    () => infraMapTopology.phase === "ready"
      ? buildInfraMapModel({
          selectedPodIds: infraMapSelectedPodIds,
          selectionActive: infraMapFocusItems.length > 0,
          topology: infraMapTopology.data,
        })
      : null,
    [infraMapFocusItems.length, infraMapSelectedPodIds, infraMapTopology],
  );
  const showInfraMapNodePods = useCallback((node: InfraMapNode) => {
    const knownPods = [...node.visiblePods, ...node.hiddenPods];
    setInfraMapListDrilldown({
      nodeId: node.id,
      nodeName: node.name,
      selectedPodKeys: infraMapFocusItems.length > 0 && knownPods.length > 0
        ? new Set(knownPods.map((pod) => pod.id))
        : null,
    });
    if (state.selectedResourceType !== "pod") state.selectResourceType("pod");
    filter.updateDetail(
      (current) => ({ ...current, node: node.name }),
      "drill-in",
    );
    revealResourcesListSurface(scrollIntoView);
  }, [filter, infraMapFocusItems.length, scrollIntoView, state]);
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
    <div className="grid min-w-0 gap-4" data-slot="resources-four-layer-surface">
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="sticky top-4 hidden min-w-0 lg:block" data-slot="resources-catalog-rail">
          <ResourcesCatalog
            discovery={state.catalog.phase === "ready" ? state.catalog.data.apiDiscovery : undefined}
            items={state.catalog.phase === "ready" ? state.catalog.data.items : []}
            onSelect={state.selectResourceType}
            selectedResourceType={state.selectedResourceType}
          />
        </aside>
        <div className="grid min-w-0 gap-4 overflow-x-hidden">
          <ResourcesCatalogMobile
            discovery={state.catalog.phase === "ready" ? state.catalog.data.apiDiscovery : undefined}
            items={state.catalog.phase === "ready" ? state.catalog.data.items : []}
            onSelect={state.selectResourceType}
            selectedResourceType={state.selectedResourceType}
          />
          <Surface aria-labelledby="resources-infra-map-title" className="min-w-0 overflow-hidden">
            <ResourcesInfraMapView
              focusOptions={infraMapFocusOptions}
              model={infraMapModel}
              onFocusRemove={removeInfraMapFocusItem}
              onFocusSelect={selectInfraMapFocusItem}
              onOpenPod={openPod}
              onRetry={state.refresh}
              onShowMorePods={showInfraMapNodePods}
              phase={infraMapTopology.phase}
              selectedFocus={infraMapFocusItems}
            />
          </Surface>
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
              timelineReplayWindow={{
                fromMs: replay.availableFromMs,
                toMs: replay.availableToMs,
              }}
              onTimelineAtChange={changeTimelineAt}
              onTimelineRangeChange={changeTimelineRange}
              collapsed={filter.detail.graphCollapsed === true}
              onCollapsedChange={changeGraphCollapsed}
              onIncludeDeletedChange={state.setIncludeDeleted}
            />
          </Surface>

          {listFallback ?? (
            <Surface
              aria-labelledby="resources-list-title"
              className="min-w-0 overflow-hidden"
              id={RESOURCES_LIST_SURFACE_ID}
            >
              <div className="border-b px-4 py-3">
                <h3 className="font-medium" id="resources-list-title">
                  {filter.state.resources.types.length === 0
                    ? t("resources.list.allTitle")
                    : filter.state.resources.types.map(humanizeFilterValue).join(", ")}
                </h3>
                {infraMapListDrilldown ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("resources.infraMap.nodeLabel", { name: infraMapListDrilldown.nodeName })}
                  </p>
                ) : null}
              </div>
              <ResourcesListBody
                filterList={filterList}
                infraMapListDrilldown={infraMapListDrilldown}
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

interface InfraMapListDrilldown {
  nodeId: string;
  nodeName: string;
  selectedPodKeys: ReadonlySet<string> | null;
}

function ResourcesListBody({
  filterList,
  infraMapListDrilldown,
  metricHistory,
  onLoadMore,
  selectTableRows,
  state,
}: {
  filterList: ResourcesFilterPageState<ResourcesFilterResourcePage>;
  infraMapListDrilldown: InfraMapListDrilldown | null;
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
  const items = selectInfraMapDrilldownRows(
    selectTableRows(filterList.data.items.map((item) => item.resource)),
    infraMapListDrilldown,
  );
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

function selectInfraMapDrilldownRows(
  rows: readonly ResourceSummary[],
  drilldown: InfraMapListDrilldown | null,
): ResourceSummary[] {
  if (drilldown === null) return [...rows];
  return rows.filter((row) => {
    if (row.resourceType !== "pod") return false;
    if (
      drilldown.selectedPodKeys !== null &&
      !drilldown.selectedPodKeys.has(podRowKey(row))
    ) {
      return false;
    }
    if (row.facts.type !== "pod" || row.facts.nodeName === null) return true;
    return row.facts.nodeName === drilldown.nodeName ||
      `node:${row.facts.nodeName}` === drilldown.nodeId;
  });
}

function podRowKey(row: ResourceSummary): string {
  return row.namespace === null
    ? `pod:${row.name}`
    : `pod:${row.namespace}/${row.name}`;
}
