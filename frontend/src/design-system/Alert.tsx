import { forwardRef, type HTMLAttributes } from "react";

import { cx } from "./cx";

export const ALERT_VARIANTS = ["default", "destructive", "success", "warning", "info"] as const;

export type AlertVariant = (typeof ALERT_VARIANTS)[number];

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, role = "alert", variant = "default", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx("ds-alert", `ds-alert--${variant}`, className)}
      data-slot="alert"
      data-variant={variant}
      role={role}
      {...props}
    />
  );
});

export const AlertTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AlertTitle(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-alert__title", className)} data-slot="alert-title" {...props} />;
});

export const AlertDescription = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function AlertDescription({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cx("ds-alert__description", className)}
        data-slot="alert-description"
        {...props}
      />
    );
  },
);
