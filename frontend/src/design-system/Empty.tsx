import { forwardRef, type HTMLAttributes } from "react";

import { cx } from "./cx";

export const EMPTY_MEDIA_VARIANTS = ["default", "icon"] as const;

export type EmptyMediaVariant = (typeof EMPTY_MEDIA_VARIANTS)[number];

export const Empty = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Empty(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-empty", className)} data-slot="empty" {...props} />;
});

export const EmptyHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function EmptyHeader(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-empty__header", className)} data-slot="empty-header" {...props} />;
});

export interface EmptyMediaProps extends HTMLAttributes<HTMLDivElement> {
  variant?: EmptyMediaVariant;
}

export const EmptyMedia = forwardRef<HTMLDivElement, EmptyMediaProps>(function EmptyMedia(
  { className, variant = "default", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx("ds-empty__media", `ds-empty__media--${variant}`, className)}
      data-slot="empty-media"
      data-variant={variant}
      {...props}
    />
  );
});

export const EmptyTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function EmptyTitle(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-empty__title", className)} data-slot="empty-title" {...props} />;
});

export const EmptyDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function EmptyDescription({ className, ...props }, ref) {
    return (
      <p ref={ref} className={cx("ds-empty__description", className)} data-slot="empty-description" {...props} />
    );
  },
);

export const EmptyContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function EmptyContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("ds-empty__content", className)} data-slot="empty-content" {...props} />;
});
