import type { ReactNode } from "react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { PhysicalTopologyPod } from "../../features/resources/physicalTopologyContract";
import type { ResourceTopologyView } from "../../features/filters/resourceTopologyView";
import type { TimelineRange } from "../../features/filters/filterContract";
import type { ResourcesFilterResourcePage } from "../../features/resources/resourcesFilterContract";
import type { ResourceMetricsHistoryFrame } from "./useResourceMetricsHistoryDataFrame";
import { captureRouteMorph } from "../../motion/useCameraMorph";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Surface } from "../../shared/ui/Surface";
import { Button } from "../../shared/ui/primitives/button";
import { ResourcesGraphShell } from "./ResourcesGraphShell";
import { ResourcesListLoadingPreview } from "./ResourcesLoadingPreview";
import {
  ResourcesFailure,
  UnknownCompletenessEmpty,
} from "./ResourcesPageFeedback";
import type { ResourcesFilterPageState } from "./resourcesFilterPageStateModel";
import { ResourcesTable } from "./ResourcesTable";
import { ResourcesToolbar } from "./ResourcesToolbar";
import { usePhysicalTopologyDataFrame } from "./usePhysicalTopologyDataFrame";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";
import type { ChangeTimelineFrame } from "./useChangeTimelineDataFrame";
import { useResourcesPageState } from "./useResourcesPageState";

export function ResourcesListSurface({
  filterList,
  listFallback,
  metricHistory,
  onLoadMore,
  physicalTopology,
  relationTopology,
  state,
  topologyPinned,
  topologyView,
  onTopologyViewChange,
  timelineFrame,
}: {
  filterList: ResourcesFilterPageState<ResourcesFilterResourcePage>;
  listFallback: ReactNode;
  metricHistory: ResourceMetricsHistoryFrame;
  onLoadMore: () => void;
  physicalTopology: ReturnType<typeof usePhysicalTopologyDataFrame>;
  relationTopology: RelationTopologyFrame;
  state: ReturnType<typeof useResourcesPageState>;
  topologyPinned: boolean;
  topologyView: ResourceTopologyView;
  onTopologyViewChange: (view: ResourceTopologyView) => void;
  timelineFrame: ChangeTimelineFrame;
}) {
  const { t } = useI18n();
  const filter = useUnifiedFilter();
  const cluster = state.choices.phase === "ready"
    ? state.choices.data.clusters.find((candidate) => candidate.id === state.selectedClusterId)
    : undefined;
  const openPod = (pod: PhysicalTopologyPod) => {
    if (state.selectedResourceType !== "pod") state.selectResourceType("pod");
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
      document.getElementById("resources-list-surface")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
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
  return (
    <div className="grid min-w-0 gap-4" data-slot="resources-four-layer-surface">
      <Surface aria-label={t("resources.layer.filters")} className="min-w-0 overflow-hidden">
        <ResourcesToolbar
          includeDeleted={state.includeDeleted}
          onIncludeDeletedChange={state.setIncludeDeleted}
        />
      </Surface>

      <Surface aria-labelledby="resources-graph-title" className="min-w-0 overflow-hidden">
        <ResourcesGraphShell
          breadcrumbs={breadcrumbs}
          clusterId={state.selectedClusterId ?? "unknown"}
          frame={physicalTopology}
          relationFrame={relationTopology}
          onOpenPod={openPod}
          onRevealServer={revealServer}
          onSelectAll={rewindToAll}
          skeletonServerCount={cluster?.serverCount ?? cluster?.nodeCount ?? null}
          topologyPinned={topologyPinned}
          topologyView={topologyView}
          onTopologyViewChange={onTopologyViewChange}
          timelineAtMs={filter.detail.timeAt}
          timelineFrame={timelineFrame}
          timelineRange={timelineRange}
          onTimelineAtChange={changeTimelineAt}
          onTimelineRangeChange={changeTimelineRange}
        />
      </Surface>

      {listFallback ?? (
        <Surface
          aria-labelledby="resources-list-title"
          className="min-w-0 overflow-hidden"
          id="resources-list-surface"
        >
          <div className="border-b px-4 py-3">
            <h3 className="font-medium" id="resources-list-title">
              {state.selectedResourceType}
            </h3>
          </div>
          <ResourcesListBody
            filterList={filterList}
            metricHistory={metricHistory}
            onLoadMore={onLoadMore}
            state={state}
          />
        </Surface>
      )}
    </div>
  );
}

function ResourcesListBody({
  filterList,
  metricHistory,
  onLoadMore,
  state,
}: {
  filterList: ResourcesFilterPageState<ResourcesFilterResourcePage>;
  metricHistory: ResourceMetricsHistoryFrame;
  onLoadMore: () => void;
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
  const items = filterList.data.items.map((item) => item.resource);
  return (
    <div className="min-w-0">
      <ListScopeStatus page={filterList.data} />
      <ResourcesTable
        items={items}
        metricHistory={metricHistory}
        onOpen={state.openDetail}
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

function ListScopeStatus({ page }: { page: ResourcesFilterResourcePage }) {
  const { formatNumber, t } = useI18n();
  const total = page.counts.filteredCount;
  const shown = page.items.length;
  const filteredText = total === null
    ? ` · ${t("resources.list.unknownTotal")}`
    : ` · ${t("resources.list.scope.filtered", { count: formatNumber(total) })}`;
  const excludedText = page.excludedCount > 0
    ? ` · ${t("resources.list.scope.excluded", {
      count: formatNumber(page.excludedCount),
    })}`
    : "";
  return (
    <div
      aria-label={t("resources.list.scope.aria")}
      className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      role="status"
    >
      {t("resources.list.scope.shown", { count: formatNumber(shown) })}
      {filteredText}
      {excludedText}
      {page.counts.filteredCountCompleteness === "partial"
        ? ` · ${t("common.state.partial")}`
        : ""}
    </div>
  );
}
