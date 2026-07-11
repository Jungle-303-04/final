import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "./primitives/cn";

type SurfaceElement = "section" | "aside" | "div";

type SurfaceAttributes = Omit<
  ComponentPropsWithoutRef<"section">,
  "aria-label" | "aria-labelledby" | "children" | "className"
>;

type SurfaceName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };

type SurfaceBase = SurfaceAttributes & {
  children: ReactNode;
  className?: string;
};

export type SurfaceProps =
  | (SurfaceBase & SurfaceName & { as?: Exclude<SurfaceElement, "div"> })
  | (SurfaceBase & {
      as: "div";
      "aria-label"?: string;
      "aria-labelledby"?: string;
    });

export function Surface({ as: Element = "section", className, children, ...props }: SurfaceProps) {
  return (
    <Element
      className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}
      data-slot="surface"
      {...props}
    >
      {children}
    </Element>
  );
}
