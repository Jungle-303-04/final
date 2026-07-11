import { ChevronDown } from "lucide-react";
import {
  forwardRef,
  type OptgroupHTMLAttributes,
  type OptionHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";

import { cx } from "./cx";

export const NATIVE_SELECT_SIZES = ["default", "sm"] as const;

export type NativeSelectSize = (typeof NATIVE_SELECT_SIZES)[number];

export interface NativeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: NativeSelectSize;
  wrapperClassName?: string;
}

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(function NativeSelect(
  { children, className, disabled, size = "default", wrapperClassName, ...props },
  ref,
) {
  return (
    <span
      className={cx("ds-native-select", `ds-native-select--${size}`, wrapperClassName)}
      data-disabled={disabled ? "true" : undefined}
      data-size={size}
      data-slot="native-select-wrapper"
    >
      <select
        ref={ref}
        className={cx("ds-native-select__control", className)}
        data-slot="native-select"
        disabled={disabled}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="ds-native-select__icon" data-icon="inline-end" />
    </span>
  );
});

export const NativeSelectOption = forwardRef<HTMLOptionElement, OptionHTMLAttributes<HTMLOptionElement>>(
  function NativeSelectOption({ className, ...props }, ref) {
    return <option ref={ref} className={cx("ds-native-select__option", className)} {...props} />;
  },
);

export const NativeSelectOptGroup = forwardRef<HTMLOptGroupElement, OptgroupHTMLAttributes<HTMLOptGroupElement>>(
  function NativeSelectOptGroup({ className, ...props }, ref) {
    return <optgroup ref={ref} className={cx("ds-native-select__group", className)} {...props} />;
  },
);
