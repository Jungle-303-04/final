import { forwardRef, type SVGAttributes } from "react";

import { cx } from "./cx";

export const SPINNER_SIZES = ["sm", "default", "lg"] as const;

export type SpinnerSize = (typeof SPINNER_SIZES)[number];

export interface SpinnerProps extends SVGAttributes<SVGSVGElement> {
  label?: string;
  size?: SpinnerSize;
}

export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(function Spinner(
  { className, label, size = "default", ...props },
  ref,
) {
  const accessibilityProps = label
    ? ({ "aria-label": label, role: "status" } as const)
    : ({ "aria-hidden": true } as const);

  return (
    <svg
      ref={ref}
      className={cx("ds-spinner", `ds-spinner--${size}`, className)}
      data-slot="spinner"
      fill="none"
      viewBox="0 0 24 24"
      {...accessibilityProps}
      {...props}
    >
      <circle className="ds-spinner__track" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path
        className="ds-spinner__indicator"
        d="M12 3a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
});
