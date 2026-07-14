import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Button } from "./button";
import { cn } from "@/shared/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";
const MOBILE_QUERY = "(max-width: 767px)";
const LABEL_MODES = ["responsive", "sr-only"] as const;
type StateUpdater = boolean | ((current: boolean) => boolean);
type SidebarState = "expanded" | "collapsed";
export type SidebarContextValue = {
  state: SidebarState;
  open: boolean;
  currentOpen: boolean;
  isMobile: boolean;
  setOpen: (next: StateUpdater) => void;
  setMobileOpen: (next: StateUpdater) => void;
  toggle: () => void;
};
const SidebarContext = createContext<SidebarContextValue | null>(null);
export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) throw new TypeError("useSidebar must be inside SidebarProvider");
  return context;
}
type DesktopControl =
  | { open: boolean; onOpenChange: (open: boolean) => void; defaultOpen?: never }
  | { open?: never; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void };
type MobileControl =
  | { mobileOpen: boolean; onMobileOpenChange: (open: boolean) => void; defaultMobileOpen?: never }
  | { mobileOpen?: never; defaultMobileOpen?: boolean; onMobileOpenChange?: (open: boolean) => void };
type NeutralDiv = NeutralProps<ComponentProps<"div">> & {
  "data-mobile"?: never;
  "data-state"?: never;
};
export type SidebarProviderProps = NeutralDiv & DesktopControl & MobileControl & {
  children?: ReactNode;
  className?: string;
};

