import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const PRODUCT_SIDEBAR_STORAGE_KEY = "kyro.sidebar.state";
export const PRODUCT_COMPACT_RAIL_QUERY = "(max-width: 1280px)";

export type ProductSidebarState = "collapsed" | "expanded";

interface ProductSidebarController {
  open: boolean;
  setOpen(open: boolean): void;
}

export function useProductSidebarController(
  defaultCollapsed?: boolean,
): ProductSidebarController {
  const [state, setState] = useState<ProductSidebarState>(() =>
    resolveInitialProductSidebarState(defaultCollapsed));
  const preferredState = useRef<ProductSidebarState>(
    resolvePreferredProductSidebarState(defaultCollapsed),
  );

  const applyState = useCallback((nextState: ProductSidebarState) => {
    setState(nextState);
    setDocumentSidebarState(nextState);
  }, []);

  const setOpen = useCallback((open: boolean) => {
    const nextState = open ? "expanded" : "collapsed";
    preferredState.current = nextState;
    persistProductSidebarState(nextState);
    applyState(browserCompactViewport() ? "collapsed" : nextState);
  }, [applyState]);

  useLayoutEffect(() => {
    setDocumentSidebarState(state);
  }, [state]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PRODUCT_COMPACT_RAIL_QUERY);
    const handleChange = (event: MediaQueryList | MediaQueryListEvent) => {
      applyState(event.matches ? "collapsed" : preferredState.current);
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [applyState]);

  return { open: state === "expanded", setOpen };
}

export function resolveInitialProductSidebarState(
  defaultCollapsed?: boolean,
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
  compactViewport = browserCompactViewport(),
): ProductSidebarState {
  if (compactViewport) return "collapsed";
  if (defaultCollapsed !== undefined) return defaultCollapsed ? "collapsed" : "expanded";
  return readProductSidebarState(storage) ?? "expanded";
}

export function readProductSidebarState(
  storage: Pick<Storage, "getItem"> | null,
): ProductSidebarState | null {
  if (storage === null) return null;
  try {
    const value = storage.getItem(PRODUCT_SIDEBAR_STORAGE_KEY);
    return value === "collapsed" || value === "expanded" ? value : null;
  } catch {
    return null;
  }
}

function persistProductSidebarState(state: ProductSidebarState): void {
  const storage = browserStorage();
  if (storage === null) return;
  try {
    storage.setItem(PRODUCT_SIDEBAR_STORAGE_KEY, state);
  } catch {
    // A sandboxed browser can deny storage while the in-memory state still works.
  }
}

function resolvePreferredProductSidebarState(
  defaultCollapsed?: boolean,
): ProductSidebarState {
  if (defaultCollapsed !== undefined) return defaultCollapsed ? "collapsed" : "expanded";
  return readProductSidebarState(browserStorage()) ?? "expanded";
}

function setDocumentSidebarState(state: ProductSidebarState): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.productSidebarState = state;
  }
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserCompactViewport(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(PRODUCT_COMPACT_RAIL_QUERY).matches;
}
