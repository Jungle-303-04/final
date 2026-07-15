import { GripVertical } from "lucide-react";
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { useI18n } from "../shared/i18n";

export const AI_ASSISTANT_PANEL_MIN_WIDTH = 360;
export const AI_ASSISTANT_PANEL_MAX_WIDTH = 640;
export const AI_ASSISTANT_PANEL_DEFAULT_WIDTH = 420;

interface ActivePointerResize {
  cancel(): void;
}

/**
 * Keeps the high-frequency pointer path outside React. The panel receives a
 * CSS-variable preview on animation frames, then commits one snapped value
 * when the gesture completes so persisted state and keyboard interaction stay
 * deterministic.
 */
export function AiAssistantResizeHandle({
  onWidthCommit,
  width,
}: {
  onWidthCommit: (width: number) => void;
  width: number;
}) {
  const { t } = useI18n();
  const activeResize = useRef<ActivePointerResize | null>(null);

  useEffect(() => () => activeResize.current?.cancel(), []);

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const panel = event.currentTarget.closest<HTMLElement>("[data-slot='ai-assistant-panel']");
    if (panel === null) return;

    event.preventDefault();
    activeResize.current?.cancel();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startX = event.clientX;
    const startWidth = width;
    let draftWidth = startWidth;
    let previewFrame: number | null = null;
    let settleFrame: number | null = null;
    let completed = false;

    panel.dataset.resizing = "true";

    const cancelPreviewFrame = () => {
      if (previewFrame === null) return;
      cancelAnimationFrame(previewFrame);
      previewFrame = null;
    };
    const renderPreview = () => {
      previewFrame = null;
      panel.style.setProperty("--ai-width", `${draftWidth}px`);
    };
    const queuePreview = () => {
      if (previewFrame !== null) return;
      previewFrame = requestAnimationFrame(renderPreview);
    };
    const removeListeners = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancelPointer);
    };
    const restore = () => {
      cancelPreviewFrame();
      if (settleFrame !== null) cancelAnimationFrame(settleFrame);
      panel.style.removeProperty("--ai-width");
      delete panel.dataset.resizing;
    };
    const finish = (next: globalThis.PointerEvent) => {
      if (completed || next.pointerId !== event.pointerId) return;
      completed = true;
      removeListeners();
      draftWidth = previewWidth(startWidth + startX - next.clientX);
      cancelPreviewFrame();
      panel.style.setProperty("--ai-width", `${draftWidth}px`);

      const committedWidth = clampAiAssistantPanelWidth(draftWidth);
      panel.dataset.width = `${committedWidth}`;
      onWidthCommit(committedWidth);
      settleFrame = requestAnimationFrame(() => {
        settleFrame = null;
        panel.style.removeProperty("--ai-width");
        delete panel.dataset.resizing;
        if (activeResize.current === session) activeResize.current = null;
      });
    };
    const cancel = () => {
      if (!completed) {
        completed = true;
        removeListeners();
      }
      restore();
      if (activeResize.current === session) activeResize.current = null;
    };
    const cancelPointer = (next: globalThis.PointerEvent) => {
      if (next.pointerId === event.pointerId) cancel();
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      draftWidth = previewWidth(startWidth + startX - next.clientX);
      queuePreview();
    };

    const session: ActivePointerResize = { cancel };
    activeResize.current = session;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancelPointer);
  };

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onWidthCommit(clampAiAssistantPanelWidth(width + (event.key === "ArrowLeft" ? 20 : -20)));
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
      onPointerDown={pointerDown}
      role="separator"
      tabIndex={0}
    >
      <GripVertical aria-hidden="true" className="size-3 text-muted-foreground" />
    </div>
  );
}

export function clampAiAssistantPanelWidth(value: number): number {
  const stepped = Math.round(value / 20) * 20;
  return Math.min(AI_ASSISTANT_PANEL_MAX_WIDTH, Math.max(AI_ASSISTANT_PANEL_MIN_WIDTH, stepped));
}

function previewWidth(value: number): number {
  return Math.min(AI_ASSISTANT_PANEL_MAX_WIDTH, Math.max(AI_ASSISTANT_PANEL_MIN_WIDTH, value));
}
