import type {
  ListResourceFilterFacetsOptions,
  ListResourceLabelFacetsOptions,
  ResourceFilterQuery,
} from "../../api/resource-filters";
import type {
  FilteredInventoryResourceList,
  LabelFacetPage,
  ResourceFilterFacetPage,
} from "../../api/resource-filter-schemas";

export type ResourcesFilterEndpointFacetPage = ResourceFilterFacetPage;
export type ResourcesFilterEndpointResourcePage = FilteredInventoryResourceList;
export type ResourcesFilterEndpointLabelPage = LabelFacetPage;

export interface ResourcesFilterEndpointDependencies {
  listResourceFilterFacets(
    options: ListResourceFilterFacetsOptions,
    signal?: AbortSignal,
  ): Promise<ResourcesFilterEndpointFacetPage>;
  listFilteredResources(
    query?: ResourceFilterQuery,
    signal?: AbortSignal,
  ): Promise<ResourcesFilterEndpointResourcePage>;
  listResourceLabelFacets(
    query?: ListResourceLabelFacetsOptions,
    signal?: AbortSignal,
  ): Promise<ResourcesFilterEndpointLabelPage>;
}
