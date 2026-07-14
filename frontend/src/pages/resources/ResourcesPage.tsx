import { RefreshCw } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesFilterPort } from "../../features/resources/resourcesFilterContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import type { ResourceMetricsHistoryPort } from "../../features/resources/resourceMetricsHistoryContract";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { ResourceDetailSheet } from "./ResourceDetailSheet";
import { ResourcesCatalog } from "./ResourcesCatalog";
import {
  ResourcesCatalogLoadingPreview,
} from "./ResourcesLoadingPreview";
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

export function ResourcesPage({
  filterPort,
  physicalTopologyPort,
  resourceMetricsHistoryPort,
  port,
}: {
  filterPort: ResourcesFilterPort;
  physicalTopologyPort: PhysicalTopologyPort;
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort;
  port: ResourcesPort;
}) {
  const { t } = useI18n();
  const { reportUnauthorized } = useAuthSessionGate();
  const session = useOptionalProductSession();
  const filter = useUnifiedFilter();
  const state = useResourcesPageState(port);
  const authorityKey = session
    ? `${session.workspaceId}:${session.userId}`
    : "anonymous";
  const physicalTopology = usePhysicalTopologyDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1,
    filterState: filter.state,
    port: physicalTopologyPort,
    reportUnauthorized,
    revision: state.revision,
  });
  const filtered = useResourcesFilterDataFrame({
    active:
      state.selectedClusterExists &&
      state.selectedResourceType !== null &&
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
  const resourcesView = state.view;
  const setResourcesView = state.setView;
  useResourceTypeShortcuts(state.cycleResourceType);
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
    <ProductPageFrame>
      <header className="flex min-w-0 justify-end">
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 xl:w-auto">
          {state.automaticRefreshPaused ? (
            <Badge variant="outline">{t("resources.refresh.paused")}</Badge>
          ) : null}
          <Button
            aria-label={t("common.action.refresh")}
            disabled={refreshing || (state.retryWaitSeconds ?? 0) > 0}
            onClick={state.refresh}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={refreshing ? "motion-safe:animate-spin" : undefined}
            />
          </Button>
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
      ) : state.catalog.phase === "loading" ||
        state.catalog.phase === "idle" ? (
        <ProductStateScreen
          kind="loading"
          loadingPreview={<ResourcesCatalogLoadingPreview />}
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
            list={state.list}
            filterList={filtered.list}
          />
          <CatalogFreshness observedAt={state.catalog.data.observedAt} />
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <ResourcesCatalog
              items={state.catalog.data.items}
              onSelect={state.selectResourceType}
              selectedResourceType={state.selectedResourceType}
            />
            <ResourcesListSurface
              filterList={filtered.list}
              metricHistory={metricHistory}
              onLoadMore={filtered.loadMoreList}
              listFallback={
                state.resourceTypeInvalid ||
                !state.selectedResourceType ||
                !state.catalog.data.items.some(
                  (item) => item.resourceType === state.selectedResourceType,
                )
                  ? (
                    <UnknownSelection
                      value={state.selectedResourceType}
                      variant="resource"
                    />
                  )
                  : null
              }
              physicalTopology={physicalTopology}
              state={state}
            />
          </div>
        </>
      )}

      <ResourceDetailSheet
        detail={state.detail}
        full={state.fullDetail}
        identity={state.detailIdentity}
        onClose={state.closeDetail}
        onTabChange={state.setDetailTab}
        open={state.detailRequested}
        tab={state.detailTab}
      />
    </ProductPageFrame>
  );
}

function useResourceTypeShortcuts(cycle: (direction: -1 | 1) => void) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditingTarget(event.target) ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (event.key !== "[" && event.key !== "]") return;
      event.preventDefault();
      cycle(event.key === "]" ? 1 : -1);
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [cycle]);
}

function isEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.matches("input, textarea, select, [contenteditable=true]")
  );
}
