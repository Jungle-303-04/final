import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  FilterMutationIntent,
  UnifiedFilterController,
  UnifiedFilterUpdater,
} from "./filterContract";
import {
  filterHistoryMode,
  parseProductFilterUrl,
  productFilterNavigationHref,
  serializeProductFilterUrl,
} from "./filterUrl";

const UnifiedFilterContext = createContext<UnifiedFilterController | null>(null);

export function UnifiedFilterProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = useMemo(() => parseProductFilterUrl(location.search), [location.search]);

  const canonicalize = useCallback(() => {
    const search = serializeProductFilterUrl(parsed.state, parsed.detail);
    if (search === location.search) return;
    navigate({
      hash: location.hash,
      pathname: location.pathname,
      search,
    }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate, parsed]);

  const navigationHref = useCallback((path: `/product${string}`) => (
    productFilterNavigationHref(path, location.search)
  ), [location.search]);

  const updateFilters = useCallback((
    update: UnifiedFilterUpdater,
    intent: FilterMutationIntent,
  ) => {
    const currentSearch = serializeProductFilterUrl(parsed.state, parsed.detail);
    const next = typeof update === "function" ? update(parsed.state) : update;
    const search = serializeProductFilterUrl(next, parsed.detail);
    if (search === currentSearch) return;
    navigate({
      hash: location.hash,
      pathname: location.pathname,
      search,
    }, { replace: filterHistoryMode(intent) === "replace" });
  }, [location.hash, location.pathname, navigate, parsed]);

  const value = useMemo<UnifiedFilterController>(() => ({
    ...parsed,
    canonicalize,
    navigationHref,
    updateFilters,
  }), [canonicalize, navigationHref, parsed, updateFilters]);

  return <UnifiedFilterContext.Provider value={value}>{children}</UnifiedFilterContext.Provider>;
}

export function useUnifiedFilter(): UnifiedFilterController {
  const filter = useContext(UnifiedFilterContext);
  if (!filter) {
    throw new Error("useUnifiedFilter must be used within UnifiedFilterProvider");
  }
  return filter;
}
