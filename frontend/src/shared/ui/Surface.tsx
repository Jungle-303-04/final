import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type SurfaceElement = "section" | "aside" | "div";
type SurfaceElevation = "flat" | "overlay";

type SurfaceAttributes = Omit<
  ComponentPropsWithoutRef<"section">,
  "aria-hidden" | "aria-label" | "aria-labelledby" | "children" | "className" | "role"
>;

type LayoutAccessibilityAttributes = Pick<
  ComponentPropsWithoutRef<"div">,
  "aria-hidden" | "role"
>;

type SurfaceName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };

type SurfaceBase = SurfaceAttributes & {
  children: ReactNode;
  className?: string;
  /**
   * Content surfaces stay in the document plane by default. Elevation is
   * reserved for real z-axis UI such as a popover, sheet, or dialog.
   */
  elevation?: SurfaceElevation;
};

export type SurfaceProps =
  | (SurfaceBase & SurfaceName & {
      as?: Exclude<SurfaceElement, "div">;
      "aria-hidden"?: never;
      role?: never;
    })
  | (SurfaceBase & LayoutAccessibilityAttributes & {
      as: "div";
      "aria-label"?: string;
      "aria-labelledby"?: string;
    });

export function Surface({
  as: Element = "section",
  className,
  children,
  elevation = "flat",
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  role,
  ...props
}: SurfaceProps) {
  if (Element !== "div") {
    const names = [ariaLabel, ariaLabelledby];
    const hasBlankName = names.some((name) => name !== undefined && name.trim().length === 0);
    const nonEmptyNameCount = names.filter((name) => name?.trim()).length;

    if (hasBlankName || nonEmptyNameCount !== 1) {
      throw new Error("Semantic Surface requires one non-empty accessible name");
    }
    if (ariaHidden !== undefined || role !== undefined) {
      throw new Error("Semantic Surface cannot override landmark accessibility");
    }
  }

  return (
    <Element
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={cn(
        "rounded-xl border bg-card text-card-foreground",
        "[&_[data-slot=card]]:rounded-none [&_[data-slot=card]]:bg-transparent",
        "[&_[data-slot=card]]:shadow-none [&_[data-slot=card]]:ring-0",
        "[&_[data-slot=card-footer]]:bg-transparent",
        elevation === "overlay" && "shadow-lg",
        className,
      )}
      data-elevation={elevation}
      data-slot="surface"
      role={role}
      {...props}
    >
      {children}
    </Element>
  );
}

export function SurfaceSection({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "min-w-0 border-t first:border-t-0",
        className,
      )}
      data-slot="surface-section"
      {...props}
    />
  );
}
