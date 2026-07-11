import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { cn } from "./cn";
import { useSidebar } from "./sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };
type EventHandlerKey<Props> = Extract<keyof Props, `on${string}`>;

type NavigationOwnedKey =
  | "aria-label" | "aria-labelledby" | "children" | "className"
  | "dangerouslySetInnerHTML" | "data-slot" | "render" | "role" | "style";
export type SidebarNavigationProps = Omit<
  ComponentProps<"nav">,
  NavigationOwnedKey | EventHandlerKey<ComponentProps<"nav">>
> & AccessibleName & {
  children: ReactNode;
  className?: string;
  "data-slot"?: never;
  role?: never;
  style?: never;
};

export function SidebarNavigation({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  children,
  className,
  ...navigationProps
}: SidebarNavigationProps) {
  const name = normalizeAccessibleName(ariaLabel, ariaLabelledBy);
  const safeProps = sanitizeNeutralPartProps(
    navigationProps, "SidebarNavigation", NAVIGATION_PROTECTED,
  );
  return (
    <nav
      {...safeProps}
      {...name}
      className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto p-2", className)}
      data-slot="sidebar-navigation"
    >
      {children}
    </nav>
  );
}

type MenuOwnedKey =
  | "children" | "className" | "dangerouslySetInnerHTML" | "data-slot"
  | "render" | "role" | "style";
export type SidebarMenuProps = Omit<
  ComponentProps<"ul">,
  MenuOwnedKey | EventHandlerKey<ComponentProps<"ul">>
> & {
  children?: ReactNode;
  className?: string;
  "data-slot"?: never;
  role?: never;
  style?: never;
};

export function SidebarMenu({ children, className, ...menuProps }: SidebarMenuProps) {
  const safeProps = sanitizeNeutralPartProps(menuProps, "SidebarMenu", LIST_PROTECTED);
  return (
    <ul
      {...safeProps}
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      data-slot="sidebar-menu"
    >
      {children}
    </ul>
  );
}

export type SidebarMenuItemProps = Omit<
  ComponentProps<"li">,
  MenuOwnedKey | EventHandlerKey<ComponentProps<"li">>
> & {
  children?: ReactNode;
  className?: string;
  "data-slot"?: never;
  role?: never;
  style?: never;
};

export function SidebarMenuItem({
  children,
  className,
  ...itemProps
}: SidebarMenuItemProps) {
  const safeProps = sanitizeNeutralPartProps(itemProps, "SidebarMenuItem", LIST_PROTECTED);
  return (
    <li
      {...safeProps}
      className={cn("relative min-w-0", className)}
      data-slot="sidebar-menu-item"
    >
      {children}
    </li>
  );
}

type SidebarMenuButtonState = {
  active: boolean;
  disabled: boolean;
  sidebarState: "expanded" | "collapsed";
  slot: "sidebar-menu-button";
};
type ButtonOwnedKey =
  | "aria-current" | "aria-disabled" | "children" | "className"
  | "dangerouslySetInnerHTML" | "data-active" | "data-disabled"
  | "data-sidebar-state" | "data-slot" | "disabled" | "onClickCapture"
  | "onKeyDownCapture" | "role" | "style" | "tabIndex" | "type";
type ButtonBaseProps = Omit<
  useRender.ComponentProps<"button", SidebarMenuButtonState>,
  ButtonOwnedKey
>;
export type SidebarMenuButtonProps = ButtonBaseProps & {
  "aria-disabled"?: boolean | "true" | "false";
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  isActive?: boolean;
  tooltip?: string;
  "data-active"?: never;
  "data-disabled"?: never;
  "data-sidebar-state"?: never;
  "data-slot"?: never;
  role?: never;
  style?: never;
  tabIndex?: never;
};

