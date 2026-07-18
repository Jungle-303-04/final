import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

type ScrollAreaAccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };

type ProtectedScrollAreaProps =
  | "aria-hidden"
  | "aria-label"
  | "aria-labelledby"
  | "children"
  | "className"
  | "dangerouslySetInnerHTML"
  | "data-orientation"
  | "data-slot"
  | "render"
  | "role"
  | "style"
  | "tabIndex";

type ScrollAreaPassthroughProps = Omit<
  ScrollAreaPrimitive.Root.Props,
  ProtectedScrollAreaProps
>;

type ScrollAreaBaseProps = ScrollAreaPassthroughProps & {
  "aria-hidden"?: never;
  "data-orientation"?: never;
  "data-slot"?: never;
  children: ReactNode;
  className?: string;
  orientation: ScrollAreaOrientation;
};

export type ScrollAreaProps = ScrollAreaBaseProps & ScrollAreaAccessibleName;

const RUNTIME_PROTECTED_SCROLL_AREA_PROPS = [
  "aria-hidden",
  "aria-label",
  "aria-labelledby",
  "children",
  "className",
  "dangerouslySetInnerHTML",
  "data-orientation",
  "data-slot",
  "render",
  "role",
  "style",
  "tabIndex",
] as const;

export function ScrollArea({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  children,
  className,
  orientation,
  ...rootProps
}: ScrollAreaProps) {
  const normalizedOrientation = normalizeOrientation(orientation);
  const accessibleName = normalizeAccessibleName(ariaLabel, ariaLabelledBy);
  const sanitizedRootProps = sanitizeRootProps(rootProps);

  return (
    <ScrollAreaPrimitive.Root
      {...sanitizedRootProps}
      className={cn("relative overflow-hidden", className)}
      data-orientation={normalizedOrientation}
      data-slot="scroll-area"
    >
      <ScrollAreaPrimitive.Viewport
        aria-label={accessibleName.ariaLabel}
        aria-labelledby={accessibleName.ariaLabelledBy}
        className="size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 motion-reduce:transition-none forced-colors:focus-visible:outline forced-colors:focus-visible:outline-[Highlight]"
        data-slot="scroll-area-viewport"
        role="region"
      >
        <ScrollAreaPrimitive.Content data-slot="scroll-area-content">
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>

      {hasVerticalScrollbar(normalizedOrientation) ? (
        <ProductScrollBar orientation="vertical" />
      ) : null}
      {hasHorizontalScrollbar(normalizedOrientation) ? (
        <ProductScrollBar orientation="horizontal" />
      ) : null}
      {normalizedOrientation === "both" ? (
        <ScrollAreaPrimitive.Corner
          className="bg-transparent forced-colors:border forced-colors:border-current forced-colors:bg-[Canvas]"
          data-slot="scroll-area-corner"
        />
      ) : null}
    </ScrollAreaPrimitive.Root>
  );
}

function ProductScrollBar({
  orientation,
}: {
  orientation: Exclude<ScrollAreaOrientation, "both">;
}) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      className={cn(
        "hidden touch-none select-none bg-transparent p-px transition-colors motion-reduce:transition-none forced-colors:border forced-colors:border-current forced-colors:bg-[Canvas]",
        orientation === "vertical"
          ? "h-full w-2.5 border-l border-l-transparent data-[has-overflow-y]:flex"
          : "h-2.5 flex-col border-t border-t-transparent data-[has-overflow-x]:flex",
      )}
      data-slot="scroll-area-scrollbar"
      keepMounted
      orientation={orientation}
    >
      <ScrollAreaPrimitive.Thumb
        className="relative flex-1 rounded-full bg-muted-foreground forced-colors:bg-[ButtonText]"
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

function sanitizeRootProps(rootProps: object): ScrollAreaPassthroughProps {
  const sanitized = { ...rootProps } as Record<string, unknown>;
  for (const protectedProp of RUNTIME_PROTECTED_SCROLL_AREA_PROPS) {
    Reflect.deleteProperty(sanitized, protectedProp);
  }
  return sanitized as unknown as ScrollAreaPassthroughProps;
}

function normalizeAccessibleName(
  ariaLabel: string | undefined,
  ariaLabelledBy: string | undefined,
) {
  const hasAriaLabel = ariaLabel !== undefined;
  const hasAriaLabelledBy = ariaLabelledBy !== undefined;
  if (hasAriaLabel === hasAriaLabelledBy) {
    throw new TypeError("ScrollArea requires exactly one accessible name");
  }

  const source = ariaLabel ?? ariaLabelledBy;
  if (typeof source !== "string" || !source.trim()) {
    throw new TypeError("ScrollArea accessible name must be non-empty");
  }
  const normalized = source.trim();

  return {
    ariaLabel: hasAriaLabel ? normalized : undefined,
    ariaLabelledBy: hasAriaLabelledBy ? normalized : undefined,
  };
}

function normalizeOrientation(
  orientation: ScrollAreaOrientation,
): ScrollAreaOrientation {
  if (
    orientation === "vertical" ||
    orientation === "horizontal" ||
    orientation === "both"
  ) {
    return orientation;
  }
  throw new TypeError(
    "ScrollArea orientation must be vertical, horizontal, or both",
  );
}

function hasVerticalScrollbar(orientation: ScrollAreaOrientation) {
  return orientation === "vertical" || orientation === "both";
}

function hasHorizontalScrollbar(orientation: ScrollAreaOrientation) {
  return orientation === "horizontal" || orientation === "both";
}
