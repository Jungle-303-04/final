import { isValidElement, type ReactElement } from "react";

const NEUTRAL_PROTECTED = [
  "aria-hidden", "contentEditable", "dangerouslySetInnerHTML", "data-slot",
  "draggable", "render", "role", "style", "tabIndex",
] as const;
const BUTTON_DERIVED = [
  "aria-current", "data-active", "data-disabled", "data-sidebar-state", "data-slot",
] as const;
const BUTTON_REJECTED = [
  "aria-hidden", "contentEditable", "dangerouslySetInnerHTML", "draggable",
  "onClickCapture", "onKeyDownCapture", "role", "style", "tabIndex", "type",
] as const;
const RENDER_REJECTED = [
  ...BUTTON_DERIVED,
  ...BUTTON_REJECTED,
  "aria-disabled",
  "disabled",
] as const;

export function normalizeAccessibleName(label: unknown, labelledBy: unknown) {
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

export function normalizeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

export function normalizeAriaDisabled(value: unknown): boolean {
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new TypeError("SidebarMenuButton aria-disabled must be boolean-like");
}

export function normalizeTooltip(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("SidebarMenuButton tooltip must be a non-empty string");
  }
  return value.trim();
}

export function normalizeRenderElement(value: unknown): ReactElement | undefined {
  if (value === undefined) return undefined;
  if (!isValidElement(value)) {
    throw new TypeError("SidebarMenuButton render must be a React element");
  }
  const props = value.props as Record<string, unknown>;
  assertProtected(props, "SidebarMenuButton render", RENDER_REJECTED);
  return value;
}

export function sanitizeNeutralPartProps<Props extends object>(
  props: Props,
  part: string,
): Props {
  for (const key of Object.keys(props)) {
    if (/^on[A-Z]/.test(key)) {
      throw new TypeError(`${part} cannot receive event handlers`);
    }
  }
  assertProtected(props, part, NEUTRAL_PROTECTED);
  return { ...props };
}

export function sanitizeButtonProps<Props extends object>(props: Props, part: string): Props {
  assertProtected(props, part, BUTTON_REJECTED);
  const safeProps = { ...props } as Record<string, unknown>;
  BUTTON_DERIVED.forEach((key) => Reflect.deleteProperty(safeProps, key));
  return safeProps as Props;
}

function assertProtected(
  props: object,
  part: string,
  protectedKeys: readonly string[],
): void {
  for (const key of protectedKeys) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      throw new TypeError(`${part} owns ${key}`);
    }
  }
}
