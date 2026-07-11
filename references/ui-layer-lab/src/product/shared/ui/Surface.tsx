import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "./primitives/cn";

type SurfaceElement = "section" | "aside" | "div";

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
      className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}
      data-slot="surface"
      role={role}
      {...props}
    >
      {children}
    </Element>
  );
}
