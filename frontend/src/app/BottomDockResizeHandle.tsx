import { GripHorizontal } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";

import {
  MAX_DOCK_HEIGHT,
  MIN_DOCK_HEIGHT,
} from "../features/bottom-dock/bottomDockState";
import { useRafDimensionPreview } from "../motion";
import { useI18n } from "../shared/i18n";

export function BottomDockResizeHandle({
  height,
  hostRef,
  onHeightChange,
}: {
  height: number;
  hostRef: RefObject<HTMLElement | null>;
  onHeightChange: (height: number) => void;
}) {
  const { t } = useI18n();
  const { beginPointerPreview, clamp } = useRafDimensionPreview({
    axis: "height",
    hostRef,
    max: MAX_DOCK_HEIGHT,
    min: MIN_DOCK_HEIGHT,
    onCommit: onHeightChange,
    previewProperty: "--dock-height",
    step: 20,
  });
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onHeightChange(clamp(height + (event.key === "ArrowUp" ? 20 : -20)));
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
      onPointerDown={(event) => beginPointerPreview(event, height)}
      role="separator"
      tabIndex={0}
    >
      <GripHorizontal aria-hidden="true" className="size-3 text-muted-foreground" />
    </div>
  );
}
