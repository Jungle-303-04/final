import type { ShortcutDefinition, ShortcutKeyEvent } from "./shortcutRegistry";

export function definitionForModifiedEvent(
  definitionsBySequence: ReadonlyMap<string, ShortcutDefinition>,
  key: string,
  event: ShortcutKeyEvent,
): ShortcutDefinition | null {
  if (event.altKey || (!event.metaKey && !event.ctrlKey)) return null;
  return definitionsBySequence.get(serializeDefinitionSequence([key], "meta-or-control")) ?? null;
}

export function shouldIgnoreEvent(event: ShortcutKeyEvent): boolean {
  if (
    event.defaultPrevented
    || event.isComposing
    || event.keyCode === 229
    || event.metaKey
    || event.ctrlKey
    || event.altKey
    || event.getModifierState?.("AltGraph")
  ) {
    return true;
  }

  return false;
}

export function isUnavailableForAllShortcuts(event: ShortcutKeyEvent): boolean {
  return event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
    event.altKey || event.getModifierState?.("AltGraph") === true;
}

export function isEditableEvent(event: ShortcutKeyEvent): boolean {
  const path = event.composedPath?.() ?? [];
  const candidates = path.length > 0 ? path : [event.target];
  return candidates.some(isEditableCandidate);
}

function isEditableCandidate(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== "object") return false;

  const element = candidate as {
    tagName?: unknown;
    isContentEditable?: unknown;
    getAttribute?: (name: string) => string | null;
  };
  const tagName = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return true;
  if (element.isContentEditable === true) return true;

  const role = element.getAttribute?.("role");
  return role === "textbox" || role === "combobox";
}

export function normalizeDefinitionKey(key: string): string {
  const normalized = key.toLocaleLowerCase("en-US");
  if (/^(?:[a-z0-9?/]|\[|\]|shift\+[a-z0-9])$/u.test(normalized)) return normalized;
  throw new Error(`invalid shortcut key: ${key}`);
}

export function normalizeEventKey(key: string, shiftKey: boolean): string | null {
  if (key === "?" || key === "/" || key === "[" || key === "]") return key;
  if (key.length !== 1) return null;
  const normalized = key.toLocaleLowerCase("en-US");
  if (!/^[a-z0-9]$/u.test(normalized)) return null;
  const isShiftedLetter = /^[A-Z]$/u.test(key);
  return shiftKey || isShiftedLetter ? `shift+${normalized}` : normalized;
}

export function serializeDefinitionSequence(
  sequence: readonly string[],
  modifier?: ShortcutDefinition["modifier"],
): string {
  return `${modifier ?? "none"}\u0000${sequence.join("\u0000")}`;
}