export function SidebarProvider(props: SidebarProviderProps) {
  const {
    children,
    className,
    defaultMobileOpen,
    defaultOpen,
    mobileOpen,
    onMobileOpenChange,
    onOpenChange,
    open,
    ...rootProps
  } = props;
  const desktop = useControlledBoolean(open, defaultOpen, onOpenChange, true, "desktop");
  const mobile = useControlledBoolean(mobileOpen, defaultMobileOpen, onMobileOpenChange, false, "mobile");
  const { set: setOpen, value: desktopOpen } = desktop;
  const { set: setMobileOpen, value: resolvedMobileOpen } = mobile;
  const isMobile = useMobileQuery();
  const currentOpen = isMobile ? resolvedMobileOpen : desktopOpen;
  const toggle = useCallback(() => {
    if (isMobile) setMobileOpen((value) => !value);
    else setOpen((value) => !value);
  }, [isMobile, setMobileOpen, setOpen]);
  const value = useMemo<SidebarContextValue>(() => ({
    state: currentOpen ? "expanded" : "collapsed",
    open: desktopOpen,
    currentOpen,
    isMobile,
    setOpen,
    setMobileOpen,
    toggle,
  }), [currentOpen, desktopOpen, isMobile, setMobileOpen, setOpen, toggle]);

  return (
    <SidebarContext.Provider value={value}>
      <div
        {...sanitizeNeutral(rootProps, "SidebarProvider")}
        className={cn("group/sidebar-provider flex min-h-svh w-full", className)}
        data-mobile={isMobile || undefined}
        data-slot="sidebar-provider"
        data-state={value.state}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };
export type SidebarProps = Omit<NeutralProps<ComponentProps<"aside">>, "aria-label" | "aria-labelledby"> &
  AccessibleName & {
    "data-mobile"?: never;
    "data-state"?: never;
    children: ReactNode;
    className?: string;
    mobileCloseLabel: string;
    mobileDescription: string;
    mobileTitle: string;
  };

export function Sidebar({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  children,
  className,
  mobileCloseLabel,
  mobileDescription,
  mobileTitle,
  ...sidebarProps
}: SidebarProps) {
  const { currentOpen, isMobile, setMobileOpen, state } = useSidebar();
  const name = normalizeName(ariaLabel, ariaLabelledBy);
  const title = nonEmpty(mobileTitle, "Sidebar mobileTitle");
  const description = nonEmpty(mobileDescription, "Sidebar mobileDescription");
  const closeLabel = nonEmpty(mobileCloseLabel, "Sidebar mobileCloseLabel");
  const safeProps = sanitizeNeutral(sidebarProps, "Sidebar");

  if (isMobile) {
    return (
      <Dialog onOpenChange={setMobileOpen} open={currentOpen}>
        <DialogContent
          className="inset-y-0 left-0 top-0 flex h-svh w-(--product-sidebar-width-mobile) max-w-[calc(100vw-1rem)] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-xl duration-200 data-open:slide-in-from-left-full data-closed:slide-out-to-left-full motion-reduce:duration-0 forced-colors:border-[CanvasText]"
          closeLabel={closeLabel}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          <aside {...safeProps} {...name} className={cn("group/sidebar flex min-h-0 flex-1 flex-col", className)} data-mobile data-slot="sidebar-mobile" data-state={state}>
            {children}
          </aside>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <aside
      {...safeProps}
      {...name}
      className={cn(
        "group/sidebar sticky top-0 flex h-svh w-(--product-sidebar-width) shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-[var(--motion-layout)] ease-[var(--ease-spring)] data-[state=collapsed]:w-(--product-sidebar-width-collapsed) motion-reduce:transition-none forced-colors:border-[CanvasText]",
        className,
      )}
      data-slot="sidebar"
      data-state={state}
    >
      {children}
    </aside>
  );
}

type PartProps<Tag extends "div" | "span"> = NeutralProps<ComponentProps<Tag>> & {
  children?: ReactNode;
  className?: string;
};

export function SidebarHeader({ className, ...props }: PartProps<"div">) {
  return <div {...sanitizeNeutral(props, "SidebarHeader")} className={cn("flex shrink-0 flex-col border-b border-sidebar-border p-2", className)} data-slot="sidebar-header" />;
}
export function SidebarContent({ className, ...props }: PartProps<"div">) {
  return <div {...sanitizeNeutral(props, "SidebarContent")} className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto", className)} data-slot="sidebar-content" />;
}
export function SidebarFooter({ className, ...props }: PartProps<"div">) {
  return <div {...sanitizeNeutral(props, "SidebarFooter")} className={cn("flex shrink-0 flex-col border-t border-sidebar-border p-2", className)} data-slot="sidebar-footer" />;
}
export function SidebarInset({ className, ...props }: PartProps<"div">) {
  return <div {...sanitizeNeutral(props, "SidebarInset")} className={cn("min-w-0 flex-1", className)} data-slot="sidebar-inset" />;
}
export function SidebarText({ className, ...props }: PartProps<"span">) {
  const { isMobile, state } = useSidebar();
  return <span {...sanitizeNeutral(props, "SidebarText")} className={cn("min-w-0 truncate transition-[width] duration-[var(--motion-layout)] ease-[var(--ease-spring)] motion-reduce:transition-none", !isMobile && state === "collapsed" && "w-0 overflow-hidden", className)} data-slot="sidebar-text" />;
}

type ButtonProps = ComponentProps<typeof Button>;
export type SidebarTriggerProps = Omit<ButtonProps,
  "aria-controls" | "aria-expanded" | "aria-label" | "children" | "dangerouslySetInnerHTML" |
  "data-slot" | "onClick" | "render" | "role" | "style" | "type"
> & {
  "aria-controls"?: never;
  "aria-expanded"?: never;
  "aria-label"?: never;
  "data-slot"?: never;
  collapseLabel: string;
  controls: string;
  expandLabel: string;
  labelMode?: (typeof LABEL_MODES)[number];
  mobileCloseLabel: string;
  mobileOpenLabel: string;
  onClick?: never;
  render?: never;
  role?: never;
  style?: never;
  type?: never;
};

export function SidebarTrigger({
  collapseLabel,
  controls,
  expandLabel,
  labelMode = "responsive",
  mobileCloseLabel,
  mobileOpenLabel,
  ...triggerProps
}: SidebarTriggerProps) {
  const { currentOpen, isMobile, state, toggle } = useSidebar();
  const labels = [collapseLabel, expandLabel, mobileCloseLabel, mobileOpenLabel]
    .map((label) => nonEmpty(label, "SidebarTrigger labels"));
  if (!LABEL_MODES.includes(labelMode)) throw new TypeError("SidebarTrigger labelMode must be responsive or sr-only");
  const label = isMobile ? (currentOpen ? labels[2] : labels[3]) : (currentOpen ? labels[0] : labels[1]);
  const safeProps = sanitize(triggerProps, TRIGGER_PROTECTED);
  const Icon = currentOpen ? PanelLeftClose : PanelLeftOpen;
  return (
    <Button
      {...safeProps}
      aria-controls={nonEmpty(controls, "SidebarTrigger controls")}
      aria-expanded={currentOpen}
      aria-label={label}
      className={cn("forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-[Highlight] motion-reduce:transition-none", labelMode === "responsive" && "w-full", labelMode === "responsive" && (state === "expanded" ? "justify-start" : "px-0"), triggerProps.className)}
      data-slot="sidebar-trigger"
      onClick={toggle}
      type="button"
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      <SidebarText className={labelMode === "sr-only" ? "sr-only" : undefined}>{label}</SidebarText>
    </Button>
  );
}

function useMobileQuery() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(MOBILE_QUERY).matches
  ));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(MOBILE_QUERY);
    const update = (event: MediaQueryList | MediaQueryListEvent) => setIsMobile(event.matches);
    update(query);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function useControlledBoolean(value: unknown, defaultValue: unknown, onChange: unknown, fallback: boolean, axis: string) {
  const controlled = value !== undefined;
  if (controlled && defaultValue !== undefined) throw new TypeError(`SidebarProvider ${axis} state must be controlled or uncontrolled`);
  if (controlled && typeof onChange !== "function") throw new TypeError(`SidebarProvider controlled ${axis} state requires a callback`);
  if (value !== undefined && typeof value !== "boolean") throw new TypeError(`SidebarProvider ${axis} state must be boolean`);
  if (defaultValue !== undefined && typeof defaultValue !== "boolean") throw new TypeError(`SidebarProvider default ${axis} state must be boolean`);
  if (onChange !== undefined && typeof onChange !== "function") throw new TypeError(`SidebarProvider ${axis} callback must be a function`);
  const [internal, setInternal] = useState(defaultValue === undefined ? fallback : defaultValue as boolean);
  const current = controlled ? value as boolean : internal;
  const set = useCallback((next: StateUpdater) => {
    const resolve = (previous: boolean) => typeof next === "function" ? next(previous) : next;
    if (controlled) (onChange as (open: boolean) => void)(resolve(current));
    else { const resolved = resolve(current); setInternal(resolved); (onChange as ((open: boolean) => void) | undefined)?.(resolved); }
  }, [controlled, current, onChange]);
  return { value: current, set };
}

