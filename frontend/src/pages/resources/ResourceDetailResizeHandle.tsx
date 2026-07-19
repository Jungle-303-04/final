import { GripVertical } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";

import { clampDimension, useRafDimensionPreview } from "../../motion";
import { useI18n } from "../../shared/i18n";

export const RESOURCE_DETAIL_MIN_WIDTH = 480;
export const RESOURCE_DETAIL_MAX_WIDTH = 960;
export const RESOURCE_DETAIL_DEFAULT_WIDTH = 672;

export function ResourceDetailResizeHandle({
  hostRef,
  onWidthCommit,
  width,
}: {
  hostRef: RefObject<HTMLElement | null>;
  onWidthCommit: (width: number) => void;
  width: number;
}) {
  const { t } = useI18n();
  const { beginPointerPreview, clamp } = useRafDimensionPreview({
    axis: "width",
    hostRef,
    max: RESOURCE_DETAIL_MAX_WIDTH,
    min: RESOURCE_DETAIL_MIN_WIDTH,
    onCommit: onWidthCommit,
    previewProperty: "--resource-detail-width",
    step: 24,
  });
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onWidthCommit(clamp(width + (event.key === "ArrowLeft" ? 24 : -24)));
  };
  return (
    <div
      aria-label={t("resources.detail.resize")}
      aria-orientation="vertical"
      aria-valuemax={RESOURCE_DETAIL_MAX_WIDTH}
      aria-valuemin={RESOURCE_DETAIL_MIN_WIDTH}
      aria-valuenow={width}
      className="absolute inset-y-0 left-0 z-30 flex w-3 -translate-x-1/2 cursor-col-resize items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onKeyDown={keyDown}
      onPointerDown={(event) => beginPointerPreview(event, width)}
      role="separator"
      tabIndex={0}
    >
      <GripVertical aria-hidden="true" className="size-3 text-muted-foreground" />
    </div>
  );
}

export function clampResourceDetailWidth(value: number): number {
  return clampDimension(value, {
    max: RESOURCE_DETAIL_MAX_WIDTH,
    min: RESOURCE_DETAIL_MIN_WIDTH,
    step: 24,
  });
}
