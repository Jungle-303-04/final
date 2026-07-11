import { forwardRef, type HTMLAttributes } from "react";

import { cx } from "./cx";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-card", className)} data-slot="card" {...props} />;
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-card__header", className)} data-slot="card-header" {...props} />;
});

export const CardTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardTitle(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-card__title", className)} data-slot="card-title" {...props} />;
});

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return (
      <p ref={ref} className={cx("ds-card__description", className)} data-slot="card-description" {...props} />
    );
  },
);

export const CardAction = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardAction(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-card__action", className)} data-slot="card-action" {...props} />;
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-card__content", className)} data-slot="card-content" {...props} />;
});

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardFooter(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-card__footer", className)} data-slot="card-footer" {...props} />;
});
