import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "./cn";

const ORIENTATIONS = ["horizontal", "vertical"] as const;
const ACTIVATION_MODES = ["automatic", "manual"] as const;
export type TabsOrientation = (typeof ORIENTATIONS)[number];
export type TabsActivationMode = (typeof ACTIVATION_MODES)[number];
export type TabsValueChangeHandler = (value: string) => void;

type OwnedRootKey =
  | "children" | "className" | "dangerouslySetInnerHTML" | "data-activation-direction"
  | "data-orientation" | "data-slot" | "defaultValue" | "onValueChange"
  | "orientation" | "render" | "role" | "style" | "value";
type RootPassthrough = Omit<TabsPrimitive.Root.Props, OwnedRootKey>;
type RootBase = RootPassthrough & {
  children: ReactNode;
  className?: string;
  activationMode?: TabsActivationMode;
  loopFocus?: boolean;
  orientation?: TabsOrientation;
  "data-activation-direction"?: never;
  "data-orientation"?: never;
  "data-slot"?: never;
};
type ControlledSelection = {
  value: string;
  defaultValue?: never;
  onValueChange: TabsValueChangeHandler;
};
type UncontrolledSelection = {
  defaultValue: string;
  value?: never;
  onValueChange?: TabsValueChangeHandler;
};
export type TabsProps = RootBase & (ControlledSelection | UncontrolledSelection);

type TabsBehavior = {
  activationMode: TabsActivationMode;
  loopFocus: boolean;
};
const TabsBehaviorContext = createContext<TabsBehavior | null>(null);
const TabsListContext = createContext(false);

export function Tabs(props: TabsProps) {
  const {
    activationMode = "automatic",
    children,
    className,
    defaultValue,
    loopFocus = true,
    onValueChange,
    orientation = "horizontal",
    value,
    ...rootProps
  } = props;
  assertChoice(orientation, ORIENTATIONS, "Tabs orientation must be horizontal or vertical");
  assertChoice(activationMode, ACTIVATION_MODES, "Tabs activationMode must be automatic or manual");
  if (typeof loopFocus !== "boolean") throw new TypeError("Tabs loopFocus must be a boolean");
  const selection = normalizeSelection(value, defaultValue, onValueChange);

  return (
    <TabsBehaviorContext.Provider value={{ activationMode, loopFocus }}>
      <TabsListContext.Provider value={false}>
        <TabsPrimitive.Root
          {...sanitize(rootProps, ROOT_PROTECTED)}
          {...selection}
          className={cn(
            "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row",
            className,
          )}
          data-orientation={orientation}
          data-slot="tabs"
          orientation={orientation}
        >
          {children}
        </TabsPrimitive.Root>
      </TabsListContext.Provider>
    </TabsBehaviorContext.Provider>
  );
}

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };
type ListOwnedKey =
  | "activateOnFocus" | "aria-label" | "aria-labelledby" | "children" | "className"
  | "dangerouslySetInnerHTML" | "data-activation-direction" | "data-orientation"
  | "data-slot" | "loopFocus" | "render" | "role" | "style";
export type TabsListProps = Omit<TabsPrimitive.List.Props, ListOwnedKey> &
  AccessibleName & {
    children: ReactNode;
    className?: string;
    "data-activation-direction"?: never;
    "data-orientation"?: never;
    "data-slot"?: never;
  };

export function TabsList({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  children,
  className,
  ...listProps
}: TabsListProps) {
  const behavior = useTabsBehavior("TabsList");
  if (useContext(TabsListContext)) throw new TypeError("TabsList cannot be nested inside TabsList");
  const name = normalizeAccessibleName(ariaLabel, ariaLabelledBy);
  return (
    <TabsListContext.Provider value>
      <TabsPrimitive.List
        {...sanitize(listProps, LIST_PROTECTED)}
        {...name}
        activateOnFocus={behavior.activationMode === "automatic"}
        className={cn(
          "inline-flex w-fit shrink-0 items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground data-[orientation=horizontal]:h-8 data-[orientation=vertical]:h-fit data-[orientation=vertical]:flex-col",
          className,
        )}
        data-slot="tabs-list"
        loopFocus={behavior.loopFocus}
      >
        {children}
      </TabsPrimitive.List>
    </TabsListContext.Provider>
  );
}

type TriggerOwnedKey =
  | "children" | "className" | "dangerouslySetInnerHTML" | "data-active"
  | "data-activation-direction" | "data-disabled" | "data-orientation" | "data-slot"
  | "nativeButton" | "render" | "role" | "style" | "type" | "value";
export type TabsTriggerProps = Omit<TabsPrimitive.Tab.Props, TriggerOwnedKey> & {
  children: ReactNode;
  className?: string;
  value: string;
  "data-active"?: never;
  "data-activation-direction"?: never;
  "data-disabled"?: never;
  "data-orientation"?: never;
  "data-slot"?: never;
};

