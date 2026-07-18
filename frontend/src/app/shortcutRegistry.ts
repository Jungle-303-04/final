import {
  productKeyboardNavigationRoutes,
  type ProductSurfaceId,
} from "./productRoutes";
import type { ProductRouteDefinition } from "./productRoutes";
import type { MessageKey, TranslationParameters } from "../shared/i18n";
import { resourcesShortcutDefinitions } from "./resourcesShortcutDefinitions";
import {
  definitionForModifiedEvent,
  isEditableEvent,
  isUnavailableForAllShortcuts,
  normalizeDefinitionKey,
  normalizeEventKey,
  serializeDefinitionSequence,
  shouldIgnoreEvent,
} from "./shortcutKeyMatcher";

export type ShortcutGroup = "navigation" | "global" | "context";

export const PRODUCT_SHORTCUT_EVENT = "opsia:product-shortcut";

export type ProductContextShortcutId =
  | "resources:next-row"
  | "resources:previous-row"
  | "resources:first-row"
  | "resources:last-row"
  | "resources:open-row"
  | "resources:open-yaml"
  | "resources:open-logs"
  | "resources:previous-kind"
  | "resources:next-kind";

export interface ProductShortcutEventDetail {
  id: ProductContextShortcutId;
}

export interface ShortcutDefinition {
  id: string;
  labelKey: MessageKey;
  labelParams?: TranslationParameters;
  group: ShortcutGroup;
  sequence: readonly string[];
  allowInInputs?: boolean;
  allowRepeat?: boolean;
  available?: boolean;
  modifier?: "meta-or-control";
  targetRoute?: ProductRouteDefinition;
}

export interface ShortcutKeyEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
  target: unknown;
  composedPath?: () => readonly unknown[];
  getModifierState?: (modifier: string) => boolean;
  preventDefault: () => void;
}
export interface ShortcutMatcher {
  handle: (event: ShortcutKeyEvent) => ShortcutDefinition | null;
  reset: () => void;
  dispose: () => void;
}
const CHORD_TIMEOUT_MS = 1_000;
const shortcutRouteLabelKeys = {
  clusters: "shell.shortcut.route.clusters",
  applications: "shell.shortcut.route.applications",
  gitops: "shell.shortcut.route.gitops",
  home: "shell.shortcut.route.home",
  issues: "shell.shortcut.route.issues",
  alerts: "settings.section.alerts",
  resources: "shell.shortcut.route.resources",
  deploy: "shell.shortcut.route.deploy",
  timeline: "shell.shortcut.route.timeline",
  traffic: "shell.shortcut.route.traffic",
  helm: "shell.shortcut.route.helm",
  checks: "shell.shortcut.route.checks",
  cost: "shell.shortcut.route.cost",
  settings: "shell.shortcut.route.settings",
} satisfies Record<ProductSurfaceId, MessageKey>;

export function shellShortcutDefinitions(
  releasedSurfaceIds: ReadonlySet<ProductSurfaceId>,
  activeSurfaceId?: ProductSurfaceId,
): readonly ShortcutDefinition[] {
  const navigation = productKeyboardNavigationRoutes().map((routeDefinition) => ({
    id: `route:${routeDefinition.id}`,
    labelKey: shortcutRouteLabelKeys[routeDefinition.id],
    group: "navigation" as const,
    sequence: routeDefinition.shortcut.split(" "),
    targetRoute: routeDefinition,
    available: releasedSurfaceIds.has(routeDefinition.id),
  }));

  const context = activeSurfaceId === "resources" && releasedSurfaceIds.has("resources")
    ? resourcesShortcutDefinitions
    : [];

  return [
    ...navigation,
    ...context,
    {
      id: "command",
      labelKey: "shell.shortcut.command",
      group: "global",
      sequence: ["k"],
      modifier: "meta-or-control",
      allowInInputs: true,
    },
    {
      id: "diagnostics",
      labelKey: "shell.diagnostics.open",
      group: "global",
      sequence: ["shift+d"],
      modifier: "meta-or-control",
      allowInInputs: true,
    },
    {
      id: "namespace",
      labelKey: "shell.filter.group.namespace",
      group: "global",
      sequence: ["n"],
    },
    {
      id: "context",
      labelKey: "shell.filter.group.cluster",
      group: "global",
      sequence: ["c"],
    },
    {
      id: "search",
      labelKey: "shell.shortcut.search",
      group: "global",
      sequence: ["/"],
    },
    {
      id: "theme",
      labelKey: "shell.shortcut.theme",
      group: "global",
      sequence: ["t"],
    },
    {
      id: "help",
      labelKey: "shell.shortcut.help",
      group: "global",
      sequence: ["?"],
    },
  ];
}

