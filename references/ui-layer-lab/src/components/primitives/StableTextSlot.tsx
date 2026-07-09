import type { ReactNode } from "react";

export function StableTextSlot({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <span className={wide ? "stable-text-slot wide" : "stable-text-slot"}>{children}</span>;
}
