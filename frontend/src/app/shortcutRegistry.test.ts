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
  it("contains only released route shortcuts plus data-independent global actions", () => {
    const definitions = shellShortcutDefinitions(new Set(["home", "issues"]));

    expect(definitions.map((definition) => definition.id)).toEqual([
      "route:home",
      "route:issues",
      "theme",
      "help",
    ]);
    expect(definitions.map((definition) => definition.sequence.join(" "))).toEqual([
      "g h",
      "g i",
      "t",
      "?",
    ]);
    expect(definitions.map((definition) => definition.labelKey)).toEqual([
      "shell.shortcut.route.home",
      "shell.shortcut.route.issues",
      "shell.shortcut.theme",
      "shell.shortcut.help",
    ]);
    expect(definitions.map((definition) => definition.id)).not.toEqual(
      expect.arrayContaining(["context", "namespace", "command", "diagnostics"]),
    );
  });

  it("matches a route chord and direct actions without dispatching unreleased routes", () => {
    const matcher = createShortcutMatcher(shellShortcutDefinitions(new Set(["home", "issues"])));
    const prefix = keyEvent("g");

    expect(matcher.handle(prefix)).toBeNull();
    expect(prefix.preventDefault).toHaveBeenCalledOnce();
    expect(matcher.handle(keyEvent("i"))?.id).toBe("route:issues");
    expect(matcher.handle(keyEvent("t"))?.id).toBe("theme");
    expect(matcher.handle(keyEvent("?", { shiftKey: true }))?.id).toBe("help");
    expect(matcher.handle(keyEvent("o"))).toBeNull();
  });

  it("owns route and Resources collection chords in one active-surface registry", () => {
    const resources = shellShortcutDefinitions(new Set(["home", "resources"]), "resources");
    const matcher = createShortcutMatcher(resources);

    expect(resources.map((definition) => definition.id)).toEqual([
      "route:home",
      "route:resources",
      "resources:next-row",
      "resources:previous-row",
      "resources:first-row",
      "resources:last-row",
      "resources:open-row",
      "resources:open-logs",
      "theme",
      "help",
    ]);
    expect(resources.map((definition) => definition.sequence.join(" "))).toEqual([
      "g h",
      "g r",
      "j",
      "k",
      "g g",
      "shift+g",
      "d",
      "l",
      "t",
      "?",
    ]);

    matcher.handle(keyEvent("g"));
    expect(matcher.handle(keyEvent("g"))?.id).toBe("resources:first-row");
    matcher.handle(keyEvent("g"));
    expect(matcher.handle(keyEvent("h"))?.id).toBe("route:home");
    expect(matcher.handle(keyEvent("G"))?.id).toBe("resources:last-row");
    expect(matcher.handle(keyEvent("g", { shiftKey: true }))?.id)
      .toBe("resources:last-row");
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
      {
        id: "command",
        labelKey: "common.action.open",
        group: "global",
        sequence: ["k"],
        allowInInputs: true,
      },
    ];
    const matcher = createShortcutMatcher(definitions);
    const input = { tagName: "INPUT", isContentEditable: false };

    expect(matcher.handle(keyEvent("t", { target: input }))).toBeNull();
    expect(matcher.handle(keyEvent("k", { target: input }))?.id).toBe("command");
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
    const invalidSuffix = keyEvent("t");

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

  it("does not reserve backend-gated shortcuts when no route uses the chord prefix", () => {
    const matcher = createShortcutMatcher(shellShortcutDefinitions(new Set()));
    const prefix = keyEvent("g");
    const command = keyEvent("k", { metaKey: true });

    expect(matcher.handle(prefix)).toBeNull();
    expect(prefix.preventDefault).not.toHaveBeenCalled();
    expect(matcher.handle(command)).toBeNull();
    expect(command.preventDefault).not.toHaveBeenCalled();
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
