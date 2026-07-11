import { cva } from "class-variance-authority";
import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Separator } from "./separator";

const BUTTON_GROUP_ORIENTATIONS = ["horizontal", "vertical"] as const;

export type ButtonGroupOrientation =
  (typeof BUTTON_GROUP_ORIENTATIONS)[number];

type EventHandlerKey<Props> = Extract<keyof Props, `on${string}`>;

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };

type NativeDivProps = ComponentProps<"div">;
type NeutralDivProps = Omit<
  NativeDivProps,
  | EventHandlerKey<NativeDivProps>
  | "aria-hidden"
  | "children"
  | "className"
  | "contentEditable"
  | "dangerouslySetInnerHTML"
  | "data-orientation"
  | "data-slot"
  | "draggable"
  | "role"
  | "style"
  | "tabIndex"
> & {
  "aria-hidden"?: never;
  contentEditable?: never;
  "data-orientation"?: never;
  "data-slot"?: never;
  draggable?: never;
  render?: never;
  role?: never;
  style?: never;
  tabIndex?: never;
};

export type ButtonGroupProps = NeutralDivProps &
  AccessibleName & {
    children: ReactNode;
    className?: string;
    orientation?: ButtonGroupOrientation;
  };

export type ButtonGroupTextProps = NeutralDivProps & {
  children: ReactNode;
  className?: string;
};

type NativeSeparatorProps = ComponentProps<typeof Separator>;
type ButtonGroupSeparatorProps = Omit<
  NativeSeparatorProps,
  | EventHandlerKey<NativeSeparatorProps>
  | "aria-orientation"
  | "children"
  | "className"
  | "dangerouslySetInnerHTML"
  | "data-orientation"
  | "data-slot"
  | "orientation"
  | "render"
  | "role"
  | "style"
  | "tabIndex"
> & {
  "aria-orientation"?: never;
  children?: never;
  className?: string;
  "data-orientation"?: never;
  "data-slot"?: never;
  orientation?: never;
  render?: never;
  role?: never;
  style?: never;
  tabIndex?: never;
};

const ButtonGroupOrientationContext =
  createContext<ButtonGroupOrientation | null>(null);

const buttonGroupVariants = cva(
  "isolate inline-flex w-fit items-stretch gap-0 [&>[data-slot=button]:focus-visible]:relative [&>[data-slot=button]:focus-visible]:z-10 motion-reduce:[&>[data-slot=button]]:transition-none forced-colors:[&>[data-slot=button]:disabled]:border-[GrayText] forced-colors:[&>[data-slot=button]:disabled]:text-[GrayText] forced-colors:[&>[data-slot=button]:disabled]:opacity-100 forced-colors:[&>[data-slot=button]:focus-visible]:outline forced-colors:[&>[data-slot=button]:focus-visible]:outline-2 forced-colors:[&>[data-slot=button]:focus-visible]:outline-[Highlight]",
  {
    variants: {
      orientation: {
        horizontal:
          "flex-row *:data-slot:rounded-r-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg! [&>[data-slot]~[data-slot]]:rounded-l-none [&>[data-slot]~[data-slot]]:border-l-0",
        vertical:
          "flex-col *:data-slot:rounded-b-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-lg! [&>[data-slot]~[data-slot]]:rounded-t-none [&>[data-slot]~[data-slot]]:border-t-0",
      },
    },
    defaultVariants: { orientation: "horizontal" },
  },
);

export function ButtonGroup({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  children,
  className,
  orientation = "horizontal",
  ...rootProps
}: ButtonGroupProps) {
  const normalizedName = normalizeAccessibleName(ariaLabel, ariaLabelledBy);
  const normalizedOrientation = normalizeOrientation(orientation);
  const safeRootProps = sanitizeNeutralDivProps(rootProps, "ButtonGroup");

  return (
    <div
      {...safeRootProps}
      aria-label={normalizedName.ariaLabel}
      aria-labelledby={normalizedName.ariaLabelledBy}
      className={cn(
        buttonGroupVariants({ orientation: normalizedOrientation }),
        className,
      )}
      data-orientation={normalizedOrientation}
      data-slot="button-group"
      role="group"
    >
      <ButtonGroupOrientationContext.Provider value={normalizedOrientation}>
        {children}
      </ButtonGroupOrientationContext.Provider>
    </div>
  );
}