const productContextShortcutIds = new Set<ProductContextShortcutId>(
  resourcesShortcutDefinitions.map(({ id }) => id as ProductContextShortcutId),
);

export function isProductContextShortcutId(value: string): value is ProductContextShortcutId {
  return productContextShortcutIds.has(value as ProductContextShortcutId);
}

export function createShortcutMatcher(
  definitions: readonly ShortcutDefinition[],
  timeoutMs = CHORD_TIMEOUT_MS,
): ShortcutMatcher {
  const definitionsBySequence = new Map<string, ShortcutDefinition>();
  const chordPrefixes = new Set<string>();
  const definitionIds = new Set<string>();

  for (const definition of definitions) {
    if (definitionIds.has(definition.id)) {
      throw new Error(`duplicate shortcut id: ${definition.id}`);
    }
    definitionIds.add(definition.id);

    if (definition.sequence.length === 0 || definition.sequence.length > 2) {
      throw new Error(`unsupported shortcut length: ${definition.id}`);
    }
    if (definition.modifier && definition.sequence.length !== 1) {
      throw new Error(`modified shortcut must have one key: ${definition.id}`);
    }

    const normalizedSequence = definition.sequence.map(normalizeDefinitionKey);
    const sequenceKey = serializeDefinitionSequence(normalizedSequence, definition.modifier);
    if (definitionsBySequence.has(sequenceKey)) {
      throw new Error(`duplicate shortcut sequence: ${normalizedSequence.join(" ")}`);
    }

    definitionsBySequence.set(sequenceKey, {
      ...definition,
      sequence: normalizedSequence,
    });
    if (!definition.modifier && normalizedSequence.length === 2) chordPrefixes.add(normalizedSequence[0]);
  }

  for (const prefix of chordPrefixes) {
    if (definitionsBySequence.has(serializeDefinitionSequence([prefix]))) {
      throw new Error(`ambiguous shortcut prefix: ${prefix}`);
    }
  }

  let pendingPrefix: string | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const reset = () => {
    pendingPrefix = null;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const startChord = (prefix: string) => {
    reset();
    pendingPrefix = prefix;
    timeoutId = setTimeout(reset, timeoutMs);
  };

  return {
    handle(event) {
      if (isUnavailableForAllShortcuts(event)) {
        reset();
        return null;
      }

      const key = normalizeEventKey(event.key, event.shiftKey);
      if (!key) {
        reset();
        return null;
      }

      const modifiedDefinition = definitionForModifiedEvent(definitionsBySequence, key, event);
      if (modifiedDefinition) {
        reset();
        if (event.repeat && !modifiedDefinition.allowRepeat) return null;
        if (isEditableEvent(event) && !modifiedDefinition.allowInInputs) return null;
        event.preventDefault();
        return modifiedDefinition;
      }

      if (shouldIgnoreEvent(event)) {
        reset();
        return null;
      }

      if (isEditableEvent(event)) {
        const inputAllowedDefinition = definitionsBySequence.get(serializeDefinitionSequence([key]));
        reset();
        if (!inputAllowedDefinition?.allowInInputs) return null;
        if (event.repeat && !inputAllowedDefinition.allowRepeat) return null;
        event.preventDefault();
        return inputAllowedDefinition;
      }

      if (pendingPrefix !== null) {
        const sequenceKey = serializeDefinitionSequence([pendingPrefix, key]);
        const definition = definitionsBySequence.get(sequenceKey) ?? null;
        reset();
        if (event.repeat && !definition?.allowRepeat) return null;
        event.preventDefault();
        return definition;
      }

      const directDefinition = definitionsBySequence.get(serializeDefinitionSequence([key])) ?? null;
      if (directDefinition) {
        if (event.repeat && !directDefinition.allowRepeat) return null;
        event.preventDefault();
        return directDefinition;
      }

      if (chordPrefixes.has(key)) {
        if (event.repeat) return null;
        startChord(key);
        event.preventDefault();
      }

      return null;
    },
    reset,
    dispose: reset,
  };
}
