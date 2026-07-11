import { forwardRef, type HTMLAttributes } from "react";

import { cx } from "./cx";

export type SeparatorOrientation = "horizontal" | "vertical";

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  decorative?: boolean;
  orientation?: SeparatorOrientation;
}

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { className, decorative = true, orientation = "horizontal", ...props },
  ref,
) {
  const accessibilityProps = decorative
    ? ({ "aria-hidden": true, role: "presentation" } as const)
    : ({ "aria-orientation": orientation, role: "separator" } as const);

  return (
    <div
      ref={ref}
      className={cx("ds-separator", `ds-separator--${orientation}`, className)}
      data-orientation={orientation}
      data-slot="separator"
      {...accessibilityProps}
      {...props}
    />
  );
});
