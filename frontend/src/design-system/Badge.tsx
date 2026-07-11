import { forwardRef, type HTMLAttributes } from "react";

import { cx } from "./cx";

export const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "success",
  "warning",
  "info",
] as const;

export type BadgeVariant = (typeof BADGE_VARIANTS)[number];

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = "default", ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx("ds-badge", `ds-badge--${variant}`, className)}
      data-slot="badge"
      data-variant={variant}
      {...props}
    />
  );
});
