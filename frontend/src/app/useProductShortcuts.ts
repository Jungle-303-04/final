import { useEffect, useRef } from "react";
import {
  createShortcutMatcher,
  isProductContextShortcutId,
  PRODUCT_SHORTCUT_EVENT,
  type ProductShortcutEventDetail,
  type ShortcutDefinition,
} from "./shortcutRegistry";
import type { ProductRouteDefinition } from "./productRoutes";

interface ProductShortcutOptions {
  definitions: readonly ShortcutDefinition[];
  isCommandPaletteOpen: boolean;
  isHelpOpen: boolean;
  onCommandPaletteOpen: () => void;
  onContextOpen: () => void;
  onDiagnosticsOpen: () => void;
  onHelpToggle: () => void;
  onNamespaceOpen: () => void;
  onRouteSelect: (routeDefinition: ProductRouteDefinition) => void;
  onSearchFocus: () => void;
  onThemeToggle: () => void;
}

/** Installs one shell listener and delegates every route action to its descriptor owner. */
export function useProductShortcuts(options: ProductShortcutOptions) {
  const latestOptions = useRef(options);
  const definitionsIdentity = shortcutDefinitionsIdentity(options.definitions);

  useEffect(() => {
    latestOptions.current = options;
  });

  useEffect(() => {
    const matcher = createShortcutMatcher(latestOptions.current.definitions);

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = latestOptions.current;
      if (current.isCommandPaletteOpen) {
        matcher.reset();
        return;
      }
      if (current.isHelpOpen && event.key !== "?") {
        matcher.reset();
        return;
      }
      if (!current.isHelpOpen && hasOpenDialog()) {
        matcher.reset();
        return;
      }

      const definition = matcher.handle(event);
      if (!definition) return;

      if (definition.targetRoute) {
        current.onRouteSelect(definition.targetRoute);
        return;
      }

      if (isProductContextShortcutId(definition.id)) {
        window.dispatchEvent(new CustomEvent<ProductShortcutEventDetail>(
          PRODUCT_SHORTCUT_EVENT,
          { detail: { id: definition.id } },
        ));
        return;
      }

      if (definition.id === "command") {
        current.onCommandPaletteOpen();
        return;
      }
      if (definition.id === "diagnostics") {
        current.onDiagnosticsOpen();
        return;
      }
      if (definition.id === "namespace") {
        current.onNamespaceOpen();
        return;
      }
      if (definition.id === "context") {
        current.onContextOpen();
        return;
      }
      if (definition.id === "search") {
        current.onSearchFocus();
        return;
      }
      if (definition.id === "theme") {
        current.onThemeToggle();
        return;
      }
      if (definition.id === "help") current.onHelpToggle();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") matcher.reset();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", matcher.reset);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", matcher.reset);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      matcher.dispose();
    };
  }, [definitionsIdentity]);
}

function shortcutDefinitionsIdentity(definitions: readonly ShortcutDefinition[]): string {
  return JSON.stringify(definitions.map((definition) => ({
    allowInInputs: definition.allowInInputs ?? false,
    allowRepeat: definition.allowRepeat ?? false,
    available: definition.available ?? true,
    id: definition.id,
    modifier: definition.modifier ?? null,
    sequence: definition.sequence,
    targetRoute: definition.targetRoute ?? null,
  })));
}

function hasOpenDialog(): boolean {
  // Profile utilities stay mounted so their imperative shortcut targets remain available.
  // Base UI marks that closed popover through a hidden ancestor and `data-closed`.
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).some((dialog) => {
    if (dialog.hasAttribute("data-closed") || dialog.getAttribute("aria-hidden") === "true") {
      return false;
    }
    return dialog.closest("[hidden], [inert]") === null;
  });
}
