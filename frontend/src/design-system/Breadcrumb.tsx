import { ChevronRight, MoreHorizontal } from "lucide-react";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type LiHTMLAttributes,
  type OlHTMLAttributes,
} from "react";

import { cx } from "./cx";

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  "aria-label"?: string;
}

export const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(function Breadcrumb(
  { "aria-label": ariaLabel = "Breadcrumb", className, ...props },
  ref,
) {
  return (
    <nav
      ref={ref}
      aria-label={ariaLabel}
      className={cx("ds-breadcrumb", className)}
      data-slot="breadcrumb"
      {...props}
    />
  );
});

export const BreadcrumbList = forwardRef<HTMLOListElement, OlHTMLAttributes<HTMLOListElement>>(
  function BreadcrumbList({ className, ...props }, ref) {
    return <ol ref={ref} className={cx("ds-breadcrumb__list", className)} data-slot="breadcrumb-list" {...props} />;
  },
);

export const BreadcrumbItem = forwardRef<HTMLLIElement, LiHTMLAttributes<HTMLLIElement>>(function BreadcrumbItem(
  { className, ...props },
  ref,
) {
  return <li ref={ref} className={cx("ds-breadcrumb__item", className)} data-slot="breadcrumb-item" {...props} />;
});

export const BreadcrumbLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function BreadcrumbLink({ className, ...props }, ref) {
    return <a ref={ref} className={cx("ds-breadcrumb__link", className)} data-slot="breadcrumb-link" {...props} />;
  },
);

export const BreadcrumbPage = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(function BreadcrumbPage(
  { className, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      aria-current="page"
      className={cx("ds-breadcrumb__page", className)}
      data-slot="breadcrumb-page"
      {...props}
    />
  );
});

export const BreadcrumbSeparator = forwardRef<HTMLLIElement, LiHTMLAttributes<HTMLLIElement>>(
  function BreadcrumbSeparator({ children, className, ...props }, ref) {
    return (
      <li
        ref={ref}
        aria-hidden="true"
        className={cx("ds-breadcrumb__separator", className)}
        data-slot="breadcrumb-separator"
        role="presentation"
        {...props}
      >
        {children ?? <ChevronRight data-icon="separator" />}
      </li>
    );
  },
);

export const BreadcrumbEllipsis = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function BreadcrumbEllipsis({ className, ...props }, ref) {
    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={cx("ds-breadcrumb__ellipsis", className)}
        data-slot="breadcrumb-ellipsis"
        role="presentation"
        {...props}
      >
        <MoreHorizontal data-icon="ellipsis" />
      </span>
    );
  },
);
