import { useSearchParams } from "react-router-dom";

export type RouteSearchEntry = readonly [key: string, value: string | null | undefined];

/**
 * Keeps direct browser query access inside the filter boundary while routes
 * retain ownership of domain parsing and navigation decisions.
 */
export function useFilterSearchParams(): URLSearchParams {
  const [searchParams] = useSearchParams();
  return searchParams;
}

/** Serializes route-local query fields in the supplied canonical order. */
export function serializeRouteSearch(entries: readonly RouteSearchEntry[]): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== null && value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  return search.length === 0 ? "" : `?${search}`;
}
