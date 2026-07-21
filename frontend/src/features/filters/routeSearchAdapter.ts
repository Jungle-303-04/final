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

/** Owns one route-local query value while preserving product filter fields. */
export function useRouteSearchParam(
  key: string,
): readonly [string | null, (value: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key);
  const update = (nextValue: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (nextValue === null) next.delete(key);
    else next.set(key, nextValue);
    setSearchParams(next, { replace: true });
  };
  return [value, update] as const;
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

/** Adds route-owned query fields without discarding the shared product filters. */
export function mergeRouteSearch(
  href: string,
  entries: readonly RouteSearchEntry[],
): string {
  if (entries.length === 0) return href;

  const [pathAndSearch, hash = ""] = href.split("#", 2);
  const [pathname, search = ""] = pathAndSearch.split("?", 2);
  const ownedKeys = new Set(entries.map(([key]) => key));
  const preserved = search.length === 0
    ? []
    : search.split("&").filter((entry) => {
      const [encodedKey = ""] = entry.split("=", 1);
      try {
        return !ownedKeys.has(decodeURIComponent(encodedKey.replace(/\+/g, " ")));
      } catch {
        return true;
      }
    });
  for (const [key, value] of entries) {
    if (value !== null && value !== undefined) {
      preserved.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  const nextSearch = preserved.join("&");
  return `${pathname}${nextSearch.length === 0 ? "" : `?${nextSearch}`}${hash.length === 0 ? "" : `#${hash}`}`;
}
