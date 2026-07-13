import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ResourceIdentity, ResourcesPort } from "../../features/resources/resourcesContract";
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
import {
  decodeResourceTarget,
  encodeResourceTarget,
  isCanonicalResourceTarget,
  resolveResourceType,
} from "./resourcesUrlState";
import { useResourcesDataFrame } from "./useResourcesDataFrame";

const RESOURCES_POLL_INTERVAL_MS = 30_000;
export function useResourcesPageState(port: ResourcesPort) {
  const { reportUnauthorized } = useAuthSessionGate();
  const clusterScope = useClusterScope();
  const filter = useUnifiedFilter();
  const refreshClusterScope = clusterScope.refresh;
  const params = useParams<"*">();
  const selectedClusterId = clusterScope.requestedClusterId;
  const legacyTypeResolution = resolveResourceType(params["*"]);
  const canonicalTypes = filter.state.resources.types;
  const selectedResourceType = canonicalTypes.length === 1
    ? canonicalTypes[0] ?? null
    : canonicalTypes.length === 0 && legacyTypeResolution.kind === "valid"
      ? legacyTypeResolution.value
      : null;
  const namespaceRefs = filter.state.common.namespaces;
  const selectedNamespaces = selectedClusterId
    ? namespaceRefs.filter((candidate) => candidate.clusterId === selectedClusterId)
    : [];
  const namespace = namespaceRefs.length === 1 && selectedNamespaces.length === 1
    ? selectedNamespaces[0]?.namespace ?? null
    : null;
  const listQuerySupported = (
    namespaceRefs.length === selectedNamespaces.length &&
    namespaceRefs.length <= 1 &&
    filter.state.common.applications.length === 0 &&
    filter.state.common.labels.length === 0 &&
    filter.state.resources.health.length === 0 &&
    filter.state.resources.query.length === 0 &&
    filter.state.resources.view === "table"
  );
  const includeDeleted = filter.state.resources.includeDeleted;
  const detailRequested = filter.detail.resource !== null || filter.detail.resourceKind !== null;
  const detailTarget = useMemo(() => decodeResourceTarget(
    selectedClusterId,
    selectedResourceType,
    filter.detail.resourceKind,
    filter.detail.resource,
  ), [
    filter.detail.resource,
    filter.detail.resourceKind,
    selectedClusterId,
    selectedResourceType,
  ]);
  const detailIdentity = detailTarget?.identity ?? null;
  const choices = clusterScope.collection;
  const [retryBlocks, setRetryBlocks] = useState<ResourcesRetryBlocks>({});
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const restoreRowKey = useRef<string | null>(null);
  const automaticRefreshPaused = hasRetryBlocks(retryBlocks);
  const { refresh: advanceRevision, revision } = useVisibleRefreshClock(
    !automaticRefreshPaused,
    RESOURCES_POLL_INTERVAL_MS,
  );
  const recordFailure = useCallback((
    target: ResourcesRequestTarget,
    failure: ReturnType<typeof toResourcesFailure>,
  ) => {
    const block = blockForFailure(target, failure);
    setRetryBlocks((current) => block
      ? withRetryBlock(current, block)
      : withoutRetryBlock(current, target));
  }, []);
  const recordSuccess = useCallback((target: ResourcesRequestTarget) => {
    setRetryBlocks((current) => withoutRetryBlock(current, target));
  }, []);
  const refresh = useCallback(() => {
    refreshClusterScope();
    advanceRevision();
  }, [advanceRevision, refreshClusterScope]);

  useEffect(() => {
    const retryAt = scheduledRateLimitRetryAt(retryBlocks);
    if (retryAt === null) return;
    const timer = window.setTimeout(advanceRevision, Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [advanceRevision, retryBlocks]);

  const selectedClusterExists = clusterScope.selectedClusterExists;
  const frame = useResourcesDataFrame({
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

  const selectResourceType = useCallback((resourceType: string) => {
    setRetryBlocks((current) => withoutRetryBlock(
      withoutRetryBlock(current, "list"),
      "detail",
    ));
    filter.updateFilters((current) => ({
      ...current,
      resources: { ...current.resources, types: [resourceType] },
    }), "chip-add");
  }, [filter]);

  useEffect(() => {
    if (
      detailTarget === null ||
      isCanonicalResourceTarget(filter.detail.resource)
    ) return;
    const selection = encodeResourceTarget(detailTarget.clusterId, detailTarget.identity);
    filter.updateDetail((current) => ({
      ...current,
      resource: selection.resource,
      resourceKind: selection.kind,
    }), "detail-expand");
  }, [detailTarget, filter]);
  const closeDetail = useCallback(() => {
    setRetryBlocks((current) => withoutRetryBlock(current, "detail"));
    const key = restoreRowKey.current;
    restoreRowKey.current = null;
    filter.updateDetail((current) => ({
      ...current,
      full: false,
      resource: null,
      resourceKind: null,
      tab: null,
    }), "detail-close");
    requestAnimationFrame(() => { if (key) rowButtons.current.get(key)?.focus(); });
  }, [filter]);

  return useMemo(() => ({
    choices,
    clusterSelection: clusterScope.selection,
    ...frame,
    selectedClusterId,
    selectedClusterExists,
    selectedResourceType,
    resourceTypeInvalid: canonicalTypes.length > 1 || (
      canonicalTypes.length === 0 && legacyTypeResolution.kind === "invalid"
    ),
    detailIdentity,
    detailRequested,
    filterProjectionUnsupported: !listQuerySupported || canonicalTypes.length > 1,
    search: filter.state.resources.query,
    namespace,
    includeDeleted,
    detailTab: filter.detail.tab ?? "overview",
    fullDetail: filter.detail.full,
    automaticRefreshPaused,
    retryWaitSeconds: retryWaitSeconds(retryBlocks),
    refresh,
    selectResourceType,
    cycleResourceType(direction: -1 | 1) {
      if (frame.catalog.phase !== "ready" || frame.catalog.data.items.length === 0) return;
      const index = frame.catalog.data.items.findIndex(
        (item) => item.resourceType === selectedResourceType,
      );
      const base = index < 0 ? 0 : index;
      const nextIndex = (base + direction + frame.catalog.data.items.length) %
        frame.catalog.data.items.length;
      const nextItem = frame.catalog.data.items[nextIndex];
      if (nextItem) selectResourceType(nextItem.resourceType);
    },
    setSearch(value: string) {
      filter.updateFilters((current) => ({
        ...current,
        resources: { ...current.resources, query: value },
      }), "typing");
    },
    setNamespace(value: string | null) {
      setRetryBlocks((current) => withoutRetryBlock(
        withoutRetryBlock(current, "list"),
        "detail",
      ));
      if (!selectedClusterId) return;
      filter.updateFilters((current) => ({
        ...current,
        common: {
          ...current.common,
          namespaces: [
            ...current.common.namespaces.filter((item) => item.clusterId !== selectedClusterId),
            ...(value ? [{ clusterId: selectedClusterId, namespace: value }] : []),
          ],
        },
      }), value ? "chip-add" : "chip-remove");
    },
    setIncludeDeleted(value: boolean) {
      setRetryBlocks((current) => withoutRetryBlock(
        withoutRetryBlock(current, "list"),
        "detail",
      ));
      filter.updateFilters((current) => ({
        ...current,
        resources: { ...current.resources, includeDeleted: value },
      }), value ? "chip-add" : "chip-remove");
    },
    setDetailTab(value: string) {
      filter.updateDetail((current) => ({ ...current, tab: value }), "detail-tab");
    },
    openDetail(identity: ResourceIdentity) {
      if (selectedClusterId === null) return;
      const selection = encodeResourceTarget(selectedClusterId, identity);
      restoreRowKey.current = identityKey(identity);
      filter.updateDetail((current) => ({
        ...current,
        full: false,
        resource: selection.resource,
        resourceKind: selection.kind,
        tab: null,
      }), "detail-open");
    },
    closeDetail,
    registerRowButton(identity: ResourceIdentity, element: HTMLButtonElement | null) {
      const key = identityKey(identity);
      if (element) rowButtons.current.set(key, element);
      else rowButtons.current.delete(key);
    },
  }), [
    automaticRefreshPaused, choices, closeDetail, detailIdentity, detailRequested, frame, includeDeleted,
    namespace, refresh, filter, selectedClusterExists, selectedClusterId,
    retryBlocks, selectedResourceType, selectResourceType, canonicalTypes.length,
    listQuerySupported, clusterScope.selection,
    legacyTypeResolution.kind,
  ]);
}

function identityKey(identity: ResourceIdentity): string {
  return [identity.resourceType, identity.kind, identity.namespace ?? "", identity.name].join(":");
}
