import type {
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";

export const INFRA_MAP_HOVER_MOVE_THRESHOLD_PX = 4;

export interface InfraMapHoverFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function infraMapHoverFrameFromEvent(
  event: ReactMouseEvent,
  element: Element | null,
): InfraMapHoverFrame {
  const rect = element?.getBoundingClientRect();
  return {
    height: rect?.height ?? 0,
    width: rect?.width ?? 0,
    x: rect ? event.clientX - rect.left : event.clientX,
    y: rect ? event.clientY - rect.top : event.clientY,
  };
}

export function shouldReuseInfraMapHoverFrame({
  current,
  next,
  sameSubject,
  threshold = INFRA_MAP_HOVER_MOVE_THRESHOLD_PX,
}: {
  current: InfraMapHoverFrame | null;
  next: InfraMapHoverFrame;
  sameSubject: boolean;
  threshold?: number;
}): boolean {
  return (
    current !== null &&
    sameSubject &&
    current.height === next.height &&
    current.width === next.width &&
    Math.abs(current.x - next.x) < threshold &&
    Math.abs(current.y - next.y) < threshold
  );
}

export function InfraMapHoverCard({
  children,
  dataSlot,
  frame,
}: {
  children: ReactNode;
  dataSlot: string;
  frame: InfraMapHoverFrame;
}) {
  const edgePadding = 8;
  const gap = 14;
  const cardWidth = Math.min(288, Math.max(0, frame.width - edgePadding * 2));
  const maxLeft = Math.max(edgePadding, frame.width - cardWidth - edgePadding);
  const left = Math.min(Math.max(edgePadding, frame.x + gap), maxLeft);
  const placeAbove = frame.height > 0 && frame.y > frame.height / 2;
  const verticalOffset = placeAbove
    ? Math.max(edgePadding, frame.height - frame.y + gap)
    : Math.max(edgePadding, frame.y + gap);

  return (
    <div
      className="pointer-events-none absolute z-50 w-72 max-w-[calc(100%-1rem)] overflow-hidden rounded-md bg-foreground text-background shadow-lg"
      data-slot={dataSlot}
      role="tooltip"
      style={{
        bottom: placeAbove ? verticalOffset : undefined,
        left,
        maxHeight: "calc(100% - 1rem)",
        top: placeAbove ? undefined : verticalOffset,
        width: cardWidth || undefined,
      }}
    >
      {children}
    </div>
  );
}

export function InfraMapTooltipHeader({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="border-b border-background/15 px-3 py-2.5">
      <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-background/65">
        {eyebrow}
      </p>
      <p className="mt-0.5 break-all text-xs font-semibold leading-snug">{title}</p>
    </div>
  );
}

export function InfraMapTooltipRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <>
      <dt className="text-background/65">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{value}</dd>
    </>
  );
}
