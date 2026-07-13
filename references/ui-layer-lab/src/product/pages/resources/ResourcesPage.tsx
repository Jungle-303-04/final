import { RefreshCw, Server } from "lucide-react";
import { useEffect } from "react";
import type { HomePort } from "../../features/home/homeContract";
import type {
  ResourceList,
  ResourcesPort,
} from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import {
  ClusterConnectionStatus,
  clusterDisplayLabel,
} from "../../shared/ui/ClusterConnectionStatus";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { Surface } from "../../shared/ui/Surface";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import { ResourceDetailSheet } from "./ResourceDetailSheet";
import { ResourcesCatalog } from "./ResourcesCatalog";
import {
  ResourcesCatalogLoadingPreview,
  ResourcesListLoadingPreview,
} from "./ResourcesLoadingPreview";
import {
  CatalogFreshness,
  ResourcesDenied,
  ResourcesFailure,
  ResourcesRefreshFeedback,
  UnknownCompletenessEmpty,
  UnknownSelection,
} from "./ResourcesPageFeedback";
import { filterResourceRows, ResourcesTable } from "./ResourcesTable";
import { ResourcesToolbar } from "./ResourcesToolbar";
import { useResourcesPageState } from "./useResourcesPageState";

type ClusterPort = Pick<HomePort, "listClusterChoices">;
export function ResourcesPage({
  clusterPort,
  port,
}: {
  clusterPort: ClusterPort;
  port: ResourcesPort;
}) {
  const { t } = useI18n();
  const state = useResourcesPageState(port, clusterPort);
  useResourceTypeShortcuts(state.cycleResourceType);
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
    return <ProductStateScreen kind="empty" placement="content" />;
  }
  if (state.denied) {
    return <ResourcesDenied onRetry={state.refresh} />;
  }

  const selectedCluster = state.choices.data.clusters.find(
    (cluster) => cluster.id === state.selectedClusterId,
  );
  const refreshing = [state.choices, state.catalog, state.list, state.detail].some(
    (resource) => resource.phase === "ready" && resource.refreshing,
  );
  return (
    <ProductPageFrame>
      <header className="flex min-w-0 justify-end">
        <div className="flex w-full min-w-0 items-center justify-end gap-2 xl:w-auto">
          {state.automaticRefreshPaused ? (
            <Badge variant="outline">{t("resources.refresh.paused")}</Badge>
          ) : null}
          {selectedCluster ? (
            <ClusterConnectionStatus
              connectionState={selectedCluster.connectionState}
              lastObservedAt={selectedCluster.lastObservedAt}
            />
          ) : null}
          <Select
            items={state.choices.data.clusters.map((cluster) => ({
              label: clusterDisplayLabel(cluster),
              value: cluster.id,
            }))}
            onValueChange={(value) => { if (value) state.selectCluster(value); }}
            value={selectedCluster?.id ?? null}
          >
            <SelectTrigger
              aria-label={t("resources.cluster.select")}
              className="min-w-0 flex-1 xl:w-(--product-cluster-select-width) xl:flex-none"
            >
              <Server aria-hidden="true" />
              <SelectValue placeholder={t("resources.cluster.select")} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectLabel>{t("resources.cluster.available")}</SelectLabel>
                {state.choices.data.clusters.map((cluster) => (
                  <SelectItem key={cluster.id} value={cluster.id}>
                    {clusterDisplayLabel(cluster)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
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
        <UnknownSelection value={state.selectedClusterId} variant="cluster" />
      ) : state.catalog.phase === "loading" || state.catalog.phase === "idle" ? (
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
          />
          <CatalogFreshness observedAt={state.catalog.data.observedAt} />
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <ResourcesCatalog
              items={state.catalog.data.items}
              onSelect={state.selectResourceType}
              selectedResourceType={state.selectedResourceType}
            />
            {state.resourceTypeInvalid || !state.selectedResourceType ? (
              <UnknownSelection value={state.selectedResourceType} variant="resource" />
            ) : !state.catalog.data.items.some(
              (item) => item.resourceType === state.selectedResourceType,
            ) ? (
              <UnknownSelection value={state.selectedResourceType} variant="resource" />
            ) : (
              <ResourcesListSurface state={state} />
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

function ResourcesListSurface({ state }: { state: ReturnType<typeof useResourcesPageState> }) {
  return (
    <Surface aria-labelledby="resources-list-title" className="min-w-0 overflow-hidden">
      <div className="border-b px-4 py-3">
        <h3 className="font-medium" id="resources-list-title">{state.selectedResourceType}</h3>
      </div>
      <ResourcesToolbar
        includeDeleted={state.includeDeleted}
        namespace={state.namespace}
        onIncludeDeletedChange={state.setIncludeDeleted}
        onNamespaceChange={state.setNamespace}
        onSearchChange={state.setSearch}
        search={state.search}
      />
      <ResourcesListBody state={state} />
    </Surface>
  );
}

function ResourcesListBody({ state }: { state: ReturnType<typeof useResourcesPageState> }) {
  const { t } = useI18n();
  if (state.list.phase === "idle" || state.list.phase === "loading") {
    return (
      <ProductStateScreen
        kind="loading"
        loadingPreview={<ResourcesListLoadingPreview />}
        placement="content"
      />
    );
  }
  if (state.list.phase === "failed") {
    return (
      <ResourcesFailure
        failure={state.list.failure}
        onRetry={state.refresh}
        retryWaitSeconds={state.retryWaitSeconds}
      />
    );
  }
  if (state.list.data.items.length === 0) {
    return <UnknownCompletenessEmpty variant="list" />;
  }
  const filtered = filterResourceRows(state.list.data.items, state.search);
  return (
    <div className="min-w-0">
      <ListScopeStatus filtered={filtered.length} list={state.list.data} />
      {filtered.length === 0 ? (
        <div className="grid min-h-48 place-items-center p-6 text-sm text-muted-foreground">
          {t("resources.list.emptySearch")}
        </div>
      ) : (
        <ResourcesTable
          items={filtered}
          onOpen={state.openDetail}
          registerRowButton={state.registerRowButton}
        />
      )}
    </div>
  );
}

function ListScopeStatus({ filtered, list }: { filtered: number; list: ResourceList }) {
  const { formatNumber, t } = useI18n();
  const filteredText = filtered === list.returned
    ? ""
    : ` · ${t("resources.list.scope.filtered", { count: formatNumber(filtered) })}`;
  const excludedText = (list.excludedCount ?? 0) > 0
    ? ` · ${t("resources.list.scope.excluded", {
      count: formatNumber(list.excludedCount ?? 0),
    })}`
    : "";
  return (
    <div
      aria-label={t("resources.list.scope.aria")}
      className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      role="status"
    >
      {t("resources.list.scope.shown", { count: formatNumber(list.returned) })}
      {filteredText}{excludedText} · {t("resources.list.unknownTotal")} · {t(
        "resources.list.scope.limit",
        { count: formatNumber(list.limit) },
      )}
      {list.limitReached ? ` · ${t("resources.list.scope.limitReached")}` : ""}
    </div>
  );
}

function useResourceTypeShortcuts(cycle: (direction: -1 | 1) => void) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey ||
        isEditingTarget(event.target) || document.querySelector('[role="dialog"]')) return;
      if (event.key !== "[" && event.key !== "]") return;
      event.preventDefault();
      cycle(event.key === "]" ? 1 : -1);
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [cycle]);
}

function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    target.matches("input, textarea, select, [contenteditable=true]");
}
