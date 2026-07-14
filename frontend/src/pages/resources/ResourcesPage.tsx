import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type {
  ResourcesFilterPort,
  ResourcesFilterResourcePage,
} from "../../features/resources/resourcesFilterContract";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { Surface } from "../../shared/ui/Surface";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { ResourceDetailSheet } from "./ResourceDetailSheet";
import { ResourcesCatalog } from "./ResourcesCatalog";
import { ResourcesGraphShell } from "./ResourcesGraphShell";
import {
  ResourcesCatalogLoadingPreview,
  ResourcesListLoadingPreview,
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
import { ResourcesTable } from "./ResourcesTable";
import { ResourcesToolbar } from "./ResourcesToolbar";
import { useResourcesFilterDataFrame } from "./useResourcesFilterDataFrame";
import type { ResourcesFilterPageState } from "./resourcesFilterPageStateModel";
import { useResourcesPageState } from "./useResourcesPageState";

export function ResourcesPage({
  filterPort,
  port,
}: {
  filterPort: ResourcesFilterPort;
  port: ResourcesPort;
}) {
  const { t } = useI18n();
  const { reportUnauthorized } = useAuthSessionGate();
  const session = useOptionalProductSession();
  const filter = useUnifiedFilter();
  const state = useResourcesPageState(port);
  const filtered = useResourcesFilterDataFrame({
    active:
      state.selectedClusterExists &&
      state.selectedResourceType !== null &&
      !state.resourceTypeInvalid,
    authorityKey: session
      ? `${session.workspaceId}:${session.userId}`
      : "anonymous",
    facetAxis: null,
    facetQuery: "",
    filterState: filter.state,
    onListFailure: state.recordListFailure,
    onListSuccess: state.recordListSuccess,
    port: filterPort,
    reportUnauthorized,
    revision: state.revision,
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
          <ResourcesClusterBoundary variant="required" />
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
            {state.resourceTypeInvalid || !state.selectedResourceType ? (
              <UnknownSelection
                value={state.selectedResourceType}
                variant="resource"
              />
            ) : !state.catalog.data.items.some(
                (item) => item.resourceType === state.selectedResourceType,
              ) ? (
              <UnknownSelection
                value={state.selectedResourceType}
                variant="resource"
              />
            ) : (
              <ResourcesListSurface filterList={filtered.list} state={state} />
            )}
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

function ResourcesListSurface({
  filterList,
  state,
}: {
  filterList: ResourcesFilterPageState<ResourcesFilterResourcePage>;
  state: ReturnType<typeof useResourcesPageState>;
}) {
  const { t } = useI18n();
  return (
    <div
      className="grid min-w-0 gap-4"
      data-slot="resources-four-layer-surface"
    >
      <Surface
        aria-label={t("resources.layer.filters")}
        className="min-w-0 overflow-hidden"
      >
        <ResourcesToolbar
          includeDeleted={state.includeDeleted}
          onIncludeDeletedChange={state.setIncludeDeleted}
        />
      </Surface>

      <Surface
        aria-labelledby="resources-graph-unavailable-title"
        className="min-w-0 overflow-hidden"
      >
        <ResourcesGraphShell />
      </Surface>

      <Surface
        aria-labelledby="resources-list-title"
        className="min-w-0 overflow-hidden"
      >
        <div className="border-b px-4 py-3">
          <h3 className="font-medium" id="resources-list-title">
            {state.selectedResourceType}
          </h3>
        </div>
        <ResourcesListBody filterList={filterList} state={state} />
      </Surface>
    </div>
  );
}

function ResourcesListBody({
  filterList,
  state,
}: {
  filterList: ResourcesFilterPageState<ResourcesFilterResourcePage>;
  state: ReturnType<typeof useResourcesPageState>;
}) {
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
        onOpen={state.openDetail}
        registerRowButton={state.registerRowButton}
      />
    </div>
  );
}

function ListScopeStatus({ page }: { page: ResourcesFilterResourcePage }) {
  const { formatNumber, t } = useI18n();
  const total = page.counts.filteredCount;
  const shown = page.items.length;
  const filteredText =
    total === null
      ? ` · ${t("resources.list.unknownTotal")}`
      : ` · ${t("resources.list.scope.filtered", { count: formatNumber(total) })}`;
  const excludedText =
    page.excludedCount > 0
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
