import { useCallback, useMemo } from "react";

import type { UnifiedFilterState } from "../../features/filters/filterContract";
import {
  parseProductFilterUrl,
  serializeProductFilterUrl,
} from "../../features/filters/filterUrl";
import type {
  ResourcesFilterFacetAxis,
  ResourcesFilterFacetPage,
  ResourcesFilterLabelFacetPage,
  ResourcesFilterPort,
  ResourcesFilterResourcePage,
} from "../../features/resources/resourcesFilterContract";
import {
  mergeFacetFilterPages,
  mergeLabelFilterPages,
  mergeResourceFilterPages,
  type ResourcesFilterPageState,
} from "./resourcesFilterPageStateModel";
import { useResourcesFilterPageChannel } from "./useResourcesFilterPageChannel";

export interface ResourcesFilterDataFrameInput {
  active: boolean;
  authorityKey: string;
  facetAxis: ResourcesFilterFacetAxis | null;
  facetQuery: string;
  filterState: UnifiedFilterState;
  port: ResourcesFilterPort;
  reportUnauthorized: () => void;
  revision: number;
}

export interface ResourcesFilterDataFrame {
  list: ResourcesFilterPageState<ResourcesFilterResourcePage>;
  facet: ResourcesFilterPageState<ResourcesFilterFacetPage>;
  labels: ResourcesFilterPageState<ResourcesFilterLabelFacetPage>;
  loadMoreList(): void;
  loadMoreFacet(): void;
  loadMoreLabels(): void;
}

export function useResourcesFilterDataFrame(
  input: ResourcesFilterDataFrameInput,
): ResourcesFilterDataFrame {
  const filterKey = useMemo(
    () => serializeProductFilterUrl(input.filterState),
    [input.filterState],
  );
  const requestState = useMemo(
    () => parseProductFilterUrl(filterKey).state,
    [filterKey],
  );
  const sharedScope = `${input.authorityKey}:${filterKey}`;

  const list = useResourcesFilterPageChannel({
    active: input.active,
    channel: "list",
    load: useCallback(
      (cursor: string | undefined, signal: AbortSignal) => input.port.listResourcePage(
        requestState,
        cursor === undefined ? {} : { cursor },
        signal,
      ),
      [input.port, requestState],
    ),
    merge: mergeResourceFilterPages,
    owner: input.port,
    reportUnauthorized: input.reportUnauthorized,
    revision: input.revision,
    scope: sharedScope,
  });

  const facet = useResourcesFilterPageChannel({
    active: input.active && input.facetAxis !== null,
    channel: "facet",
    load: useCallback(
      (cursor: string | undefined, signal: AbortSignal) => input.port.listFacetPage(
        requestState,
        {
          axis: input.facetAxis!,
          ...(cursor === undefined ? {} : { cursor }),
        },
        signal,
      ),
      [input.facetAxis, input.port, requestState],
    ),
    merge: mergeFacetFilterPages,
    owner: input.port,
    reportUnauthorized: input.reportUnauthorized,
    revision: input.revision,
    scope: input.facetAxis === null ? null : `${sharedScope}:${input.facetAxis}`,
  });

  const labels = useResourcesFilterPageChannel({
    active: input.active,
    channel: "labels",
    load: useCallback(
      (cursor: string | undefined, signal: AbortSignal) => input.port.listLabelFacetPage(
        requestState,
        {
          ...(input.facetQuery.trim() === "" ? {} : { facetQuery: input.facetQuery }),
          ...(cursor === undefined ? {} : { cursor }),
        },
        signal,
      ),
      [input.facetQuery, input.port, requestState],
    ),
    merge: mergeLabelFilterPages,
    owner: input.port,
    reportUnauthorized: input.reportUnauthorized,
    revision: input.revision,
    scope: `${sharedScope}:labels:${input.facetQuery.trim()}`,
  });

  return {
    list: list.state,
    facet: facet.state,
    labels: labels.state,
    loadMoreList: list.loadMore,
    loadMoreFacet: facet.loadMore,
    loadMoreLabels: labels.loadMore,
  };
}
