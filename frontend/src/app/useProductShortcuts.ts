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
  onHelpToggle: () => void;
  onRouteSelect: (routeDefinition: ProductRouteDefinition) => void;
  onThemeToggle: () => void;
}

/** Installs one shell listener and delegates every route action to its descriptor owner. */
export function useProductShortcuts(options: ProductShortcutOptions) {
  const latestOptions = useRef(options);

  useEffect(() => {
    latestOptions.current = options;
  });

  useEffect(() => {
    const matcher = createShortcutMatcher(options.definitions);

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
      if (!current.isHelpOpen && document.querySelector('[role="dialog"]')) {
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
  }, [options.definitions]);
}
