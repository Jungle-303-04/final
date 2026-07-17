import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  createShortcutMatcher,
  shellShortcutDefinitions,
  type ShortcutDefinition,
  type ShortcutKeyEvent,
} from "./shortcutRegistry";

afterEach(() => {
  vi.useRealTimers();
});

describe("shell shortcut registry", () => {
  it("keeps all upstream navigation chords discoverable and marks unregistered routes unavailable", () => {
    const definitions = shellShortcutDefinitions(new Set(["home", "issues"]));

    expect(definitions.filter((definition) => definition.id.startsWith("route:"))
      .map((definition) => [definition.id, definition.sequence.join(" "), definition.available]))
      .toEqual(expect.arrayContaining([
        ["route:home", "g h", true],
        ["route:resources", "g r", false],
        ["route:issues", "g i", true],
        ["route:applications", "g a", false],
        ["route:timeline", "g l", false],
        ["route:traffic", "g f", false],
        ["route:helm", "g m", false],
        ["route:gitops", "g o", false],
        ["route:checks", "g u", false],
        ["route:cost", "g c", false],
      ]));
    expect(definitions.find((definition) => definition.id === "command"))
      .toMatchObject({
        allowInInputs: true,
        modifier: "meta-or-control",
        sequence: ["k"],
      });
    expect(definitions.find((definition) => definition.id === "diagnostics"))
      .toMatchObject({
        allowInInputs: true,
        modifier: "meta-or-control",
        sequence: ["shift+d"],
      });
    expect(definitions.find((definition) => definition.id === "namespace"))
      .toMatchObject({ sequence: ["n"] });
    expect(definitions.find((definition) => definition.id === "context"))
      .toMatchObject({ sequence: ["c"] });
    expect(definitions.find((definition) => definition.id === "search"))
      .toMatchObject({ sequence: ["/"] });
  });

  it("matches an unavailable route chord so the shell can give honest feedback", () => {
    const matcher = createShortcutMatcher(shellShortcutDefinitions(new Set(["home", "issues"])));
    const prefix = keyEvent("g");

    expect(matcher.handle(prefix)).toBeNull();
    expect(prefix.preventDefault).toHaveBeenCalledOnce();
    expect(matcher.handle(keyEvent("i"))?.id).toBe("route:issues");
    matcher.handle(keyEvent("g"));
    expect(matcher.handle(keyEvent("t"))).toBeNull();
    expect(matcher.handle(keyEvent("t"))?.id).toBe("theme");
    expect(matcher.handle(keyEvent("?", { shiftKey: true }))?.id).toBe("help");
    expect(matcher.handle(keyEvent("k", { metaKey: true }))?.id).toBe("command");
    expect(matcher.handle(keyEvent("k", { ctrlKey: true }))?.id).toBe("command");
    expect(matcher.handle(keyEvent("D", { ctrlKey: true, shiftKey: true }))?.id)
      .toBe("diagnostics");
    expect(matcher.handle(keyEvent("n"))?.id).toBe("namespace");
    expect(matcher.handle(keyEvent("c"))?.id).toBe("context");
    expect(matcher.handle(keyEvent("/"))?.id).toBe("search");
  });

  it("owns route and Resources collection chords in one active-surface registry", () => {
    const resources = shellShortcutDefinitions(new Set(["home", "resources"]), "resources");
    const matcher = createShortcutMatcher(resources);

    expect(resources.map((definition) => definition.id)).toEqual(expect.arrayContaining([
      "route:home",
      "route:resources",
      "route:timeline",
      "route:cost",
      "resources:next-row",
      "resources:previous-row",
      "resources:first-row",
      "resources:last-row",
      "resources:open-row",
      "resources:open-yaml",
      "resources:open-logs",
      "resources:previous-kind",
      "resources:next-kind",
      "command",
      "theme",
      "help",
    ]));
    expect(resources.map((definition) => definition.sequence.join(" "))).toEqual(expect.arrayContaining([
      "g h",
      "g r",
      "g l",
      "g c",
      "j",
      "k",
      "g g",
      "shift+g",
      "d",
      "y",
      "[",
      "]",
      "t",
      "?",
    ]));

    matcher.handle(keyEvent("g"));
    expect(matcher.handle(keyEvent("g"))?.id).toBe("resources:first-row");
    matcher.handle(keyEvent("g"));
    expect(matcher.handle(keyEvent("h"))?.id).toBe("route:home");
    expect(matcher.handle(keyEvent("G"))?.id).toBe("resources:last-row");
    expect(matcher.handle(keyEvent("g", { shiftKey: true }))?.id)
      .toBe("resources:last-row");
    expect(matcher.handle(keyEvent("["))?.id).toBe("resources:previous-kind");
    expect(matcher.handle(keyEvent("]"))?.id).toBe("resources:next-kind");
  });

  it("does not publish Resources context actions outside the active Resources surface", () => {
    const definitions = shellShortcutDefinitions(new Set(["home", "resources"]), "home");

    expect(definitions.map(({ id }) => id)).not.toEqual(expect.arrayContaining([
      "resources:next-row",
      "resources:first-row",
    ]));
  });

  it("suppresses shortcuts in editable controls unless explicitly allowed", () => {
    const definitions: readonly ShortcutDefinition[] = [
      ...shellShortcutDefinitions(new Set(["home"])),
    ];
    const matcher = createShortcutMatcher(definitions);
    const input = { tagName: "INPUT", isContentEditable: false };

    expect(matcher.handle(keyEvent("t", { target: input }))).toBeNull();
    expect(matcher.handle(keyEvent("k", { metaKey: true, target: input }))?.id).toBe("command");
    expect(matcher.handle(keyEvent("k", { ctrlKey: true, target: input }))?.id).toBe("command");
    expect(matcher.handle(keyEvent("D", {
      ctrlKey: true,
      shiftKey: true,
      target: input,
    }))?.id).toBe("diagnostics");
    expect(matcher.handle(keyEvent("n", { target: input }))).toBeNull();
    expect(matcher.handle(keyEvent("c", { target: input }))).toBeNull();
    expect(matcher.handle(keyEvent("?", {
      shiftKey: true,
      target: { tagName: "DIV", isContentEditable: true },
    }))).toBeNull();
  });

  it("expires incomplete chords and ignores modified, repeated, or prevented events", () => {
    vi.useFakeTimers();
    const matcher = createShortcutMatcher(shellShortcutDefinitions(new Set(["home"])));

    matcher.handle(keyEvent("g"));
    vi.advanceTimersByTime(1_001);
    expect(matcher.handle(keyEvent("h"))).toBeNull();
    expect(matcher.handle(keyEvent("t", { metaKey: true }))).toBeNull();
    expect(matcher.handle(keyEvent("t", { ctrlKey: true }))).toBeNull();
    expect(matcher.handle(keyEvent("t", { altKey: true }))).toBeNull();
    expect(matcher.handle(keyEvent("T", { shiftKey: true }))).toBeNull();
    expect(matcher.handle(keyEvent("t", { repeat: true }))).toBeNull();
    expect(matcher.handle(keyEvent("t", { defaultPrevented: true }))).toBeNull();
    expect(matcher.handle(keyEvent("t", { isComposing: true }))).toBeNull();
    expect(matcher.handle(keyEvent("t", { keyCode: 229 }))).toBeNull();
    expect(matcher.handle(keyEvent("t", {
      getModifierState: (modifier) => modifier === "AltGraph",
    }))).toBeNull();
  });

  it("consumes an invalid chord suffix without reinterpreting it as a global action", () => {
    const matcher = createShortcutMatcher(shellShortcutDefinitions(new Set(["home"])));
    const invalidSuffix = keyEvent("z");

    matcher.handle(keyEvent("g"));
    expect(matcher.handle(invalidSuffix)).toBeNull();
    expect(invalidSuffix.preventDefault).toHaveBeenCalledOnce();
    expect(matcher.handle(keyEvent("t"))?.id).toBe("theme");
  });

  it("clears a pending chord when Escape or an ignored event interrupts it", () => {
    const matcher = createShortcutMatcher(shellShortcutDefinitions(new Set(["home"])));
    const escape = keyEvent("Escape");

    matcher.handle(keyEvent("g"));
    expect(matcher.handle(escape)).toBeNull();
    expect(escape.preventDefault).not.toHaveBeenCalled();
    expect(matcher.handle(keyEvent("h"))).toBeNull();

    matcher.handle(keyEvent("g"));
    expect(matcher.handle(keyEvent("x", { isComposing: true }))).toBeNull();
    expect(matcher.handle(keyEvent("h"))).toBeNull();

    matcher.handle(keyEvent("g"));
    expect(matcher.handle(keyEvent("x", { metaKey: true }))).toBeNull();
    expect(matcher.handle(keyEvent("h"))).toBeNull();
  });

  it("retains source navigation and command access even when no surface is registered", () => {
    const matcher = createShortcutMatcher(shellShortcutDefinitions(new Set()));
    const prefix = keyEvent("g");
    const command = keyEvent("k", { metaKey: true });

    expect(matcher.handle(prefix)).toBeNull();
    expect(prefix.preventDefault).toHaveBeenCalledOnce();
    expect(matcher.handle(keyEvent("h"))?.id).toBe("route:home");
    expect(matcher.handle(command)?.id).toBe("command");
    expect(command.preventDefault).toHaveBeenCalledOnce();
  });

  it("detects editable controls through the composed event path", () => {
    const matcher = createShortcutMatcher(shellShortcutDefinitions(new Set(["home"])));
    const editableAncestor = { tagName: "TEXTAREA", isContentEditable: false };

    expect(matcher.handle(keyEvent("t", {
      target: { tagName: "SPAN", isContentEditable: false },
      composedPath: () => [{ tagName: "SPAN" }, editableAncestor],
    }))).toBeNull();
    expect(matcher.handle(keyEvent("t", {
      target: { tagName: "SELECT", isContentEditable: false },
    }))).toBeNull();
    expect(matcher.handle(keyEvent("t", {
      target: {
        tagName: "DIV",
        isContentEditable: false,
        getAttribute: (name: string) => name === "role" ? "textbox" : null,
      },
    }))).toBeNull();
  });

  it("rejects duplicate shortcut sequences instead of choosing by registration order", () => {
    const duplicate: readonly ShortcutDefinition[] = [
      { id: "first", labelKey: "common.action.open", group: "global", sequence: ["t"] },
      { id: "second", labelKey: "common.action.close", group: "global", sequence: ["t"] },
    ];

    expect(() => createShortcutMatcher(duplicate)).toThrow(/duplicate shortcut sequence: t/u);
  });

  it("rejects duplicate identifiers and direct actions that shadow a chord prefix", () => {
    expect(() => createShortcutMatcher([
      { id: "same", labelKey: "common.action.open", group: "global", sequence: ["t"] },
      { id: "same", labelKey: "common.action.close", group: "global", sequence: ["?"] },
    ])).toThrow(/duplicate shortcut id: same/u);

    expect(() => createShortcutMatcher([
      { id: "direct", labelKey: "common.action.open", group: "global", sequence: ["g"] },
      { id: "chord", labelKey: "common.action.close", group: "navigation", sequence: ["g", "h"] },
    ])).toThrow(/ambiguous shortcut prefix: g/u);
  });
});

function keyEvent(
  key: string,
  overrides: Partial<Omit<ShortcutKeyEvent, "preventDefault">> = {},
): Omit<ShortcutKeyEvent, "preventDefault"> & { preventDefault: Mock<() => void> } {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    repeat: false,
    shiftKey: false,
    isComposing: false,
    keyCode: 0,
    target: null,
    composedPath: () => [],
    getModifierState: () => false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}
