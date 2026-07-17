import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesRefreshPolicyKey } from "../../features/resources/resourceMetricsHistoryContract";
import type {
  BrowserRefreshPolicy,
  BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";
import {
  useServerRefreshScheduler,
  type ServerRefreshController,
} from "../../shared/data/useServerRefreshScheduler";
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

export function useResourcesPageState(
  port: ResourcesPort,
  refreshPolicies: BrowserRefreshPolicyRegistry<ResourcesRefreshPolicyKey>,
) {
  const { reportUnauthorized } = useAuthSessionGate();
  const clusterScope = useClusterScope();
  const filter = useUnifiedFilter();
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
  const catalogNamespaces = [...new Set(
    selectedNamespaces.map((candidate) => candidate.namespace),
  )].sort();
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
  const retryBlocksRef = useRef(retryBlocks);
  useEffect(() => {
    retryBlocksRef.current = retryBlocks;
  }, [retryBlocks]);
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
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [revision, setRevision] = useState(0);
  const [podRevision, setPodRevision] = useState(0);
  const listPolicyScope = [
    selectedClusterId ?? "",
    selectedResourceType ?? "",
    namespace ?? "",
    includeDeleted ? "deleted" : "active",
  ].join("\u001f");
  const listRefreshPolicyKey = selectedResourceType === "pod" || selectedResourceType === "node"
    ? "metrics_kubernetes"
    : "resource_list_slow";
  const [listPolicyRecord, setListPolicyRecord] = useState<{
    policy: BrowserRefreshPolicy;
    scope: string;
  } | null>(null);
  const refreshAfterSeconds = listPolicyRecord?.scope === listPolicyScope
    ? listPolicyRecord.policy.refreshAfterSeconds
    : null;
  const policyScope = useRef({ catalog: selectedClusterId, list: listPolicyScope });
  useEffect(() => {
    policyScope.current = { catalog: selectedClusterId, list: listPolicyScope };
  }, [listPolicyScope, selectedClusterId]);
  const catalogRefresh = useServerRefreshScheduler(
    () => setCatalogRevision((current) => current + 1),
  );
  const listRefresh = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );
  const acceptPolicy = useCallback((
    key: "resource_list" | "resource_list_slow" | "metrics_kubernetes",
    controller: ServerRefreshController,
  ) => {
    const requestedScope = key === "resource_list"
      ? selectedClusterId
      : listPolicyScope;
    const isCurrentScope = () => (
      key === "resource_list"
        ? policyScope.current.catalog
        : policyScope.current.list
    ) === requestedScope;
    void refreshPolicies.getPolicy(key).then(
      (policy) => {
        if (!isCurrentScope()) return;
        if (key !== "resource_list") {
          setListPolicyRecord({ policy, scope: listPolicyScope });
        }
        controller.acceptSuccess(policy);
      },
      () => {
        if (isCurrentScope()) controller.backgroundFailure();
      },
    );
  }, [listPolicyScope, refreshPolicies, selectedClusterId]);
  const recordFailure = useCallback(
    (
      target: ResourcesRequestTarget,
      failure: ReturnType<typeof toResourcesFailure>,
    ) => {
      const block = blockForFailure(target, failure);
      const next = block
        ? withRetryBlock(retryBlocksRef.current, block)
        : withoutRetryBlock(retryBlocksRef.current, target);
      retryBlocksRef.current = next;
      setRetryBlocks(next);
      if (target === "catalog") catalogRefresh.backgroundFailure();
      else listRefresh.backgroundFailure();
    },
    [catalogRefresh, listRefresh],
  );
  const recordSuccess = useCallback((target: ResourcesRequestTarget) => {
    const next = withoutRetryBlock(retryBlocksRef.current, target);
    retryBlocksRef.current = next;
    setRetryBlocks(next);
    if (target === "catalog") {
      acceptPolicy("resource_list", catalogRefresh);
    } else if (next.list === undefined && next.detail === undefined) {
      acceptPolicy(listRefreshPolicyKey, listRefresh);
    } else {
      listRefresh.backgroundFailure();
    }
  }, [acceptPolicy, catalogRefresh, listRefresh, listRefreshPolicyKey]);
  const refresh = useCallback(() => {
    catalogRefresh.requestRefresh();
    listRefresh.requestRefresh();
    setPodRevision((current) => current + 1);
    clusterScope.refresh();
  }, [catalogRefresh, clusterScope, listRefresh]);

  useEffect(() => {
    catalogRefresh.backgroundFailure();
  }, [catalogRefresh, selectedClusterId]);

  useEffect(() => {
    listRefresh.backgroundFailure();
  }, [includeDeleted, listRefresh, namespace, selectedClusterId, selectedResourceType]);

  useEffect(() => {
    const retryAt = scheduledRateLimitRetryAt(retryBlocks);
    if (retryAt === null) return;
    const timer = window.setTimeout(() => {
      if (retryBlocks.catalog?.code === "rate-limited") catalogRefresh.requestRefresh();
      if (
        retryBlocks.list?.code === "rate-limited" ||
        retryBlocks.detail?.code === "rate-limited"
      ) listRefresh.requestRefresh();
    }, Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [catalogRefresh, listRefresh, retryBlocks]);

  const selectedClusterExists = clusterScope.selectedClusterExists;
  const frame = useResourcesDataFrame({
    catalogNamespaces,
    catalogQuerySupported: true,
    catalogRevision,
    detailClusterId: detailTarget?.clusterId ?? null,
    detailIdentity,
    includeDeleted,
    listQuerySupported,
    namespace,
    port,
    onRequestFailure: recordFailure,
    onRequestSuccess: recordSuccess,
    reportUnauthorized,
    listRevision: revision,
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
  const requestResourceEventInvalidation = useCallback(() => {
    if (
      listPolicyRecord?.scope !== listPolicyScope ||
      listPolicyRecord.policy.eventInvalidation !== true
    ) return;
    listRefresh.requestEventInvalidation();
  }, [listPolicyRecord, listPolicyScope, listRefresh]);

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
      refreshAfterSeconds,
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
      requestResourceEventInvalidation,
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
      refreshAfterSeconds,
      requestResourceEventInvalidation,
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