export function TabsTrigger({ children, className, value, ...tabProps }: TabsTriggerProps) {
  useTabsBehavior("TabsTrigger");
  if (!useContext(TabsListContext)) throw new TypeError("TabsTrigger must be inside TabsList");
  return (
    <TabsPrimitive.Tab
      {...sanitize(tabProps, TRIGGER_PROTECTED)}
      className={cn(
        "relative inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-1 text-sm font-medium text-foreground/60 transition-[color,background-color,box-shadow,border-color] duration-100 data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start hover:text-foreground focus-visible:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-background data-active:text-foreground data-active:shadow-sm motion-reduce:transition-none forced-colors:border forced-colors:border-transparent forced-colors:data-active:border-[Highlight] forced-colors:data-active:bg-[Highlight] forced-colors:data-active:text-[HighlightText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2 forced-colors:focus-visible:outline-[CanvasText] forced-colors:aria-disabled:border-[GrayText] forced-colors:aria-disabled:text-[GrayText] forced-colors:aria-disabled:opacity-100",
        className,
      )}
      data-slot="tabs-trigger"
      nativeButton
      value={normalizeValue(value, "TabsTrigger value")}
    >
      {children}
    </TabsPrimitive.Tab>
  );
}

type ContentOwnedKey =
  | "children" | "className" | "dangerouslySetInnerHTML" | "data-activation-direction"
  | "data-ending-style" | "data-hidden" | "data-index" | "data-orientation"
  | "data-slot" | "data-starting-style" | "hidden" | "inert" | "render" | "role"
  | "style" | "tabIndex" | "value";
export type TabsContentProps = Omit<TabsPrimitive.Panel.Props, ContentOwnedKey> & {
  children: ReactNode;
  className?: string;
  value: string;
  "data-hidden"?: never;
  "data-orientation"?: never;
  "data-slot"?: never;
};

export function TabsContent({ children, className, value, ...panelProps }: TabsContentProps) {
  useTabsBehavior("TabsContent");
  if (useContext(TabsListContext)) throw new TypeError("TabsContent cannot be inside TabsList");
  return (
    <TabsPrimitive.Panel
      {...sanitize(panelProps, CONTENT_PROTECTED)}
      className={cn(
        "flex-1 text-sm outline-none motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-ring/50 forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-[CanvasText]",
        className,
      )}
      data-slot="tabs-content"
      value={normalizeValue(value, "TabsContent value")}
    >
      {children}
    </TabsPrimitive.Panel>
  );
}

const ROOT_PROTECTED = ["dangerouslySetInnerHTML", "data-activation-direction", "data-orientation", "data-slot", "render", "role", "style"] as const;
const LIST_PROTECTED = ["activateOnFocus", "dangerouslySetInnerHTML", "data-activation-direction", "data-orientation", "data-slot", "loopFocus", "render", "role", "style"] as const;
const TRIGGER_PROTECTED = ["dangerouslySetInnerHTML", "data-active", "data-activation-direction", "data-disabled", "data-orientation", "data-slot", "nativeButton", "render", "role", "style", "type"] as const;
const CONTENT_PROTECTED = ["dangerouslySetInnerHTML", "data-activation-direction", "data-ending-style", "data-hidden", "data-index", "data-orientation", "data-slot", "data-starting-style", "hidden", "inert", "render", "role", "style", "tabIndex"] as const;

function useTabsBehavior(part: string) {
  const value = useContext(TabsBehaviorContext);
  if (!value) throw new TypeError(`${part} must be inside Tabs`);
  return value;
}

function normalizeSelection(value: unknown, defaultValue: unknown, onChange: unknown) {
  const controlled = value !== undefined;
  const uncontrolled = defaultValue !== undefined;
  if (controlled === uncontrolled) throw new TypeError("Tabs requires exactly one controlled or default value");
  if (onChange !== undefined && typeof onChange !== "function") throw new TypeError("Tabs onValueChange must be a function");
  if (controlled && typeof onChange !== "function") throw new TypeError("Controlled Tabs require onValueChange");
  const selected = normalizeValue(controlled ? value : defaultValue, "Tabs selected value");
  const callback = typeof onChange === "function" ? (next: unknown) => onChange(normalizeValue(next, "Tabs next value")) : undefined;
  return controlled ? { value: selected, onValueChange: callback } : { defaultValue: selected, onValueChange: callback };
}

function normalizeAccessibleName(label: unknown, labelledBy: unknown) {
  if ((label !== undefined) === (labelledBy !== undefined)) throw new TypeError("TabsList requires exactly one accessible name");
  const normalized = normalizeValue(label ?? labelledBy, "TabsList accessible name");
  return label !== undefined ? { "aria-label": normalized } : { "aria-labelledby": normalized };
}

function normalizeValue(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function assertChoice<T extends string>(value: unknown, choices: readonly T[], message: string): asserts value is T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new TypeError(message);
}

function sanitize<T extends object>(props: T, protectedKeys: readonly string[]): T {
  const result = { ...props } as Record<string, unknown>;
  for (const key of protectedKeys) Reflect.deleteProperty(result, key);
  return result as T;
}