type EventKey<Props> = Extract<keyof Props, `on${string}`>;
type NeutralProps<Props> = Omit<Props, EventKey<Props> | "aria-hidden" | "children" | "className" | "contentEditable" | "dangerouslySetInnerHTML" | "data-slot" | "draggable" | "role" | "style" | "tabIndex"> & {
  "aria-hidden"?: never; contentEditable?: never; "data-slot"?: never; draggable?: never; render?: never; role?: never; style?: never; tabIndex?: never;
};
const NEUTRAL_PROTECTED = ["aria-hidden", "contentEditable", "dangerouslySetInnerHTML", "data-mobile", "data-slot", "data-state", "draggable", "render", "role", "style", "tabIndex"] as const;
const TRIGGER_PROTECTED = ["aria-controls", "aria-expanded", "aria-label", "children", "dangerouslySetInnerHTML", "data-slot", "onClick", "render", "role", "style", "type"] as const;

function sanitizeNeutral<T extends object>(props: T, part: string): T {
  for (const key of Object.keys(props)) if (/^on[A-Z]/.test(key)) throw new TypeError(`${part} cannot receive event handlers`);
  return sanitize(props, NEUTRAL_PROTECTED);
}
function sanitize<T extends object>(props: T, keys: readonly string[]): T {
  const safe = { ...props } as Record<string, unknown>;
  keys.forEach((key) => Reflect.deleteProperty(safe, key));
  return safe as T;
}
function normalizeName(label: unknown, labelledBy: unknown) {
  if ((label === undefined) === (labelledBy === undefined)) throw new TypeError("Sidebar requires exactly one accessible name");
  const value = nonEmpty(label ?? labelledBy, "Sidebar accessible name");
  return label === undefined ? { "aria-labelledby": value } : { "aria-label": value };
}
function nonEmpty(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be non-empty`);
  return value.trim();
}