export function SidebarMenuButton({
  "aria-disabled": ariaDisabled,
  children,
  className,
  disabled = false,
  isActive = false,
  render,
  tooltip,
  ...buttonProps
}: SidebarMenuButtonProps) {
  const { isMobile, setMobileOpen, state } = useSidebar();
  const normalizedActive = normalizeBoolean(isActive, "SidebarMenuButton isActive");
  const normalizedDisabled = normalizeBoolean(disabled, "SidebarMenuButton disabled")
    || normalizeAriaDisabled(ariaDisabled);
  const normalizedTooltip = normalizeTooltip(tooltip);
  const safeProps = sanitizeButtonProps(buttonProps, "SidebarMenuButton");
  const isNativeButton = render === undefined;
  const preventDisabledActivation = (
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (!normalizedDisabled) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (normalizedDisabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (isMobile) setMobileOpen(false);
  };

  const element = useRender<SidebarMenuButtonState, HTMLElement>({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        "aria-current": normalizedActive ? "page" : undefined,
        "aria-disabled": normalizedDisabled || undefined,
        children,
        className: cn(SIDEBAR_MENU_BUTTON_CLASSES, className),
        disabled: isNativeButton ? normalizedDisabled : undefined,
        onClick: handleClick,
        onClickCapture: preventDisabledActivation,
        onKeyDownCapture: (event: ReactKeyboardEvent<HTMLElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            preventDisabledActivation(event);
          }
        },
        tabIndex: !isNativeButton && normalizedDisabled ? -1 : undefined,
        type: isNativeButton ? "button" : undefined,
      },
      safeProps,
    ),
    render,
    state: {
      active: normalizedActive,
      disabled: normalizedDisabled,
      sidebarState: state,
      slot: "sidebar-menu-button",
    },
    stateAttributesMapping: {
      active: (value) => value ? { "data-active": "" } : null,
      disabled: (value) => value ? { "data-disabled": "" } : null,
      sidebarState: (value) => ({ "data-sidebar-state": value }),
      slot: (value) => ({ "data-slot": value }),
    },
  });

  if (!normalizedTooltip || state !== "collapsed" || isMobile) return element;
  return (
    <Tooltip>
      <TooltipTrigger render={element} />
      <TooltipContent align="center" role="tooltip" side="right">
        {normalizedTooltip}
      </TooltipContent>
    </Tooltip>
  );
}

const SIDEBAR_MENU_BUTTON_CLASSES =
  "group/sidebar-menu-button flex h-9 w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg border border-transparent px-2.5 text-left text-sm font-medium text-sidebar-foreground/70 outline-none transition-[color,background-color,border-color] duration-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[sidebar-state=collapsed]:justify-center data-[sidebar-state=collapsed]:px-0 data-[sidebar-state=collapsed]:[&>span:last-child]:sr-only data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50 motion-reduce:transition-none forced-colors:data-active:border-[Highlight] forced-colors:data-active:bg-[Highlight] forced-colors:data-active:text-[HighlightText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2 forced-colors:focus-visible:outline-[CanvasText] forced-colors:aria-disabled:border-[GrayText] forced-colors:aria-disabled:text-[GrayText] forced-colors:aria-disabled:opacity-100";

const NAVIGATION_PROTECTED = [
  "dangerouslySetInnerHTML", "data-slot", "render", "role", "style",
] as const;
const LIST_PROTECTED = [
  "dangerouslySetInnerHTML", "data-slot", "render", "role", "style",
] as const;
const BUTTON_DERIVED = [
  "aria-current", "data-active", "data-disabled", "data-sidebar-state", "data-slot",
] as const;
const BUTTON_REJECTED = [
  "dangerouslySetInnerHTML", "onClickCapture", "onKeyDownCapture", "role",
  "style", "tabIndex", "type",
] as const;

function normalizeAccessibleName(label: unknown, labelledBy: unknown) {
  if ((label === undefined) === (labelledBy === undefined)) {
    throw new TypeError("SidebarNavigation requires exactly one accessible name");
  }
  const value = label ?? labelledBy;
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("SidebarNavigation accessible name must be non-empty");
  }
  return label === undefined
    ? { "aria-labelledby": value.trim() }
    : { "aria-label": value.trim() };
}

function normalizeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function normalizeAriaDisabled(value: unknown): boolean {
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new TypeError("SidebarMenuButton aria-disabled must be boolean-like");
}

function normalizeTooltip(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("SidebarMenuButton tooltip must be a non-empty string");
  }
  return value.trim();
}

function sanitizePartProps<Props extends object>(
  props: Props,
  part: string,
  protectedKeys: readonly string[],
): Props {
  for (const key of protectedKeys) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      throw new TypeError(`${part} owns ${key}`);
    }
  }
  return { ...props };
}

function sanitizeNeutralPartProps<Props extends object>(
  props: Props,
  part: string,
  protectedKeys: readonly string[],
): Props {
  for (const key of Object.keys(props)) {
    if (/^on[A-Z]/.test(key)) {
      throw new TypeError(`${part} cannot receive event handlers`);
    }
  }
  return sanitizePartProps(props, part, protectedKeys);
}

function sanitizeButtonProps<Props extends object>(props: Props, part: string): Props {
  sanitizePartProps(props, part, BUTTON_REJECTED);
  const safeProps = { ...props } as Record<string, unknown>;
  BUTTON_DERIVED.forEach((key) => Reflect.deleteProperty(safeProps, key));
  return safeProps as Props;
}
