import type { ReactNode } from "react";

export function Surface({ as: Element = "section", className = "", children }: {
  as?: "section" | "div" | "aside";
  className?: string;
  children: ReactNode;
}) {
  return <Element className={`surface ${className}`}>{children}</Element>;
}
