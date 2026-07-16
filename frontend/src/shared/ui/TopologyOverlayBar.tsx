import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/cn";

/**
 * Layout-only chrome for controls floating above an interactive canvas.
 * Empty gaps remain pannable; every interactive child must opt back into
 * pointer events explicitly.
 */
export function TopologyOverlayBar({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-col items-start gap-2",
        className,
      )}
      data-slot="topology-overlay-bar"
      {...props}
    />
  );
}
