import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import { useVisibleRefreshClock } from "../../shared/data/useVisibleRefreshClock";
import {
  blockForFailure,
  hasRetryBlocks,
  retryWaitSeconds,
  scheduledRateLimitRetryAt,
  toResourcesFailure,
  withRetryBlock,
  withoutRetryBlock,
  type ResourcesRequestTarget,
  type ResourcesRetryBlocks,
} from "./resourcesPageStateModel";
import { resolveResourceType } from "./resourcesUrlState";
import { useResourcesDataFrame } from "./useResourcesDataFrame";
import { useResourcesDetailState } from "./useResourcesDetailState";

const RESOURCE_COUNTS_POLL_INTERVAL_MS = 10_000;
const POD_STATE_POLL_INTERVAL_MS = 5_000;
export function useResourcesPageState(port: ResourcesPort) {
  const { reportUnauthorized } = useAuthSessionGate();
  const clusterScope = useClusterScope();
  const filter = useUnifiedFilter();
  const refreshClusterScope = clusterScope.refresh;
  const params = useParams<"*">();
  const selectedClusterId = clusterScope.requestedClusterId;
  const legacyTypeResolution = resolveResourceType(params["*"]);
  const canonicalTypes = filter.state.resources.types;
  const selectedResourceType =
    canonicalTypes.length === 1
      ? (canonicalTypes[0] ?? null)
      : canonicalTypes.length === 0 && legacyTypeResolution.kind === "valid"
        ? legacyTypeResolution.value
        : null;
  const namespaceRefs = filter.state.common.namespaces;
  const selectedNamespaces = selectedClusterId
    ? namespaceRefs.filter(
        (candidate) => candidate.clusterId === selectedClusterId,
      )
    : [];
  const namespace =
    namespaceRefs.length === 1 && selectedNamespaces.length === 1
      ? (selectedNamespaces[0]?.namespace ?? null)
      : null;
  const listFiltersSupported =
    namespaceRefs.length === selectedNamespaces.length &&
    namespaceRefs.length <= 1 &&
    filter.state.common.applications.length === 0 &&
    filter.state.common.labels.length === 0 &&
    filter.state.resources.health.length === 0 &&
    filter.state.resources.query.length === 0;
  const view = filter.state.resources.view;
  const listQuerySupported = listFiltersSupported;
  const includeDeleted = filter.state.resources.includeDeleted;
  const choices = clusterScope.collection;
  const [retryBlocks, setRetryBlocks] = useState<ResourcesRetryBlocks>({});
  const {
    closeDetail,
    detailIdentity,
    detailRequested,
    detailTarget,
    navigateDetail,
    openDetail,
    registerRowButton,
  } = useResourcesDetailState(
    selectedClusterId,
    selectedResourceType,
    setRetryBlocks,
  );
  const automaticRefreshPaused = hasRetryBlocks(retryBlocks);
  const { refresh: advanceRevision, revision } = useVisibleRefreshClock(
    !automaticRefreshPaused,
    RESOURCE_COUNTS_POLL_INTERVAL_MS,
  );
  const { refresh: advancePodRevision, revision: podRevision } = useVisibleRefreshClock(
    !automaticRefreshPaused && clusterScope.selectedClusterExists,
    POD_STATE_POLL_INTERVAL_MS,
  );
  const observedRevision = useRef(revision);
  const resumedFromBackground = useRef(false);
  const recordFailure = useCallback(
    (
      target: ResourcesRequestTarget,
      failure: ReturnType<typeof toResourcesFailure>,
    ) => {
      const block = blockForFailure(target, failure);
      setRetryBlocks((current) =>
        block
          ? withRetryBlock(current, block)
          : withoutRetryBlock(current, target),
      );
    },
    [],
  );
  const recordSuccess = useCallback((target: ResourcesRequestTarget) => {
    setRetryBlocks((current) => withoutRetryBlock(current, target));
  }, []);
  const refresh = useCallback(() => {
    advanceRevision();
    advancePodRevision();
  }, [advancePodRevision, advanceRevision]);

  useEffect(() => {
    if (observedRevision.current === revision) return;
    observedRevision.current = revision;
    if (resumedFromBackground.current) {
      resumedFromBackground.current = false;
      return;
    }
    refreshClusterScope();
  }, [refreshClusterScope, revision]);

  useEffect(() => {
    const rememberVisibilityResume = () => {
      if (document.visibilityState === "visible") resumedFromBackground.current = true;
    };
    document.addEventListener("visibilitychange", rememberVisibilityResume);
    return () => document.removeEventListener("visibilitychange", rememberVisibilityResume);
  }, []);

  useEffect(() => {
    const retryAt = scheduledRateLimitRetryAt(retryBlocks);
    if (retryAt === null) return;
    const timer = window.setTimeout(
      advanceRevision,
      Math.max(0, retryAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [advanceRevision, retryBlocks]);

  const selectedClusterExists = clusterScope.selectedClusterExists;
  const frame = useResourcesDataFrame({
    catalogQuerySupported: true,
    detailClusterId: detailTarget?.clusterId ?? null,
    detailIdentity,
    includeDeleted,
    listQuerySupported,
    namespace,
    port,
    onRequestFailure: recordFailure,
    onRequestSuccess: recordSuccess,
    reportUnauthorized,
    revision,
    selectedClusterExists,
    selectedClusterId,
    selectedResourceType,
  });

  const selectResourceType = useCallback(
    (resourceType: string) => {
      setRetryBlocks((current) =>
        withoutRetryBlock(withoutRetryBlock(current, "list"), "detail"),
      );
      filter.updateFilters(
        (current) => ({
          ...current,
          resources: { ...current.resources, types: [resourceType] },
        }),
        "chip-add",
      );
    },
    [filter],
  );

  return useMemo(
    () => ({
      choices,
      clusterSelection: clusterScope.selection,
      ...frame,
      selectedClusterId,
      selectedClusterExists,
      selectedResourceType,
      resourceTypeInvalid:
        canonicalTypes.length === 0 &&
        legacyTypeResolution.kind === "invalid",
      detailIdentity,
      detailRequested,
      detailFull: filter.detail.full,
      filterProjectionUnsupported:
        !listFiltersSupported,
      view,
      search: filter.state.resources.query,
      namespace,
      includeDeleted,
      detailTab: filter.detail.tab ?? "overview",
      automaticRefreshPaused,
      retryWaitSeconds: retryWaitSeconds(retryBlocks),
      recordListFailure(failure: ReturnType<typeof toResourcesFailure>) {
        recordFailure("list", failure);
      },
      recordListSuccess() {
        recordSuccess("list");
      },
      revision,
      podRevision,
      refresh,
      selectResourceType,
      cycleResourceType(direction: -1 | 1) {
        if (
          frame.catalog.phase !== "ready" ||
          frame.catalog.data.items.length === 0
        )
          return;
        const index = frame.catalog.data.items.findIndex(
          (item) => item.resourceType === selectedResourceType,
        );
        const base = index < 0 ? 0 : index;
        const nextIndex =
          (base + direction + frame.catalog.data.items.length) %
          frame.catalog.data.items.length;
        const nextItem = frame.catalog.data.items[nextIndex];
        if (nextItem) selectResourceType(nextItem.resourceType);
      },
      setSearch(value: string) {
        filter.updateFilters(
          (current) => ({
            ...current,
            resources: { ...current.resources, query: value },
          }),
          "typing",
        );
      },
      setNamespace(value: string | null) {
        setRetryBlocks((current) =>
          withoutRetryBlock(withoutRetryBlock(current, "list"), "detail"),
        );
        if (!selectedClusterId) return;
        filter.updateFilters(
          (current) => ({
            ...current,
            common: {
              ...current.common,
              namespaces: [
                ...current.common.namespaces.filter(
                  (item) => item.clusterId !== selectedClusterId,
                ),
                ...(value
                  ? [{ clusterId: selectedClusterId, namespace: value }]
                  : []),
              ],
            },
          }),
          value ? "chip-add" : "chip-remove",
        );
      },
      setIncludeDeleted(value: boolean) {
        setRetryBlocks((current) =>
          withoutRetryBlock(withoutRetryBlock(current, "list"), "detail"),
        );
        filter.updateFilters(
          (current) => ({
            ...current,
            resources: { ...current.resources, includeDeleted: value },
          }),
          value ? "chip-add" : "chip-remove",
        );
      },
      setView(value: typeof view) {
        if (value === "graph") {
          setRetryBlocks((current) =>
            withoutRetryBlock(withoutRetryBlock(current, "catalog"), "list"),
          );
        }
        filter.updateFilters(
          (current) => ({
            ...current,
            resources: { ...current.resources, view: value },
          }),
          "view-change",
        );
      },
      setDetailTab(value: string) {
        filter.updateDetail(
          (current) => ({ ...current, tab: value }),
          "detail-tab",
        );
      },
      setDetailFull(value: boolean) {
        filter.updateDetail(
          (current) => ({ ...current, full: value }),
          "detail-expand",
        );
      },
      openDetail,
      navigateDetail,
      closeDetail,
      registerRowButton,
    }),
    [
      automaticRefreshPaused,
      choices,
      closeDetail,
      detailIdentity,
      detailRequested,
      frame,
      includeDeleted,
      namespace,
      navigateDetail,
      openDetail,
      refresh,
      filter,
      recordFailure,
      recordSuccess,
      registerRowButton,
      selectedClusterExists,
      selectedClusterId,
      retryBlocks,
      revision,
      podRevision,
      selectedResourceType,
      selectResourceType,
      canonicalTypes.length,
      listFiltersSupported,
      clusterScope.selection,
      view,
      legacyTypeResolution.kind,
    ],
  );
}
