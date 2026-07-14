import { GripVertical } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";

import { useI18n } from "../shared/i18n";

const MIN_WIDTH = 360;
const MAX_WIDTH = 640;

export function AiAssistantResizeHandle({
  onWidthChange,
  width,
}: {
  onWidthChange: (width: number) => void;
  width: number;
}) {
  const { t } = useI18n();
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const startX = event.clientX;
    const startWidth = width;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => {
      onWidthChange(clampWidth(startWidth + startX - next.clientX));
    };
    const finish = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish, { once: true });
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onWidthChange(clampWidth(width + (event.key === "ArrowLeft" ? 20 : -20)));
  };
  return (
    <div
      aria-label={t("shell.ai.resize")}
      aria-orientation="vertical"
      aria-valuemax={MAX_WIDTH}
      aria-valuemin={MIN_WIDTH}
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

function clampWidth(value: number): number {
  const stepped = Math.round(value / 20) * 20;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, stepped));
}
