import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/cn";

type ProductFloatingActionAvoidanceProps = Omit<ComponentProps<"div">, "data-slot"> & {
  "data-slot"?: never;
};

/**
 * Keeps flow content out of the inline lane occupied by the shared fixed action.
 * The lane is derived from the same geometry tokens as ProductPageFrame.
 */
export function ProductFloatingActionAvoidance({
  className,
  ...props
}: ProductFloatingActionAvoidanceProps) {
  return (
    <div
      {...props}
      className={cn("min-w-0 pe-[var(--product-floating-action-inline-clearance)]", className)}
      data-slot="product-floating-action-avoidance"
    />
  );
}
