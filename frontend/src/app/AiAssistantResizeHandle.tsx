import { GripVertical } from "lucide-react";
import {
  type KeyboardEvent,
  type RefObject,
} from "react";

import { clampDimension, useRafDimensionPreview } from "../motion";
import { useI18n } from "../shared/i18n";

export const AI_ASSISTANT_PANEL_MIN_WIDTH = 360;
export const AI_ASSISTANT_PANEL_MAX_WIDTH = 640;
export const AI_ASSISTANT_PANEL_DEFAULT_WIDTH = 460;

export function AiAssistantResizeHandle({
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
    max: AI_ASSISTANT_PANEL_MAX_WIDTH,
    min: AI_ASSISTANT_PANEL_MIN_WIDTH,
    onCommit: onWidthCommit,
    previewProperty: "--ai-width",
    step: 20,
  });

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onWidthCommit(clamp(width + (event.key === "ArrowLeft" ? 20 : -20)));
  };

  return (
    <div
      aria-label={t("shell.ai.resize")}
      aria-orientation="vertical"
      aria-valuemax={AI_ASSISTANT_PANEL_MAX_WIDTH}
      aria-valuemin={AI_ASSISTANT_PANEL_MIN_WIDTH}
      aria-valuenow={width}
      className="absolute inset-y-0 left-0 z-10 flex w-3 -translate-x-1/2 cursor-col-resize items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onKeyDown={keyDown}
      onPointerDown={(event) => beginPointerPreview(event, width)}
      role="separator"
      tabIndex={0}
    >
      <GripVertical aria-hidden="true" className="size-3 text-muted-foreground" />
    </div>
  );
}

export function clampAiAssistantPanelWidth(value: number): number {
  return clampDimension(value, {
    max: AI_ASSISTANT_PANEL_MAX_WIDTH,
    min: AI_ASSISTANT_PANEL_MIN_WIDTH,
    step: 20,
  });
}
