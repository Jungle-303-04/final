import { forwardRef, type HTMLAttributes } from "react";

import { cx } from "./cx";

export const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Skeleton(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cx("ds-skeleton", className)}
      data-slot="skeleton"
      {...props}
    />
  );
});
