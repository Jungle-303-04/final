import { GripHorizontal } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useEffect, useRef } from "react";

import {
  clampHeight,
  MAX_DOCK_HEIGHT,
  MIN_DOCK_HEIGHT,
} from "../features/bottom-dock/bottomDockState";
import { useI18n } from "../shared/i18n";

export function BottomDockResizeHandle({
  height,
  onHeightChange,
}: {
  height: number;
  onHeightChange: (height: number) => void;
}) {
  const { t } = useI18n();
  const cleanupRef = useRef<() => void>(() => undefined);
  useEffect(() => () => cleanupRef.current(), []);
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    cleanupRef.current();
    const startY = event.clientY;
    const startHeight = height;
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);
    const move = (next: globalThis.PointerEvent) => {
      onHeightChange(clampHeight(startHeight + startY - next.clientY));
    };
    const finish = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      cleanupRef.current = () => undefined;
    };
    cleanupRef.current = finish;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish, { once: true });
    document.addEventListener("pointercancel", finish, { once: true });
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onHeightChange(clampHeight(height + (event.key === "ArrowUp" ? 20 : -20)));
  };
  return (
    <div
      aria-label={t("shell.dock.resize")}
      aria-orientation="horizontal"
      aria-valuemax={MAX_DOCK_HEIGHT}
      aria-valuemin={MIN_DOCK_HEIGHT}
      aria-valuenow={height}
      className="absolute inset-x-0 top-0 z-10 flex h-3 -translate-y-1/2 cursor-row-resize items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onKeyDown={keyDown}
      onPointerDown={pointerDown}
      role="separator"
      tabIndex={0}
    >
      <GripHorizontal aria-hidden="true" className="size-3 text-muted-foreground" />
    </div>
  );
}
