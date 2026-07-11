import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cloneElement, type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode } from "react";
import { cn } from "./cn";
import { useSidebar } from "./sidebar";
import {
  normalizeAccessibleName,
  normalizeAriaDisabled,
  normalizeBoolean,
  normalizeRenderElement,
  normalizeTooltip,
  sanitizeButtonProps,
  sanitizeNeutralPartProps,
} from "./sidebar-menu-contract";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };
type EventHandlerKey<Props> = Extract<keyof Props, `on${string}`>;
type NeutralGuard = {
  "aria-hidden"?: never; contentEditable?: never; "data-slot"?: never;
  draggable?: never; role?: never; style?: never; tabIndex?: never;
};

type NavigationOwnedKey =
  | "aria-label" | "aria-labelledby" | "children" | "className"
  | "dangerouslySetInnerHTML" | "render" | keyof NeutralGuard;
export type SidebarNavigationProps = Omit<
  ComponentProps<"nav">,
  NavigationOwnedKey | EventHandlerKey<ComponentProps<"nav">>
> & AccessibleName & NeutralGuard & {
  children: ReactNode;
  className?: string;
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
    navigationProps, "SidebarNavigation",
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
  | "render" | keyof NeutralGuard;
export type SidebarMenuProps = Omit<
  ComponentProps<"ul">,
  MenuOwnedKey | EventHandlerKey<ComponentProps<"ul">>
> & NeutralGuard & {
  children?: ReactNode;
  className?: string;
};

export function SidebarMenu({ children, className, ...menuProps }: SidebarMenuProps) {
  const safeProps = sanitizeNeutralPartProps(menuProps, "SidebarMenu");
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
> & NeutralGuard & {
  children?: ReactNode;
  className?: string;
};

export function SidebarMenuItem({
  children,
  className,
  ...itemProps
}: SidebarMenuItemProps) {
  const safeProps = sanitizeNeutralPartProps(itemProps, "SidebarMenuItem");
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
  | "aria-current" | "aria-disabled" | "aria-hidden" | "children" | "className"
  | "contentEditable" | "draggable" | "render"
  | "dangerouslySetInnerHTML" | "data-active" | "data-disabled"
  | "data-sidebar-state" | "data-slot" | "disabled" | "onClickCapture"
  | "onKeyDownCapture" | "role" | "style" | "tabIndex" | "type";
type ButtonBaseProps = Omit<
  useRender.ComponentProps<"button", SidebarMenuButtonState>,
  ButtonOwnedKey
>;
export type SidebarMenuButtonProps = ButtonBaseProps & {
  "aria-disabled"?: boolean | "true" | "false";
  "aria-hidden"?: never;
  children: ReactNode;
  className?: string;
  contentEditable?: never;
  disabled?: boolean;
  draggable?: never;
  isActive?: boolean;
  render?: ReactElement;
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
  const renderElement = normalizeRenderElement(render);
  const isNativeButton = renderElement === undefined;
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
    render: renderElement
      ? (resolvedProps) => cloneElement(
        renderElement,
        mergeProps<"button">(
          renderElement.props as ComponentProps<"button">,
          resolvedProps as ComponentProps<"button">,
        ),
      )
      : undefined,
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

  if (!normalizedTooltip || isMobile) return element;
  return (
    <Tooltip>
      <TooltipTrigger render={element} />
      <TooltipContent
        align="center"
        hidden={state !== "collapsed"}
        role="tooltip"
        side="right"
      >
        {normalizedTooltip}
      </TooltipContent>
    </Tooltip>
  );
}

const SIDEBAR_MENU_BUTTON_CLASSES =
  "group/sidebar-menu-button flex h-9 w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg border border-transparent px-2.5 text-left text-sm font-medium text-sidebar-foreground/70 outline-none transition-[color,background-color,border-color] duration-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[sidebar-state=collapsed]:justify-center data-[sidebar-state=collapsed]:px-0 data-[sidebar-state=collapsed]:[&>span:last-child]:sr-only data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50 motion-reduce:transition-none forced-colors:data-active:border-[Highlight] forced-colors:data-active:bg-[Highlight] forced-colors:data-active:text-[HighlightText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2 forced-colors:focus-visible:outline-[CanvasText] forced-colors:aria-disabled:border-[GrayText] forced-colors:aria-disabled:text-[GrayText] forced-colors:aria-disabled:opacity-100";
