import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import {
  DEFAULT_LOCALE,
  formatNumberForLocale,
  translate,
  useOptionalI18n,
} from "../../i18n";
import { cn } from "@/shared/lib/cn";

type ProgressAccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };

type ProtectedProgressProps =
  | "aria-label"
  | "aria-labelledby"
  | "aria-hidden"
  | "aria-valuemax"
  | "aria-valuemin"
  | "aria-valuenow"
  | "aria-valuetext"
  | "children"
  | "className"
  | "dangerouslySetInnerHTML"
  | "format"
  | "getAriaValueText"
  | "locale"
  | "max"
  | "min"
  | "render"
  | "role"
  | "style"
  | "value";

type ProgressPassthroughProps = Omit<ProgressPrimitive.Root.Props, ProtectedProgressProps>;

type ProgressBaseProps = ProgressPassthroughProps & {
  "aria-hidden"?: never;
  className?: string;
  value: number | null;
  valueText?: string;
};

export type ProgressProps = ProgressBaseProps & ProgressAccessibleName;

const RUNTIME_PROTECTED_PROGRESS_PROPS = [
  "aria-hidden",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
  "children",
  "dangerouslySetInnerHTML",
  "format",
  "getAriaValueText",
  "locale",
  "max",
  "min",
  "render",
  "role",
  "style",
  "value",
] as const;

export function Progress({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
  value,
  valueText,
  ...rootProps
}: ProgressProps) {
  const i18n = useOptionalI18n();
  const sanitizedRootProps = sanitizeRootProps(rootProps);
  const normalizedValue = normalizeProgressValue(value);
  const normalizedLabel = normalizeRequiredText(
    ariaLabel ?? ariaLabelledBy,
    "Progress requires a non-empty accessible name",
  );
  const normalizedValueText = valueText === undefined
    ? defaultValueText(
        normalizedValue,
        i18n?.t("common.progress.indeterminate")
          ?? translate(DEFAULT_LOCALE, "common.progress.indeterminate"),
        i18n?.formatNumber ?? fallbackFormatNumber,
      )
    : normalizeRequiredText(
        valueText,
        "Progress valueText must be non-empty when provided",
      );

  return (
    <ProgressPrimitive.Root
      {...sanitizedRootProps}
      aria-label={ariaLabel === undefined ? undefined : normalizedLabel}
      aria-labelledby={ariaLabelledBy === undefined ? undefined : normalizedLabel}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={normalizedValue ?? undefined}
      aria-valuetext={normalizedValueText}
      className={cn("w-full", className)}
      data-slot="progress"
      max={100}
      min={0}
      role="progressbar"
      value={normalizedValue}
    >
      <ProgressPrimitive.Track
        className="relative h-2 w-full overflow-hidden rounded-full bg-secondary forced-colors:border forced-colors:border-current"
        data-slot="progress-track"
      >
        <ProgressPrimitive.Indicator
          className="h-full rounded-full bg-primary bg-clip-padding transition-[width] duration-300 ease-out data-indeterminate:w-1/3 data-indeterminate:border data-indeterminate:border-dashed data-indeterminate:border-primary data-indeterminate:motion-safe:animate-pulse data-indeterminate:motion-reduce:animate-none motion-reduce:transition-none forced-colors:bg-[Highlight] forced-colors:data-indeterminate:animate-none forced-colors:data-indeterminate:border-[Highlight]"
          data-slot="progress-indicator"
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

function sanitizeRootProps(rootProps: object): ProgressPassthroughProps {
  const sanitized = { ...rootProps } as Record<string, unknown>;
  for (const protectedProp of RUNTIME_PROTECTED_PROGRESS_PROPS) {
    Reflect.deleteProperty(sanitized, protectedProp);
  }
  return sanitized as unknown as ProgressPassthroughProps;
}

function normalizeProgressValue(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) {
    throw new TypeError("Progress value must be finite or null");
  }
  if (value < 0 || value > 100) {
    throw new RangeError("Progress value must be between 0 and 100");
  }
  return value;
}

function normalizeRequiredText(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(message);
  return normalized;
}

function defaultValueText(
  value: number | null,
  indeterminateLabel: string,
  formatNumber: (value: number | bigint, options?: Intl.NumberFormatOptions) => string,
): string {
  if (value === null) return indeterminateLabel;
  return formatNumber(value / 100, {
    maximumFractionDigits: 2,
    style: "percent",
  });
}

const fallbackFormatNumber = (
  value: number | bigint,
  options?: Intl.NumberFormatOptions,
) => formatNumberForLocale(DEFAULT_LOCALE, value, options);
