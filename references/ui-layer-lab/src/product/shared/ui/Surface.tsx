import type { ReactNode } from "react";
import { cn } from "./primitives/cn";

export function Surface({ as: Element = "section", className, children }: {
  as?: "section" | "div" | "aside";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Element className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}>
      {children}
    </Element>
  );
}
