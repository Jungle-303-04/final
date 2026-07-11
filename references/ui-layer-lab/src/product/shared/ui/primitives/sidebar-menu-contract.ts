const NEUTRAL_PROTECTED = [
  "aria-hidden", "contentEditable", "dangerouslySetInnerHTML", "data-slot",
  "draggable", "render", "role", "style", "tabIndex",
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

export function normalizeTooltip(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("Sidebar menu tooltip must be a non-empty string");
  }
  return value.trim();
}

export function normalizeRouteTarget(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("SidebarMenuLink to must be an internal absolute path");
  }
  const path = value.trim();
  const containsControlCharacter = Array.from(path).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (
    !/^\/(?!\/)/.test(path)
    || path.includes("\\")
    || containsControlCharacter
  ) {
    throw new TypeError("SidebarMenuLink to must be an internal absolute path");
  }
  return path;
}

export function assertNoUnexpectedProps(props: object, part: string): void {
  const keys = Object.keys(props);
  if (keys.length > 0) {
    throw new TypeError(`${part} does not accept ${keys.sort().join(", ")}`);
  }
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
