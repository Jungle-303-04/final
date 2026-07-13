import { ResourcesPortFailure } from "../../features/resources/resourcesContract";
import type {
  ResourcesFilterFacetPage,
  ResourcesFilterLabelFacetPage,
  ResourcesFilterResourcePage,
  ResourcesFilterSnapshot,
} from "../../features/resources/resourcesFilterContract";

export interface ResourcesFilterPageState<T> {
  phase: "idle" | "loading" | "ready" | "failed";
  data: T | null;
  failure: ResourcesPortFailure | null;
  refreshing: boolean;
  appending: boolean;
  refreshFailure: ResourcesPortFailure | null;
  appendFailure: ResourcesPortFailure | null;
}

export const FILTER_PAGE_IDLE: ResourcesFilterPageState<never> = {
  phase: "idle",
  data: null,
  failure: null,
  refreshing: false,
  appending: false,
  refreshFailure: null,
  appendFailure: null,
};

export const FILTER_PAGE_LOADING: ResourcesFilterPageState<never> = {
  ...FILTER_PAGE_IDLE,
  phase: "loading",
};

export type ResourcesFilterRequestMode = "replace" | "append";

export function startFilterPageRequest<T>(
  current: ResourcesFilterPageState<T>,
  mode: ResourcesFilterRequestMode,
): ResourcesFilterPageState<T> {
  if (mode === "append" && current.phase === "ready") {
    return { ...current, appending: true, appendFailure: null };
  }
  if (current.phase === "ready") {
    return { ...current, refreshing: true, refreshFailure: null, appendFailure: null };
  }
  return filterPageLoading();
}

export function replaceFilterPage<T>(data: T): ResourcesFilterPageState<T> {
  return {
    phase: "ready",
    data,
    failure: null,
    refreshing: false,
    appending: false,
    refreshFailure: null,
    appendFailure: null,
  };
}

export function failFilterPageRequest<T>(
  current: ResourcesFilterPageState<T>,
  mode: ResourcesFilterRequestMode,
  failure: ResourcesPortFailure,
): ResourcesFilterPageState<T> {
  if (current.phase !== "ready") {
    return {
      ...filterPageIdle<T>(),
      phase: "failed",
      failure,
    };
  }
  return mode === "append"
    ? { ...current, appending: false, appendFailure: failure }
    : { ...current, refreshing: false, refreshFailure: failure };
}

export function appendFilterPage<T extends { snapshot: ResourcesFilterSnapshot }>(
  current: ResourcesFilterPageState<T>,
  next: T,
  merge: (accepted: T, incoming: T) => T,
): ResourcesFilterPageState<T> {
  if (current.phase !== "ready" || current.data === null) {
    return replaceFilterPage(next);
  }
  if (!samePageChain(current.data.snapshot, next.snapshot)) {
    return {
      ...current,
      appending: false,
      appendFailure: new ResourcesPortFailure("invalid-response"),
    };
  }
  return replaceFilterPage(merge(current.data, next));
}

export function samePageChain(
  accepted: ResourcesFilterSnapshot,
  incoming: ResourcesFilterSnapshot,
): boolean {
  return accepted.snapshotRevision === incoming.snapshotRevision &&
    accepted.authorizationRevision === incoming.authorizationRevision &&
    accepted.filterFingerprint === incoming.filterFingerprint;
}

export function mergeResourceFilterPages(
  accepted: ResourcesFilterResourcePage,
  incoming: ResourcesFilterResourcePage,
): ResourcesFilterResourcePage {
  const { duplicates, items } = appendUnique(
    accepted.items,
    incoming.items,
    ({ resource }) => resource.inventoryKey,
  );
  return {
    ...accepted,
    items,
    nextCursor: incoming.nextCursor,
    hasMore: incoming.hasMore,
    excludedCount: accepted.excludedCount + incoming.excludedCount + duplicates,
    dataQualityWarnings: duplicates === 0
      ? [...accepted.dataQualityWarnings, ...incoming.dataQualityWarnings]
      : [
          ...accepted.dataQualityWarnings,
          ...incoming.dataQualityWarnings,
          {
            code: "duplicate-resource-excluded",
            section: "list",
            field: null,
            rowIndex: null,
            group: "pagination",
          },
        ],
  };
}

export function mergeFacetFilterPages(
  accepted: ResourcesFilterFacetPage,
  incoming: ResourcesFilterFacetPage,
): ResourcesFilterFacetPage {
  return {
    ...accepted,
    items: appendUnique(accepted.items, incoming.items, facetKey).items,
    nextCursor: incoming.nextCursor,
    hasMore: incoming.hasMore,
  };
}

export function mergeLabelFilterPages(
  accepted: ResourcesFilterLabelFacetPage,
  incoming: ResourcesFilterLabelFacetPage,
): ResourcesFilterLabelFacetPage {
  return {
    ...accepted,
    items: appendUnique(accepted.items, incoming.items, ({ selector }) => selector).items,
    nextCursor: incoming.nextCursor,
    hasMore: incoming.hasMore,
  };
}

function appendUnique<T>(
  accepted: readonly T[],
  incoming: readonly T[],
  identity: (item: T) => string,
): { duplicates: number; items: T[] } {
  const known = new Set(accepted.map(identity));
  const items = [...accepted];
  let duplicates = 0;
  for (const item of incoming) {
    const key = identity(item);
    if (known.has(key)) {
      duplicates += 1;
      continue;
    }
    known.add(key);
    items.push(item);
  }
  return { duplicates, items };
}

function facetKey(item: ResourcesFilterFacetPage["items"][number]): string {
  return `${item.axis}:${item.value}`;
}

function filterPageIdle<T>(): ResourcesFilterPageState<T> {
  return FILTER_PAGE_IDLE;
}

function filterPageLoading<T>(): ResourcesFilterPageState<T> {
  return FILTER_PAGE_LOADING;
}
