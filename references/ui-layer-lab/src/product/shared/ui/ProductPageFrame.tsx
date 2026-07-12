import type { ComponentProps } from "react";
import { cn } from "./primitives/cn";

type ProductPageFrameProps = Omit<ComponentProps<"div">, "data-slot"> & {
  "data-slot"?: never;
};

export function ProductPageFrame({
  className,
  ...props
}: ProductPageFrameProps) {
  return (
    <div
      {...props}
      className={cn("grid w-full min-w-0 gap-4 p-4 sm:p-6", className)}
      data-slot="product-page-frame"
    />
  );
}
