import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
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
  decodeResourceSelection,
  encodeResourceSelection,
  resolveResourceType,
  resourceTypePath,
} from "./resourcesUrlState";
import { useResourcesDataFrame } from "./useResourcesDataFrame";

const RESOURCES_POLL_INTERVAL_MS = 30_000;
export function useResourcesPageState(port: ResourcesPort) {
  const { reportUnauthorized } = useAuthSessionGate();
  const clusterScope = useClusterScope();
  const refreshClusterScope = clusterScope.refresh;
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<"*">();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClusterId = clusterScope.requestedClusterId;
  const typeResolution = resolveResourceType(params["*"]);
  const selectedResourceType = typeResolution.kind === "valid" ? typeResolution.value : null;
  const namespace = normalizedOptionalQuery(searchParams.get("namespace"));
  const includeDeleted = searchParams.get("showInactive") === "1";
  const detailRequested = searchParams.has("resource") || searchParams.has("kind");
  const detailIdentity = decodeResourceSelection(
    selectedResourceType,
    searchParams.get("kind"),
    searchParams.get("resource"),
  );
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
    detailIdentity,
    includeDeleted,
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

  useEffect(() => {
    if (frame.catalog.phase !== "ready" || typeResolution.kind !== "none") return;
    const first = frame.catalog.data.items[0];
    if (!first) return;
    navigate({ pathname: resourceTypePath(first.resourceType), search: location.search }, { replace: true });
  }, [frame.catalog, location.search, navigate, typeResolution.kind]);

  const updateQuery = useCallback((mutate: (next: URLSearchParams) => void, replace = true) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace });
  }, [searchParams, setSearchParams]);
  const selectResourceType = useCallback((resourceType: string) => {
    setRetryBlocks((current) => withoutRetryBlock(
      withoutRetryBlock(current, "list"),
      "detail",
    ));
    const next = new URLSearchParams(searchParams);
    clearDetail(next);
    navigate({ pathname: resourceTypePath(resourceType), search: next.toString() });
  }, [navigate, searchParams]);
  const closeDetail = useCallback(() => {
    setRetryBlocks((current) => withoutRetryBlock(current, "detail"));
    const key = restoreRowKey.current;
    restoreRowKey.current = null;
    const next = new URLSearchParams(searchParams);
    clearDetail(next);
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true });
    requestAnimationFrame(() => { if (key) rowButtons.current.get(key)?.focus(); });
  }, [location.pathname, navigate, searchParams]);

  return useMemo(() => ({
    choices,
    ...frame,
    selectedClusterId,
    selectedClusterExists,
    selectedResourceType,
    resourceTypeInvalid: typeResolution.kind === "invalid",
    detailIdentity,
    detailRequested,
    search: searchParams.get("search") ?? "",
    namespace,
    includeDeleted,
    detailTab: searchParams.get("tab") ?? "overview",
    fullDetail: searchParams.get("full") === "1",
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
      updateQuery((next) => {
        if (value) next.set("search", value);
        else next.delete("search");
      });
    },
    setNamespace(value: string | null) {
      setRetryBlocks((current) => withoutRetryBlock(
        withoutRetryBlock(current, "list"),
        "detail",
      ));
      updateQuery((next) => {
        if (value) next.set("namespace", value);
        else next.delete("namespace");
        clearDetail(next);
      }, false);
    },
    setIncludeDeleted(value: boolean) {
      setRetryBlocks((current) => withoutRetryBlock(
        withoutRetryBlock(current, "list"),
        "detail",
      ));
      updateQuery((next) => {
        if (value) next.set("showInactive", "1");
        else next.delete("showInactive");
        clearDetail(next);
      }, false);
    },
    setDetailTab(value: string) { updateQuery((next) => next.set("tab", value)); },
    openDetail(identity: ResourceIdentity) {
      const selection = encodeResourceSelection(identity);
      restoreRowKey.current = identityKey(identity);
      updateQuery((next) => {
        next.set("resource", selection.resource);
        next.set("kind", selection.kind);
        next.delete("tab");
      }, false);
    },
    closeDetail,
    registerRowButton(identity: ResourceIdentity, element: HTMLButtonElement | null) {
      const key = identityKey(identity);
      if (element) rowButtons.current.set(key, element);
      else rowButtons.current.delete(key);
    },
  }), [
    automaticRefreshPaused, choices, closeDetail, detailIdentity, detailRequested, frame, includeDeleted,
    namespace, refresh, searchParams, selectedClusterExists, selectedClusterId,
    retryBlocks, selectedResourceType, selectResourceType, typeResolution.kind, updateQuery,
  ]);
}

function normalizedOptionalQuery(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function clearDetail(params: URLSearchParams) {
  for (const key of ["resource", "kind", "tab", "full"]) params.delete(key);
}

function identityKey(identity: ResourceIdentity): string {
  return [identity.resourceType, identity.kind, identity.namespace ?? "", identity.name].join(":");
}
