import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cx } from "./cx";

export const BUTTON_VARIANTS = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
] as const;

export const BUTTON_SIZES = ["default", "sm", "lg", "icon"] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = (typeof BUTTON_SIZES)[number];

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export interface ButtonClassNameOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string | undefined;
}

/**
 * Exposes the product-owned button treatment for semantic links and router links.
 * Consumers must still render the correct native element.
 */
export function buttonClassName({
  variant = "default",
  size = "default",
  className,
}: ButtonClassNameOptions = {}): string {
  return cx("ds-button", `ds-button--${variant}`, `ds-button--${size}`, className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size = "default", type = "button", variant = "default", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClassName({ variant, size, className })}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      type={type}
      {...props}
    />
  );
});
