import type { ShortcutDefinition } from "./shortcutRegistry";

export const resourcesShortcutDefinitions: readonly ShortcutDefinition[] = [
  {
    id: "resources:next-row",
    labelKey: "shell.shortcut.resources.nextRow",
    group: "context",
    sequence: ["j"],
  },
  {
    id: "resources:previous-row",
    labelKey: "shell.shortcut.resources.previousRow",
    group: "context",
    sequence: ["k"],
  },
  {
    id: "resources:first-row",
    labelKey: "shell.shortcut.resources.firstRow",
    group: "context",
    sequence: ["g", "g"],
  },
  {
    id: "resources:last-row",
    labelKey: "shell.shortcut.resources.lastRow",
    group: "context",
    sequence: ["shift+g"],
  },
  {
    id: "resources:open-row",
    labelKey: "shell.shortcut.resources.openRow",
    group: "context",
    sequence: ["d"],
  },
  {
    id: "resources:open-yaml",
    labelKey: "shell.shortcut.resources.openYaml",
    group: "context",
    sequence: ["y"],
  },
  {
    id: "resources:open-logs",
    labelKey: "shell.shortcut.resources.openLogs",
    group: "context",
    sequence: ["l"],
  },
  {
    id: "resources:previous-kind",
    labelKey: "shell.shortcut.resources.previousKind",
    group: "context",
    sequence: ["["],
  },
  {
    id: "resources:next-kind",
    labelKey: "shell.shortcut.resources.nextKind",
    group: "context",
    sequence: ["]"],
  },
];
