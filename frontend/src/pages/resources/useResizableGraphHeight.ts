import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

export const DEFAULT_GRAPH_HEIGHT = 720;
export const MIN_GRAPH_HEIGHT = 480;
export const MAX_GRAPH_HEIGHT = 1_040;
export const GRAPH_HEIGHT_STORAGE_KEY = "opsia:product-graph-height";

export function clampGraphHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRAPH_HEIGHT;
  return Math.min(MAX_GRAPH_HEIGHT, Math.max(MIN_GRAPH_HEIGHT, Math.round(value)));
}

function storedGraphHeight(): number {
  if (typeof window === "undefined") return DEFAULT_GRAPH_HEIGHT;
  try {
    const stored = window.localStorage.getItem(GRAPH_HEIGHT_STORAGE_KEY);
    return stored === null ? DEFAULT_GRAPH_HEIGHT : clampGraphHeight(Number(stored));
  } catch {
    return DEFAULT_GRAPH_HEIGHT;
  }
}

export function useResizableGraphHeight() {
  const [height, setHeight] = useState(storedGraphHeight);

  useEffect(() => {
    try {
      window.localStorage.setItem(GRAPH_HEIGHT_STORAGE_KEY, String(height));
    } catch {
      // Storage can be unavailable in hardened or private browser contexts.
    }
  }, [height]);

  const resizeBy = useCallback((delta: number) => {
    setHeight((current) => clampGraphHeight(current + delta));
  }, []);
  const reset = useCallback(() => setHeight(DEFAULT_GRAPH_HEIGHT), []);
  const beginResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const move = (pointerEvent: PointerEvent) => {
      setHeight(clampGraphHeight(startHeight + pointerEvent.clientY - startY));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }, [height]);

  return { beginResize, height, reset, resizeBy };
}