export function ButtonGroupText({
  children,
  className,
  ...textProps
}: ButtonGroupTextProps) {
  const safeTextProps = sanitizeNeutralDivProps(textProps, "ButtonGroupText");
  return (
    <div
      {...safeTextProps}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-muted px-2.5 text-sm font-medium text-muted-foreground transition-colors motion-reduce:transition-none forced-colors:border-[ButtonText] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]",
        className,
      )}
      data-slot="button-group-text"
    >
      {children}
    </div>
  );
}

export function ButtonGroupSeparator({
  className,
  ...separatorProps
}: ButtonGroupSeparatorProps) {
  const groupOrientation = useContext(ButtonGroupOrientationContext);
  if (!groupOrientation) {
    throw new TypeError("ButtonGroupSeparator must be inside ButtonGroup");
  }
  const separatorOrientation = groupOrientation === "horizontal"
    ? "vertical"
    : "horizontal";
  const safeSeparatorProps = sanitizePartProps(
    separatorProps,
    "ButtonGroupSeparator",
  );
  return (
    <Separator
      {...safeSeparatorProps}
      className={cn(
        "relative self-stretch bg-input forced-colors:bg-[ButtonText] data-horizontal:mx-px data-horizontal:w-auto data-vertical:my-px data-vertical:h-auto",
        className,
      )}
      data-slot="button-group-separator"
      orientation={separatorOrientation}
    />
  );
}

function normalizeAccessibleName(
  ariaLabel: string | undefined,
  ariaLabelledBy: string | undefined,
) {
  if ((ariaLabel === undefined) === (ariaLabelledBy === undefined)) {
    throw new TypeError("ButtonGroup requires exactly one accessible name");
  }
  const source = ariaLabel ?? ariaLabelledBy;
  if (typeof source !== "string" || !source.trim()) {
    throw new TypeError("ButtonGroup accessible name must be non-empty");
  }
  return {
    ariaLabel: ariaLabel === undefined ? undefined : source.trim(),
    ariaLabelledBy: ariaLabelledBy === undefined ? undefined : source.trim(),
  };
}

function normalizeOrientation(value: unknown): ButtonGroupOrientation {
  if (BUTTON_GROUP_ORIENTATIONS.includes(value as ButtonGroupOrientation)) {
    return value as ButtonGroupOrientation;
  }
  throw new TypeError("ButtonGroup orientation must be horizontal or vertical");
}

function sanitizeNeutralDivProps(
  props: object,
  part: string,
): NeutralDivProps {
  assertNeutralProps(props, part);
  return sanitizePartProps(props, part) as NeutralDivProps;
}

function sanitizePartProps<Props>(props: Props, part: string): Props {
  assertNeutralProps(props as object, part);
  const safeProps = { ...props } as Record<string, unknown>;
  Reflect.deleteProperty(safeProps, "data-orientation");
  Reflect.deleteProperty(safeProps, "data-slot");
  Reflect.deleteProperty(safeProps, "aria-orientation");
  Reflect.deleteProperty(safeProps, "orientation");
  return safeProps as Props;
}

function assertNeutralProps(props: object, part: string): void {
  for (const key of Object.keys(props)) {
    if (/^on[A-Z]/.test(key)) {
      throw new TypeError(`${part} cannot receive event handlers`);
    }
  }
  for (const key of [
    "contentEditable",
    "dangerouslySetInnerHTML",
    "draggable",
    "aria-hidden",
    "render",
    "role",
    "style",
    "tabIndex",
  ]) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      throw new TypeError(`${part} owns neutral element semantics`);
    }
  }
}

export { buttonGroupVariants };
