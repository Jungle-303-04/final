import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "../../shared/lib/cn";
import {
  clampResourceDetailWidth,
  RESOURCE_DETAIL_DEFAULT_WIDTH,
  ResourceDetailResizeHandle,
} from "./ResourceDetailResizeHandle";
import "./ResourceDetailOverlay.css";

const RESOURCE_DETAIL_WIDTH_STORAGE_KEY = "opsia.resources.detail-width";

export function ResourceDetailOverlay({
  children,
  forceFull,
  rightInset,
}: {
  children: ReactNode;
  forceFull: boolean;
  rightInset: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(readWidth);
  useLayoutEffect(() => {
    rootRef.current?.style.setProperty("--resource-detail-right-inset", `${rightInset}px`);
    rootRef.current?.style.setProperty("--resource-detail-width", `${width}px`);
  }, [rightInset, width]);
  return (
    <div
      className={cn(
        "resources-detail-overlay absolute inset-y-0 z-20 min-w-0 bg-background transition-[inset,width,border-color] duration-(--motion-page) ease-(--ease-page) motion-reduce:transition-none",
        forceFull ? "left-0 border-l-0" : "border-l",
      )}
      data-detail-size={forceFull ? "full" : "peek"}
      data-slot="resources-detail-column"
      ref={rootRef}
    >
      {!forceFull ? (
        <ResourceDetailResizeHandle
          hostRef={rootRef}
          onWidthCommit={(value) => {
            const next = clampResourceDetailWidth(value);
            setWidth(next);
            persistWidth(next);
          }}
          width={width}
        />
      ) : null}
      {children}
    </div>
  );
}

function readWidth(): number {
  if (typeof window === "undefined") return RESOURCE_DETAIL_DEFAULT_WIDTH;
  try {
    const persisted = window.localStorage.getItem(RESOURCE_DETAIL_WIDTH_STORAGE_KEY);
    if (persisted === null) return RESOURCE_DETAIL_DEFAULT_WIDTH;
    const stored = Number(persisted);
    return Number.isFinite(stored)
      ? clampResourceDetailWidth(stored)
      : RESOURCE_DETAIL_DEFAULT_WIDTH;
  } catch {
    return RESOURCE_DETAIL_DEFAULT_WIDTH;
  }
}

function persistWidth(width: number): void {
  try {
    window.localStorage.setItem(RESOURCE_DETAIL_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Disabled storage must not prevent resizing the active sheet.
  }
}
