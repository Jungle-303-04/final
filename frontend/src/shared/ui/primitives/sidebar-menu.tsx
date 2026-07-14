import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { cn } from "./cn";
import { useSidebar } from "./sidebar";
import {
  assertNoUnexpectedProps,
  normalizeAccessibleName,
  normalizeBoolean,
  normalizeRouteTarget,
  normalizeTooltip,
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
  const safeProps = sanitizeNeutralPartProps(navigationProps, "SidebarNavigation");
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

type SharedInteractiveProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  tooltip?: string;
};
export type SidebarMenuLinkProps = SharedInteractiveProps & {
  isActive?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  to: string;
};
export type SidebarMenuButtonProps = SharedInteractiveProps & {
  "aria-label"?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export function SidebarMenuLink({
  children,
  className,
  disabled = false,
  isActive = false,
  onClick,
  to,
  tooltip,
  ...unexpectedProps
}: SidebarMenuLinkProps) {
  assertNoUnexpectedProps(unexpectedProps, "SidebarMenuLink");
  const { isMobile, setMobileOpen, state } = useSidebar();
  const active = normalizeBoolean(isActive, "SidebarMenuLink isActive");
  const unavailable = normalizeBoolean(disabled, "SidebarMenuLink disabled");
  const safeTo = normalizeRouteTarget(to);
  const safeTooltip = normalizeTooltip(tooltip);

  const preventUnavailable = (
    event: ReactMouseEvent<HTMLAnchorElement> | ReactKeyboardEvent<HTMLAnchorElement>,
  ) => {
    if (!unavailable) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (unavailable) {
      preventUnavailable(event);
      return;
    }
    onClick?.(event);
    if (!event.defaultPrevented && isMobile) setMobileOpen(false);
  };
  const link = (
    <Link
      aria-current={active ? "page" : undefined}
      aria-disabled={unavailable || undefined}
      className={sidebarMenuInteractiveClassName(className)}
      data-active={active ? "" : undefined}
      data-disabled={unavailable ? "" : undefined}
      data-sidebar-state={state}
      data-slot="sidebar-menu-link"
      onClick={handleClick}
      onClickCapture={preventUnavailable}
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" || event.key === " ") preventUnavailable(event);
      }}
      tabIndex={unavailable ? -1 : undefined}
      to={safeTo}
    >
      {children}
    </Link>
  );

  return withCollapsedTooltip(link, safeTooltip, isMobile, state);
}

export function SidebarMenuButton({
  "aria-label": ariaLabel,
  children,
  className,
  disabled = false,
  onClick,
  tooltip,
  ...unexpectedProps
}: SidebarMenuButtonProps) {
  assertNoUnexpectedProps(unexpectedProps, "SidebarMenuButton");
  const { isMobile, state } = useSidebar();
  const unavailable = normalizeBoolean(disabled, "SidebarMenuButton disabled");
  const safeTooltip = normalizeTooltip(tooltip);
  const button = (
    <button
      aria-disabled={unavailable || undefined}
      aria-label={ariaLabel}
      className={sidebarMenuInteractiveClassName(className)}
      data-disabled={unavailable ? "" : undefined}
      data-sidebar-state={state}
      data-slot="sidebar-menu-button"
      disabled={unavailable}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );

  return withCollapsedTooltip(button, safeTooltip, isMobile, state);
}

function withCollapsedTooltip(
  element: ReactElement,
  tooltip: string | undefined,
  isMobile: boolean,
  state: "expanded" | "collapsed",
) {
  if (!tooltip || isMobile) return element;
  return (
    <Tooltip>
      <TooltipTrigger render={element} />
      <TooltipContent
        align="center"
        hidden={state !== "collapsed"}
        role="tooltip"
        side="right"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

const SIDEBAR_MENU_INTERACTIVE_CLASSES =
  "group/sidebar-menu-button flex h-9 w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg border border-transparent px-2.5 text-left text-sm font-medium text-sidebar-foreground/70 outline-none transition-[color,background-color,border-color] duration-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[sidebar-state=collapsed]:justify-center data-[sidebar-state=collapsed]:px-0 data-[sidebar-state=collapsed]:[&>span:last-child]:sr-only data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50 motion-reduce:transition-none forced-colors:data-active:border-[Highlight] forced-colors:data-active:bg-[Highlight] forced-colors:data-active:text-[HighlightText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2 forced-colors:focus-visible:outline-[CanvasText] forced-colors:aria-disabled:border-[GrayText] forced-colors:aria-disabled:text-[GrayText] forced-colors:aria-disabled:opacity-100";

export function sidebarMenuInteractiveClassName(className?: string): string {
  return cn(SIDEBAR_MENU_INTERACTIVE_CLASSES, className);
}
